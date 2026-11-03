import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ironLegionRequired, parseRequireIronLegion } from "@/lib/ironlegion";
import { ironLegionMemberVerified } from "@/lib/ironlegionMember";
import { settingsOf } from "@/lib/serverSettings";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { demoLobbyState } from "@/lib/liveDemo";

/**
 * GET /api/reserve/ironlegion?thread_id=<id>
 *
 * Whether the signed-in viewer still has to authenticate with IronLegion to
 * reserve in this game: `{ needs_authentication: true | false | null }`. The
 * map hides its "Steam authentication needed" notice on false. null = not
 * signed in, or it can't tell. Same check as POST /api/reserve (no directory
 * row = let them through, so false).
 */

const THREAD_ID_RE = /^\d{10,}$/;

interface GameRow extends RowDataPacket {
  guild_id?: string | null;
  game_data: unknown;
}

function requireSwitch(raw: unknown): boolean | null {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return parseRequireIronLegion((data as { require_ironlegion?: unknown } | null)?.require_ironlegion);
}

export async function GET(request: NextRequest) {
  const threadId = new URL(request.url).searchParams.get("thread_id");
  if (!threadId || !THREAD_ID_RE.test(threadId)) {
    return NextResponse.json({ error: "thread_id query param is required" }, { status: 400 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ needs_authentication: null });
  // Preview mode: the sample lobby always asks, so the notice can be seen.
  if (isSchedulerDemo() && demoLobbyState(threadId)) return NextResponse.json({ needs_authentication: true });

  try {
    const pool = getPool();
    const [rows] = await pool.query<GameRow[]>("SELECT guild_id, game_data FROM games WHERE thread_id = ?", [threadId]);
    const game = rows[0];
    if (!game) return NextResponse.json({ needs_authentication: null });
    const guildId = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
    const server = Boolean((await settingsOf(guildId))?.features.ironlegion);
    if (!ironLegionRequired(requireSwitch(game.game_data), server)) return NextResponse.json({ needs_authentication: false });
    const verified = await ironLegionMemberVerified(pool, guildId, session.discord_id);
    return NextResponse.json({ needs_authentication: verified === false });
  } catch (error) {
    console.error("[reserve/ironlegion] check failed:", error);
    return NextResponse.json({ needs_authentication: null });
  }
}
