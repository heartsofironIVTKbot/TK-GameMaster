import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { DatabaseConfigError, getPool } from "@/lib/db";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { draftViewerIdentity } from "@/lib/draftStore";
import { botNationName } from "@/lib/botNation";
import { moderationOptions } from "@/lib/playerIndex";
import { coopStateFor, parseCoopRequests } from "@/lib/coopRequests";
import {
  SchedulerSetupError,
  countPendingRequests,
  getRequest,
  insertRequest,
  isSchedulerDemo,
} from "@/lib/scheduleStore";
import tagToSlotJson from "@/lib/tag_to_slot.json";

/**
 * Co-op requests from the map.
 *
 * GET    ?thread_id=<game>         — the viewer's request and the ones waiting for their answer
 * GET    ?request_id=<id>          — how one of the viewer's queued requests went
 * POST   {thread_id, nation, tag?} — ask to co-op a major someone holds
 * DELETE {thread_id}               — withdraw the viewer's waiting request
 * PATCH  {thread_id, user_id, approve} — the nation's player answers
 *
 * The bot checks and applies them (bot.py.py _process_web_coop) and DMs the
 * nation's player, who can also answer there.
 */

const GAME_RE = /^\d{5,25}$/;
const USER_RE = /^\d{5,25}$/;
const TAG_RE = /^[A-Z0-9]{2,4}$/;
const MAX_PENDING = 5;
const tagToSlot = tagToSlotJson as Record<string, string>;

interface GameRow extends RowDataPacket {
  thread_id: string;
  guild_id: string | null;
  mode: string | null;
  status: string | null;
  game_started: number | boolean;
  coop: string | null;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function failure(error: unknown, label: string) {
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) return jsonError(error.message, 503);
  console.error(`[coop] ${label} failed:`, error);
  return jsonError("Database unavailable — try again shortly.", 503);
}

async function loadGame(gameId: string): Promise<GameRow | null> {
  const [rows] = await getPool().query<GameRow[]>(
    `SELECT thread_id, CAST(guild_id AS CHAR) AS guild_id, mode, status, game_started,
            CAST(JSON_EXTRACT(game_data, '$.coop_requests') AS CHAR) AS coop
       FROM games WHERE thread_id = ? LIMIT 1`,
    [gameId],
  );
  return rows[0] ?? null;
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
    // The preview has no bot to keep requests.
    if (isSchedulerDemo()) return Response.json({ mine: null, incoming: [] }, { headers: { "Cache-Control": "no-store" } });
    const game = await loadGame(gameId);
    if (!game) return jsonError("That game no longer exists.", 404);
    let parsed: unknown = null;
    try {
      parsed = game.coop ? JSON.parse(game.coop) : null;
    } catch {
      parsed = null;
    }
    const state = coopStateFor(parseCoopRequests(parsed), me.user_id, Math.floor(Date.now() / 1000));
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "GET");
  }
}

async function queue(request: NextRequest, method: "POST" | "DELETE" | "PATCH") {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const gameId = typeof body.thread_id === "string" ? body.thread_id : "";
  if (!GAME_RE.test(gameId)) return jsonError("Invalid game", 400);
  const rawNation = typeof body.nation === "string" ? body.nation.trim().slice(0, 140) : "";
  if (method === "POST" && !rawNation) return jsonError("Pick a nation first.", 400);
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (method === "PATCH" && (!USER_RE.test(userId) || typeof body.approve !== "boolean")) {
    return jsonError("Say whose request and whether you accept it.", 400);
  }
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    if (isSchedulerDemo()) return jsonError("Co-op requests need the live site: the preview has no bot.", 409);
    const game = await loadGame(gameId);
    if (!game) return jsonError("That game no longer exists.", 404);
    const status = String(game.status ?? "").toLowerCase();
    if (status === "ended" || status === "cancelled") return jsonError("This game has already ended.", 409);
    if (Boolean(Number(game.game_started))) return jsonError("The game has already started, so co-op requests are closed.", 409);
    if ((await countPendingRequests(me.user_id)) >= MAX_PENDING) {
      return jsonError("You already have several requests waiting for the bot — give it a moment.", 429);
    }

    let payload: Record<string, unknown>;
    if (method === "POST") {
      // The map's name ("German Reich") → the bot's for the game's mode ("Germany").
      const tag = typeof body.tag === "string" && TAG_RE.test(body.tag) ? body.tag : null;
      const guildId = game.guild_id ? String(game.guild_id) : undefined;
      const options = await moderationOptions(guildId).catch(() => null);
      const slot = tagToSlot[rawNation.toUpperCase()] ?? rawNation;
      payload = { thread_id: game.thread_id, nation: botNationName(options?.mode_nations?.[String(game.mode ?? "")], tag, slot) };
    } else if (method === "PATCH") {
      payload = { thread_id: game.thread_id, user_id: userId, approve: body.approve === true };
    } else {
      payload = { thread_id: game.thread_id };
    }
    const requestId = crypto.randomUUID();
    await insertRequest({
      requestId,
      action: method === "POST" ? "coop_request" : method === "PATCH" ? "coop_decide" : "coop_cancel",
      slotId: null,
      hostId: me.user_id,
      payload,
      guildId: game.guild_id ? String(game.guild_id) : HOME_GUILD_ID,
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

export function PATCH(request: NextRequest) {
  return queue(request, "PATCH");
}
