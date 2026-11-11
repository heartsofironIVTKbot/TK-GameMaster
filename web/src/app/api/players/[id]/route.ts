import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { getPlayerProfile } from "@/lib/playerProfile";
import { gameGuildOf } from "@/lib/scheduleStore";

/**
 * GET /api/players/<discord_id>[?game=<thread id>]
 *
 * Discord-style profile card for a server member: names, avatar, banner and
 * server roles (bot-mirrored; see lib/playerProfile.ts). Public, like the
 * member list inside Discord itself. `game` (the map): that game's server,
 * never another server's records; without it, the host pages' server.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) {
    return Response.json({ error: "Invalid player id" }, { status: 400 });
  }
  try {
    const game = request.nextUrl.searchParams.get("game") ?? "";
    const guildId = /^\d{5,25}$/.test(game) ? ((await gameGuildOf(game)) ?? undefined) : undefined;
    const profile = await getPlayerProfile(id, guildId);
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
