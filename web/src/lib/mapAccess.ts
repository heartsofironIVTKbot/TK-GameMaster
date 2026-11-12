import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * Who may see a game's reservation map: members of the game's own Discord
 * server, signed in. A shared link opens nothing for anyone else (the games
 * list, the lobby and its live updates all check this).
 *
 * Membership is the bot's member directory (web_member_directory, refreshed
 * every 10 minutes), so someone who just joined may wait a few minutes. A
 * server with no member list at all (GameMaster isn't in it, or hasn't read
 * its members yet) stays closed: membership can't be checked, and it used to
 * open the map to every signed-in Discord user (2026-11-12).
 */

export type MapAccess = { ok: true; userId: string | null } | { ok: false; reason: "login" | "not_member"; message: string };

export const ACCESS_MESSAGES = {
  login: "Log in with Discord to see this game's reservations.",
  not_member:
    "This game's reservations are only for members of its Discord server. If you just joined it, try again in a few minutes.",
  unchecked:
    "This game's reservations are only for members of its Discord server, and GameMaster can't see that server's members yet. Try again later.",
  no_server: "None of your Discord servers use GameMaster yet, so there are no games to show you.",
} as const;

interface CountRow extends RowDataPacket {
  member: number;
  mirrored: number;
}

/** Can the signed-in viewer (if any) see the maps of games on this server? */
export async function mapAccessFor(guildId: string | null): Promise<MapAccess> {
  if (isSchedulerDemo()) return { ok: true, userId: null };
  const session = await getSession().catch(() => null);
  if (!session) return { ok: false, reason: "login", message: ACCESS_MESSAGES.login };
  if (!guildId) return { ok: true, userId: session.discord_id };
  const [rows] = await getPool().query<CountRow[]>(
    `SELECT EXISTS(SELECT 1 FROM web_member_directory WHERE guild_id = ? AND user_id = ?) AS member,
            EXISTS(SELECT 1 FROM web_member_directory WHERE guild_id = ?) AS mirrored`,
    [guildId, session.discord_id, guildId],
  );
  const row = rows[0];
  if (row && Number(row.member)) return { ok: true, userId: session.discord_id };
  const message = row && !Number(row.mirrored) ? ACCESS_MESSAGES.unchecked : ACCESS_MESSAGES.not_member;
  return { ok: false, reason: "not_member", message };
}

interface MemberGuildRow extends RowDataPacket {
  guild_id: string;
}

/**
 * The map with no game link, for someone who hosts nowhere: a GameMaster
 * server they're a member of — the home server first, then the one with the
 * most recently updated open game. Null when they're in none.
 */
export async function memberGuildFor(userId: string, homeGuildId: string): Promise<string | null> {
  const [rows] = await getPool().query<MemberGuildRow[]>(
    `SELECT CAST(d.guild_id AS CHAR) AS guild_id
       FROM web_member_directory d
       LEFT JOIN games g ON g.guild_id = d.guild_id AND (g.status IS NULL OR g.status NOT IN ('ended', 'cancelled'))
      WHERE d.user_id = ?
      GROUP BY d.guild_id
      ORDER BY (CAST(d.guild_id AS CHAR) = ?) DESC, MAX(g.updated_at) DESC
      LIMIT 1`,
    [userId, homeGuildId],
  );
  return rows[0]?.guild_id ?? null;
}

/** The 401 / 403 a refused request gets (the map shows the message). */
export function accessDenied(access: Extract<MapAccess, { ok: false }>): Response {
  return Response.json(
    { error: access.message, access: access.reason },
    { status: access.reason === "login" ? 401 : 403, headers: { "Cache-Control": "no-store" } },
  );
}
