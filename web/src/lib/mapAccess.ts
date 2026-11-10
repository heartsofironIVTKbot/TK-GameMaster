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
 * server the bot hasn't mirrored yet (no rows at all) stays open, rather than
 * locking everyone out.
 */

export type MapAccess = { ok: true; userId: string | null } | { ok: false; reason: "login" | "not_member"; message: string };

export const ACCESS_MESSAGES = {
  login: "Log in with Discord to see this game's reservations.",
  not_member:
    "This game's reservations are only for members of its Discord server. If you just joined it, try again in a few minutes.",
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
  if (row && !Number(row.mirrored)) return { ok: true, userId: session.discord_id };
  return { ok: false, reason: "not_member", message: ACCESS_MESSAGES.not_member };
}

/** The 401 / 403 a refused request gets (the map shows the message). */
export function accessDenied(access: Extract<MapAccess, { ok: false }>): Response {
  return Response.json(
    { error: access.message, access: access.reason },
    { status: access.reason === "login" ? 401 : 403, headers: { "Cache-Control": "no-store" } },
  );
}
