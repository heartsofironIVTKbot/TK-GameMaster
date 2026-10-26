import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, currentGuildId } from "@/lib/currentGuild";
import { getPool, DatabaseConfigError } from "@/lib/db";
import { demoLobbies } from "@/lib/liveDemo";
import { gameGuildOf, isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * GET /api/games[?game=<thread id>]
 *
 * Game lobbies for the live map: open games that have not started, then
 * games already in progress (started within the last day) — players can ask
 * to hot-join those and report crashes, hosts add late joiners.
 * Reads the same `games` table the bot owns.
 *
 * One server's games (multi-server): the server of ?game= (the bot's
 * announcement / reminder links), else the one the viewer's host pages are on.
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

export async function GET(request: NextRequest) {
  // Accessing request data keeps this handler out of build-time prerendering
  // (Cache Components is enabled, and `export const dynamic` is not allowed
  // in that mode — a prerendered games list would be stale forever).
  const linked = request.nextUrl.searchParams.get("game") ?? "";
  try {
    const guildId = (THREAD_RE.test(linked) ? await gameGuildOf(linked) : null) ?? (await currentGuildId());
    // The sample lobbies belong to the home server.
    if (isSchedulerDemo()) return NextResponse.json({ games: guildId === HOME_GUILD_ID ? demoLobbies(true) : [] });

    const pool = getPool();
    const startedSince = Math.floor(Date.now() / 1000) - STARTED_WINDOW_SEC;
    const [rows] = await pool.query<GameRow[]>(
      // host_id as text: snowflakes exceed 2^53 and would be rounded.
      `SELECT thread_id, mode, status, thread_name, game_started, CAST(host_id AS CHAR) AS host_id, start_timestamp
       FROM games
       WHERE guild_id = ? AND status NOT IN ('ended', 'cancelled')
         AND (game_started = 0 OR COALESCE(start_timestamp, 0) >= ?)
       ORDER BY game_started ASC, updated_at DESC
       LIMIT 50`,
      [guildId, startedSince],
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
