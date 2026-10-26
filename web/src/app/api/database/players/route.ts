import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import type { PlayerFilter, PlayerSort } from "@/lib/moderationTypes";
import { loadPlayerIndex, searchPlayerIndex } from "@/lib/playerIndex";

/**
 * GET /api/database/players?q=&filter=&sort=&page=[&fresh=1]
 *
 * Database page user search (hosts only): everyone with history, or anyone
 * in the server when searching by name / @handle / Discord id; filters
 * (warned, banned, dishonored, trusted, valor) and sort (name, warnings,
 * commends, games, recent). `fresh=1` rebuilds the shared index right after
 * a moderation action.
 */
const FILTERS: PlayerFilter[] = ["all", "warned", "banned", "dishonored", "trusted", "valor"];
const SORTS: PlayerSort[] = ["name", "warnings", "commends", "games", "recent"];

export async function GET(request: Request) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const params = new URL(request.url).searchParams;
  const filter = FILTERS.find((value) => value === params.get("filter")) ?? "all";
  const sort = SORTS.find((value) => value === params.get("sort")) ?? "name";
  const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0);
  const q = (params.get("q") ?? "").slice(0, 64);

  try {
    const players = await loadPlayerIndex(params.get("fresh") === "1");
    return Response.json(searchPlayerIndex(players, { q, filter, sort, page }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[database/players] search failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
