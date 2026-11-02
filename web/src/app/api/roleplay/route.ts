import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { listRpGames, type RpSort } from "@/lib/rpArchive";

/**
 * GET /api/roleplay?q=&server=&mode=&rewarded=1&sort=newest|oldest|most_rp&offset=
 *
 * The public roleplay archive (no login): games the AI graded, newest first,
 * searchable by player, nation, game, story and quotes.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sort = params.get("sort");
  try {
    const result = await listRpGames({
      q: (params.get("q") ?? "").slice(0, 120),
      server: (params.get("server") ?? "").replace(/\D/g, ""),
      mode: (params.get("mode") ?? "").slice(0, 60),
      rewardedOnly: params.get("rewarded") === "1",
      sort: sort === "oldest" || sort === "most_rp" ? (sort as RpSort) : "newest",
      offset: Math.min(10_000, Math.max(0, Number(params.get("offset")) || 0)),
    });
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[roleplay] list failed:", error);
    return Response.json({ error: "The roleplay archive is unavailable right now." }, { status: 503 });
  }
}
