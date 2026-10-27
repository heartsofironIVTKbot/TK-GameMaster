import { invalidateLobby, lobbySnapshot, lobbyVersion } from "@/lib/lobbySnapshot";

/**
 * Live map hub (infrastructure plan, Phase 3): pushes lobby changes and
 * other players' selections to every open map of a game over Server-Sent
 * Events (GET /api/live).
 *
 *  - One room per game with at least one open map. Each second the room
 *    re-reads the lobby version (one primary-key read); a new version is
 *    built once (shared snapshot cache) and pushed to everyone. Writes made
 *    by this website call `lobbyChanged` and go out at once; the bot's
 *    writes (Discord commands, Host Tool, drafts) land within a second.
 *  - Selections ("Ivan is looking at Germany") are memory only, never
 *    stored. Rate-limited per player, merged and sent at most every 100 ms
 *    per room, and dropped 12 s after the player's last refresh.
 *  - One process: the website runs as a single server. With several
 *    servers this needs a shared bus (Redis pub/sub) behind the same API.
 */

export interface LiveClient {
  readonly id: number;
  /** Logged-in viewer's Discord id (null = anonymous). */
  readonly userId: string | null;
  /** Queue an event; false when the connection is gone or hopelessly behind. */
  send(event: string, data: unknown): boolean;
  close(): void;
}

export interface LiveSelection {
  user_id: string;
  name: string;
  avatar_url: string | null;
  tag: string;
}

interface Room {
  threadId: string;
  clients: Set<LiveClient>;
  version: string | null;
  /** The last lobby sent (JSON), so an unchanged rebuild isn't sent again. */
  content: string | null;
  selections: Map<string, LiveSelection & { until: number }>;
  selectionsDirty: boolean;
  viewers: number;
  checking: boolean;
  recheck: boolean;
}

const CHECK_MS = 1_000;
const FLUSH_MS = 100;
const PING_MS = 20_000;
const SELECTION_TTL_MS = 12_000;
/** Per player: a burst of 10 selection updates, then 5 per second. */
const BUCKET_SIZE = 10;
const BUCKET_REFILL_PER_MS = 5 / 1_000;
const MAX_ROOMS = 1_000;
const MAX_CLIENTS_PER_ROOM = 3_000;

export class LiveHub {
  private readonly rooms = new Map<string, Room>();
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private nextId = 1;
  private lastPing = Date.now();

  constructor() {
    setInterval(() => this.tick(), CHECK_MS).unref?.();
    setInterval(() => this.flush(), FLUSH_MS).unref?.();
  }

  newClientId(): number {
    return this.nextId++;
  }

