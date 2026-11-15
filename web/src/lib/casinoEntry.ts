import { isCasinoGame } from "@/lib/casinoSettings";
import { CASINO_DOWN_MESSAGE, CASINO_URL, casinoUp } from "@/lib/casinoStatus";
import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, playerRecords } from "@/lib/currentGuild";
import { hasCasino } from "@/lib/serverSettingsTypes";
import type { Pool } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { ironLegionRequired, ironLegionVerifyUrl, parseRequireIronLegion } from "@/lib/ironlegion";
import { ironLegionMemberVerified } from "@/lib/ironlegionMember";
import { memberRoleIds } from "@/lib/memberRoles";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { casinoRoomsOf } from "@/lib/lobbySnapshot";
import { moderationOptions } from "@/lib/playerIndex";
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

export { CASINO_URL };
/** A fresh or resume link works once, for a minute (the bot's WEB_ACCESS_TOKEN_TTL_SEC). */
const NEW_LINK_SEC = 60;
/** A finished run's receipt link can be opened again for 3 days (the bot's RECEIPT_VIEW_TOKEN_TTL_SEC). */
const RECEIPT_LINK_SEC = 3 * 24 * 3600;
/** The bot's numeric tiers: lower = more privileged. */
const TIER = { vip: 0, trusted: 1, verified: 2, none: 3 } as const;

export type CasinoEntry =
  | {
      status: "ok";
      url: string;
      kind: "new" | "resume" | "receipt";
      nation: string | null;
      preview?: boolean;
      /** A co-op player: the main's name (the receipt is theirs). */
      coop_of?: string | null;
    }
  | { status: "not_casino"; map_url: string }
  /** The game's host, a co-host or Host Management without a nation: the map, or roll. */
  | { status: "host"; map_url: string }
  /** Every nation is taken: ask to be a filler, or watch (and ask to co-op) on the map. */
  | { status: "full"; map_url: string; filler: "none" | "pending" | "approved" | "declined" }
  | { status: "denied"; title: string; message: string; map_url: string | null; action?: { label: string; url: string } };

