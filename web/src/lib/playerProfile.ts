import type { RowDataPacket } from "mysql2";
import { currentGuildId, isHomeGuild, playerRecords } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { demoPlayerPortfolio } from "@/lib/databaseDemo";
import { demoPlayerProfile } from "@/lib/liveDemo";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { lookupMembers } from "@/lib/memberDirectory";
import { HOST_RANKS, RP_RANK_ROLES, type HostBranch, type HostRank } from "@/lib/hostBranches";
import { memberRoleIds as publishedRoleIds } from "@/lib/memberRoles";
import {
  MERIT_RULES,
  MODERATION_ACTION_LABELS,
  TRUSTED_COMMENDS,
  WARN_BAN_LIMIT,
  type BanRoad,
  type DishonoredRestriction,
  type GameBanInfo,
  type ModerationEvent,
  type ModeStanding,
  type PlayerPortfolio,
  type PlayerProfile,
  type PortfolioGame,
  type PortfolioMode,
  type ProfileRole,
  type StandingStatus,
  type TrustedRoad,
} from "@/lib/playerTypes";
import type { HostStanding } from "@/lib/moderationTypes";
import { categoryOfMode } from "@/lib/scheduleOptions";
import { sharedCache } from "@/lib/ttlCache";

/**
 * Short server caches (scale plan, Phase 0): many viewers opening the same
 * card, or a host reopening a portfolio, cost one database read per window.
 * Moderation changes show up on the portfolio within PORTFOLIO_TTL_MS.
 */
const PROFILE_TTL_MS = 60_000;
const PORTFOLIO_TTL_MS = 30_000;
const profileCache = sharedCache<PlayerProfile | null>("player-profile", PROFILE_TTL_MS, 1000);
const portfolioCache = sharedCache<PlayerPortfolio>("player-portfolio", PORTFOLIO_TTL_MS, 300);

/**
 * Player profile cards and the host-only portfolio, read from the tables the
 * bot maintains (the web never talks to Discord):
 *   web_member_directory  names, avatar, role ids (+ banner saved at login)
 *   web_guild_roles       role names / colors / order / icons
 *   users                 nickname and the /report statistics
 *   games + game_reservations  game history
 * Every lookup degrades gracefully when the bot hasn't created a table or
 * column yet: the card just shows less. Per server (multi-server): stats,
 * roles and history are the given server's (default: the one the host pages
 * work on); the in-game nickname is the same everywhere (users).
 */

const DISCORD_EPOCH_MS = BigInt(1420070400000);

/** The home server's role ids (bot.py.py ROLE_IDS); other servers use the
 *  ids their setup chose (memberRoles.memberRoleIds). */
export const ROLE = {
  HOI4_RP_TRUSTED: "1423010943436329043",
  HOI4_MP_TRUSTED: "1473110336277053480",
  HOI4_VERIFIED: "1440832519221285035",
  VALOR: "1462629336694788332",
} as const;

/** Per-mode stat columns + roles (the bot's get_mod_context / GAME_ROLE_CONFIG). */
const MODES: {
  mode: PortfolioMode;
  commends: string;
  warns: string;
  banned: string;
  trustedRole: string;
  verifiedRole: string;
  verifiedColumn: string;
}[] = [
  {
    mode: "Roleplay",
    commends: "rp_commends",
    warns: "rp_warns",
    banned: "banned",
    trustedRole: ROLE.HOI4_RP_TRUSTED,
    verifiedRole: ROLE.HOI4_VERIFIED,
    verifiedColumn: "hoi4_verified",
  },
  {
    mode: "Historical",
    commends: "hist_commends",
    warns: "hist_warns",
    banned: "hist_banned",
    trustedRole: ROLE.HOI4_MP_TRUSTED,
    verifiedRole: ROLE.HOI4_VERIFIED,
    verifiedColumn: "hoi4_verified",
  },
];

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function isSchemaGap(error: unknown): boolean {
  const code = errorCode(error);
  return code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR";
}

