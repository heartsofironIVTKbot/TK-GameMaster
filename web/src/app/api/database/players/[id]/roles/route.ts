import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { getMemberRoles } from "@/lib/memberRoles";

/**
 * GET /api/database/players/<discord_id>/roles
 *
 * A member's RP / Hist Verified (and who gave it) and VIP (category, links or
 * reason, VIPs on other servers, one waiting for approval). Hosts can look;
 * only Host Management can change them (POST /api/schedule/requests,
 * action "member_roles").
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) return Response.json({ error: "Invalid player id" }, { status: 400 });
  try {
    const roles = await getMemberRoles(id, status.host);
    return Response.json({ roles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[database/roles] lookup failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
