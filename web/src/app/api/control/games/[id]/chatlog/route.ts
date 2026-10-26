import { CHAT_LOG_MAX_BYTES } from "@/lib/aiAnalysisTypes";
import { saveChatLog } from "@/lib/chatLogs";
import { DatabaseConfigError } from "@/lib/db";
import { getGameControl } from "@/lib/gameControl";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError } from "@/lib/scheduleStore";

/**
 * POST /api/control/games/<game id>/chatlog   (multipart: file = the .txt)
 *
 * Upload a played game's HOI4 chat log (replaces the Host Control Center's
 * "Upload Chat Log"). The game's host or Host Management only. A new upload
 * replaces the old one; run the AI analysis afterwards
 * (POST /api/schedule/requests {action: "game_log_analysis"}).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "Invalid game id" }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return Response.json({ error: "Pick the chat log file (.txt)." }, { status: 400 });
  const name = file.name || "chat_log.txt";
  if (!/\.txt$/i.test(name) && !file.type.startsWith("text/")) {
    return Response.json({ error: "The chat log must be a .txt file." }, { status: 400 });
  }
  if (file.size === 0) return Response.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > CHAT_LOG_MAX_BYTES) {
    return Response.json({ error: `That file is too big (the limit is ${CHAT_LOG_MAX_BYTES / 1024 / 1024} MB).` }, { status: 413 });
  }

  try {
    const game = await getGameControl(id, status.host);
    if (!game) return Response.json({ error: "That game no longer exists." }, { status: 404 });
    if (!game.can_manage) return Response.json({ error: "Only the game's host or Host Management can upload its chat log." }, { status: 403 });
    if (game.phase === "announced" || game.phase === "cancelled") {
      return Response.json({ error: "Upload the chat log once the game has been played." }, { status: 409 });
    }
    const content = new TextDecoder("utf-8").decode(await file.arrayBuffer()).replace(/\u0000/g, "");
    if (!content.trim()) return Response.json({ error: "That file has no text in it." }, { status: 400 });
    const meta = await saveChatLog({
      gameId: game.storage_key,
      guildId: status.host.guild_id,
      filename: name,
      content,
      uploadedBy: status.host.discord_id,
    });
    return Response.json({ chat_log: { filename: meta.filename, bytes: meta.bytes, uploaded_at: meta.uploaded_at } }, { status: 201 });
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[control/chatlog] upload failed:", error);
    return Response.json({ error: "Couldn't save the chat log — try again shortly." }, { status: 503 });
  }
}
