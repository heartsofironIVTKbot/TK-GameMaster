import { getAttendanceGame } from "@/lib/attendance";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";

/**
 * GET /api/attendance/games/<game id>
 *
 * One game's attendance (hosts only): samples, the roster with each
 * player's per-sample voice state and verdict, the latest voice check and
 * the audit timeline. `can_edit` = the viewer is its host or staff.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "Invalid game id" }, { status: 400 });
  try {
    const game = await getAttendanceGame(id, status.host);
    if (!game) return Response.json({ error: "That game hasn't started or no longer exists." }, { status: 404 });
    return Response.json({ game }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[attendance/game] lookup failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