function bannerUrl(userId: string, hash: string | null): string | null {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${userId}/${hash}.${ext}?size=600`;
}

function parseIdList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  // Read the ids as digit strings — JSON.parse would round 19-digit snowflakes.
  return raw.match(/\d{5,25}/g) ?? [];
}

interface DirectoryRow extends RowDataPacket {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role_ids?: string | null;
  banner_hash?: string | null;
  accent_color?: number | null;
}

interface RoleRow extends RowDataPacket {
  id: string;
  name: string;
  color: number;
  icon: string | null;
}

async function directoryRow(userId: string, guildId: string): Promise<DirectoryRow | null> {
  const pool = getPool();
  const base = "CAST(user_id AS CHAR) AS user_id, username, display_name, avatar_url";
  try {
    const [rows] = await pool.query<DirectoryRow[]>(
      `SELECT ${base}, role_ids, banner_hash, accent_color
       FROM web_member_directory WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)`,
      [guildId, userId],
    );
    return rows[0] ?? null;
  } catch (error) {
    if (errorCode(error) === "ER_NO_SUCH_TABLE") return null;
    if (errorCode(error) !== "ER_BAD_FIELD_ERROR") throw error;
    // Bot not restarted with the profile-card columns yet.
    const [rows] = await pool.query<DirectoryRow[]>(
      `SELECT ${base} FROM web_member_directory WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)`,
      [guildId, userId],
    );
    return rows[0] ?? null;
  }
}

/** Rank role ids per host branch (home RP = the original roles; the rest from the bot). */
export async function hostRankRoles(guildId?: string): Promise<Record<HostBranch, Record<HostRank, string | null>>> {
  const guild = guildId ?? (await currentGuildId());
  const published = await publishedRoleIds(guild);
  const rp = isHomeGuild(guild) ? { ...RP_RANK_ROLES, ...published.host_ranks.RP } : published.host_ranks.RP;
  return { RP: rp, HIST: published.host_ranks.HIST };
}

/** A member's rank in each branch, from their mirrored role ids. */
export async function hostRanksOf(
  roleIds: Set<string> | null,
  guildId?: string,
): Promise<Record<HostBranch, HostRank | null>> {
  const roles = await hostRankRoles(guildId);
  const rankIn = (branch: HostBranch) =>
    [...HOST_RANKS].reverse().find((rank) => {
      const id = roles[branch][rank];
      return Boolean(id && roleIds?.has(id));
    }) ?? null;
  return { RP: rankIn("RP"), HIST: rankIn("HIST") };
}

/** The member's mirrored Discord role ids on a server (null when not mirrored yet). */
export async function memberRoleIds(userId: string, guildId?: string): Promise<Set<string> | null> {
  const member = await directoryRow(userId, guildId ?? (await currentGuildId())).catch(() => null);
  return member?.role_ids ? new Set(parseIdList(member.role_ids)) : null;
}

interface HostStatsRow extends RowDataPacket {
  [column: string]: unknown;
}

/** host_stats + rank roles per branch for the Database page (null = not a host and no record). */
async function hostStanding(userId: string, roleIds: Set<string> | null, guildId: string): Promise<HostStanding | null> {
  let row: HostStatsRow | undefined;
  try {
    // SELECT * — the HIST columns appear once the bot has added them.
    const [rows] = await getPool().query<HostStatsRow[]>(
      "SELECT * FROM host_stats WHERE guild_id = ? AND host_id = CAST(? AS UNSIGNED)",
      [guildId, userId],
    );
    row = rows[0];
  } catch (error) {
    if (!isSchemaGap(error)) throw error;
  }
  const ranks = await hostRanksOf(roleIds, guildId);
  if (!row && !ranks.RP && !ranks.HIST) return null;
  return {
    hosted_games: num(row?.hosted_games),
    branches: [
      { branch: "RP", rank: ranks.RP, acclamations: num(row?.acclamations), violations: num(row?.violations) },
      { branch: "HIST", rank: ranks.HIST, acclamations: num(row?.hist_acclamations), violations: num(row?.hist_violations) },
    ],
  };
}

async function rolesFor(roleIds: string[], guildId: string): Promise<ProfileRole[]> {
  if (roleIds.length === 0) return [];
  try {
    const [rows] = await getPool().query<RoleRow[]>(
      `SELECT CAST(role_id AS CHAR) AS id, name, color, icon FROM web_guild_roles
       WHERE guild_id = ? AND role_id IN (${roleIds.map(() => "CAST(? AS UNSIGNED)").join(", ")})
       ORDER BY position DESC`,
      [guildId, ...roleIds],
    );
    return rows.map((row) => {
      const icon = row.icon?.trim() || null;
      const isUrl = icon !== null && /^https?:\/\//.test(icon);
      return {
        id: row.id,
        name: row.name,
        color: row.color ? `#${(row.color & 0xffffff).toString(16).padStart(6, "0")}` : null,
        icon_url: isUrl ? icon : null,
        icon_emoji: icon && !isUrl ? icon : null,
      };
    });
  } catch (error) {
    if (isSchemaGap(error)) return [];
    throw error;
  }
}

