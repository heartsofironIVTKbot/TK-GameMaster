import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { recentActivity } from "@/lib/playerIndex";

/**
 * GET /api/database/activity
 *
 * The latest 40 moderation actions across every player (moderation_events),
 * with player and host names — the Database page's audit feed. Hosts only.
 */
export async function GET() {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  try {
    return Response.json({ activity: await recentActivity(40) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[database/activity] failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
