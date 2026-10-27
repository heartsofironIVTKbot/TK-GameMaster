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
 *    stored. Rate-limited per player, dropped 12 s after the player's last
 *    refresh. A new map gets the full list once; after that only changes
 *    go out, merged at most every 100 ms per room — the full list to every
 *    viewer on every change grows with viewers × selections and swamps the
 *    server at a few hundred players.
 *  - Every event is serialized once per room, not once per viewer.
 *  - One process: the website runs as a single server. With several
 *    servers this needs a shared bus (Redis pub/sub) behind the same API.
 */

export interface LiveClient {
  readonly id: number;
  /** Logged-in viewer's Discord id (null = anonymous). */
  readonly userId: string | null;
  /** Queue a ready SSE frame (see `sseFrame`); false when the connection is gone or hopelessly behind. */
  send(frame: string): boolean;
  close(): void;
}

export interface LiveSelection {
  user_id: string;
  name: string;
  tag: string;
}

interface Room {
  threadId: string;
  clients: Set<LiveClient>;
  /** Open maps per person (Discord id, or `anonymous:<client id>`). */
  people: Map<string, number>;
  version: string | null;
  /** The last lobby sent (JSON), so an unchanged rebuild isn't sent again. */
  content: string | null;
  selections: Map<string, LiveSelection & { until: number }>;
  /** Selections changed since the last flush: the new one, or null = gone. */
  changed: Map<string, LiveSelection | null>;
  viewers: number;
  checking: boolean;
  recheck: boolean;
}

export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const personOf = (client: LiveClient) => client.userId ?? `anonymous:${client.id}`;

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
        people: new Map(),
        version: null,
        content: null,
        selections: new Map(),
        changed: new Map(),
        viewers: 0,
        checking: false,
        recheck: false,
      };
      this.rooms.set(threadId, room);
    }
    if (room.clients.size >= MAX_CLIENTS_PER_ROOM) return null;
    room.clients.add(client);
    room.people.set(personOf(client), (room.people.get(personOf(client)) ?? 0) + 1);
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
    if (!room || !room.people.has(selection.user_id)) return true;
    if (!this.take(selection.user_id)) return false;
    const current = room.selections.get(selection.user_id);
    if (!selection.tag) {
      if (current) this.dropSelection(room, selection.user_id);
      return true;
    }
    const next = { user_id: selection.user_id, name: selection.name, tag: selection.tag };
    if (current?.tag !== next.tag || current.name !== next.name) room.changed.set(next.user_id, next);
    room.selections.set(next.user_id, { ...next, until: Date.now() + SELECTION_TTL_MS });
    return true;
  }

  private dropSelection(room: Room, userId: string): void {
    if (room.selections.delete(userId)) room.changed.set(userId, null);
  }

  private async greet(room: Room, client: LiveClient, known: string | null): Promise<void> {
    try {
      const version = await lobbyVersion(room.threadId);
      if (version !== known) {
        const snapshot = await lobbySnapshot(room.threadId, version);
        client.send(sseFrame("lobby", { ...snapshot, version }));
        if (room.version === null) {
          room.version = version;
          room.content = JSON.stringify(snapshot);
        }
      }
      room.version ??= version;
    } catch (error) {
      console.error("[live] first lobby read failed:", error);
    }
    client.send(sseFrame("selections", this.selectionList(room)));
    // Everyone else hears about a changed count from the next tick.
    client.send(sseFrame("viewers", { count: room.people.size }));
  }

  private leave(room: Room, client: LiveClient): void {
    if (!room.clients.delete(client)) return;
    const person = personOf(client);
    const left = (room.people.get(person) ?? 1) - 1;
    if (left > 0) room.people.set(person, left);
    else {
      room.people.delete(person);
      if (client.userId) this.dropSelection(room, client.userId);
    }
    if (room.clients.size === 0) this.rooms.delete(room.threadId);
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
        if (selection.until < now) this.dropSelection(room, userId);
      }
      // People, not tabs: one logged-in player with two tabs counts once.
      if (room.people.size !== room.viewers) {
        room.viewers = room.people.size;
        this.broadcast(room, "viewers", { count: room.viewers });
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

  /** Changed selections since the last flush: `{set: [...], gone: [user ids]}`. */
  private flush(): void {
    for (const room of this.rooms.values()) {
      if (room.changed.size === 0) continue;
      const set: LiveSelection[] = [];
      const gone: string[] = [];
      for (const [userId, selection] of room.changed) {
        if (selection) set.push(selection);
        else gone.push(userId);
      }
      room.changed.clear();
      this.broadcast(room, "selected", { set, gone });
    }
  }

  private broadcast(room: Room, event: string, data: unknown): void {
    const frame = sseFrame(event, data);
    for (const client of room.clients) {
      if (!client.send(frame)) {
        client.close();
        this.leave(room, client);
      }
    }
  }

  private selectionList(room: Room): LiveSelection[] {
    return [...room.selections.values()].map(({ user_id, name, tag }) => ({ user_id, name, tag }));
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
