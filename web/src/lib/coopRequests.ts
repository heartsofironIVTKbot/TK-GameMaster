/**
 * Co-op requests on the map. A player picks a major someone already holds and
 * presses Request co-op; the nation's player accepts or declines (on the map
 * or in the bot's DM). The bot keeps them in the game document
 * (`coop_requests`, one per requester) — bot.py.py _process_web_coop.
 * Client-safe.
 */

export type CoopStatus = "pending" | "approved" | "declined" | "withdrawn" | "expired" | "failed";

const STATUSES: CoopStatus[] = ["pending", "approved", "declined", "withdrawn", "expired", "failed"];

/** A request is only answered within a day (bot: COOP_REQUEST_TTL_SEC). */
export const COOP_REQUEST_TTL_SEC = 24 * 3600;

export interface CoopRequest {
  /** Who asks. */
  user_id: string;
  /** Their Discord display name when they asked. */
  name: string | null;
  /** The major (the bot's name for it). */
  nation: string;
  /** Who was on the nation when they asked. */
  owner: string;
  status: CoopStatus;
  /** When they asked (epoch seconds). */
  ts: number;
  decided_at: number | null;
}

/** GET /api/coop?thread_id= */
export interface CoopState {
  /** The viewer's latest request in this game. */
  mine: CoopRequest | null;
  /** Requests waiting for the viewer's answer (they hold the nation). */
  incoming: CoopRequest[];
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** game_data.coop_requests → entries, newest first. */
export function parseCoopRequests(raw: unknown): CoopRequest[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .map(([userId, value]): CoopRequest | null => {
      if (!/^\d{5,25}$/.test(userId) || !value || typeof value !== "object") return null;
      const entry = value as Record<string, unknown>;
      const status = String(entry.status ?? "") as CoopStatus;
      const nation = String(entry.nation ?? "").trim();
      if (!STATUSES.includes(status) || !nation) return null;
      return {
        user_id: userId,
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim().slice(0, 64) : null,
        nation,
        owner: String(entry.owner ?? ""),
        status,
        ts: num(entry.ts),
        decided_at: entry.decided_at == null ? null : num(entry.decided_at),
      };
    })
    .filter((entry): entry is CoopRequest => entry !== null)
    .sort((a, b) => b.ts - a.ts);
}

/** The viewer's side of a game's requests (`now`: epoch seconds). */
export function coopStateFor(requests: CoopRequest[], viewerId: string, now: number): CoopState {
  const fresh = (entry: CoopRequest) => now - entry.ts <= COOP_REQUEST_TTL_SEC;
  return {
    mine: requests.find((entry) => entry.user_id === viewerId) ?? null,
    incoming: requests.filter((entry) => entry.status === "pending" && entry.owner === viewerId && fresh(entry)),
  };
}
