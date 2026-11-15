import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { DatabaseConfigError, getPool } from "@/lib/db";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { draftViewerIdentity } from "@/lib/draftStore";
import { SchedulerSetupError, countPendingRequests, getRequest, insertRequest, isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * A Casino game where every nation is taken: ask to be a filler (2026-11-15).
 *
 * POST                 — the host and co-hosts get a DM with Accept / Decline
 *                        (bot.py.py _process_web_filler_request)
 * GET ?request_id=<id> — how the request went
 */
const GAME_RE = /^\d{5,25}$/;

interface GameRow extends RowDataPacket {
  thread_id: string;
  guild_id: string | null;
  status: string | null;
  game_started: number | boolean;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function failure(error: unknown) {
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) return jsonError(error.message, 503);
  console.error("[casino/filler] failed:", error);
  return jsonError("Database unavailable — try again shortly.", 503);
}

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("request_id") ?? "";
  if (!requestId) return jsonError("Which request?", 400);
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const status = await getRequest(requestId, me.user_id);
    if (!status) return jsonError("Request not found", 404);
    return Response.json({ status: status.status, error: status.error, result: status.result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ game: string }> }) {
  const { game: gameId } = await params;
  if (!GAME_RE.test(gameId)) return jsonError("Invalid game", 400);
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    if (isSchedulerDemo()) return jsonError("Filler requests need the live site: the preview has no bot.", 409);
    const [rows] = await getPool().query<GameRow[]>(
      "SELECT thread_id, CAST(guild_id AS CHAR) AS guild_id, status, game_started FROM games WHERE thread_id = ? LIMIT 1",
      [gameId],
    );
    const game = rows[0];
    if (!game) return jsonError("That game no longer exists.", 404);
    const status = String(game.status ?? "").toLowerCase();
    if (status === "ended" || status === "cancelled") return jsonError("This game has already ended.", 409);
    if (Boolean(Number(game.game_started))) return jsonError("The game has already started: ask the host directly.", 409);
    if ((await countPendingRequests(me.user_id)) >= 5) {
      return jsonError("You already have several requests waiting for the bot — give it a moment.", 429);
    }
    const requestId = crypto.randomUUID();
    await insertRequest({
      requestId,
      action: "filler_request",
      slotId: null,
      hostId: me.user_id,
      payload: { thread_id: game.thread_id },
      guildId: game.guild_id ? String(game.guild_id) : HOME_GUILD_ID,
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  } catch (error) {
    return failure(error);
  }
}
