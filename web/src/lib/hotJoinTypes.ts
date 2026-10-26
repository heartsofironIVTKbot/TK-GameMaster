/**
 * Hot-join on the website (replaces the Hot-Join panel in the reservation
 * thread). A player asks on the map for a free nation in a running game; the
 * game's host approves or declines on the Games page. The bot keeps the
 * requests in the game document (`hotjoin_requests`) — bot.py.py
 * _process_web_hotjoin. Client-safe.
 */

export type HotJoinStatus = "pending" | "approved" | "declined" | "withdrawn" | "failed";

const STATUSES: HotJoinStatus[] = ["pending", "approved", "declined", "withdrawn", "failed"];

export interface HotJoinEntry {
  user_id: string;
  /** The nation they asked for (the bot's name for it). */
  nation: string;
  status: HotJoinStatus;
  /** When they asked (epoch seconds). */
  ts: number;
  /** Their slot before asking (they want to move), or null. */
  current: string | null;
  decided_at: number | null;
  decided_by: string | null;
}

/** A request as the Games page lists it. */
export interface HotJoinRequestView extends HotJoinEntry {
  name: string;
  avatar_url: string | null;
  decided_by_name: string | null;
}

/** POST /api/schedule/requests {action: "hotjoin_decide"} (bot: _web_hotjoin_decide). */
export interface HotJoinDecidePayload {
  thread_id: string;
  user_id: string;
  approve: boolean;
  /** Approve despite the late-join warnings (Major cooldown, repeat Minor, Dishonored). */
  force?: boolean;
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** game_data.hotjoin_requests → entries, pending first, then newest first. */
export function parseHotJoin(raw: unknown): HotJoinEntry[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .flatMap(([userId, value]) => {
      if (!/^\d+$/.test(userId) || !value || typeof value !== "object") return [];
      const entry = value as Record<string, unknown>;
      const status = STATUSES.find((candidate) => candidate === entry.status);
      if (!status || typeof entry.nation !== "string" || !entry.nation) return [];
      return [
        {
          user_id: userId,
          nation: entry.nation,
          status,
          ts: num(entry.ts),
          current: typeof entry.current === "string" && entry.current ? entry.current : null,
          decided_at: num(entry.decided_at) || null,
          decided_by: entry.by ? String(entry.by) : null,
        },
      ];
    })
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.ts - a.ts);
}

/** Plain words for a status (the map and the Games page). */
export const HOTJOIN_STATUS_TEXT: Record<HotJoinStatus, string> = {
  pending: "Waiting for the host",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
  failed: "Couldn't be done",
};