/** The player's record on a server (users at home, guild_users elsewhere). */
async function recordRow(userId: string, guildId: string): Promise<Record<string, unknown> | null> {
  const records = playerRecords(guildId);
  try {
    // SELECT * so older `users` tables missing newer columns still work.
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT * FROM ${records.table} WHERE ${records.where}`,
      [...records.whereParams, userId],
    );
    return (rows[0] as Record<string, unknown> | undefined) ?? null;
  } catch (error) {
    if (isSchemaGap(error)) return null;
    throw error;
  }
}

/** In-game nickname (kept once for every server, in users). */
async function nicknameOf(userId: string, record: Record<string, unknown> | null, guildId: string): Promise<string> {
  let raw: unknown = record?.ingame_nickname;
  if (!isHomeGuild(guildId)) {
    try {
      const [rows] = await getPool().query<RowDataPacket[]>("SELECT ingame_nickname FROM users WHERE discord_id = ?", [userId]);
      raw = rows[0]?.ingame_nickname;
    } catch (error) {
      if (!isSchemaGap(error)) throw error;
    }
  }
  return typeof raw === "string" ? raw.trim() : "";
}

/** Discord-style profile card. Null when the bot knows nothing about the id. */
export async function getPlayerProfile(userId: string, guildId?: string): Promise<PlayerProfile | null> {
  if (isSchedulerDemo()) return demoPlayerProfile(userId);
  const guild = guildId ?? (await currentGuildId());
  return profileCache.get(`${guild}:${userId}`, () => loadPlayerProfile(userId, guild));
}

async function loadPlayerProfile(userId: string, guildId: string): Promise<PlayerProfile | null> {
  const [member, user] = await Promise.all([directoryRow(userId, guildId), recordRow(userId, guildId)]);
  if (!member && !user) return null;
  const [roles, nickname] = await Promise.all([
    rolesFor(parseIdList(member?.role_ids), guildId),
    nicknameOf(userId, user, guildId),
  ]);
  return {
    discord_id: userId,
    username: member?.username ?? null,
    display_name: member?.display_name ?? null,
    ingame_nickname: nickname || null,
    avatar_url: member?.avatar_url ?? null,
    banner_url: bannerUrl(userId, member?.banner_hash ?? null),
    accent_color: typeof member?.accent_color === "number" ? member.accent_color : null,
    roles,
    in_server: Boolean(member),
  };
}

/**
 * Remember the banner/accent color Discord gave us at login so other players
 * see them on this player's card. Best effort: never blocks a login. Only
 * updates an existing member row (the bot owns membership).
 */
export async function saveLoginProfile(
  userId: string,
  banner: string | null,
  accentColor: number | null,
): Promise<void> {
  if (isSchedulerDemo()) return;
  try {
    await getPool().query(
      `UPDATE web_member_directory SET banner_hash = ?, accent_color = ?
       WHERE user_id = CAST(? AS UNSIGNED)`,
      [banner, accentColor, userId],
    );
    // Every server's card shows the same banner.
    profileCache.deleteWhere((key) => key.endsWith(`:${userId}`));
  } catch (error) {
    if (!isSchemaGap(error)) console.error("[players] could not save login banner:", error);
  }
}

// --- portfolio -------------------------------------------------------------

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flag(value: unknown): boolean {
  return value === true || num(value) === 1;
}

function standing(mode: ModeStanding["mode"], commends: unknown, warns: unknown, banned: unknown): ModeStanding {
  const status: StandingStatus = flag(banned) ? "banned" : "clear";
  return { mode, status, commends: num(commends), warns: num(warns) };
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Same rules as the bot's _dishonored_entry_active / _dishonored_full_summary. */
export function activeDishonored(raw: unknown, nowSec: number): DishonoredRestriction[] {
  const restrictions: DishonoredRestriction[] = [];
  for (const [category, value] of Object.entries(parseJsonObject(raw))) {
    // Only live modes (old Stellaris restrictions no longer apply).
    if (!MODES.some((mode) => mode.mode === category)) continue;
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const expiresAt = num(entry.expires_at) || null;
    if (expiresAt && nowSec >= expiresAt) continue;
    const allMajors = Boolean(entry.all_majors);
    const majors = stringList(entry.majors);
    const minors = stringList(entry.minors);
    if (!allMajors && majors.length === 0 && minors.length === 0) continue;
    const reason = typeof entry.description === "string" ? entry.description.trim() : "";
    restrictions.push({
      category,
      all_majors: allMajors,
      majors,
      minors,
      reason: reason || null,
      since: num(entry.ts) || null,
      expires_at: expiresAt,
    });
  }
  return restrictions;
}

/** The bot's _pretty_reservation_name. */
export function prettySlot(key: string): string {
  if (key.startsWith("_FILL_")) return "Filler";
  const coop = key.indexOf("_coop");
  if (coop >= 0) {
    const suffix = key.slice(coop + "_coop".length).replace(/^_+|_+$/g, "");
    return /^\d+$/.test(suffix) ? `${key.slice(0, coop)} (Co-op ${suffix})` : `${key.slice(0, coop)} (Co-op)`;
  }
  return key;
}

function isCapacitySlot(key: string): boolean {
  return !key.includes("_coop") && !key.startsWith("_FILL_");
}

function snowflakeSeconds(id: string): number {
  try {
    return Number(((BigInt(id) >> BigInt(22)) + DISCORD_EPOCH_MS) / BigInt(1000));
  } catch {
    return 0;
  }
}

interface HistoryRow extends RowDataPacket {
  thread_id: string;
  mode: string | null;
  start_timestamp: string | null;
  slot_key: string;
  present_ids: string | null;
  game_bans: string | null;
  status: string | null;
  snapshot_done: string | null;
}

interface HistoryGame extends PortfolioGame {
  /** This game recorded a ban for the player (game_data.game_bans). */
  banned_here: boolean;
}

/** The bot's build_player_game_history (oldest first), on one server. */
async function gameHistory(userId: string, guildId: string): Promise<HistoryGame[]> {
  let rows: HistoryRow[];
  try {
    [rows] = await getPool().query<HistoryRow[]>(
      `SELECT g.thread_id, g.mode, g.status, CAST(g.start_timestamp AS CHAR) AS start_timestamp, r.slot_key,
              CAST(JSON_EXTRACT(g.game_data, '$.present_ids') AS CHAR) AS present_ids,
              CAST(JSON_EXTRACT(g.game_data, '$.game_bans') AS CHAR) AS game_bans,
              CAST(JSON_EXTRACT(g.game_data, '$.snapshot_done') AS CHAR) AS snapshot_done
       FROM game_reservations r
       JOIN games g ON g.thread_id = r.thread_id
       WHERE r.user_id = CAST(? AS UNSIGNED) AND g.guild_id = ?
         AND (g.status IS NULL OR g.status <> 'cancelled')`,
      [userId, guildId],
    );
  } catch (error) {
    if (isSchemaGap(error)) return [];
    throw error;
  }

  // One entry per game; prefer a real nation slot over a co-op/filler slot.
  const byGame = new Map<string, { row: HistoryRow; slots: string[] }>();
  for (const row of rows) {
    const entry = byGame.get(row.thread_id) ?? { row, slots: [] };
    entry.slots.push(row.slot_key);
    byGame.set(row.thread_id, entry);
  }
  const games = [...byGame.values()].map(({ row, slots }) => {
    const primary = slots.find(isCapacitySlot) ?? slots[0];
    const startTs = num(row.start_timestamp);
    // Digit-string matches: these lists may hold snowflakes as JSON numbers.
    // Attendance is taken once the bot sets snapshot_done (legacy ended games
    // only carry present_ids) — the bot's _attendance_taken.
    const hasPresentList = row.present_ids !== null && row.present_ids !== "null";
    const attendanceTaken = row.snapshot_done === "true" || (row.status === "ended" && hasPresentList);
    return {
      thread_id: row.thread_id,
      mode: row.mode || "Unknown",
      nation: prettySlot(primary),
      present: attendanceTaken ? parseIdList(row.present_ids).includes(userId) : null,
      ts: startTs > 0 ? startTs : snowflakeSeconds(row.thread_id),
      banned_here: parseIdList(row.game_bans).includes(userId),
    };
  });
  games.sort((a, b) => a.ts - b.ts);
  return games;
}

/**
 * Everything /report shows, plus the moderation log. `fresh` skips the
 * short cache (right after a moderation action on this player).
 */
export async function getPlayerPortfolio(userId: string, fresh = false, guildId?: string): Promise<PlayerPortfolio> {
  if (isSchedulerDemo()) return demoPlayerPortfolio(userId);
  const guild = guildId ?? (await currentGuildId());
  const key = `${guild}:${userId}`;
  if (fresh) portfolioCache.delete(key);
  return portfolioCache.get(key, () => loadPlayerPortfolio(userId, guild));
}

type BanGame = NonNullable<GameBanInfo["game"]>;

/** History-derived numbers: total, attendance, latest 20, ban games. */
interface HistoryFacts {
  total: number;
  attended: number;
  tracked: number;
  recent: PortfolioGame[];
  banGames: Partial<Record<PortfolioMode, BanGame>>;
}

interface SummaryRow extends RowDataPacket {
  total_games: number;
  attended: number;
  attendance_tracked: number;
  recent_games: unknown;
  ban_games: unknown;
}

/** JSON columns arrive parsed (MySQL) or as text (MariaDB). */
function jsonValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Phase 1 fast path: the bot's precomputed player_summary row (one primary
 * key read, however long the history). Falls back to rebuilding from the
 * games tables for players the bot hasn't summarized yet.
 */
async function historyFacts(userId: string, guildId: string): Promise<HistoryFacts> {
  try {
    const [rows] = await getPool().query<SummaryRow[]>(
      `SELECT total_games, attended, attendance_tracked, recent_games, ban_games
       FROM player_summary WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)`,
      [guildId, userId],
    );
    const row = rows[0];
    if (row) {
      const recent = jsonValue(row.recent_games);
      const banGames = jsonValue(row.ban_games);
      return {
        total: num(row.total_games),
        attended: num(row.attended),
        tracked: num(row.attendance_tracked),
        recent: Array.isArray(recent) ? (recent as PortfolioGame[]) : [],
        banGames: banGames && typeof banGames === "object" ? (banGames as HistoryFacts["banGames"]) : {},
      };
    }
  } catch (error) {
    if (!isSchemaGap(error)) throw error;
  }

  const history = await gameHistory(userId, guildId);
  const tracked = history.filter((game) => game.present !== null);
  const banGames: HistoryFacts["banGames"] = {};
  for (const game of history) {
    if (game.banned_here) {
      banGames[categoryOfMode(game.mode)] = { thread_id: game.thread_id, mode: game.mode, nation: game.nation, ts: game.ts };
    }
  }
  return {
    total: history.length,
    attended: tracked.filter((game) => game.present).length,
    tracked: tracked.length,
    recent: history
      .slice(-20)
      .reverse()
      .map(({ thread_id, mode, nation, present, ts }) => ({ thread_id, mode, nation, present, ts })),
    banGames,
  };
}

interface EventRow extends RowDataPacket {
  action: string;
  mode: string | null;
  amount: number | null;
  reason: string | null;
  actor_id: string | null;
  automatic: number | boolean;
  log_url: string | null;
  created_at: number;
}

interface PlayerEvents {
  recent: ModerationEvent[];
  /** Latest ban event per mode, latest Dishonored give per mode. */
  latestBan: Partial<Record<string, ModerationEvent>>;
  latestDishonored: Partial<Record<string, ModerationEvent>>;
}

/** The player's moderation log (moderation_events), with issuer names. */
async function playerEvents(userId: string, guildId: string): Promise<PlayerEvents> {
  const empty: PlayerEvents = { recent: [], latestBan: {}, latestDishonored: {} };
  let recentRows: EventRow[];
  let keyRows: EventRow[];
  try {
    const columns = `action, mode, amount, reason, CAST(actor_id AS CHAR) AS actor_id, automatic, log_url, created_at`;
    [[recentRows], [keyRows]] = await Promise.all([
      getPool().query<EventRow[]>(
        `SELECT ${columns} FROM moderation_events WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)
         ORDER BY created_at DESC, id DESC LIMIT 20`,
        [guildId, userId],
      ),
      // Older than the latest 20, still needed for the ban / Dishonored cards.
      getPool().query<EventRow[]>(
        `SELECT ${columns} FROM moderation_events WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)
           AND action IN ('ban', 'dishonored_give')
         ORDER BY created_at DESC, id DESC LIMIT 20`,
        [guildId, userId],
      ),
    ]);
  } catch (error) {
    if (isSchemaGap(error)) return empty;
    throw error;
  }

  const actorIds = [...recentRows, ...keyRows].map((row) => row.actor_id).filter((id): id is string => Boolean(id));
  const actors = await lookupMembers(actorIds, guildId);
  const toEvent = (row: EventRow): ModerationEvent => {
    const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
    return {
      action: row.action,
      label: MODERATION_ACTION_LABELS[row.action] ?? row.action,
      mode: row.mode,
      amount: row.amount === null ? null : num(row.amount),
      reason: row.reason?.trim() || null,
      issued_by: actor ? actor.display_name || actor.username || null : row.actor_id ? `#${row.actor_id}` : null,
      automatic: flag(row.automatic),
      created_at: num(row.created_at),
      log_url: row.log_url,
    };
  };

  const latestBan: PlayerEvents["latestBan"] = {};
  const latestDishonored: PlayerEvents["latestDishonored"] = {};
  for (const row of keyRows) {
    const bucket = row.action === "ban" ? latestBan : latestDishonored;
    const key = row.mode ?? "";
    if (!bucket[key]) bucket[key] = toEvent(row);
  }
  return { recent: recentRows.map(toEvent), latestBan, latestDishonored };
}

