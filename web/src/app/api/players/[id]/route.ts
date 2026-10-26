import { DatabaseConfigError } from "@/lib/db";
import { getPlayerProfile } from "@/lib/playerProfile";

/**
 * GET /api/players/<discord_id>
 *
 * Discord-style profile card for a server member: names, avatar, banner and
 * server roles (bot-mirrored; see lib/playerProfile.ts). Public, like the
 * member list inside Discord itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) {
    return Response.json({ error: "Invalid player id" }, { status: 400 });
  }
  try {
    const profile = await getPlayerProfile(id);
    if (!profile) return Response.json({ error: "Player not found" }, { status: 404 });
    return Response.json({ profile }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[players] profile lookup failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
