import { loadRawArchiveGame } from "@/lib/archive";
import { DatabaseConfigError } from "@/lib/db";
import { loadGameThreadLog } from "@/lib/gameThreadLog";
import { accessDenied, mapAccessFor } from "@/lib/mapAccess";

/**
 * GET /api/archive/<game id>/thread
 *
 * The game's Game Thread as saved when it ended (lib/gameThreadLog.ts). The
 * archive itself is public, but the thread's chat is for members of the
 * game's server only (signed in), like its map. {log: null} when there's none.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "That isn't a game." }, { status: 400 });
  try {
    const raw = await loadRawArchiveGame(id);
    if (!raw) return Response.json({ error: "This game isn't in the archive." }, { status: 404 });
    const access = await mapAccessFor(raw.guild_id);
    if (!access.ok) return accessDenied(access);
    const log = await loadGameThreadLog([id, ...raw.keys]);
    return Response.json({ log }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[archive] game thread failed:", error);
    return Response.json({ error: "The game thread is unavailable right now." }, { status: 503 });
  }
}