async function loadPlayerPortfolio(userId: string, guildId: string): Promise<PlayerPortfolio> {
  const [user, facts, member, events, roleIdsOfServer] = await Promise.all([
    recordRow(userId, guildId),
    historyFacts(userId, guildId),
    directoryRow(userId, guildId).catch(() => null),
    playerEvents(userId, guildId),
    publishedRoleIds(guildId),
  ]);
  const stats = user ?? {};
  const totalGames = facts.total || num(stats.total_games);
  const merit = num(stats.merit_points);
  const dishonored = activeDishonored(stats.dishonored_data, Math.floor(Date.now() / 1000)).map((entry) => ({
    ...entry,
    log_url: events.latestDishonored[entry.category]?.log_url ?? null,
  }));
  // Null when the bot hasn't mirrored roles yet (then fall back to the DB flags).
  const roleIds = member?.role_ids ? new Set(parseIdList(member.role_ids)) : null;

  // Historical uses Hist Verified once the bot has set that role up (before
  // that, the old shared role — same as the bot's fallback). Another server
  // uses the roles its setup chose.
  const serverRoles = roleIdsOfServer;
  const trustedRoleOf = (mode: (typeof MODES)[number]) =>
    mode.mode === "Historical" ? serverRoles.hist_trusted : serverRoles.rp_trusted;
  const verifiedRoleOf = (mode: (typeof MODES)[number]) =>
    mode.mode === "Historical" ? (serverRoles.hist_verified ?? serverRoles.rp_verified) : serverRoles.rp_verified;
  const verifiedColumnOf = (mode: (typeof MODES)[number]) =>
    mode.mode === "Historical" && serverRoles.hist_verified ? "hist_verified" : mode.verifiedColumn;
  const hasRole = (id: string | null) => (roleIds && id ? roleIds.has(id) : null);
  const trusted: TrustedRoad[] = MODES.map((mode) => ({
    mode: mode.mode,
    commends: num(stats[mode.commends]),
    required: TRUSTED_COMMENDS,
    has_role: hasRole(trustedRoleOf(mode)),
    verified: hasRole(verifiedRoleOf(mode)) ?? flag(stats[verifiedColumnOf(mode)]),
    banned: flag(stats[mode.banned]),
  }));

  const bans: BanRoad[] = MODES.map((mode) => ({
    mode: mode.mode,
    warns: num(stats[mode.warns]),
    limit: WARN_BAN_LIMIT,
    banned: flag(stats[mode.banned]),
  }));

  const gameBans: GameBanInfo[] = bans
    .filter((road) => road.banned)
    .map((road) => {
      const event = events.latestBan[road.mode];
      return {
        mode: road.mode,
        automatic: event ? event.automatic : road.warns >= road.limit,
        warns: road.warns,
        game: facts.banGames[road.mode] ?? null,
        reason: event?.reason ?? null,
        issued_by: event?.issued_by ?? null,
        issued_at: event?.created_at ?? null,
        log_url: event?.log_url ?? null,
      };
    });

  return {
    discord_id: userId,
    total_games: totalGames,
    attended: facts.attended,
    attendance_tracked: facts.tracked,
    standings: MODES.map((mode) => standing(mode.mode, stats[mode.commends], stats[mode.warns], stats[mode.banned])),
    merit_points: merit,
    // The Valor role itself (the bot also checks warnings / bans); computed
    // from the rules only when the role mirror isn't available.
    hearts_of_valor: hasRole(serverRoles.valor) ??
      (merit >= MERIT_RULES.valor_merit &&
        facts.attended >= MERIT_RULES.valor_attended &&
        bans.every((road) => road.warns === 0 && !road.banned)),
    merit_rules: { ...MERIT_RULES },
    trusted,
    bans,
    game_bans: gameBans,
    dishonored,
    history: facts.recent,
    events: events.recent,
    host: await hostStanding(userId, roleIds, guildId),
  };
}
