import {
  ACCESS_LEVELS,
  GAME_START_INTERVALS,
  type GameAccessPayload,
  type GameCancelPayload,
  type GameEndPayload,
  type GameRemindPayload,
  type GameResourcesPayload,
  type GameStartPayload,
  type LifecycleAction,
} from "@/lib/gameControlTypes";
import { PRESET_LIMITS } from "@/lib/presetTypes";
import { validateResourceList } from "@/lib/presetValidation";

/**
 * Checks for Games page requests before they're queued for the bot (the
 * bot's _process_web_game_lifecycle re-checks everything against live data).
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const SNOWFLAKE_RE = /^\d{5,25}$/;

export const LIFECYCLE_ACTIONS: readonly LifecycleAction[] = ["game_start", "game_end", "game_cancel"];

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function validateGameLifecycle(
  action: LifecycleAction,
  raw: unknown,
): Result<GameStartPayload | GameEndPayload | GameCancelPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const threadId = text(body.thread_id);
  if (!SNOWFLAKE_RE.test(threadId)) return { ok: false, error: "Invalid game." };

  if (action === "game_end") return { ok: true, value: { thread_id: threadId } };

  if (action === "game_cancel") {
    const reason = text(body.reason);
    if (reason.length < 3) return { ok: false, error: "Give a reason — it's sent to every reserved player." };
    if (reason.length > 1000) return { ok: false, error: "Keep the reason under 1000 characters." };
    return { ok: true, value: { thread_id: threadId, reason } };
  }

  const serverId = text(body.server_id);
  const password = text(body.password);
  const checksum = text(body.checksum).toUpperCase();
  const interval = GAME_START_INTERVALS.find((value) => value === Number(body.interval_minutes));
  if (!serverId || serverId.length > 64) return { ok: false, error: "Enter the in-game server ID." };
  if (!password || password.length > 64) return { ok: false, error: "Enter the in-game server password." };
  if (!/^[A-Z0-9]{4}$/.test(checksum)) return { ok: false, error: "The checksum must be exactly four letters or digits." };
  if (!interval) return { ok: false, error: "Pick an attendance interval: 20, 30 or 40 minutes." };
  return {
    ok: true,
    value: { thread_id: threadId, server_id: serverId, password, checksum, interval_minutes: interval },
  };
}

/** A reminder round (formerly /remind). */
export function validateGameRemind(raw: unknown): Result<GameRemindPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const threadId = text(body.thread_id);
  if (!SNOWFLAKE_RE.test(threadId)) return { ok: false, error: "Invalid game." };
  if (body.kind !== "early" && body.kind !== "late") return { ok: false, error: "Pick an early or a late reminder." };
  return { ok: true, value: { thread_id: threadId, kind: body.kind } };
}

/** A reservation access change (formerly /lock, /unlock, /lockdown, /nation_lock, /nation_unlock, /clear). */
export function validateGameAccess(raw: unknown): Result<GameAccessPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const threadId = text(body.thread_id);
  if (!SNOWFLAKE_RE.test(threadId)) return { ok: false, error: "Invalid game." };
  switch (body.op) {
    case "levels": {
      const major = ACCESS_LEVELS.find((level) => level === body.major_level);
      const minor = ACCESS_LEVELS.find((level) => level === body.minor_level);
      if (!major || !minor) return { ok: false, error: "Pick who may reserve Majors and Minors." };
      return { ok: true, value: { thread_id: threadId, op: "levels", major_level: major, minor_level: minor } };
    }
    case "lockdown":
      return { ok: true, value: { thread_id: threadId, op: "lockdown", enabled: body.enabled === true } };
    case "nation_lock":
    case "nation_unlock": {
      const nation = text(body.nation).slice(0, 128);
      if (!nation) return { ok: false, error: "Pick a nation." };
      return { ok: true, value: { thread_id: threadId, op: body.op, nation } };
    }
    case "clear":
      return { ok: true, value: { thread_id: threadId, op: "clear" } };
    default:
      return { ok: false, error: "Unknown access change." };
  }
}

/** A game's whole mods or rules list (formerly /post_mods, /post_rules). */
export function validateGameResources(raw: unknown): Result<GameResourcesPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const threadId = text(body.thread_id);
  if (!SNOWFLAKE_RE.test(threadId)) return { ok: false, error: "Invalid game." };
  if (body.resource !== "mods" && body.resource !== "rules") return { ok: false, error: "Pick the mods or the rules." };
  const list = validateResourceList(
    Array.isArray(body.entries) ? body.entries : [],
    body.resource === "mods" ? PRESET_LIMITS.mods : PRESET_LIMITS.gameRules,
    body.resource === "mods" ? "mods" : "rulesets",
  );
  if (!list.ok) return list;
  return { ok: true, value: { thread_id: threadId, resource: body.resource, entries: list.value ?? [] } };
}
