import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError, getSlotDetails } from "@/lib/scheduleStore";

/**
 * GET /api/schedule/slots/<slot_id>
 *
 * One game's stored settings (to prefill the edit form) and what can still
 * change: everything before the announcement, day/time/host afterwards,
 * nothing once it started. Only its host and staff may read it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return Response.json({ error: "Invalid game id" }, { status: 400 });
  }

  try {
    const details = await getSlotDetails(id, status.host.discord_id);
    if (!details) return Response.json({ error: "That game is no longer on the schedule." }, { status: 404 });
    if (!details.slot.mine && !status.host.is_staff) {
      return Response.json({ error: "You can only edit games you are hosting." }, { status: 403 });
    }
    return Response.json(details);
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[schedule/slots] GET failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
