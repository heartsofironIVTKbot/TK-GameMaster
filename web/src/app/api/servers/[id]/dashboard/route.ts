import { DatabaseConfigError } from "@/lib/db";
import { serverDashboard, serverLiveStatus } from "@/lib/serverDashboard";
import { dashboardAccess } from "@/lib/serverSettings";

/**
 * GET /api/servers/<guild_id>/dashboard[?only=status]
 *
 * The owner dashboard: live checks, 30-day usage, upcoming and recent games,
 * staff activity. `only=status` returns just the live checks (Health tab).
 * Same access as the server's settings (owner, admins, allowed Host Management).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) return Response.json({ error: "Invalid server id" }, { status: 400 });
  try {
    const access = await dashboardAccess(id);
    if ("message" in access) return Response.json({ error: access.message }, { status: access.status });
    const onlyStatus = new URL(request.url).searchParams.get("only") === "status";
    const body = onlyStatus
      ? { status: await serverLiveStatus(id, access.setupDone, access.snapshotAt) }
      : await serverDashboard(id, access.setupDone, access.snapshotAt);
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[servers] dashboard failed:", error);
    return Response.json({ error: "The database is unavailable — try again shortly." }, { status: 503 });
  }
}
