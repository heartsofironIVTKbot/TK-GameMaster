import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { gameResourcesFor } from "@/lib/gameControl";
import { accessDenied, mapAccessFor } from "@/lib/mapAccess";
import { gameGuildOf } from "@/lib/scheduleStore";

/**
 * GET /api/games/resources?game=<thread id>
 *
 * The map's Rules and Mods pop-ups: the game's own mods and rulesets
 * ({mods, rules}, each a list of {name, link}), as announced or last edited
 * on the Games page. Same members-only rule as the map itself.
 */
const THREAD_RE = /^\d{10,25}$/;

export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game") ?? "";
  if (!THREAD_RE.test(game)) return Response.json({ error: "Not a game" }, { status: 400 });
  try {
    const guildId = await gameGuildOf(game);
    if (guildId === null) return Response.json({ error: "Game not found" }, { status: 404 });
    const access = await mapAccessFor(guildId);
    if (!access.ok) return accessDenied(access);
    const resources = await gameResourcesFor(game, guildId);
    if (!resources) return Response.json({ error: "Game not found" }, { status: 404 });
    return Response.json(resources, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[games/resources] failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
