import type { NextRequest } from "next/server";
import { listArchiveGames } from "@/lib/archive";
import type { ArchiveSort, ArchiveTab } from "@/lib/archiveTypes";
import { DatabaseConfigError } from "@/lib/db";

/**
 * GET /api/archive?q=&tab=all|roleplay|historical&server=&mode=&graded=1&sort=newest|oldest|rating&offset=
 *
 * The public game archive (no login): every started game on every server,
 * newest first, searchable by player, nation, game, host and server.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sort = params.get("sort");
  const tab = params.get("tab");
  try {
    const result = await listArchiveGames({
      q: (params.get("q") ?? "").slice(0, 120),
      tab: tab === "roleplay" || tab === "historical" ? (tab as ArchiveTab) : "all",
      server: (params.get("server") ?? "").replace(/\D/g, ""),
      mode: (params.get("mode") ?? "").slice(0, 60),
      gradedOnly: params.get("graded") === "1",
      sort: sort === "oldest" || sort === "rating" ? (sort as ArchiveSort) : "newest",
      offset: Math.min(10_000, Math.max(0, Number(params.get("offset")) || 0)),
    });
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[archive] list failed:", error);
    return Response.json({ error: "The archive is unavailable right now." }, { status: 503 });
  }
}
