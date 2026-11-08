import { isCasinoGame, isFortunesGame } from "@/lib/casinoSettings";
import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, isHomeGuild, playerRecords } from "@/lib/currentGuild";
import type { Pool } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { ironLegionRequired, ironLegionVerifyUrl, parseRequireIronLegion } from "@/lib/ironlegion";
import { ironLegionMemberVerified } from "@/lib/ironlegionMember";
import { memberRoleIds } from "@/lib/memberRoles";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { settingsOf } from "@/lib/serverSettings";

/**
 * The way into the Casino (docs/casino-integration.md, step 2). A Casino
 * game's announcement links to /casino/<game> on GameMaster; signed in with
 * Discord, the player gets the one-time link the old Discord Casino panel
 * used to give: a `web_access_tokens` row the Casino's /api/access checks
 * and burns, carrying who they are (VIP / Trusted / Verified / IronLegion,
 * banned) so the Casino never has to ask Discord. Ported from the bot's
 * _generate_web_access_token, _live_role_flags and the old /gamble checks.
 */

/** tkcasino.online (CASINO_URL to point it elsewhere, e.g. a local copy). */
export const CASINO_URL = (process.env.CASINO_URL || "https://tkcasino.online").replace(/\/+$/, "");
/** A fresh link works once, for a minute (the bot's WEB_ACCESS_TOKEN_TTL_SEC). */
const NEW_LINK_SEC = 60;
/** Resume / receipt links can be opened again for a day (RECEIPT_VIEW_TOKEN_TTL_SEC). */
const RECEIPT_LINK_SEC = 24 * 3600;
/** The bot's numeric tiers: lower = more privileged. */
const TIER = { vip: 0, trusted: 1, verified: 2, none: 3 } as const;

export type CasinoEntry =
  | { status: "ok"; url: string; kind: "new" | "resume" | "receipt" | "fortunes"; nation: string | null; preview?: boolean }
  | { status: "not_casino"; map_url: string }
  | { status: "denied"; title: string; message: string; map_url: string | null; action?: { label: string; url: string } };

interface GameRow extends RowDataPacket {
  thread_id: string;
  guild_id: string | null;
  status: string | null;
  game_started: number | null;
  game_data: unknown;
}

interface Row extends RowDataPacket {
  [key: string]: unknown;
}

const json = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
const flag = (value: unknown) => value === true || value === 1 || value === "1";

export const mapUrlOf = (gameKey: string) => `/map?game=${encodeURIComponent(gameKey)}`;

const casinoLink = (token: string, gameKey: string) => `${CASINO_URL}/?token=${token}&gameId=${encodeURIComponent(gameKey)}`;

