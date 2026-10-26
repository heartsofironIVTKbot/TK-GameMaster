import type { RowDataPacket } from "mysql2";
import { currentGuildId, isHomeGuild, playerRecords, readBotConfig } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { demoActivity, demoModerationOptions, demoPlayerIndex } from "@/lib/databaseDemo";
import { lookupMembers } from "@/lib/memberDirectory";
import { memberRoleIds } from "@/lib/memberRoles";
import {
  PORTFOLIO_MODES,
  type ActivityItem,
  type DatabasePlayer,
  type ModerationOptions,
  type PlayerFilter,
  type PlayerSearchResult,
  type PlayerSort,
} from "@/lib/moderationTypes";
import { MERIT_RULES, MODERATION_ACTION_LABELS, type PortfolioMode } from "@/lib/playerTypes";
import { activeDishonored } from "@/lib/playerProfile";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { sharedCache } from "@/lib/ttlCache";

/**
 * The Database page's user list: everyone with any history — played a game,
 * has a stat (commends, warnings, Merit, ban, Dishonored) or a moderation
 * record — from users, player_summary and moderation_events, so people who
 * left the server still show. Server members with no history at all
 * (web_member_directory) are only returned when searched for directly.
 *
 * Built once per INDEX_TTL_MS (one read of each table) and shared by every
 * search, filter and sort; a moderation action asks for a fresh build.
 * One list per server (multi-server): the server the host pages work on.
 */

const INDEX_TTL_MS = 30_000;
const PAGE_SIZE = 30;
const index = sharedCache<DatabasePlayer[]>("player-index", INDEX_TTL_MS, 20);

const MODE_COLUMNS: Record<PortfolioMode, { commends: string; warns: string; banned: string }> = {
  Roleplay: { commends: "rp_commends", warns: "rp_warns", banned: "banned" },
  Historical: { commends: "hist_commends", warns: "hist_warns", banned: "hist_banned" },
};

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

async function optionalRows<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const [rows] = await getPool().query<T[]>(sql, params);
    return rows;
  } catch (error) {
    if (errorCode(error) === "ER_NO_SUCH_TABLE" || errorCode(error) === "ER_BAD_FIELD_ERROR") return [];
    throw error;
  }
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flag(value: unknown): boolean {
  return value === true || num(value) === 1;
}