interface GameRow extends RowDataPacket {
  thread_id: string;
  host_id: string | null;
  mode: string | null;
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

/** Every playable nation of the game's mode is held (the Casino has nothing left to roll). */
async function allNationsTaken(db: Pool, gameKey: string, guildId: string, mode: string, data: Record<string, unknown>): Promise<boolean> {
  const list = (await moderationOptions(guildId).catch(() => null))?.mode_nations?.[mode];
  if (!list) return false;
  const hidden = new Set((Array.isArray(data.layout_disabled_nations) ? data.layout_disabled_nations : []).map(String));
  const playable = [...list.majors, ...list.minors].filter((name) => !hidden.has(name));
  if (playable.length === 0) return false;
  const [rows] = await db.query<Row[]>("SELECT slot_key FROM game_reservations WHERE thread_id = ?", [gameKey]);
  const taken = new Set(rows.map((row) => String(row.slot_key)));
  return playable.every((name) => taken.has(name));
}

/** Where this player should go for this game, with every check the old panel made.
 *  `viewer.roll`: a host chose to roll after all (skip the host choice). */
export async function casinoEntry(
  gameKey: string,
  userId: string,
  username: string,
  viewer: { isStaff?: boolean; staffGuild?: string | null; roll?: boolean } = {},
): Promise<CasinoEntry> {
  const map = mapUrlOf(gameKey);
  if (isSchedulerDemo()) {
    // Preview: no database or Casino to talk to; show where it would go.
    return { status: "ok", kind: "new", nation: null, preview: true, url: casinoLink("preview-token", gameKey) };
  }
  const db = getPool();
  const [games] = await db.query<GameRow[]>(
    "SELECT thread_id, CAST(host_id AS CHAR) AS host_id, mode, guild_id, status, game_started, game_data FROM games WHERE thread_id = ? LIMIT 1",
    [gameKey],
  );
  const game = games[0];
  if (!game) return { status: "denied", title: "Game not found", message: "This game isn't on GameMaster any more. It may have been cancelled.", map_url: null };
  const data = json(game.game_data);
  if (!isCasinoGame(data)) return { status: "not_casino", map_url: map };
  const guildId = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
  // The Casino servers (TommyKay and its test server), whichever is home.
  if (!hasCasino(guildId)) {
    return { status: "denied", title: "Not a Casino server", message: "The Casino is only for TommyKay's server.", map_url: map };
  }

  // Already holding a nation: resume the run, or see the receipt (never a fresh roll).
  const [held] = await db.query<Row[]>("SELECT slot_key FROM game_reservations WHERE thread_id = ? AND user_id = ? LIMIT 1", [gameKey, userId]);
  const nation = held[0]?.slot_key ? String(held[0].slot_key) : null;
  // A co-op never rolls: the run is the main's, and they get the main's receipt.
  if (nation && nation.includes("_coop")) return coopEntry(db, gameKey, guildId, nation.split("_coop", 1)[0], map);
  // A filler has nothing to roll: the host can swap them in for a no-show.
  if (nation && nation.startsWith("_FILL_")) {
    return {
      status: "denied",
      title: "You're a filler",
      message: "You're on this game as a filler, so there's nothing to roll. If a player doesn't show up, the host can swap you in.",
      map_url: map,
    };
  }

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

  if (!nation) {
    // The host, co-hosts and Host Management: the live map, or a roll of their own.
    const coHosts = Array.isArray(data.co_hosts) ? data.co_hosts.map(String) : [];
    const hosting =
      String(game.host_id ?? "") === userId || coHosts.includes(userId) || (Boolean(viewer.isStaff) && viewer.staffGuild === guildId);
    if (hosting && !viewer.roll) return { status: "host", map_url: map };
    // Nothing left to roll: a filler spot, or the map (co-op requests are there).
    if (await allNationsTaken(db, gameKey, guildId, String(game.mode ?? ""), data)) {
      const requests = data.filler_requests && typeof data.filler_requests === "object" ? (data.filler_requests as Record<string, unknown>) : {};
      const mine = requests[userId] && typeof requests[userId] === "object" ? String((requests[userId] as Record<string, unknown>).status ?? "") : "";
      const filler = mine === "pending" || mine === "approved" || mine === "declined" ? mine : "none";
      return { status: "full", map_url: map, filler };
    }
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

  // Down: say so rather than send them to a dead page (the host can switch the game to normal reserving).
  if (!(await casinoUp())) return { status: "denied", title: "The Casino is down", message: CASINO_DOWN_MESSAGE, map_url: map };

  let kind: "new" | "resume" | "receipt" = "new";
  if (nation) kind = (await runOf(db, gameKey, userId)).finished ? "receipt" : "resume";
  const token = await writeToken(db, gameKey, userId, username, player, kind);
  return { status: "ok", kind, nation, url: casinoLink(token, gameKey) };
}

/**
 * A co-op player's way in (2026-11-15): their main's Casino receipt once the
 * main has finished rolling (the same read-only link the main gets), never a
 * run of their own.
 */
async function coopEntry(db: Pool, gameKey: string, guildId: string, nation: string, map: string): Promise<CasinoEntry> {
  const [owners] = await db.query<Row[]>(
    "SELECT CAST(user_id AS CHAR) AS user_id FROM game_reservations WHERE thread_id = ? AND slot_key = ? LIMIT 1",
    [gameKey, nation],
  );
  const mainId = owners[0]?.user_id ? String(owners[0].user_id) : null;
  if (!mainId) {
    return { status: "denied", title: "No main player", message: `Nobody holds ${nation} right now, so there's no receipt to show.`, map_url: map };
  }
  const main = await playerFlags(db, guildId, mainId);
  const mainName = main.username ?? "Your main";
  if (!(await runOf(db, gameKey, mainId)).finished) {
    return {
      status: "denied",
      title: "Your main is still rolling",
      message: `You're on the ${nation} co-op. ${mainName} hasn't finished rolling at the Casino yet: once they have, this opens their receipt.`,
      map_url: map,
    };
  }
  if (!(await casinoUp())) return { status: "denied", title: "The Casino is down", message: CASINO_DOWN_MESSAGE, map_url: map };
  const token = await writeToken(db, gameKey, mainId, main.username, main, "receipt");
  return { status: "ok", kind: "receipt", nation, coop_of: mainName, url: casinoLink(token, gameKey) };
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
      // Only a finished run's receipt link is reusable; a resume link works once
      // (2026-11-14: a 3-day reusable resume link was a way back into the run).
      kind === "receipt" ? 1 : 0,
      kind === "receipt" ? 1 : 0,
      now,
      now + (kind === "receipt" ? RECEIPT_LINK_SEC : NEW_LINK_SEC),
      isVip || isTrusted || isVerified || isAuthenticated ? 1 : 0,
      tier,
      gameKey,
    ],
  );
  return token;
}

/** One nation's player in a Casino game, and how far they've rolled. */
export interface CasinoRollRow {
  user_id: string;
  name: string;
  nation: string;
  state: "finished" | "rolling" | "not_started";
  /** Where an unfinished run stopped ("Doctrine room"). */
  where: string | null;
}

export type CasinoRolls =
  | { status: "ok"; rows: CasinoRollRow[]; rooms_on: boolean; removal_at: number | null }
  | { status: "denied"; message: string };

const STAGE_NAMES: Record<number, string> = { 0: "Nation wheel", 1: "Poker Lounge", 2: "Doctrine room", 3: "Build slots", 4: "Roulette" };

/** Finished as the bot counts it (_casino_run_finished): the receipt, or a host grant's roll came back. */
function runFinished(row: Row | undefined, override: unknown): boolean {
  if (override && typeof override === "object" && Object.keys(override as object).length > 0) return true;
  if (!row) return false;
  return String(row.status ?? "").toUpperCase() === "FINALIZED" || flag(row.receipt_dm_sent) || Number(row.current_stage ?? 0) >= 5;
}

