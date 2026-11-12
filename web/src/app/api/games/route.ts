import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, currentGuildId, hostServersOf } from "@/lib/currentGuild";
import { getPool, DatabaseConfigError } from "@/lib/db";
import { demoLobbies } from "@/lib/liveDemo";
import { gameGuildOf, isSchedulerDemo } from "@/lib/scheduleStore";
import { ACCESS_MESSAGES, mapAccessFor, memberGuildFor } from "@/lib/mapAccess";
import { getSession } from "@/lib/session";
import { UNSTARTED_GAME_CLOSES_AFTER_SEC } from "@/lib/gameWindow";

/**
 * GET /api/games[?game=<thread id>]
 *
 * Game lobbies for the live map: open games that have not started, then
 * games already in progress (started within the last day) — players can ask
 * to hot-join those and report crashes, hosts add late joiners.
 * Reads the same `games` table the bot owns.
 *
 * One server's games (multi-server): the server of ?game= (the bot's
 * announcement / reminder links), else the one the viewer's host pages are on,
 * else (players) a GameMaster server they're a member of.
 * Only for that server's members, signed in (lib/mapAccess.ts): anyone else
 * gets no games and `access` ("login" / "not_member") with the reason.
 */

const THREAD_RE = /^\d{10,25}$/;

/** How long after its start a running game still shows up. */
const STARTED_WINDOW_SEC = 24 * 3600;

interface GameRow extends RowDataPacket {
  thread_id: string;
  mode: string | null;
  status: string | null;
  thread_name: string | null;
  game_started: number | boolean;
  host_id: string | number | null;
  start_timestamp: number | null;
}

/**
 * No game link: a host's current server; a player's own GameMaster server;
 * null for a player in none (no longer the home server for everyone). Not
 * signed in: the home server, which then asks them to log in.
 */
async function defaultGuild(): Promise<string | null> {
  const session = await getSession().catch(() => null);
  if (!session) return HOME_GUILD_ID;
  const hosts = await hostServersOf(session.discord_id).catch(() => []);
  if (hosts.length > 0) return currentGuildId();
  return memberGuildFor(session.discord_id, HOME_GUILD_ID);
}

export async function GET(request: NextRequest) {
  // Accessing request data keeps this handler out of build-time prerendering
  // (Cache Components is enabled, and `export const dynamic` is not allowed
  // in that mode — a prerendered games list would be stale forever).
  const linked = request.nextUrl.searchParams.get("game") ?? "";
  try {
    // The sample lobbies belong to the home server.
    if (isSchedulerDemo()) {
      const demoGuild = (THREAD_RE.test(linked) ? await gameGuildOf(linked) : null) ?? (await currentGuildId());
      return NextResponse.json({ games: demoGuild === HOME_GUILD_ID ? demoLobbies(true) : [] });
    }
    const guildId = (THREAD_RE.test(linked) ? await gameGuildOf(linked) : null) ?? (await defaultGuild());
    if (guildId === null) {
      return NextResponse.json(
        { games: [], access: "not_member", error: ACCESS_MESSAGES.no_server },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const access = await mapAccessFor(guildId);
    if (!access.ok) {
      return NextResponse.json(
        { games: [], access: access.reason, error: access.message },
        { status: access.reason === "login" ? 401 : 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const pool = getPool();
    const nowSec = Math.floor(Date.now() / 1000);
    const startedSince = nowSec - STARTED_WINDOW_SEC;
    // Never started and its time long gone: closed (lib/gameWindow.ts).
    const unstartedSince = nowSec - UNSTARTED_GAME_CLOSES_AFTER_SEC;
    const [rows] = await pool.query<GameRow[]>(
      // host_id as text: snowflakes exceed 2^53 and would be rounded.
      `SELECT thread_id, mode, status, thread_name, game_started, CAST(host_id AS CHAR) AS host_id, start_timestamp
       FROM games
       WHERE guild_id = ? AND (status IS NULL OR status NOT IN ('ended', 'cancelled'))
         AND (
           (game_started = 0 AND (start_timestamp IS NULL OR start_timestamp = 0 OR start_timestamp >= ?))
           OR (game_started <> 0 AND COALESCE(start_timestamp, 0) >= ?)
         )
       ORDER BY game_started ASC, updated_at DESC
       LIMIT 50`,
      [guildId, unstartedSince, startedSince],
    );
    return NextResponse.json({ games: rows });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      // Missing MYSQL_* env vars: tell the client exactly what to fix.
      // The message names keys only, never values, so it is safe to expose.
      console.error("[games] database configuration error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[games] GET failed:", error);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
