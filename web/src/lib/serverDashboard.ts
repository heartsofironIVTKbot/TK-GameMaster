import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { heartbeat, isOnline } from "@/lib/botStatus";
import { lookupMembers } from "@/lib/memberDirectory";
import { recentActivity } from "@/lib/playerIndex";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import type {
  DashboardGame,
  ServerDashboard,
  ServerLiveStatus,
  StatusCheck,
} from "@/lib/serverDashboardTypes";

/**
 * The owner dashboard and the Health tab's live checks for one server
 * (docs/server-setup.md, Stage 3). Everything is read from tables the bot
 * keeps; a table that doesn't exist yet (older bot) just reads as empty.
 */

const DAY = 86_400;
const WINDOW_DAYS = 30;
/** A snapshot older than this means the bot isn't reporting this server. */
const SNAPSHOT_STALE_SEC = 30 * 60;
/** A website request still waiting after this long is stuck. */
const REQUEST_STUCK_SEC = 5 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

async function rows<T extends RowDataPacket>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    const [result] = await getPool().query<T[]>(sql, params);
    return result;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") return [];
    throw error;
  }
}

function ago(sec: number, now = nowSec()): string {
  const diff = Math.max(0, now - sec);
  if (diff < 90) return "just now";
  if (diff < 3_600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 2 * DAY) return `${Math.round(diff / 3_600)} h ago`;
  return `${Math.round(diff / DAY)} days ago`;
}

function ids(text: string | null): string[] {
  return text ? (text.match(/\d{5,25}/g) ?? []) : [];
}

// --- live status --------------------------------------------------------------

interface StatusInputs {
  beat: Awaited<ReturnType<typeof heartbeat>>;
  snapshotAt: number | null;
  commands: ServerLiveStatus["commands"];
  requests: ServerLiveStatus["requests"];
}

/** The checks, in order of importance (pure: also used for preview data). */
export function statusChecks(input: StatusInputs, setupDone: boolean, now = nowSec()): StatusCheck[] {
  const checks: StatusCheck[] = [];
  const online = isOnline(input.beat, now);
  if (online === null) {
    checks.push({
      id: "bot",
      level: "warning",
      title: "No status from GameMaster yet",
      detail: "The bot reports in every minute once it runs the latest update.",
    });
  } else if (!online) {
    checks.push({
      id: "bot",
      level: "error",
      title: "GameMaster is offline",
      detail: `Last heard from ${ago(input.beat!.beat_at, now)}. It usually comes back on its own — the status page shows when it does.`,
      fix: { href: "/status", label: "Status page" },
    });
  } else {
    checks.push({
      id: "bot",
      level: "ok",
      title: "GameMaster is online",
      detail: `Reported ${ago(input.beat!.beat_at, now)}${input.beat!.latency_ms !== null ? ` · ${input.beat!.latency_ms} ms to Discord` : ""}.`,
    });
  }

  if (input.snapshotAt === null) {
    checks.push({
      id: "snapshot",
      level: "error",
      title: "GameMaster hasn't reported this server yet",
      detail: "It reads your roles and channels when it joins and every few minutes after.",
      fix: { op: "refresh" },
    });
  } else if (now - input.snapshotAt > SNAPSHOT_STALE_SEC) {
    checks.push({
      id: "snapshot",
      level: "warning",
      title: "This server's roles and channels are out of date",
      detail: `GameMaster last read them ${ago(input.snapshotAt, now)}.`,
      fix: { op: "refresh" },
    });
  } else {
    checks.push({
      id: "snapshot",
      level: "ok",
      title: "Roles and channels are up to date",
      detail: `Read ${ago(input.snapshotAt, now)}.`,
    });
  }

  if (setupDone) {
    const commands = input.commands;
    if (commands?.error) {
      checks.push({ id: "commands", level: "error", title: "Slash command sync failed", detail: commands.error, fix: { op: "sync_commands" } });
    } else if (!commands?.synced_at) {
      checks.push({
        id: "commands",
        level: "warning",
        title: "No slash command sync recorded yet",
        detail: "GameMaster syncs its commands at startup and when setup finishes.",
        fix: { op: "sync_commands" },
      });
    } else {
      checks.push({
        id: "commands",
        level: "ok",
        title: `${commands.count ?? 0} slash commands available`,
        detail: `Synced ${ago(commands.synced_at, now)}.`,
      });
    }
  }

  const { stuck, failed_24h: failed, recent_errors: errors } = input.requests;
  if (stuck > 0) {
    checks.push({
      id: "requests",
      level: "warning",
      title: `${stuck} website request${stuck === 1 ? " is" : "s are"} waiting`,
      detail: "GameMaster hasn't picked them up for 5+ minutes — it may be offline or very busy.",
    });
  } else if (failed > 0) {
    checks.push({
      id: "requests",
      level: "warning",
      title: `${failed} website request${failed === 1 ? "" : "s"} failed in the last day`,
      detail: errors[0] ? `Latest: ${errors[0].error.replace(/^❌\s*/, "")}` : "See each page's messages for details.",
    });
  } else {
    checks.push({ id: "requests", level: "ok", title: "Website requests are going through", detail: "Nothing waiting or failed in the last day." });
  }
  return checks;
}