/**
 * Everyone's Casino rolls in a game (2026-11-15), for its host, co-hosts and
 * Host Management: the Games page's "Casino rolls" card, in place of the old
 * Casino's host page. Unfinished players are reminded by DM and taken off
 * their nation 30 minutes before the start (bot casino_roll_watch_loop).
 */
export async function casinoRolls(gameKey: string, viewer: { id: string; isStaff: boolean; guildId: string | null }): Promise<CasinoRolls> {
  if (isSchedulerDemo()) {
    return {
      status: "ok",
      rooms_on: true,
      removal_at: null,
      rows: [
        { user_id: "1", name: "Otto", nation: "Germany", state: "finished", where: null },
        { user_id: "2", name: "Ivan", nation: "Soviet Union", state: "rolling", where: STAGE_NAMES[2] },
        { user_id: "3", name: "Tom", nation: "France", state: "not_started", where: null },
      ],
    };
  }
  const db = getPool();
  const [games] = await db.query<Row[]>(
    "SELECT CAST(host_id AS CHAR) AS host_id, guild_id, game_data FROM games WHERE thread_id = ? LIMIT 1",
    [gameKey],
  );
  const game = games[0];
  const data = json(game?.game_data);
  if (!game || !isCasinoGame(data)) return { status: "denied", message: "This isn't a Casino game." };
  const guildId = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
  const coHosts = Array.isArray(data.co_hosts) ? data.co_hosts.map(String) : [];
  const allowed = String(game.host_id ?? "") === viewer.id || coHosts.includes(viewer.id) || (viewer.isStaff && viewer.guildId === guildId);
  if (!allowed) return { status: "denied", message: "Only this game's host, its co-hosts and Host Management can see everyone's rolls." };

  const [held] = await db.query<Row[]>(
    "SELECT slot_key, CAST(user_id AS CHAR) AS user_id FROM game_reservations WHERE thread_id = ?",
    [gameKey],
  );
  const mains = held.filter((row) => {
    const slot = String(row.slot_key ?? "");
    return slot && !slot.includes("_coop") && !slot.startsWith("_FILL_");
  });
  const ids = mains.map((row) => String(row.user_id));
  const [sessions] = await db.query<Row[]>(
    "SELECT CAST(user_id AS CHAR) AS user_id, current_stage, status, receipt_dm_sent FROM web_sessions WHERE game_id = ?",
    [gameKey],
  );
  const runs = new Map(sessions.map((row) => [String(row.user_id), row]));
  const names = new Map<string, string>();
  if (ids.length) {
    const [members] = await db.query<Row[]>(
      `SELECT CAST(user_id AS CHAR) AS user_id, display_name, username FROM web_member_directory
        WHERE guild_id = ? AND user_id IN (${ids.map(() => "?").join(",")})`,
      [guildId, ...ids],
    );
    for (const member of members) names.set(String(member.user_id), String(member.display_name || member.username || member.user_id));
  }
  const overrides = data.web_override_rolls && typeof data.web_override_rolls === "object" ? (data.web_override_rolls as Record<string, unknown>) : {};
  const roomsOn = casinoRoomsOf(data).casino_rooms.length > 0;
  const rows: CasinoRollRow[] = mains.map((row) => {
    const id = String(row.user_id);
    const run = runs.get(id);
    const finished = !roomsOn || runFinished(run, overrides[id]);
    const stage = Number(run?.current_stage ?? 0);
    return {
      user_id: id,
      name: names.get(id) ?? id,
      nation: String(row.slot_key),
      state: finished ? "finished" : run ? "rolling" : "not_started",
      where: finished || !run ? null : (STAGE_NAMES[stage] ?? null),
    };
  });
  const order = { not_started: 0, rolling: 1, finished: 2 } as const;
  rows.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
  const start = Number(data.start_timestamp ?? 0);
  return { status: "ok", rows, rooms_on: roomsOn, removal_at: start > 0 ? start - 30 * 60 : null };
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
 * the player gets, 3 days). Still rolling: the static receipt so far.
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
  let nation = held[0]?.slot_key ? String(held[0].slot_key) : null;
  if (!nation) return { status: "denied", message: "This player has no nation in this game." };
  // A co-op: their main's receipt (the run is the main's).
  if (nation.includes("_coop")) {
    nation = nation.split("_coop", 1)[0];
    const [owners] = await db.query<Row[]>(
      "SELECT CAST(user_id AS CHAR) AS user_id FROM game_reservations WHERE thread_id = ? AND slot_key = ? LIMIT 1",
      [gameKey, nation],
    );
    if (!owners[0]?.user_id) return { status: "denied", message: `Nobody holds ${nation} right now.` };
    playerId = String(owners[0].user_id);
  }
  const run = await runOf(db, gameKey, playerId);
  if (!run.finished) {
    return { status: "ok", finished: false, nation, url: staticReceiptUrl(gameKey, playerId, nation, String(game.mode ?? ""), run.results) };
  }
  const player = await playerFlags(db, guildId, playerId);
  const token = await writeToken(db, gameKey, playerId, player.username, player, "receipt");
  return { status: "ok", finished: true, nation, url: casinoLink(token, gameKey) };
}
