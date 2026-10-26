import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { aiResultsFor } from "@/lib/aiResults";
import { HOME_GUILD_ID, currentGuildId } from "@/lib/currentGuild";
import { DatabaseConfigError, getPool } from "@/lib/db";
import { getPlayerPortfolio, getPlayerProfile } from "@/lib/playerProfile";
import type { PlayerPortfolio } from "@/lib/playerTypes";
import type { MyProfileResponse } from "@/lib/profileTypes";
import { DEMO_HOST, isSchedulerDemo } from "@/lib/scheduleStore";
import { demoServers } from "@/lib/serverSettingsDemo";
import { getSession } from "@/lib/session";

/**
 * GET /api/me/profile[?guild=<server id>]
 *
 * The logged-in player's own record — the page the /info command opens.
 * Same data as the Database page's player record, but only ever your own,
 * and without who issued each action or links into the private audit log.
 * `guild` (from /info) picks the server whose records to show, as long as
 * you're a member there; otherwise the server the host pages are on (home
 * for most players).
 */

const ID_RE = /^\d{15,25}$/;

/** Is the player a member of (or on record at) this server? */
async function knownOn(userId: string, guildId: string): Promise<boolean> {
  if (guildId === HOME_GUILD_ID) return true;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT 1 FROM web_member_directory WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)
       UNION ALL SELECT 1 FROM guild_users WHERE guild_id = ? AND discord_id = ? LIMIT 1`,
      [guildId, userId, guildId, userId],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function serverName(guildId: string): Promise<string | null> {
  if (isSchedulerDemo()) return demoServers().get(guildId)?.name ?? null;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT guild_name FROM guild_settings WHERE guild_id = ?", [guildId]);
    return (rows[0]?.guild_name as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}

/** A player sees their own record, not which staff member did what. */
function forPlayer(portfolio: PlayerPortfolio): PlayerPortfolio {
  return {
    ...portfolio,
    events: portfolio.events.map((event) => ({ ...event, issued_by: null, log_url: null })),
    game_bans: portfolio.game_bans.map((ban) => ({ ...ban, issued_by: null, log_url: null })),
    dishonored: portfolio.dishonored.map((entry) => ({ ...entry, log_url: null })),
  };
}

export async function GET(request: NextRequest) {
  const session = isSchedulerDemo() ? null : await getSession();
  const viewer = isSchedulerDemo()
    ? { discord_id: DEMO_HOST.discord_id, username: DEMO_HOST.username, avatar_url: null }
    : session
      ? {
          discord_id: session.discord_id,
          username: session.username,
          avatar_url: session.avatar ? `https://cdn.discordapp.com/avatars/${session.discord_id}/${session.avatar}.png?size=128` : null,
        }
      : null;
  if (!viewer) return Response.json({ error: "Log in with Discord first." }, { status: 401 });

  try {
    const wanted = request.nextUrl.searchParams.get("guild") ?? "";
    let guildId = await currentGuildId();
    if (ID_RE.test(wanted) && wanted !== guildId && (isSchedulerDemo() ? demoServers().has(wanted) : await knownOn(viewer.discord_id, wanted))) {
      guildId = wanted;
    }
    const [profile, portfolio, name, aiResults] = await Promise.all([
      getPlayerProfile(viewer.discord_id, guildId),
      getPlayerPortfolio(viewer.discord_id, true, guildId),
      serverName(guildId),
      aiResultsFor(viewer.discord_id, guildId).catch(() => []),
    ]);
    const body: MyProfileResponse = {
      profile,
      portfolio: forPlayer(portfolio),
      server: { id: guildId, name },
      viewer,
      ai_results: aiResults,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[me/profile] failed:", error);
    return Response.json({ error: "The database is unavailable — try again shortly." }, { status: 503 });
  }
}