  /** Open map: join the game's room. `known` = the version the map already shows. */
  subscribe(threadId: string, client: LiveClient, known: string | null): (() => void) | null {
    let room = this.rooms.get(threadId);
    if (!room) {
      if (this.rooms.size >= MAX_ROOMS) return null;
      room = {
        threadId,
        clients: new Set(),
        version: null,
        content: null,
        selections: new Map(),
        selectionsDirty: false,
        viewers: 0,
        checking: false,
        recheck: false,
      };
      this.rooms.set(threadId, room);
    }
    if (room.clients.size >= MAX_CLIENTS_PER_ROOM) return null;
    room.clients.add(client);
    void this.greet(room, client, known);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.leave(room, client);
    };
  }

  /** This website changed a lobby: push it now instead of on the next check. */
  lobbyChanged(threadId: string): void {
    invalidateLobby(threadId);
    const room = this.rooms.get(threadId);
    if (room) void this.check(room);
  }

  /**
   * A logged-in player selected a nation (or cleared it with `tag: null`).
   * Only players with the game's map open count. False when rate-limited.
   */
  select(threadId: string, selection: Omit<LiveSelection, "tag"> & { tag: string | null }): boolean {
    const room = this.rooms.get(threadId);
    if (!room || ![...room.clients].some((client) => client.userId === selection.user_id)) return true;
    if (!this.take(selection.user_id)) return false;
    const current = room.selections.get(selection.user_id);
    if (!selection.tag) {
      if (current) {
        room.selections.delete(selection.user_id);
        room.selectionsDirty = true;
      }
      return true;
    }
    if (current?.tag !== selection.tag || current.name !== selection.name) room.selectionsDirty = true;
    room.selections.set(selection.user_id, {
      user_id: selection.user_id,
      name: selection.name,
      avatar_url: selection.avatar_url,
      tag: selection.tag,
      until: Date.now() + SELECTION_TTL_MS,
    });
    return true;
  }

  private async greet(room: Room, client: LiveClient, known: string | null): Promise<void> {
    try {
      const version = await lobbyVersion(room.threadId);
      if (version !== known) {
        const snapshot = await lobbySnapshot(room.threadId, version);
        client.send("lobby", { ...snapshot, version });
        if (room.version === null) {
          room.version = version;
          room.content = JSON.stringify(snapshot);
        }
      }
      room.version ??= version;
    } catch (error) {
      console.error("[live] first lobby read failed:", error);
    }
    client.send("selections", this.selectionList(room));
    room.viewers = -1; // the next flush sends the new count to everyone
  }

  private leave(room: Room, client: LiveClient): void {
    room.clients.delete(client);
    if (client.userId && ![...room.clients].some((other) => other.userId === client.userId)) {
      if (room.selections.delete(client.userId)) room.selectionsDirty = true;
    }
    if (room.clients.size === 0) this.rooms.delete(room.threadId);
    else room.viewers = -1;
  }

  private async check(room: Room): Promise<void> {
    if (room.checking) {
      room.recheck = true;
      return;
    }
    room.checking = true;
    try {
      do {
        room.recheck = false;
        invalidateLobby(room.threadId);
        const version = await lobbyVersion(room.threadId);
        if (version !== room.version) {
          const snapshot = await lobbySnapshot(room.threadId, version);
          room.version = version;
          // The version also rolls over every minute (names, avatars): only
          // send when the lobby itself differs.
          const content = JSON.stringify(snapshot);
          if (content !== room.content) {
            room.content = content;
            this.broadcast(room, "lobby", { ...snapshot, version });
          } else {
            // Same lobby, new version: maps keep it for their safety poll.
            this.broadcast(room, "lobby", { unchanged: true, version });
          }
        }
      } while (room.recheck && this.rooms.get(room.threadId) === room);
    } catch (error) {
      console.error("[live] lobby check failed:", error);
    } finally {
      room.checking = false;
    }
  }

  private tick(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      void this.check(room);
      for (const [userId, selection] of room.selections) {
        if (selection.until < now) {
          room.selections.delete(userId);
          room.selectionsDirty = true;
        }
      }
    }
    if (now - this.lastPing >= PING_MS) {
      this.lastPing = now;
      for (const room of this.rooms.values()) this.broadcast(room, "ping", now);
    }
    for (const [userId, bucket] of this.buckets) {
      if (now - bucket.at > 60_000) this.buckets.delete(userId);
    }
  }

  private flush(): void {
    for (const room of this.rooms.values()) {
      if (room.selectionsDirty) {
        room.selectionsDirty = false;
        this.broadcast(room, "selections", this.selectionList(room));
      }
      const viewers = this.viewerCount(room);
      if (viewers !== room.viewers) {
        room.viewers = viewers;
        this.broadcast(room, "viewers", { count: viewers });
      }
    }
  }

  private broadcast(room: Room, event: string, data: unknown): void {
    for (const client of room.clients) {
      if (!client.send(event, data)) {
        client.close();
        this.leave(room, client);
      }
    }
  }

  private selectionList(room: Room): LiveSelection[] {
    return [...room.selections.values()].map((selection) => ({
      user_id: selection.user_id,
      name: selection.name,
      avatar_url: selection.avatar_url,
      tag: selection.tag,
    }));
  }

  /** People, not tabs: one logged-in player with two tabs counts once. */
  private viewerCount(room: Room): number {
    const people = new Set<string>();
    for (const client of room.clients) people.add(client.userId ?? `anonymous:${client.id}`);
    return people.size;
  }

  private take(userId: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(userId) ?? { tokens: BUCKET_SIZE, at: now };
    bucket.tokens = Math.min(BUCKET_SIZE, bucket.tokens + (now - bucket.at) * BUCKET_REFILL_PER_MS);
    bucket.at = now;
    this.buckets.set(userId, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}

/** The one hub of this server process (survives dev hot reloads). */
export function liveHub(): LiveHub {
  const holder = globalThis as { __gmLiveHub?: LiveHub };
  holder.__gmLiveHub ??= new LiveHub();
  return holder.__gmLiveHub;
}
