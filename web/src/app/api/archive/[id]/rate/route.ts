import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { loadRawArchiveGame, raterEligible, ratingOf } from "@/lib/archive";
import { DatabaseConfigError } from "@/lib/db";
import { draftViewerIdentity } from "@/lib/draftStore";
import { SchedulerSetupError, countPendingRequests, getRequest, insertRequest } from "@/lib/scheduleStore";

/**
 * Rate a game from the archive page: for players whose rating DM didn't
 * arrive (DMs closed). The bot records it the same way as a DM click and
 * gives the first-rating Merit (bot.py.py _process_web_feedback_rate).
 *
 * GET  ?request_id=<id>  how the bot handled the viewer's rating
 * POST { stars: 1-5 }
 */

const MAX_PENDING = 5;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function failure(error: unknown, label: string) {
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) return jsonError(error.message, 503);
  console.error(`[archive-rate] ${label} failed:`, error);
  return jsonError("Database unavailable. Try again shortly.", 503);
}

export async function GET(request: NextRequest) {
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const requestId = request.nextUrl.searchParams.get("request_id") ?? "";
    const status = requestId ? await getRequest(requestId, me.user_id) : null;
    if (!status) return jsonError("Request not found", 404);
    return Response.json(
      { status: status.status, error: status.error, result: status.result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error, "GET");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return jsonError("That isn't a game.", 400);
  const body = (await request.json().catch(() => null)) as { stars?: unknown } | null;
  const stars = Math.round(Number(body?.stars));
  if (!(stars >= 1 && stars <= 5)) return jsonError("Pick 1 to 5 stars.", 400);
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const game = await loadRawArchiveGame(id);
    if (!game) return jsonError("This game isn't in the archive.", 404);
    if (!ratingOf(game).open) return jsonError("Rating for this game has closed.", 409);
    if (!raterEligible(game, me.user_id)) return jsonError("Only players who were counted present can rate this game.", 403);
    if ((await countPendingRequests(me.user_id)) >= MAX_PENDING) {
      return jsonError("You already have several requests waiting for the bot. Give it a moment.", 429);
    }
    const requestId = crypto.randomUUID();
    await insertRequest({
      requestId,
      action: "feedback_rate",
      slotId: null,
      hostId: me.user_id,
      payload: { game_id: game.id, stars },
      guildId: game.guild_id,
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  } catch (error) {
    return failure(error, "POST");
  }
}