async function liveStatus(guildId: string, setupDone: boolean, demoSnapshotAt: number | null): Promise<ServerLiveStatus> {
  const now = nowSec();
  const beat = await heartbeat();
  let snapshotAt: number | null;
  let commands: ServerLiveStatus["commands"];
  let requests: ServerLiveStatus["requests"];
  if (isSchedulerDemo()) {
    snapshotAt = demoSnapshotAt;
    commands = setupDone ? { synced_at: now - 3 * 3_600, count: 10, error: null } : null;
    requests = { stuck: 0, failed_24h: 0, recent_errors: [] };
  } else {
    const [snap, command, stuck, failed, errors] = await Promise.all([
      rows<RowDataPacket>("SELECT JSON_EXTRACT(data, '$.updated_at') AS at FROM web_guild_snapshot WHERE guild_id = ?", [guildId]),
      rows<RowDataPacket>(
        "SELECT commands_synced_at, commands_count, commands_error FROM guild_bot_status WHERE guild_id = ?",
        [guildId],
      ),
      rows<RowDataPacket>(
        "SELECT COUNT(*) AS n FROM web_schedule_requests WHERE guild_id = ? AND status = 'pending' AND created_at < ?",
        [guildId, now - REQUEST_STUCK_SEC],
      ),
      rows<RowDataPacket>(
        "SELECT COUNT(*) AS n FROM web_schedule_requests WHERE guild_id = ? AND status = 'error' AND created_at >= ?",
        [guildId, now - DAY],
      ),
      rows<RowDataPacket>(
        `SELECT action, error, COALESCE(processed_at, created_at) AS at FROM web_schedule_requests
          WHERE guild_id = ? AND status = 'error' AND created_at >= ? ORDER BY created_at DESC LIMIT 3`,
        [guildId, now - DAY],
      ),
    ]);
    snapshotAt = snap[0]?.at != null ? Number(snap[0].at) || null : null;
    commands = command[0]
      ? {
          synced_at: command[0].commands_synced_at === null ? null : Number(command[0].commands_synced_at),
          count: command[0].commands_count === null ? null : Number(command[0].commands_count),
          error: command[0].commands_error ?? null,
        }
      : null;
    requests = {
      stuck: Number(stuck[0]?.n) || 0,
      failed_24h: Number(failed[0]?.n) || 0,
      recent_errors: errors.map((row) => ({ action: String(row.action), error: String(row.error ?? ""), at: Number(row.at) || 0 })),
    };
  }
  return {
    bot_online: isOnline(beat, now),
    last_beat: beat?.beat_at ?? null,
    started_at: beat?.started_at ?? null,
    latency_ms: beat?.latency_ms ?? null,
    snapshot_at: snapshotAt,
    commands,
    requests,
    checks: statusChecks({ beat, snapshotAt, commands, requests }, setupDone, now),
  };
}

/** The Health tab's live checks only. */
export async function serverLiveStatus(guildId: string, setupDone: boolean, demoSnapshotAt: number | null = null) {
  return liveStatus(guildId, setupDone, demoSnapshotAt);
}