async function directoryRows(guildId: string): Promise<RowDataPacket[]> {
  const base = "CAST(user_id AS CHAR) AS id, username, display_name, avatar_url";
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${base}, role_ids FROM web_member_directory WHERE guild_id = ?`,
      [guildId],
    );
    return rows;
  } catch (error) {
    if (errorCode(error) === "ER_NO_SUCH_TABLE") return [];
    if (errorCode(error) !== "ER_BAD_FIELD_ERROR") throw error;
    // Bot not restarted with the role_ids column yet.
    return optionalRows<RowDataPacket>(`SELECT ${base} FROM web_member_directory WHERE guild_id = ?`, [guildId]);
  }
}

/** In-game nicknames (kept once for every server, in users). */
async function nicknames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await optionalRows<RowDataPacket>(
    `SELECT CAST(discord_id AS CHAR) AS id, ingame_nickname FROM users
      WHERE ingame_nickname IS NOT NULL AND ingame_nickname <> '' AND discord_id IN (?)`,
    [ids],
  );
  return new Map(rows.map((row) => [String(row.id), String(row.ingame_nickname)]));
}

async function buildIndex(guildId: string): Promise<DatabasePlayer[]> {
  const records = playerRecords(guildId);
  const [members, users, summaries, lastActions, roleIdsOfServer] = await Promise.all([
    directoryRows(guildId),
    // u.* keeps this working on users tables missing newer columns.
    optionalRows<RowDataPacket>(
      `SELECT CAST(discord_id AS CHAR) AS id_text, u.* FROM ${records.table} u WHERE ${records.scope}`,
      records.scopeParams,
    ),
    optionalRows<RowDataPacket>(
      `SELECT CAST(user_id AS CHAR) AS id, total_games, attended, attendance_tracked FROM player_summary WHERE guild_id = ?`,
      [guildId],
    ),
    optionalRows<RowDataPacket>(
      `SELECT CAST(user_id AS CHAR) AS id, MAX(created_at) AS last_at FROM moderation_events WHERE guild_id = ? GROUP BY user_id`,
      [guildId],
    ),
    memberRoleIds(guildId),
  ]);

  const memberById = new Map(members.map((row) => [String(row.id), row]));
  const userById = new Map(users.map((row) => [String(row.id_text), row]));
  const summaryById = new Map(summaries.map((row) => [String(row.id), row]));
  const lastById = new Map(lastActions.map((row) => [String(row.id), num(row.last_at)]));
  const ids = new Set([...memberById.keys(), ...userById.keys(), ...summaryById.keys(), ...lastById.keys()]);
  const nowSec = Math.floor(Date.now() / 1000);
  // Home records carry the nickname; other servers look it up in users.
  const nicknameById = isHomeGuild(guildId) ? null : await nicknames([...ids]);
  const trustedRole: Record<PortfolioMode, string | null> = {
    Roleplay: roleIdsOfServer.rp_trusted,
    Historical: roleIdsOfServer.hist_trusted,
  };

  const players: DatabasePlayer[] = [];
  for (const id of ids) {
    const member = memberById.get(id);
    const user: Record<string, unknown> = userById.get(id) ?? {};
    const summary = summaryById.get(id);
    const roleIds = new Set(typeof member?.role_ids === "string" ? (member.role_ids.match(/\d{5,25}/g) ?? []) : []);
    const rawNickname = nicknameById ? nicknameById.get(id) : user.ingame_nickname;
    const nickname = typeof rawNickname === "string" ? rawNickname.trim() : "";
    const totalGames = summary ? num(summary.total_games) : num(user.total_games);
    const merit = num(user.merit_points);
    const dishonored = activeDishonored(user.dishonored_data, nowSec).map((entry) => entry.category as PortfolioMode);
    const modes = Object.fromEntries(
      PORTFOLIO_MODES.map((mode) => {
        const columns = MODE_COLUMNS[mode];
        return [
          mode,
          {
            commends: num(user[columns.commends]),
            warns: num(user[columns.warns]),
            banned: flag(user[columns.banned]),
          },
        ];
      }),
    ) as DatabasePlayer["modes"];
    const attendanceTracked = summary ? num(summary.attendance_tracked) : 0;
    const lastActionAt = lastById.get(id) ?? null;
    const hasHistory =
      totalGames > 0 ||
      attendanceTracked > 0 ||
      merit > 0 ||
      dishonored.length > 0 ||
      lastActionAt !== null ||
      PORTFOLIO_MODES.some((mode) => modes[mode].commends > 0 || modes[mode].warns > 0 || modes[mode].banned);
    players.push({
      discord_id: id,
      name: nickname || member?.display_name || member?.username || `#${id}`,
      username: member?.username ?? null,
      avatar_url: member?.avatar_url ?? null,
      in_server: Boolean(member),
      has_history: hasHistory,
      total_games: totalGames,
      attended: summary ? num(summary.attended) : 0,
      attendance_tracked: attendanceTracked,
      merit,
      modes,
      dishonored,
      trusted: PORTFOLIO_MODES.filter((mode) => {
        const roleId = trustedRole[mode];
        return Boolean(roleId && roleIds.has(roleId));
      }),
      // The Valor role when the bot mirrors roles; otherwise the rule itself.
      valor:
        typeof member?.role_ids === "string" && roleIdsOfServer.valor
          ? roleIds.has(roleIdsOfServer.valor)
          : merit >= MERIT_RULES.valor_merit &&
            (summary ? num(summary.attended) : 0) >= MERIT_RULES.valor_attended &&
            PORTFOLIO_MODES.every((mode) => modes[mode].warns === 0 && !modes[mode].banned),
      last_action_at: lastActionAt,
    });
  }
  return players;
}

export async function loadPlayerIndex(fresh = false, guildId?: string): Promise<DatabasePlayer[]> {
  const guild = guildId ?? (await currentGuildId());
  // The sample players belong to the home server; other sample servers start empty.
  if (isSchedulerDemo()) return isHomeGuild(guild) ? demoPlayerIndex() : [];
  if (fresh) index.delete(guild);
  return index.get(guild, () => buildIndex(guild));
}

const totalWarns = (player: DatabasePlayer) => PORTFOLIO_MODES.reduce((sum, mode) => sum + player.modes[mode].warns, 0);
const totalCommends = (player: DatabasePlayer) =>
  PORTFOLIO_MODES.reduce((sum, mode) => sum + player.modes[mode].commends, 0);

const FILTERS: Record<PlayerFilter, (player: DatabasePlayer) => boolean> = {
  all: () => true,
  warned: (player) => totalWarns(player) > 0,
  banned: (player) => PORTFOLIO_MODES.some((mode) => player.modes[mode].banned),
  dishonored: (player) => player.dishonored.length > 0,
  trusted: (player) => player.trusted.length > 0,
  valor: (player) => player.valor,
};

const SORTS: Record<PlayerSort, (a: DatabasePlayer, b: DatabasePlayer) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  warnings: (a, b) => totalWarns(b) - totalWarns(a),
  commends: (a, b) => totalCommends(b) - totalCommends(a),
  games: (a, b) => b.total_games - a.total_games,
  recent: (a, b) => (b.last_action_at ?? 0) - (a.last_action_at ?? 0),
};

