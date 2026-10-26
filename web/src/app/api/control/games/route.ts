import { DatabaseConfigError } from "@/lib/db";
import { listControlGames } from "@/lib/gameControl";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError } from "@/lib/scheduleStore";

/**
 * GET /api/control/games
 *
 * Games page list (hosts only): announced and running games, then the last
 * two days of finished ones, with any start / end / cancel still in flight.
 */
export async function GET() {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  try {
    const games = await listControlGames(status.host);
    return Response.json({ games }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[control/games] list failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
