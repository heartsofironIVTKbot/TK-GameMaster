import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { draftViewerIdentity } from "@/lib/draftStore";
import { loadPlayerGame } from "@/lib/playerGame";
import { SchedulerSetupError, countPendingRequests, getRequest, insertRequest } from "@/lib/scheduleStore";

/**
 * Hot-join from the map (replaces the Hot-Join panel in the reservation thread).
 *
 * GET    ?thread_id=<game>   — the viewer's latest request for that game
 * GET    ?request_id=<id>    — how one of the viewer's requests went
 * POST   {thread_id, nation} — ask to join a running game as a free nation
 * DELETE {thread_id}         — withdraw a request that's still waiting
 *
 * The bot checks and records it (bot.py.py _process_web_hotjoin) and DMs the
 * game's host, who approves or declines on the Games page.
 */

const GAME_RE = /^\d{5,25}$/;
const MAX_PENDING = 5;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function failure(error: unknown, label: string) {
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) return jsonError(error.message, 503);
  console.error(`[hotjoin] ${label} failed:`, error);
  return jsonError("Database unavailable — try again shortly.", 503);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const requestId = params.get("request_id");
    if (requestId) {
      const status = await getRequest(requestId, me.user_id);
      if (!status) return jsonError("Request not found", 404);
      return Response.json(
        { status: status.status, error: status.error, result: status.result },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const gameId = params.get("thread_id") ?? "";
    if (!GAME_RE.test(gameId)) return jsonError("Invalid game", 400);
    const game = await loadPlayerGame(gameId);
    if (!game) return jsonError("That game no longer exists.", 404);
    const mine = game.hotjoin.find((entry) => entry.user_id === me.user_id) ?? null;
    return Response.json(
      { request: mine, started: game.started, finished: game.finished },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error, "GET");
  }
}

async function queue(request: NextRequest, method: "POST" | "DELETE") {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const gameId = typeof body.thread_id === "string" ? body.thread_id : "";
  if (!GAME_RE.test(gameId)) return jsonError("Invalid game", 400);
  const nation = typeof body.nation === "string" ? body.nation.trim().slice(0, 140) : "";
  if (method === "POST" && !nation) return jsonError("Pick a nation first.", 400);
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const game = await loadPlayerGame(gameId);
    if (!game) return jsonError("That game no longer exists.", 404);
    if (game.finished) return jsonError("This game has already ended.", 409);
    if (!game.started) return jsonError("The game hasn't started yet — reserve a nation instead.", 409);
    if (method === "DELETE" && !game.hotjoin.some((entry) => entry.user_id === me.user_id && entry.status === "pending")) {
      return jsonError("You have no hot-join request waiting in this game.", 404);
    }
    if ((await countPendingRequests(me.user_id)) >= MAX_PENDING) {
      return jsonError("You already have several requests waiting for the bot — give it a moment.", 429);
    }
    const requestId = crypto.randomUUID();
    await insertRequest({
      requestId,
      action: method === "POST" ? "hotjoin_request" : "hotjoin_cancel",
      slotId: null,
      hostId: me.user_id,
      payload: method === "POST" ? { thread_id: game.id, nation } : { thread_id: game.id },
      guildId: game.guild_id,
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  } catch (error) {
    return failure(error, method);
  }
}

export function POST(request: NextRequest) {
  return queue(request, "POST");
}

export function DELETE(request: NextRequest) {
  return queue(request, "DELETE");
}
