import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import type { PublicStatus } from "@/lib/serverDashboardTypes";

/**
 * GameMaster's own status from the bot's heartbeat tables (bot.py.py STATUS
 * section): bot_heartbeat (one row, updated every minute), bot_uptime_days
 * (minutes online per UTC day) and bot_incidents (outages and restarts).
 */

/** No heartbeat for this long = offline (bot: BOT_OFFLINE_AFTER_SEC). */
export const OFFLINE_AFTER_SEC = 180;
const DAYS = 30;

export interface Heartbeat {
  started_at: number;
  beat_at: number;
  latency_ms: number | null;
  guilds: number;
  active_guilds: number;
}

function schemaGap(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR";
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** The bot's heartbeat, or null before the bot has ever sent one. */
export async function heartbeat(): Promise<Heartbeat | null> {
  if (isSchedulerDemo()) {
    const now = nowSec();
    return { started_at: now - 3 * 86_400 - 4_000, beat_at: now - 20, latency_ms: 42, guilds: 3, active_guilds: 1 };
  }
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT started_at, beat_at, latency_ms, guilds, active_guilds FROM bot_heartbeat WHERE id = 1",
    );
    const row = rows[0];
    if (!row) return null;
    return {
      started_at: Number(row.started_at) || 0,
      beat_at: Number(row.beat_at) || 0,
      latency_ms: row.latency_ms === null ? null : Number(row.latency_ms),
      guilds: Number(row.guilds) || 0,
      active_guilds: Number(row.active_guilds) || 0,
    };
  } catch (error) {
    if (schemaGap(error)) return null;
    throw error;
  }
}

export function isOnline(beat: Heartbeat | null, now = nowSec()): boolean | null {
  return beat ? now - beat.beat_at <= OFFLINE_AFTER_SEC : null;
}

function utcDay(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/** The public /status page. */
export async function publicStatus(): Promise<PublicStatus> {
  const now = nowSec();
  const beat = await heartbeat();
  const online = isOnline(beat, now);
  const dayList = Array.from({ length: DAYS }, (_, index) => utcDay(now - (DAYS - 1 - index) * 86_400));
  const todayStart = Math.floor(now / 86_400) * 86_400;
  const elapsedToday = Math.max(1, Math.floor((now - todayStart) / 60));

  let minutes = new Map<string, number>();
  let incidents: PublicStatus["incidents"] = [];
  if (isSchedulerDemo()) {
    // A plausible month: mostly up, one outage, a couple of restarts.
    minutes = new Map(dayList.map((day, index) => [day, index === 18 ? 1290 : index === DAYS - 1 ? elapsedToday : 1440]));
    incidents = [
      { kind: "restart", started_at: now - 3 * 86_400 - 4_000, ended_at: now - 3 * 86_400 - 4_000, detail: "GameMaster restarted" },
      { kind: "outage", started_at: now - 11 * 86_400, ended_at: now - 11 * 86_400 + 9_000, detail: "GameMaster was offline" },
    ];
  } else {
    try {
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, minutes FROM bot_uptime_days WHERE day >= ?",
        [dayList[0]],
      );
      minutes = new Map(rows.map((row) => [String(row.day), Number(row.minutes) || 0]));
      const [found] = await getPool().query<RowDataPacket[]>(
        `SELECT kind, started_at, ended_at, detail FROM bot_incidents
          WHERE started_at >= ? ORDER BY started_at DESC LIMIT 20`,
        [now - DAYS * 86_400],
      );
      incidents = found.map((row) => ({
        kind: row.kind === "outage" ? "outage" : "restart",
        started_at: Number(row.started_at) || 0,
        ended_at: row.ended_at === null ? null : Number(row.ended_at),
        detail: row.detail ?? null,
      }));
    } catch (error) {
      if (!schemaGap(error)) throw error;
    }
  }
  if (online === false && beat) {
    incidents = [{ kind: "outage", started_at: beat.beat_at, ended_at: null, detail: "GameMaster is offline" }, ...incidents];
  }

  // Days before the first recorded one have no data; after it, a missing day was down.
  const firstIndex = dayList.findIndex((day) => minutes.has(day));
  let upMinutes = 0;
  let expected = 0;
  const days = dayList.map((day, index) => {
    if (firstIndex < 0 || index < firstIndex) return { day, percent: null };
    const possible = index === DAYS - 1 ? elapsedToday : 1440;
    const up = Math.min(possible, minutes.get(day) ?? 0);
    upMinutes += up;
    expected += possible;
    return { day, percent: Math.round((up / possible) * 1000) / 10 };
  });

  return {
    state: online === null ? "unknown" : online ? "online" : "offline",
    last_beat: beat?.beat_at ?? null,
    started_at: beat?.started_at ?? null,
    latency_ms: online ? (beat?.latency_ms ?? null) : null,
    servers: beat?.active_guilds ?? null,
    days,
    uptime_30d: expected > 0 ? Math.round((upMinutes / expected) * 10000) / 100 : null,
    incidents,
    checked_at: now,
  };
}
