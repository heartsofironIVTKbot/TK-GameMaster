import { getArchiveGame } from "@/lib/archive";
import { DatabaseConfigError } from "@/lib/db";
import { draftViewerIdentity } from "@/lib/draftStore";

/**
 * GET /api/archive/<game id>
 *
 * One game for the public archive page: its sections in the reservation
 * board's order, everyone's presence and marks, and the rating totals. A
 * logged-in player who was counted present also gets their own rating and
 * whether they can still rate.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "That isn't a game." }, { status: 400 });
  try {
    const me = await draftViewerIdentity().catch(() => null);
    const game = await getArchiveGame(id, me?.user_id ?? null);
    if (!game) return Response.json({ error: "This game isn't in the archive." }, { status: 404 });
    return Response.json(game, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[archive] game failed:", error);
    return Response.json({ error: "The archive is unavailable right now." }, { status: 503 });
  }
}