/** Where this player should go for this game, with every check the old panel made. */
export async function casinoEntry(gameKey: string, userId: string, username: string): Promise<CasinoEntry> {
  const map = mapUrlOf(gameKey);
  if (isSchedulerDemo()) {
    // Preview: no database or Casino to talk to; show where it would go.
    return { status: "ok", kind: "new", nation: null, preview: true, url: casinoLink("preview-token", gameKey) };
  }
  const db = getPool();
  const [games] = await db.query<GameRow[]>(
    "SELECT thread_id, guild_id, status, game_started, game_data FROM games WHERE thread_id = ? LIMIT 1",
    [gameKey],
  );
  const game = games[0];
  if (!game) return { status: "denied", title: "Game not found", message: "This game isn't on GameMaster any more. It may have been cancelled.", map_url: null };
  const data = json(game.game_data);
  if (isFortunesGame(data)) return fortunesEntry(db, game, gameKey, userId);
  if (!isCasinoGame(data)) return { status: "not_casino", map_url: map };
  const guildId = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
  if (!isHomeGuild(guildId)) {
    return { status: "denied", title: "Not a Casino server", message: "The Casino is only for TommyKay's server.", map_url: map };
  }

  // Already holding a nation: resume the run, or see the receipt (never a fresh roll).
  const [held] = await db.query<Row[]>("SELECT slot_key FROM game_reservations WHERE thread_id = ? AND user_id = ? LIMIT 1", [gameKey, userId]);
  const nation = held[0]?.slot_key ? String(held[0].slot_key) : null;

  const closed = flag(game.game_started) || game.status === "ended" || game.status === "cancelled";
  if (closed && !nation) {
    return { status: "denied", title: "Rolling is closed", message: "This game has already started or ended, so the Casino is closed for it.", map_url: map };
  }
  // Emergency Unreserve is final: only a host can bring the player back (host tools).
  const unreserved = Array.isArray(data.randomizer_unreserved) ? data.randomizer_unreserved.map(String) : [];
  if (!nation && unreserved.includes(userId)) {
    return {
      status: "denied",
      title: "You unreserved this game",
      message: "You used Emergency Unreserve here, so you can't roll again. If the host wants you back, they can add you.",
      map_url: map,
    };
  }
  // Removed by a host (the Host Tool): only a host can bring them back.
  const hostRemoved = Array.isArray(data.casino_host_removed) ? data.casino_host_removed.map(String) : [];
  if (!nation && hostRemoved.includes(userId)) {
    return {
      status: "denied",
      title: "The host removed you",
      message: "A host took you off this game, so you can't roll again yourself. If they want you back, they can add you.",
      map_url: map,
    };
  }

  const player = await playerFlags(db, guildId, userId);
  if (!player.member) {
    return { status: "denied", title: "Join the server first", message: "You need to be a member of TommyKay's Discord server to play in the Casino.", map_url: map };
  }
  if (player.banned && !nation) {
    return { status: "denied", title: "You can't roll", message: "You're banned from reserving nations on this server.", map_url: map };
  }
  const serverIronLegion = Boolean((await settingsOf(guildId))?.features.ironlegion);
  if (!nation && ironLegionRequired(parseRequireIronLegion(data.require_ironlegion), serverIronLegion) && !player.isAuthenticated) {
    const roleIds = await memberRoleIds(guildId);
    const authenticate = ironLegionVerifyUrl(guildId, roleIds.ironlegion_verify_channel);
    return {
      status: "denied",
      title: "Steam authentication needed",
      message: "This game requires IronLegion. Authenticate your Steam account with IronLegion, then open the Casino again.",
      map_url: map,
      ...(authenticate ? { action: { label: "Authenticate with IronLegion", url: authenticate } } : {}),
    };
  }

  let kind: "new" | "resume" | "receipt" = "new";
  if (nation) kind = (await runOf(db, gameKey, userId)).finished ? "receipt" : "resume";
  const token = await writeToken(db, gameKey, userId, username, player, kind);
  return { status: "ok", kind, nation, url: casinoLink(token, gameKey) };
}

/** A Fortunes of War link lasts a day; each visit replaces the last one. */
const FORTUNES_LINK_SEC = 24 * 3600;

/**
 * Fortunes of War (docs/casino-integration.md, step 7): players reserve on the
 * map as usual, then draw a card in the Casino's Fortunes room. The bot keeps
 * their fortunes_draws row (nation, major, redraws); this hands out the key
 * that opens it. The card stays with the player if they change nation.
 */
async function fortunesEntry(db: Pool, game: GameRow, gameKey: string, userId: string): Promise<CasinoEntry> {
  const map = mapUrlOf(gameKey);
  const guildId = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
  if (!isHomeGuild(guildId)) {
    return { status: "denied", title: "Not a Casino server", message: "Fortunes of War is only for TommyKay's server.", map_url: map };
  }
  let row: Row | undefined;
  try {
    const [rows] = await db.query<Row[]>("SELECT nation, state FROM fortunes_draws WHERE game_id = ? AND user_id = ? LIMIT 1", [gameKey, userId]);
    row = rows[0];
  } catch (error) {
    if (/ER_NO_SUCH_TABLE|doesn't exist/i.test(String((error as Error)?.message ?? error))) {
      return { status: "denied", title: "Not ready yet", message: "Fortunes of War isn't set up yet. Try again in a few minutes.", map_url: map };
    }
    throw error;
  }
  const hasCard = row?.state === "pending" || row?.state === "locked";
  const closed = flag(game.game_started) || game.status === "ended" || game.status === "cancelled";
  if (closed && !hasCard) {
    return { status: "denied", title: "The cards are sealed", message: "This game has already started or ended, so Fortunes of War is closed for it.", map_url: map };
  }
  const [held] = await db.query<Row[]>("SELECT slot_key FROM game_reservations WHERE thread_id = ? AND user_id = ? LIMIT 1", [gameKey, userId]);
  const slot = held[0]?.slot_key ? String(held[0].slot_key) : null;
  if (!slot && !hasCard) {
    return {
      status: "denied",
      title: "Reserve a nation first",
      message: "Fortunes of War cards are for players with a nation. Reserve one on the map, then draw your card.",
      map_url: map,
    };
  }
  const player = await playerFlags(db, guildId, userId);
  if (!player.member) {
    return { status: "denied", title: "Join the server first", message: "You need to be a member of TommyKay's Discord server to draw a card.", map_url: map };
  }
  if (player.banned && !hasCard) {
    return { status: "denied", title: "You can't draw", message: "You're banned from reserving nations on this server.", map_url: map };
  }
  if (!row) {
    // The bot adds the row within a few seconds of the reservation.
    return {
      status: "denied",
      title: "Dealing your cards",
      message: "GameMaster is getting your deck ready. Try again in a few seconds.",
      map_url: map,
      action: { label: "Try again", url: `/casino/${encodeURIComponent(gameKey)}` },
    };
  }
  const key = crypto.randomBytes(16).toString("hex");
  await db.query("UPDATE fortunes_draws SET access_key = ?, key_expires_at = ? WHERE game_id = ? AND user_id = ?", [
    key,
    Math.floor(Date.now() / 1000) + FORTUNES_LINK_SEC,
    gameKey,
    userId,
  ]);
  return { status: "ok", kind: "fortunes", nation: row.nation ? String(row.nation) : slot, url: `${CASINO_URL}/fortunes?k=${key}` };
}

