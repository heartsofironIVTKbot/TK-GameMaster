import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { canonicalName, nationMatchKeys } from "@/data/nationCategories";
import { isCasinoGame } from "@/lib/casinoSettings";
import { HOME_GUILD_ID, playerRecords } from "@/lib/currentGuild";
import { unstartedGamePassed } from "@/lib/gameWindow";
import { ironLegionRequired, ironLegionVerifyUrl, parseRequireIronLegion } from "@/lib/ironlegion";
import { ironLegionMemberVerified } from "@/lib/ironlegionMember";
import { memberRoleIds } from "@/lib/memberRoles";
import { categoryOfMode } from "@/lib/scheduleOptions";
import { getHostRosterEntry } from "@/lib/scheduleStore";
import { settingsOf } from "@/lib/serverSettings";
import { memberIsVip, vipOpenNations } from "@/lib/vipStatus";

/**
 * Who may take which nation in a game: the reserve route's rules, shared with
 * the map's 30-second hold (POST /api/live/select), so a player can only hold
 * a nation they could actually reserve (2026-11-12: a player without Trusted
 * could hold a major for 30 s and keep everyone else off it).
 */

export interface GameDataDocument {
  lockdown?: unknown;
  /** The game's own IronLegion switch (lib/ironlegion.ts). */
  require_ironlegion?: unknown;
  add_on?: unknown;
  randomizer_only?: unknown;
  capacity?: unknown;
  locked_regions?: unknown;
  /** Locked nations VIPs may still reserve (lib/vipStatus.ts). */
  vip_open_regions?: unknown;
  layout_disabled_nations?: unknown;
  is_draft?: unknown;
  /** Players the Host Tool placed: user id → until (epoch s; 0 = until a host changes them). */
  host_locks?: unknown;
  /** Who may reserve majors / minors: "VIP" | "Trusted" | "Verified" | "All Users". */
  major_lock_level?: unknown;
  minor_lock_level?: unknown;
}

export interface RuleGame {
  guild_id?: string | null;
  mode: string | null;
  status: string | null;
  game_started: number | boolean;
  start_timestamp?: number | null;
}

export interface Refusal {
  message: string;
  status: number;
}

interface UserRow extends RowDataPacket {
  hoi4_verified: number | boolean;
  /** Missing until the bot has added the column (then Historical falls back to hoi4_verified). */
  hist_verified?: number | boolean;
  banned: number | boolean;
  vip?: number | boolean;
}

