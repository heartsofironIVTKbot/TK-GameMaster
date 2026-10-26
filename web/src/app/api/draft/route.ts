import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { DRAFT_CHOICE_VALUES, DRAFT_HOST_OPS, DRAFT_NOTE_MAX } from "@/lib/draft";
import { draftHostOn, draftViewerIdentity, getDraftViewer, loadDraftGame } from "@/lib/draftStore";
import { SchedulerSetupError, countPendingRequests, getRequest, insertRequest } from "@/lib/scheduleStore";
import type { RequestAction } from "@/lib/scheduleTypes";

/**
 * Draft games on the website (formerly /reserve in draft games, /start_draft,
 * /draft_pick and /empty_draft_pool).
 *
 * GET  ?thread_id=<game>   — the viewer's role (captain / host) and, for
 *                            hosts and captains, the pool notes
 * GET  ?request_id=<id>    — how one of the viewer's requests went
 * POST {thread_id, action, ...}
 *      join {preference: "major" | "minor" | "coop" | "filler", note}
 *                                                  — any logged-in player
 *      leave                                       — leave the pool
 *      pick {user_id, slot}                        — the captain on the clock
 *      start | finish | remove {user_id} | assign {user_id, slot}
 *      | captain {team, user_id}                   — hosts (the bot only lets
 *                                                    the game's host or staff)
 *
 * Every change is queued for the bot (web_schedule_requests), which checks it
 * against the live game and applies it; poll GET ?request_id= for the result.
 * Requests go to the game's own server (multi-server).
 */

const THREAD_RE = /^\d{5,25}$/;
const SNOWFLAKE_RE = /^\d{5,25}$/;
const MAX_PENDING = 5;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function failure(error: unknown, label: string) {
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
    return jsonError(error.message, 503);
  }
  console.error(`[draft] ${label} failed:`, error);
  return jsonError("Database unavailable — try again shortly.", 503);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requestId = params.get("request_id");
  try {
    if (requestId) {
      const me = await draftViewerIdentity();
      if (!me) return jsonError("Log in with Discord first.", 401);
      const status = await getRequest(requestId, me.user_id);
      if (!status) return jsonError("Request not found", 404);
      return Response.json(
        { status: status.status, error: status.error, result: status.result },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const threadId = params.get("thread_id") ?? "";
    if (!THREAD_RE.test(threadId)) return jsonError("Invalid game", 400);
    const viewer = await getDraftViewer(threadId);
    if (!viewer) return jsonError("This isn't a draft game.", 404);
    return Response.json({ viewer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "GET");
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const me = await draftViewerIdentity();
  if (!me) return jsonError("Log in with Discord first.", 401);
  const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
  if (!THREAD_RE.test(threadId)) return jsonError("Invalid game", 400);
  const action = typeof body.action === "string" ? body.action : "";

  let botAction: RequestAction;
  let payload: Record<string, unknown> = { thread_id: threadId };
  let hostOnly = false;
  if (action === "join") {
    if (!(DRAFT_CHOICE_VALUES as readonly unknown[]).includes(body.preference)) {
      return jsonError("Choose Major, Minor, Major Co-op or Filler.", 400);
    }
    const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, DRAFT_NOTE_MAX) : "";
    botAction = "draft_join";
    payload = { ...payload, preference: body.preference, note };
  } else if (action === "leave") {
    botAction = "draft_leave";
  } else if (action === "pick") {
    const userId = typeof body.user_id === "string" ? body.user_id : "";
    const slot = typeof body.slot === "string" ? body.slot.trim().slice(0, 140) : "";
    if (!SNOWFLAKE_RE.test(userId) || !slot) return jsonError("Pick a player and a slot.", 400);
    botAction = "draft_pick";
    payload = { ...payload, user_id: userId, slot };
  } else if ((DRAFT_HOST_OPS as readonly string[]).includes(action)) {
    hostOnly = true;
    botAction = "draft_control";
    payload = { ...payload, op: action };
    if (action === "remove" || action === "assign" || action === "captain") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      if (!SNOWFLAKE_RE.test(userId)) return jsonError("Pick a player.", 400);
      payload.user_id = userId;
    }
    // Host Tool → Notify players off: the bot skips the player's DM.
    if ((action === "remove" || action === "assign") && body.notify === false) payload.notify = false;
    if (action === "assign") {
      const slot = typeof body.slot === "string" ? body.slot.trim().slice(0, 140) : "";
      if (!slot) return jsonError("Pick a slot.", 400);
      payload.slot = slot;
    }
    if (action === "captain") {
      if (typeof body.team !== "string" || !body.team) return jsonError("Pick a team.", 400);
      payload.team = body.team;
    }
  } else {
    return jsonError("Unknown draft action", 400);
  }

  try {
    const game = await loadDraftGame(threadId);
    if (!game) return jsonError("This isn't a draft game (or it no longer exists).", 404);
    // Host tools need a host role on the game's own server.
    if (hostOnly && !(await draftHostOn(game, me.user_id))) return jsonError("Only hosts can run the draft.", 403);
    if ((await countPendingRequests(me.user_id)) >= MAX_PENDING) {
      return jsonError("You already have several requests waiting for the bot — give it a moment.", 429);
    }
    const requestId = crypto.randomUUID();
    await insertRequest({ requestId, action: botAction, slotId: null, hostId: me.user_id, payload, guildId: game.guild_id });
    return Response.json({ request_id: requestId }, { status: 202 });
  } catch (error) {
    return failure(error, "POST");
  }
}
