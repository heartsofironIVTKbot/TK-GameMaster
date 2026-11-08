import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { UNRESERVE_REASON_MAX as REASON_MAX, UNRESERVE_REASON_MIN as REASON_MIN } from "@/lib/casinoSettings";
import { DatabaseConfigError } from "@/lib/db";
import { draftViewerIdentity } from "@/lib/draftStore";
import { loadPlayerGame } from "@/lib/playerGame";
import { SchedulerSetupError, countPendingRequests, getRequest, insertRequest } from "@/lib/scheduleStore";

/**
 * Emergency Unreserve on a Casino game (docs/casino-integration.md, step 6).
 *
 * POST {reason}        — leave the game for good: the nation and the Casino
 *                        run are deleted and the player can't roll again
 *                        (only a host can add them back). The bot does it
 *                        (bot.py.py _process_web_casino_emergency_unreserve)
 *                        and DMs the game's host and co-hosts the reason.
 * GET  ?request_id=<id> — how it went.
 */

const GAME_RE = /^\d{5,25}$/;
const MAX_PENDING = 5;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function failure(error: unknown, label: string) {
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) return jsonError(error.message, 503);
  console.error(`[casino/unreserve] ${label} failed:`, error);
  return jsonError("Database unavailable — try again shortly.", 503);
}

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("request_id") ?? "";
  if (!requestId) return jsonError("Missing request_id", 400);
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const status = await getRequest(requestId, me.user_id);
    if (!status) return jsonError("Request not found", 404);
    return Response.json(
      { status: status.status, error: status.error, result: status.result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error, "GET");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ game: string }> }) {
  const { game: gameId } = await params;
  if (!GAME_RE.test(gameId)) return jsonError("Invalid game", 400);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const reason = typeof body.reason === "string" ? body.reason.replace(/\s+/g, " ").trim() : "";
  if (reason.length < REASON_MIN) return jsonError("Tell the host why you're leaving (a few words at least).", 400);
  if (reason.length > REASON_MAX) return jsonError(`Keep the reason under ${REASON_MAX} characters.`, 400);
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const game = await loadPlayerGame(gameId);
    if (!game) return jsonError("That game no longer exists.", 404);
    if (game.finished || game.started) {
      return jsonError("This game has started or ended, so you can't unreserve any more. Tell the host instead.", 409);
    }
    if ((await countPendingRequests(me.user_id)) >= MAX_PENDING) {
      return jsonError("You already have several requests waiting for the bot — give it a moment.", 429);
    }
    const requestId = crypto.randomUUID();
    await insertRequest({
      requestId,
      action: "casino_emergency_unreserve",
      slotId: null,
      hostId: me.user_id,
      payload: { thread_id: game.id, reason },
      guildId: game.guild_id,
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  } catch (error) {
    return failure(error, "POST");
  }
}
