import { listAttendanceGames } from "@/lib/attendance";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";

/**
 * GET /api/attendance/games
 *
 * Attendance page game list (hosts only): started games, live ones first,
 * with sample progress, present count and how many players need a look.
 */
export async function GET() {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  try {
    const games = await listAttendanceGames();
    return Response.json({ games }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[attendance/games] list failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