/** A player's standing on the server, as the old Discord panel read it from their live roles. */
interface PlayerFlags {
  member: boolean;
  /** Their Discord handle (the member directory), for the Casino's display. */
  username: string | null;
  banned: boolean;
  isVip: boolean;
  isTrusted: boolean;
  isVerified: boolean;
  isAuthenticated: boolean;
  tier: number;
}

/** Membership and roles from the bot's member directory, bans from the records (the bot's _live_role_flags). */
async function playerFlags(db: Pool, guildId: string, userId: string): Promise<PlayerFlags> {
  const records = playerRecords(guildId);
  const [[member], [user], roleIds] = await Promise.all([
    db.query<Row[]>("SELECT role_ids, username FROM web_member_directory WHERE guild_id = ? AND user_id = ? LIMIT 1", [guildId, userId]).then(([rows]) => rows),
    db.query<Row[]>(`SELECT * FROM ${records.table} WHERE ${records.where} LIMIT 1`, [...records.whereParams, userId]).then(([rows]) => rows),
    memberRoleIds(guildId),
  ]);
  // Role ids as digit strings: JSON.parse would round 19-digit snowflakes.
  const roles = new Set(typeof member?.role_ids === "string" ? (member.role_ids.match(/\d{5,25}/g) ?? []) : []);
  const has = (id: string | null) => Boolean(id && roles.has(id));
  const isVip = roleIds.vip_all.some((id) => roles.has(id)) || flag(user?.vip);
  // The Casino's Trusted and Verified are the Roleplay ones (the bot's _live_role_ids).
  const isTrusted = has(roleIds.rp_trusted);
  const isVerified = roleIds.rp_verified ? has(roleIds.rp_verified) : flag(user?.hoi4_verified);
  const isAuthenticated = Boolean(roleIds.ironlegion_on) && (await ironLegionMemberVerified(db, guildId, userId)) === true;
  const tier = isVip ? TIER.vip : isTrusted ? TIER.trusted : isVerified || isAuthenticated ? TIER.verified : TIER.none;
  return {
    member: Boolean(member),
    username: member?.username ? String(member.username) : null,
    banned: flag(user?.banned),
    isVip,
    isTrusted,
    isVerified,
    isAuthenticated,
    tier,
  };
}

/** Where a player's Casino run stands, and what they've rolled so far. */
async function runOf(db: Pool, gameKey: string, userId: string): Promise<{ finished: boolean; results: Record<string, unknown> }> {
  const [sessions] = await db.query<Row[]>(
    "SELECT current_stage, status, receipt_dm_sent, progress FROM web_sessions WHERE game_id = ? AND user_id = ? LIMIT 1",
    [gameKey, userId],
  );
  const row = sessions[0];
  const stage = Number(row?.current_stage ?? 0);
  // Finished as the Casino's own inspector counts it.
  const finished = String(row?.status ?? "").toUpperCase() === "FINALIZED" || flag(row?.receipt_dm_sent) || stage >= 5;
  return { finished, results: json(json(row?.progress).results) };
}