// --- usage, games, staff -----------------------------------------------------

interface GameRow extends RowDataPacket {
  thread_id: string;
  mode: string | null;
  thread_name: string | null;
  host_id: string | null;
  start_timestamp: number | string | null;
  status: string | null;
  game_started: number | null;
  present_ids: string | null;
  snapshot_done: string | null;
}

function demoDashboard(guildId: string, status: ServerLiveStatus): ServerDashboard {
  const now = nowSec();
  if (guildId !== HOME_GUILD_ID) {
    return {
      status,
      usage: { days: WINDOW_DAYS, games_hosted: 0, players: 0, hosts: 0, attendance_rate: null, modes: [] },
      upcoming: [],
      recent: [],
      staff: { top_hosts: [], moderation: [] },
    };
  }
  const game = (id: string, mode: string, name: string, ts: number, host: string, players: number | null): DashboardGame => ({
    id, mode, name, ts, host_name: host, players, url: null,
  });
  return {
    status,
    usage: {
      days: WINDOW_DAYS,
      games_hosted: 27,
      players: 184,
      hosts: 9,
      attendance_rate: 0.86,
      modes: [
        { mode: "Roleplay", games: 11 },
        { mode: "Historical (Vanilla)", games: 7 },
        { mode: "Kaiserreich (FFA)", games: 4 },
        { mode: "Historical (TFB)", games: 3 },
        { mode: "Roleplay (Millennium Dawn)", games: 2 },
      ],
    },
    upcoming: [
      game("s1", "Roleplay", "Roleplay", now + 6 * 3_600, "Demo Host", null),
      game("s2", "Historical (TFB)", "Historical (TFB)", now + 30 * 3_600, "Senior Host", null),
      game("s3", "Kaiserreich (FFA)", "Kaiserreich (FFA)", now + 52 * 3_600, "casino_host", null),
    ],
    recent: [
      game("r1", "Roleplay", "Roleplay #86 — Road to 56", now - 2 * DAY, "Demo Host", 34),
      game("r2", "Historical (Vanilla)", "Vanilla 1936", now - 3 * DAY, "Senior Host", 18),
      game("r3", "Kaiserreich (FFA)", "Kaiserreich FFA", now - 5 * DAY, "md_enjoyer", 26),
    ],
    staff: {
      top_hosts: [
        { id: "100000000000000001", name: "Demo Host", avatar_url: null, games: 9 },
        { id: "200000000000000002", name: "Senior Host", avatar_url: null, games: 7 },
        { id: "400000000000000004", name: "md_enjoyer", avatar_url: null, games: 4 },
      ],
      moderation: [],
    },
  };
}

