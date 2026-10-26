import { DatabaseConfigError } from "@/lib/db";
import { getGameControl } from "@/lib/gameControl";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError } from "@/lib/scheduleStore";

/**
 * GET /api/control/games/<game id>
 *
 * One game for the Games page (hosts only): phase, roster, start readiness
 * (draft, checksum), attendance so far and any start / end / cancel in
 * flight. `can_manage` = the viewer is its host or Host Management.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "Invalid game id" }, { status: 400 });
  try {
    const game = await getGameControl(id, status.host);
    if (!game) return Response.json({ error: "That game no longer exists." }, { status: 404 });
    return Response.json({ game }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[control/game] lookup failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
