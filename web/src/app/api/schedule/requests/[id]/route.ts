import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError, getRequest } from "@/lib/scheduleStore";

/**
 * GET /api/schedule/requests/<request_id>
 *
 * Progress of one of the caller's queued requests: pending until the bot
 * picks it up, then done (with the slot id + host panel link) or error
 * (with the bot's exact message).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return Response.json({ error: "Invalid request id" }, { status: 400 });
  }

  try {
    const found = await getRequest(id, status.host.discord_id);
    if (!found) return Response.json({ error: "Request not found" }, { status: 404 });
    return Response.json(found);
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[schedule/requests] GET failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
