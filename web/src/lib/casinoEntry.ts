import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, isHomeGuild, playerRecords } from "@/lib/currentGuild";
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
  | { status: "ok"; url: string; kind: "new" | "resume" | "receipt"; nation: string | null; preview?: boolean }
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
  if (data.add_on !== "randomizer") return { status: "not_casino", map_url: map };
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

  // Who they are on the server: membership and roles from the bot's member directory, bans from the records.
  const records = playerRecords(guildId);
  const [[member], [user], roleIds] = await Promise.all([
    db.query<Row[]>("SELECT role_ids FROM web_member_directory WHERE guild_id = ? AND user_id = ? LIMIT 1", [guildId, userId]).then(([rows]) => rows),
    db.query<Row[]>(`SELECT * FROM ${records.table} WHERE ${records.where} LIMIT 1`, [...records.whereParams, userId]).then(([rows]) => rows),
    memberRoleIds(guildId),
  ]);
  if (!member) {
    return { status: "denied", title: "Join the server first", message: "You need to be a member of TommyKay's Discord server to play in the Casino.", map_url: map };
  }
  const banned = flag(user?.banned);
  if (banned && !nation) {
    return { status: "denied", title: "You can't roll", message: "You're banned from reserving nations on this server.", map_url: map };
  }
  // Role ids as digit strings: JSON.parse would round 19-digit snowflakes.
  const roles = new Set(typeof member.role_ids === "string" ? (member.role_ids.match(/\d{5,25}/g) ?? []) : []);
  const has = (id: string | null) => Boolean(id && roles.has(id));
  const isVip = roleIds.vip_all.some((id) => roles.has(id)) || flag(user?.vip);
  // The Casino's Trusted and Verified are the Roleplay ones (the bot's _live_role_ids).
  const isTrusted = has(roleIds.rp_trusted);
  const isVerified = roleIds.rp_verified ? has(roleIds.rp_verified) : flag(user?.hoi4_verified);
  const serverIronLegion = Boolean((await settingsOf(guildId))?.features.ironlegion);
  const isAuthenticated = Boolean(roleIds.ironlegion_on) && (await ironLegionMemberVerified(db, guildId, userId)) === true;
  if (!nation && ironLegionRequired(parseRequireIronLegion(data.require_ironlegion), serverIronLegion) && !isAuthenticated) {
    const authenticate = ironLegionVerifyUrl(guildId, roleIds.ironlegion_verify_channel);
    return {
      status: "denied",
      title: "Steam authentication needed",
      message: "This game requires IronLegion. Authenticate your Steam account with IronLegion, then open the Casino again.",
      map_url: map,
      ...(authenticate ? { action: { label: "Authenticate with IronLegion", url: authenticate } } : {}),
    };
  }
  const tier = isVip ? TIER.vip : isTrusted ? TIER.trusted : isVerified || isAuthenticated ? TIER.verified : TIER.none;

  let kind: "new" | "resume" | "receipt" = "new";
  if (nation) {
    const [sessions] = await db.query<Row[]>("SELECT current_stage, status FROM web_sessions WHERE game_id = ? AND user_id = ? LIMIT 1", [gameKey, userId]);
    const stage = Number(sessions[0]?.current_stage ?? 0);
    const finished = String(sessions[0]?.status ?? "").toUpperCase() === "FINALIZED" || stage >= 5;
    kind = finished ? "receipt" : "resume";
  }
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
  return { status: "ok", kind, nation, url: casinoLink(token, gameKey) };
}