export function searchPlayerIndex(
  players: DatabasePlayer[],
  options: { q: string; filter: PlayerFilter; sort: PlayerSort; page: number },
): PlayerSearchResult {
  const needle = options.q.trim().toLowerCase().replace(/^@/, "");
  const withHistory = players.filter((player) => player.has_history);
  // A direct search also reaches members with no history yet (e.g. to warn
  // someone before their first game); browsing lists only users with history.
  const pool = needle ? players : withHistory;
  const matches = pool.filter((player) => {
    if (!FILTERS[options.filter](player)) return false;
    if (!needle) return true;
    return (
      player.name.toLowerCase().includes(needle) ||
      (player.username ?? "").toLowerCase().includes(needle) ||
      player.discord_id.startsWith(needle)
    );
  });
  // Exact name / handle matches first, then users with history, then the
  // chosen order (name breaks ties).
  matches.sort((a, b) => {
    if (needle) {
      const exact = (p: DatabasePlayer) => (p.name.toLowerCase() === needle || p.username?.toLowerCase() === needle ? 0 : 1);
      const byExact = exact(a) - exact(b);
      if (byExact) return byExact;
      const byHistory = Number(b.has_history) - Number(a.has_history);
      if (byHistory) return byHistory;
    }
    return SORTS[options.sort](a, b) || SORTS.name(a, b);
  });
  const page = Math.max(0, Math.min(options.page, Math.floor(Math.max(0, matches.length - 1) / PAGE_SIZE)));
  const counts = Object.fromEntries(
    (Object.keys(FILTERS) as PlayerFilter[]).map((filter) => [filter, withHistory.filter(FILTERS[filter]).length]),
  ) as Record<PlayerFilter, number>;
  return {
    players: matches.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    total: matches.length,
    page,
    page_size: PAGE_SIZE,
    counts,
  };
}

interface ActivityRow extends RowDataPacket {
  target_id: string;
  action: string;
  mode: string | null;
  amount: number | null;
  reason: string | null;
  actor_id: string | null;
  automatic: number | boolean;
  log_url: string | null;
  created_at: number;
}

/** Server-wide moderation feed, newest first. */
export async function recentActivity(limit = 40, guildId?: string): Promise<ActivityItem[]> {
  const guild = guildId ?? (await currentGuildId());
  if (isSchedulerDemo()) return isHomeGuild(guild) ? demoActivity(limit) : [];
  const rows = await optionalRows<ActivityRow>(
    `SELECT CAST(user_id AS CHAR) AS target_id, action, mode, amount, reason, CAST(actor_id AS CHAR) AS actor_id,
            automatic, log_url, created_at
     FROM moderation_events WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ${Math.max(1, Math.min(100, limit))}`,
    [guild],
  );
  const ids = [...new Set(rows.flatMap((row) => [row.target_id, row.actor_id].filter((id): id is string => Boolean(id))))];
  const members = await lookupMembers(ids, guild);
  const nameOf = (id: string | null) => {
    if (!id) return null;
    const member = members.get(id);
    return member ? member.display_name || member.username || `#${id}` : `#${id}`;
  };
  return rows.map((row) => ({
    target_id: row.target_id,
    target_name: nameOf(row.target_id) ?? row.target_id,
    action: row.action,
    label: MODERATION_ACTION_LABELS[row.action] ?? row.action,
    mode: row.mode,
    amount: row.amount === null ? null : num(row.amount),
    reason: row.reason?.trim() || null,
    issued_by: nameOf(row.actor_id),
    automatic: flag(row.automatic),
    created_at: num(row.created_at),
    log_url: row.log_url,
  }));
}

/** The bot's Dishonored nation lists for a server (published at bot startup), or null. */
export async function moderationOptions(guildId?: string): Promise<ModerationOptions | null> {
  if (isSchedulerDemo()) return demoModerationOptions();
  let value: unknown = null;
  try {
    value = await readBotConfig(guildId ?? (await currentGuildId()), "web_moderation_options");
  } catch (error) {
    if (errorCode(error) !== "ER_NO_SUCH_TABLE" && errorCode(error) !== "ER_BAD_FIELD_ERROR") throw error;
  }
  const parsed = value && typeof value === "object" ? (value as Partial<ModerationOptions>) : null;
  return parsed?.nations
    ? {
        nations: parsed.nations,
        mode_nations: parsed.mode_nations,
        mode_layouts: parsed.mode_layouts,
        mode_resources: parsed.mode_resources,
        server: parsed.server,
      }
    : null;
}