export function parseGameData(raw: unknown): GameDataDocument {
  if (typeof raw === "string") {
    try {
      return (JSON.parse(raw) ?? {}) as GameDataDocument;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as GameDataDocument;
  }
  return {};
}

export function isCoopSlot(slotKey: string): boolean {
  return slotKey.includes("_coop");
}

export function isFillerSlot(slotKey: string): boolean {
  return slotKey.startsWith("_FILL_");
}

/** The game takes no picks from the map right now (started, locked down, draft, Casino …). */
export function gameClosedRefusal(game: RuleGame, gameData: GameDataDocument): Refusal | null {
  if (game.game_started || ["ended", "cancelled"].includes(game.status ?? "")) {
    return { message: "Reservations are closed — this game has started or ended", status: 409 };
  }
  // Announced, never started, and its time long gone (lib/gameWindow.ts).
  if (unstartedGamePassed(game.start_timestamp)) {
    return { message: "Reservations are closed — this game's time has passed", status: 409 };
  }
  if (gameData.lockdown) return { message: "Reservations are locked down by the host", status: 409 };
  // Casino games: nations are rolled on the Casino (GET /casino/<game>), never picked here.
  if (isCasinoGame(gameData)) return { message: "This is a Casino game: roll your nation at the Casino", status: 409 };
  // Draft games are filled through the draft pool (POST /api/draft): the captains (or the host) place players.
  if (gameData.is_draft) {
    return { message: "This is a draft game — use Join the draft; the team captains place players on nations", status: 409 };
  }
  return null;
}

/**
 * IronLegion Steam authentication, when the game (or its server) requires it.
 * IronLegion's own yes / no from its database (lib/ironlegionMember.ts), else
 * the bot's `verified` flag in web_member_directory, built from the same answers.
 * No row yet, or an older table: let them through, like the bot does when it
 * can't check (and the bot re-checks its own reservation paths).
 */
async function ironLegionRefusal(db: Pool | PoolConnection, guildId: string, userId: string, game: GameDataDocument): Promise<string | null> {
  const server = Boolean((await settingsOf(guildId))?.features.ironlegion);
  if (!ironLegionRequired(parseRequireIronLegion(game.require_ironlegion), server)) return null;
  if ((await ironLegionMemberVerified(db, guildId, userId)) === false) {
    const url = ironLegionVerifyUrl(guildId, (await memberRoleIds(guildId).catch(() => null))?.ironlegion_verify_channel);
    return `This game requires IronLegion Steam authentication. Press Authenticate ${url ? `in ${url}` : "on the server's IronLegion panel in Discord"}; then try again.`;
  }
  return null;
}

/**
 * May this player take this nation (the bot's name for it, `slot`; a co-op
 * slot follows its main nation): host locks (and "except VIPs"), a preset's
 * not-playable nations, a ban, the game's Major / Minor access levels, and
 * IronLegion. Null = yes. `modeMajors`: the mode's majors (bot names).
 */
export async function nationRefusal(
  db: Pool | PoolConnection,
  args: {
    game: RuleGame;
    gameData: GameDataDocument;
    slot: string;
    mapTag: string | null;
    userId: string;
    modeMajors: string[] | null;
  },
): Promise<Refusal | null> {
  const { game, gameData, slot, mapTag, userId, modeMajors } = args;
  const gameGuild = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
  const mainNation = isCoopSlot(slot) ? slot.split("_coop", 1)[0] : slot;

  // Host-locked nations (Games page / calendar / Host Tool) and a preset's not-playable ones.
  let vipOnlyNation: string | null = null;
  if (!isFillerSlot(slot)) {
    const disabled = (Array.isArray(gameData.layout_disabled_nations) ? gameData.layout_disabled_nations : []).map((name) =>
      canonicalName(String(name)),
    );
    const lockedKeys = new Set([
      ...(Array.isArray(gameData.locked_regions) ? gameData.locked_regions : []).map((name) => canonicalName(String(name))),
      ...disabled,
    ]);
    const nationKeys = mapTag ? nationMatchKeys(mapTag, mainNation, mainNation) : new Set([canonicalName(mainNation)]);
    // Locked "except VIPs": checked once the player is known.
    const vipOpenKeys = new Set(vipOpenNations(gameData as Record<string, unknown>).map((name) => canonicalName(name)));
    const disabledKeys = new Set(disabled);
    const matches = [...nationKeys].filter((key) => lockedKeys.has(key));
    if (matches.length > 0) {
      if (matches.every((key) => vipOpenKeys.has(key) && !disabledKeys.has(key))) vipOnlyNation = mainNation;
      else return { message: `${mainNation} is locked in this game`, status: 409 };
    }
  }

  // The game's own server's player record (multi-server: other servers keep
  // theirs in guild_users). No record yet = a player new to this server: not
  // banned, nothing verified in the database — their roles still count.
  const records = playerRecords(gameGuild);
  const [userRows] = await db.query<UserRow[]>(`SELECT * FROM ${records.table} WHERE ${records.where}`, [
    ...records.whereParams,
    userId,
  ]);
  const user = userRows[0] ?? ({ hoi4_verified: 0, hist_verified: 0, banned: 0, vip: 0 } as UserRow);
  if (user.banned) return { message: "You are banned from reserving nations", status: 403 };
  // A nation locked "except VIPs": VIPs only (hosts place players with the Host Tool).
  if (vipOnlyNation && !(await memberIsVip(gameGuild, userId, Boolean(user.vip)))) {
    return { message: `${vipOnlyNation} is locked in this game: only VIP players can reserve it`, status: 403 };
  }

  // Who may reserve: the game's own levels (Games page / game setup), majors
  // and minors separately, as the bot's _member_meets_lock_level: everyone,
  // Verified+ (Verified or Trusted), Trusted+, or VIP. Hosts always may.
  // Verified: the game type's role, else the record's flag (hoi4_verified /
  // hist_verified for Historical once the bot has set that role up).
  if (!isFillerSlot(slot)) {
    const major = modeMajors ? modeMajors.includes(mainNation) : false;
    const raw = major ? gameData.major_lock_level ?? "Trusted" : gameData.minor_lock_level ?? "All Users";
    const level = ["VIP", "Trusted", "Verified", "All Users"].includes(String(raw)) ? String(raw) : major ? "Trusted" : "All Users";
    if (level !== "All Users" && !(await getHostRosterEntry(userId, gameGuild).catch(() => null))) {
      const [roleIds, [directory]] = await Promise.all([
        memberRoleIds(gameGuild),
        db.query<(RowDataPacket & { role_ids: string | null })[]>(
          "SELECT role_ids FROM web_member_directory WHERE guild_id = ? AND user_id = ? LIMIT 1",
          [gameGuild, userId],
        ),
      ]);
      const historical = categoryOfMode(game.mode ?? "") === "Historical" && Boolean(roleIds.hist_verified);
      // Role ids as digit strings: JSON.parse would round 19-digit snowflakes.
      const raws = directory[0]?.role_ids;
      const roles = new Set(typeof raws === "string" ? (raws.match(/\d{5,25}/g) ?? []) : []);
      const has = (id: string | null) => Boolean(id && roles.has(id));
      const vip = roleIds.vip_all.some((id) => roles.has(id)) || Boolean(user.vip);
      const trusted = has(historical ? roleIds.hist_trusted : roleIds.rp_trusted);
      const verifiedRole = historical ? roleIds.hist_verified : roleIds.rp_verified;
      const verified = verifiedRole ? has(verifiedRole) : Boolean(historical ? user.hist_verified : user.hoi4_verified);
      const allowed = level === "VIP" ? vip : level === "Trusted" ? trusted : verified || trusted;
      if (!allowed) {
        const who = level === "VIP" ? "VIP" : level === "Trusted" ? "Trusted+" : "Verified+";
        return { message: `${major ? "Major" : "Minor"} nations in this game are for ${who} players only.`, status: 403 };
      }
    }
  }

  const ironLegion = await ironLegionRefusal(db, gameGuild, userId, gameData);
  if (ironLegion) return { message: ironLegion, status: 403 };
  return null;
}
