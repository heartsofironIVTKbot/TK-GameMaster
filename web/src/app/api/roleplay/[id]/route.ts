import { DatabaseConfigError } from "@/lib/db";
import { getRpGame } from "@/lib/rpArchive";

/**
 * GET /api/roleplay/<game id>
 *
 * One graded game for the public roleplay page: the AI's story recap,
 * everyone's result and the chat log, line by line (no login).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "That isn't a game." }, { status: 400 });
  try {
    const game = await getRpGame(id);
    if (!game) return Response.json({ error: "This game hasn't been graded, or it doesn't exist." }, { status: 404 });
    return Response.json(game, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[roleplay] game failed:", error);
    return Response.json({ error: "The roleplay archive is unavailable right now." }, { status: 503 });
  }
}
