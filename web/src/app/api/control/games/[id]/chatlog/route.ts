import { CHAT_LOG_MAX_BYTES, CHAT_LOG_MAX_FILES } from "@/lib/aiAnalysisTypes";
import { ChatLogError, addChatLog, moveChatLog, removeChatLog } from "@/lib/chatLogs";
import { DatabaseConfigError } from "@/lib/db";
import { getGameControl } from "@/lib/gameControl";
import type { GameControl } from "@/lib/gameControlTypes";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import type { HostProfile } from "@/lib/scheduleTypes";
import { SchedulerSetupError } from "@/lib/scheduleStore";

/**
 * A played game's HOI4 chat log, in one or more files (replaces the Host
 * Control Center's "Upload Chat Log"). The game's host or Host Management only.
 *
 * POST   multipart: file (one or more .txt) → adds them after the game's files
 * DELETE ?file=<file id>                  → removes one
 * PATCH  { file_id, move: "up" | "down" } → moves one a place earlier / later
 *
 * Files are read as one game, in order. Run the AI analysis afterwards
 * (POST /api/schedule/requests {action: "game_log_analysis"}).
 */

type Ready = { game: GameControl; host: HostProfile; keys: string[] };

function failure(error: unknown, label: string) {
  if (error instanceof ChatLogError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  console.error(`[control/chatlog] ${label} failed:`, error);
  return Response.json({ error: "Couldn't change the chat log files. Try again shortly." }, { status: 503 });
}

/** The game, if the viewer may change its logs. */
async function ready(id: string): Promise<Ready | Response> {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "Invalid game id" }, { status: 400 });
  const game = await getGameControl(id, status.host);
  if (!game) return Response.json({ error: "That game no longer exists." }, { status: 404 });
  if (!game.can_manage) return Response.json({ error: "Only the game's host or Host Management can change its chat log." }, { status: 403 });
  if (game.phase === "announced" || game.phase === "cancelled") {
    return Response.json({ error: "Upload the chat log once the game has been played." }, { status: 409 });
  }
  return { game, host: status.host, keys: [game.storage_key, game.id] };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((entry): entry is File => typeof entry !== "string");
  if (files.length === 0) return Response.json({ error: "Pick the chat log file(s) (.txt)." }, { status: 400 });
  if (files.length > CHAT_LOG_MAX_FILES) {
    return Response.json({ error: `Up to ${CHAT_LOG_MAX_FILES} files per game.` }, { status: 400 });
  }
  for (const file of files) {
    const name = file.name || "chat_log.txt";
    if (!/\.txt$/i.test(name) && !file.type.startsWith("text/")) {
      return Response.json({ error: `${name}: chat logs are .txt files.` }, { status: 400 });
    }
    if (file.size === 0) return Response.json({ error: `${name} is empty.` }, { status: 400 });
    if (file.size > CHAT_LOG_MAX_BYTES) {
      return Response.json({ error: `${name} is too big (a game's files can add up to ${CHAT_LOG_MAX_BYTES / 1024 / 1024} MB).` }, { status: 413 });
    }
  }
  try {
    const ok = await ready(id);
    if (ok instanceof Response) return ok;
    // In the order picked; sorted by name first, so "log 1", "log 2"… land in order.
    const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const added = [];
    for (const file of ordered) {
      const content = new TextDecoder("utf-8").decode(await file.arrayBuffer()).replace(/\u0000/g, "");
      if (!content.trim()) throw new ChatLogError(`${file.name} has no text in it.`);
      added.push(
        await addChatLog({
          gameId: ok.game.storage_key,
          gameIds: ok.keys,
          guildId: ok.host.guild_id,
          filename: file.name || "chat_log.txt",
          content,
          uploadedBy: ok.host.discord_id,
        }),
      );
    }
    return Response.json({ added: added.map((file) => ({ file_id: file.file_id, filename: file.filename, bytes: file.bytes })) }, { status: 201 });
  } catch (error) {
    return failure(error, "upload");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fileId = new URL(request.url).searchParams.get("file") ?? "";
  if (!fileId) return Response.json({ error: "Which file?" }, { status: 400 });
  try {
    const ok = await ready(id);
    if (ok instanceof Response) return ok;
    await removeChatLog(ok.keys, fileId);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error, "remove");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { file_id?: unknown; move?: unknown } | null;
  const fileId = typeof body?.file_id === "string" ? body.file_id : "";
  const move = body?.move === "up" || body?.move === "down" ? body.move : null;
  if (!fileId || !move) return Response.json({ error: "Say which file and which way to move it." }, { status: 400 });
  try {
    const ok = await ready(id);
    if (ok instanceof Response) return ok;
    await moveChatLog(ok.keys, fileId, move);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error, "move");
  }
}
