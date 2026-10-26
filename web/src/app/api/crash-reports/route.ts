import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import {
  CRASH_NOTES_MAX,
  CRASH_TEXT_MAX,
  CRASH_ZIP_MAX_BYTES,
  CRASH_ZIP_MIN_BYTES,
  type CrashPageData,
} from "@/lib/crashReportTypes";
import { listMyCrashReports, saveCrashReport } from "@/lib/crashReports";
import { DatabaseConfigError } from "@/lib/db";
import { draftViewerIdentity } from "@/lib/draftStore";
import { loadPlayerGame } from "@/lib/playerGame";
import { SchedulerSetupError, countPendingRequests, getRequest, insertRequest } from "@/lib/scheduleStore";

/**
 * Crash reports on the website (replaces the reservation thread's Crash
 * Report panel and the DM upload).
 *
 * GET  ?game=<id>        — the game and the viewer's reports for it
 * GET  ?request_id=<id>  — how the bot handled one of the viewer's reports
 * POST (multipart: game, what_happened, notes, file = the zipped logs folder)
 *
 * The bot checks the archive, posts it to the crash-report channel and gives
 * the Merit reward (bot.py.py _process_web_crash_report).
 */

const GAME_RE = /^\d{5,25}$/;
const MAX_PENDING = 5;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function failure(error: unknown, label: string) {
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) return jsonError(error.message, 503);
  if ((error as { code?: string } | null)?.code === "ER_NET_PACKET_TOO_LARGE") {
    return jsonError("That file is too big for the database right now — try a smaller zip (logs folder only).", 413);
  }
  console.error(`[crash-reports] ${label} failed:`, error);
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
    const gameId = params.get("game") ?? "";
    if (!GAME_RE.test(gameId)) return jsonError("Open this page from a game (the link in your game DM or on the map).", 400);
    const game = await loadPlayerGame(gameId);
    const body: CrashPageData = {
      game: game ? { id: game.id, name: game.name, mode: game.mode, started: game.started, finished: game.finished } : null,
      reports: game ? await listMyCrashReports(me.user_id, game.id) : [],
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "GET");
  }
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Send the form with your zip file.", 400);
  const gameId = String(form.get("game") ?? "");
  const whatHappened = String(form.get("what_happened") ?? "").trim().slice(0, CRASH_TEXT_MAX);
  const notes = String(form.get("notes") ?? "").trim().slice(0, CRASH_NOTES_MAX);
  const file = form.get("file");
  if (!GAME_RE.test(gameId)) return jsonError("Invalid game.", 400);
  if (!whatHappened) return jsonError("Tell the developers what happened right before the crash.", 400);
  if (!file || typeof file === "string") return jsonError("Pick your zipped logs folder (.zip).", 400);
  const name = file.name || "logs.zip";
  if (!/\.zip$/i.test(name)) return jsonError("Please compress your logs folder into a .zip file and upload that.", 400);
  if (file.size < CRASH_ZIP_MIN_BYTES) {
    return jsonError("That file is too small — zip the whole crash folder (with the minidump and logs), not single files.", 400);
  }
  if (file.size > CRASH_ZIP_MAX_BYTES) {
    return jsonError(`That file is too big (the limit is ${CRASH_ZIP_MAX_BYTES / 1024 / 1024} MB) — zip only the logs folder.`, 413);
  }
  try {
    const me = await draftViewerIdentity();
    if (!me) return jsonError("Log in with Discord first.", 401);
    const game = await loadPlayerGame(gameId);
    if (!game) return jsonError("That game no longer exists.", 404);
    if (game.finished) return jsonError("This game has ended — crash reports are no longer accepted for it.", 409);
    if (!game.started) return jsonError("This game hasn't started yet.", 409);
    if ((await countPendingRequests(me.user_id)) >= MAX_PENDING) {
      return jsonError("You already have several requests waiting for the bot — give it a moment.", 429);
    }
    const reportId = await saveCrashReport({
      guildId: game.guild_id,
      gameId: game.id,
      userId: me.user_id,
      whatHappened,
      notes,
      filename: name,
      content: Buffer.from(await file.arrayBuffer()),
    });
    const requestId = crypto.randomUUID();
    await insertRequest({
      requestId,
      action: "crash_report",
      slotId: null,
      hostId: me.user_id,
      payload: { report_id: reportId },
      guildId: game.guild_id,
    });
    return Response.json({ request_id: requestId, report_id: reportId }, { status: 202 });
  } catch (error) {
    return failure(error, "POST");
  }
}
