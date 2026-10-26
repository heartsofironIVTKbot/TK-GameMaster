import { DatabaseConfigError } from "@/lib/db";
import { getRequest } from "@/lib/scheduleStore";
import { setupRequester } from "@/lib/serverSettings";

/**
 * GET /api/servers/<guild_id>/requests/<request_id>
 *
 * Progress of the caller's own "Create for me" request: pending until the
 * bot picks it up, then done (result.setup.created = the new role / channel)
 * or error (the bot's message).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  if (!/^\d{15,25}$/.test(id) || !/^[0-9a-f-]{36}$/.test(rid)) return Response.json({ error: "Invalid request" }, { status: 400 });
  try {
    const requester = await setupRequester(id);
    if ("message" in requester) return Response.json({ error: requester.message }, { status: requester.status });
    const status = await getRequest(rid, requester.userId);
    if (!status || status.action !== "server_setup") return Response.json({ error: "Request not found" }, { status: 404 });
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[servers] request status failed:", error);
    return Response.json({ error: "The database is unavailable — try again shortly." }, { status: 503 });
  }
}
