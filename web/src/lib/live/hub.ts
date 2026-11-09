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
 *  - Selections ("Ivan is picking Germany") are memory only, never
 *    stored, and each one is a HOLD: for 30 s the nation is that player's to
 *    reserve, nobody else can select or reserve it (/api/reserve asks
 *    `holderOf`). Selecting it again doesn't restart the clock; when it runs
 *    out the hold goes and that player waits 15 s before taking the same
 *    nation again, so others get their chance. Rate-limited per player,
 *    dropped when the player's last map closes. A new map gets the full list
 *    once; after that only changes go out, merged at most every 100 ms per
 *    room (250 ms with over 400 viewers). The full list to every viewer on
 *    every change grows with viewers × selections and swamps the server at
 *    a few hundred players.
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
  /** How long the hold has left when this was sent (ms). */
  ends_in_ms: number;
}

/** A player's 30-second hold on a nation (their selection). */
interface Hold {
  user_id: string;
  name: string;
  tag: string;
  until: number;
}

/** What selecting a nation did. */
export type SelectResult =
  | { status: "holding"; ends_in_ms: number }
  | { status: "held"; name: string; ends_in_ms: number }
  | { status: "cooldown"; ends_in_ms: number }
  | { status: "cleared" | "ignored" }
  | { status: "limited" };

interface Room {
  threadId: string;
  clients: Set<LiveClient>;
  /** Open maps per person (Discord id, or `anonymous:<client id>`). */
  people: Map<string, number>;
  version: string | null;
  /** The last lobby sent (JSON), so an unchanged rebuild isn't sent again. */
  content: string | null;
  /** Player id → their hold (one each). */
  selections: Map<string, Hold>;
  /** `${player}:${tag}` → when that player may take that nation again. */
  cooldowns: Map<string, number>;
  /** Selections changed since the last flush: the new one, or null = gone. */
  changed: Map<string, Hold | null>;
  lastFlush: number;
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
/**
 * Rooms this big merge selection changes over 250 ms: each flush is one
 * socket write per viewer, the largest CPU cost of a full room (load test).
 */
const BIG_ROOM = 400;
const BIG_ROOM_FLUSH_MS = 250;
const PING_MS = 20_000;
/** How long a selected nation is held for its player. */
export const HOLD_MS = 30_000;
/** After a hold runs out, the same player waits this long for that nation. */
export const HOLD_COOLDOWN_MS = 15_000;
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
        cooldowns: new Map(),
        changed: new Map(),
        lastFlush: 0,
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
   * A logged-in player selected a nation (or cleared it with `tag: null`):
   * a 30-second hold, unless someone else holds it or the player's own hold
   * on it just ran out. Only players with the game's map open count.
   */
  select(threadId: string, selection: { user_id: string; name: string; tag: string | null }): SelectResult {
    const room = this.rooms.get(threadId);
    if (!room || !room.people.has(selection.user_id)) return { status: "ignored" };
    if (!this.take(selection.user_id)) return { status: "limited" };
    const now = Date.now();
    const current = room.selections.get(selection.user_id);
    if (!selection.tag) {
      if (current) this.dropSelection(room, selection.user_id);
      return { status: "cleared" };
    }
    // Their own hold on it: keep it (re-selecting never restarts the clock).
    if (current?.tag === selection.tag && current.until > now) {
      return { status: "holding", ends_in_ms: current.until - now };
    }
    const holder = this.activeHolder(room, selection.tag, now);
    if (holder && holder.user_id !== selection.user_id) {
      return { status: "held", name: holder.name, ends_in_ms: holder.until - now };
    }
    const waitUntil = room.cooldowns.get(`${selection.user_id}:${selection.tag}`) ?? 0;
    if (waitUntil > now) return { status: "cooldown", ends_in_ms: waitUntil - now };
    const next: Hold = { user_id: selection.user_id, name: selection.name, tag: selection.tag, until: now + HOLD_MS };
    room.selections.set(next.user_id, next);
    room.changed.set(next.user_id, next);
    return { status: "holding", ends_in_ms: HOLD_MS };
  }

  /** Who holds this nation right now (null = nobody), for /api/reserve. */
  holderOf(threadId: string, tag: string | null): { user_id: string; name: string; ends_in_ms: number } | null {
    const room = this.rooms.get(threadId);
    if (!room || !tag) return null;
    const now = Date.now();
    const holder = this.activeHolder(room, tag, now);
    return holder ? { user_id: holder.user_id, name: holder.name, ends_in_ms: holder.until - now } : null;
  }

  /** A player reserved: their hold has done its job. */
  release(threadId: string, userId: string): void {
    const room = this.rooms.get(threadId);
    if (room) this.dropSelection(room, userId);
  }

  private activeHolder(room: Room, tag: string, now: number): Hold | null {
    for (const hold of room.selections.values()) {
      if (hold.tag === tag && hold.until > now) return hold;
    }
    return null;
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
    client.send(sseFrame("selections", this.selectionList(room, Date.now())));
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
      // Holds that ran out: free the nation, and that player waits a moment for it.
      for (const [userId, hold] of room.selections) {
        if (hold.until > now) continue;
        this.dropSelection(room, userId);
        room.cooldowns.set(`${userId}:${hold.tag}`, now + HOLD_COOLDOWN_MS);
      }
      for (const [key, until] of room.cooldowns) {
        if (until <= now) room.cooldowns.delete(key);
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
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.changed.size === 0) continue;
      if (room.clients.size > BIG_ROOM && now - room.lastFlush < BIG_ROOM_FLUSH_MS - FLUSH_MS / 2) continue;
      room.lastFlush = now;
      const set: LiveSelection[] = [];
      const gone: string[] = [];
      for (const [userId, selection] of room.changed) {
        if (selection) set.push(this.wire(selection, now));
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

  private selectionList(room: Room, now: number): LiveSelection[] {
    return [...room.selections.values()].map((hold) => this.wire(hold, now));
  }

  /** Time left, not a clock time: the viewers' clocks needn't match the server's. */
  private wire(hold: Hold, now: number): LiveSelection {
    return { user_id: hold.user_id, name: hold.name, tag: hold.tag, ends_in_ms: Math.max(0, hold.until - now) };
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