/** The web_access_tokens row the bot's _generate_web_access_token wrote. */
async function writeToken(
  db: Pool,
  gameKey: string,
  userId: string,
  username: string | null,
  player: PlayerFlags,
  kind: "new" | "resume" | "receipt",
): Promise<string> {
  const { isVip, isTrusted, isVerified, isAuthenticated, banned, tier } = player;
  const token = crypto.randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  await db.query(
    `INSERT INTO web_access_tokens
       (token, user_id, username, is_vip, is_trusted, is_verified, is_authenticated, is_banned,
        receipt_view, force_receipt, is_grant, grant_config, created_at, expires_at, can_roll_majors, role_tier, game_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)`,
    [
      token,
      userId,
      username,
      isVip || tier === TIER.vip ? 1 : 0,
      isTrusted ? 1 : 0,
      isVerified ? 1 : 0,
      isAuthenticated ? 1 : 0,
      banned ? 1 : 0,
      kind === "new" ? 0 : 1,
      kind === "receipt" ? 1 : 0,
      now,
      now + (kind === "new" ? NEW_LINK_SEC : RECEIPT_LINK_SEC),
      isVip || isTrusted || isVerified || isAuthenticated ? 1 : 0,
      tier,
      gameKey,
    ],
  );
  return token;
}

export type CasinoReceipt =
  | { status: "ok"; url: string; finished: boolean; nation: string; preview?: boolean }
  | { status: "denied"; message: string };

/**
 * The Casino's static receipt (/receipt/<id>, no login, never expires) with
 * what the player has rolled so far: the bot's _build_house_receipt_url and
 * the Casino inspector's staticReceiptPayload.
 */
function staticReceiptUrl(gameKey: string, userId: string, nation: string, mode: string, results: Record<string, unknown>): string {
  const ideologyRaw = String(results.ideology ?? "");
  const ideology = ideologyRaw.includes(": ") ? ideologyRaw.slice(0, ideologyRaw.lastIndexOf(": ")) : ideologyRaw;
  const pathRaw = String(results.path ?? "");
  const path = pathRaw.includes(": ") ? pathRaw.slice(pathRaw.lastIndexOf(": ") + 2) : pathRaw;
  const payload = { g: gameKey, u: userId, n: nation, m: mode, i: ideology || null, p: path || null };
  return `${CASINO_URL}/receipt/${Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url")}`;
}

/**
 * A player's Casino receipt for the game's host, its co-hosts and Host
 * Management (the map's player cards; docs/casino-integration.md, step 4).
 * A finished run: a read-only link straight to their full receipt (the kind
 * the player gets, 24 hours). Still rolling: the static receipt so far.
 */
export async function casinoReceipt(
  gameKey: string,
  viewer: { id: string; isStaff: boolean; guildId: string | null },
  playerId: string,
): Promise<CasinoReceipt> {
  if (isSchedulerDemo()) {
    return { status: "ok", finished: false, nation: "Germany", preview: true, url: staticReceiptUrl(gameKey, playerId, "Germany", "Roleplay", {}) };
  }
  const db = getPool();
  const [games] = await db.query<Row[]>(
    "SELECT CAST(host_id AS CHAR) AS host_id, guild_id, mode, game_data FROM games WHERE thread_id = ? LIMIT 1",
    [gameKey],
  );
  const game = games[0];
  const data = json(game?.game_data);
  if (!game || !isCasinoGame(data)) return { status: "denied", message: "This isn't a Casino game." };
  const guildId = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
  const coHosts = Array.isArray(data.co_hosts) ? data.co_hosts.map(String) : [];
  const allowed = String(game.host_id ?? "") === viewer.id || coHosts.includes(viewer.id) || (viewer.isStaff && viewer.guildId === guildId);
  if (!allowed) return { status: "denied", message: "Only this game's host, its co-hosts and Host Management can see players' receipts." };

  const [held] = await db.query<Row[]>("SELECT slot_key FROM game_reservations WHERE thread_id = ? AND user_id = ? LIMIT 1", [gameKey, playerId]);
  const nation = held[0]?.slot_key ? String(held[0].slot_key) : null;
  if (!nation) return { status: "denied", message: "This player has no nation in this game." };
  const run = await runOf(db, gameKey, playerId);
  if (!run.finished) {
    return { status: "ok", finished: false, nation, url: staticReceiptUrl(gameKey, playerId, nation, String(game.mode ?? ""), run.results) };
  }
  const player = await playerFlags(db, guildId, playerId);
  const token = await writeToken(db, gameKey, playerId, player.username, player, "receipt");
  return { status: "ok", finished: true, nation, url: casinoLink(token, gameKey) };
}
