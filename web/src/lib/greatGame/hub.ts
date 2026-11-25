import { checkTimeout, getState, onEventChange } from "./store";

/**
 * Great Game live channel: every open page of an event gets the whole event
 * state (Server-Sent Events) the moment anything changes, so the wheel, the
 * cards, the glow on a nation and every pick reach all ~40 viewers at once.
 * A result is decided and saved before it is sent; the page plays the
 * animation from the time stamped on it, so a page that loads mid-spin
 * shows where the spin is (or its result).
 *
 * "Considering" (the yellow glow while a captain looks at a nation) and the
 * live scratching of a vice-captain ticket are not saved: they live here and
 * go out to everyone.
 *
 * It also checks the turn clock of every open event once a second.
 */

export interface GGClient {
  id: number;
  send(frame: string): boolean;
  close(): void;
}

/**
 * The vice-captain ticket being scratched by hand: the strokes so far (each a
 * polyline of x, y pairs in 0..1 of the scratch area) and whether it has been
 * scratched clear. Only for the latest vice draw.
 */
export interface GGScratch {
  seq: number;
  lines: number[][];
  done: boolean;
}

/** Enough for a thorough scratch; anything past it is ignored. */
const MAX_SCRATCH_POINTS = 6000;

/** Step 4: the face-down card the captain on the clock is pointing at. */
export interface GGHover {
  team: string;
  card: number;
}

interface Room {
  clients: Set<GGClient>;
  considering: Record<string, { tag: string; by: string; at: number } | null>;
  scratch: GGScratch | null;
  hover: GGHover | null;
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

class GGHub {
  private rooms = new Map<string, Room>();
  private nextId = 1;
  private lastPing = Date.now();

  constructor() {
    onEventChange((slug) => void this.push(slug));
    setInterval(() => void this.tick(), 1000).unref?.();
  }

  newClientId() {
    return this.nextId++;
  }

  private room(slug: string): Room {
    let room = this.rooms.get(slug);
    if (!room) {
      room = { clients: new Set(), considering: {}, scratch: null, hover: null };
      this.rooms.set(slug, room);
    }
    return room;
  }

  async subscribe(slug: string, client: GGClient): Promise<() => void> {
    const room = this.room(slug);
    room.clients.add(client);
    const state = await getState(slug);
    if (state) client.send(frame("state", state));
    client.send(frame("considering", room.considering));
    if (room.scratch) client.send(frame("scratch", room.scratch));
    client.send(frame("hover", room.hover));
    this.broadcast(slug, "viewers", { count: room.clients.size });
    return () => {
      room.clients.delete(client);
      this.broadcast(slug, "viewers", { count: room.clients.size });
    };
  }

  private broadcast(slug: string, event: string, data: unknown) {
    const room = this.rooms.get(slug);
    if (!room) return;
    const text = frame(event, data);
    for (const client of [...room.clients]) {
      if (!client.send(text)) {
        room.clients.delete(client);
        client.close();
      }
    }
  }

  private async push(slug: string) {
    const room = this.rooms.get(slug);
    if (!room) return;
    const state = await getState(slug);
    if (!state) return;
    // A pick or ban ends that team's glow.
    if (state.turn.team === null || state.phase !== "bans" && state.phase !== "draft") room.considering = {};
    for (const team of state.teams) {
      const glow = room.considering[team.id];
      if (glow && (team.ban === glow.tag || team.picks.includes(glow.tag) || state.turn.team !== team.id)) room.considering[team.id] = null;
    }
    this.broadcast(slug, "state", state);
    this.broadcast(slug, "considering", room.considering);
    // A flip (or a new turn) ends the pointing.
    if (room.hover && (state.phase !== "recruits" || state.turn.team !== room.hover.team)) {
      room.hover = null;
      this.broadcast(slug, "hover", null);
    }
  }

  /** A team's captain (or an organizer) is looking at a nation; "" clears it. */
  consider(slug: string, team: string, tag: string, by: string) {
    const room = this.room(slug);
    room.considering[team] = tag ? { tag, by, at: Date.now() } : null;
    this.broadcast(slug, "considering", room.considering);
  }

  /** The captain on the clock points at face-down card `card` (null: none). */
  hover(slug: string, team: string, card: number | null) {
    const room = this.room(slug);
    const next = card === null ? null : { team, card };
    if (room.hover?.team === next?.team && room.hover?.card === next?.card) return;
    room.hover = next;
    this.broadcast(slug, "hover", next);
  }

  /** Strokes on the ticket of vice draw `seq` (a new seq starts a fresh ticket); `done`: scratched clear. */
  scratch(slug: string, seq: number, line: number[] | null, done: boolean) {
    const room = this.room(slug);
    if (!room.scratch || room.scratch.seq !== seq) room.scratch = { seq, lines: [], done: false };
    const scratch = room.scratch;
    if (scratch.done) return;
    const used = scratch.lines.reduce((sum, entry) => sum + entry.length, 0);
    const add = line && line.length >= 2 && used + line.length <= MAX_SCRATCH_POINTS * 2 ? line : null;
    if (add) scratch.lines.push(add);
    if (done) scratch.done = true;
    if (add || done) this.broadcast(slug, "scratch-add", { seq, line: add, done: scratch.done });
  }

  private async tick() {
    const now = Date.now();
    const ping = now - this.lastPing > 20_000;
    if (ping) this.lastPing = now;
    for (const [slug, room] of this.rooms) {
      if (!room.clients.size) continue;
      await checkTimeout(slug).catch((error) => console.error("[greatgame] timeout check failed:", error));
      if (ping) this.broadcast(slug, "ping", now);
    }
  }
}

export function ggHub(): GGHub {
  const g = globalThis as { __ggHub?: GGHub };
  if (!g.__ggHub) g.__ggHub = new GGHub();
  return g.__ggHub;
}