/** Everything the owner dashboard shows for one server. */
export async function serverDashboard(guildId: string, setupDone: boolean, demoSnapshotAt: number | null = null): Promise<ServerDashboard> {
  const status = await liveStatus(guildId, setupDone, demoSnapshotAt);
  if (isSchedulerDemo()) {
    const demo = demoDashboard(guildId, status);
    demo.staff.moderation = await recentActivity(6, guildId).catch(() => []);
    return demo;
  }
  const now = nowSec();
  const since = now - WINDOW_DAYS * DAY;
  const [games, upcomingRows, recentRows, moderation] = await Promise.all([
    rows<GameRow>(
      `SELECT thread_id, mode, thread_name, CAST(host_id AS CHAR) AS host_id, start_timestamp, status, game_started,
              CAST(JSON_EXTRACT(game_data, '$.present_ids') AS CHAR) AS present_ids,
              CAST(JSON_EXTRACT(game_data, '$.snapshot_done') AS CHAR) AS snapshot_done
         FROM games
        WHERE guild_id = ? AND COALESCE(start_timestamp, 0) BETWEEN ? AND ?
          AND (status IS NULL OR status <> 'cancelled')`,
      [guildId, since, now],
    ),
    rows<RowDataPacket>(
      `SELECT slot_id, mode, game_timestamp, CAST(host_id AS CHAR) AS host_id, host_username FROM schedule_slots
        WHERE guild_id = ? AND game_timestamp >= ? AND (status IS NULL OR status <> 'cancelled')
        ORDER BY game_timestamp LIMIT 5`,
      [guildId, now],
    ),
    rows<GameRow>(
      `SELECT thread_id, mode, thread_name, CAST(host_id AS CHAR) AS host_id, start_timestamp, status, game_started,
              NULL AS present_ids, NULL AS snapshot_done
         FROM games WHERE guild_id = ? AND status = 'ended' ORDER BY updated_at DESC LIMIT 5`,
      [guildId],
    ),
    recentActivity(6, guildId).catch(() => []),
  ]);

  const hosted = games.filter((game) => Number(game.game_started) === 1 || game.status === "ended");
  const threadIds = [...new Set([...hosted, ...recentRows].map((game) => String(game.thread_id)))];
  const reservations = threadIds.length
    ? await rows<RowDataPacket>(
        "SELECT thread_id, CAST(user_id AS CHAR) AS user_id FROM game_reservations WHERE thread_id IN (?)",
        [threadIds],
      )
    : [];
  const playersOf = new Map<string, Set<string>>();
  for (const row of reservations) {
    const key = String(row.thread_id);
    playersOf.set(key, (playersOf.get(key) ?? new Set()).add(String(row.user_id)));
  }

  const players = new Set<string>();
  let reserved = 0;
  let present = 0;
  const hostCounts = new Map<string, number>();
  const modeCounts = new Map<string, number>();
  for (const game of hosted) {
    const roster = playersOf.get(String(game.thread_id)) ?? new Set<string>();
    roster.forEach((id) => players.add(id));
    const taken = game.snapshot_done === "true" || (game.status === "ended" && game.present_ids !== null && game.present_ids !== "null");
    if (taken) {
      const showed = new Set(ids(game.present_ids));
      reserved += roster.size;
      present += [...roster].filter((id) => showed.has(id)).length;
    }
    if (game.host_id) hostCounts.set(game.host_id, (hostCounts.get(game.host_id) ?? 0) + 1);
    const mode = game.mode || "Unknown";
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
  }

  const topHosts = [...hostCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const names = await lookupMembers(
    [...topHosts.map(([id]) => id), ...upcomingRows.map((row) => String(row.host_id ?? "")), ...recentRows.map((row) => row.host_id ?? "")],
    guildId,
  ).catch(() => new Map());
  const nameOf = (id: string | null, fallback: string | null = null) => {
    const member = id ? names.get(id) : undefined;
    return member ? member.display_name || member.username || fallback : fallback;
  };

  return {
    status,
    usage: {
      days: WINDOW_DAYS,
      games_hosted: hosted.length,
      players: players.size,
      hosts: hostCounts.size,
      attendance_rate: reserved > 0 ? present / reserved : null,
      modes: [...modeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([mode, count]) => ({ mode, games: count })),
    },
    upcoming: upcomingRows.map((row) => ({
      id: String(row.slot_id),
      mode: String(row.mode ?? "Game"),
      name: String(row.mode ?? "Game"),
      ts: Number(row.game_timestamp) || 0,
      host_name: nameOf(String(row.host_id ?? ""), row.host_username ? String(row.host_username) : null),
      players: null,
      url: null,
    })),
    recent: recentRows.map((row) => ({
      id: String(row.thread_id),
      mode: row.mode || "Game",
      name: (row.thread_name || row.mode || "Game").replace(/\s*Reservations\s*$/i, ""),
      ts: Number(row.start_timestamp) || 0,
      host_name: nameOf(row.host_id),
      players: playersOf.get(String(row.thread_id))?.size ?? 0,
      // The game's attendance and history (threads are gone once a game ends; newer games have none).
      url: `/attendance?game=${row.thread_id}`,
    })),
    staff: {
      top_hosts: topHosts.map(([id, count]) => ({
        id,
        name: nameOf(id, `#${id}`) ?? `#${id}`,
        avatar_url: names.get(id)?.avatar_url ?? null,
        games: count,
      })),
      moderation,
    },
  };
}
