import crypto from "node:crypto";
import { DatabaseConfigError } from "@/lib/db";
import { countPendingRequests, insertRequest } from "@/lib/scheduleStore";
import { FIX_ACTIONS, type FixOp } from "@/lib/serverDashboardTypes";
import { setupRequester } from "@/lib/serverSettings";

/**
 * POST /api/servers/<guild_id>/fix  {op}
 *
 * The dashboard's fix-it buttons: re-check the server, re-sync slash
 * commands, test the audit log, re-send the welcome. Queued for the bot
 * (_process_web_server_setup, which re-checks who may do it). Returns
 * {request_id}; poll GET /api/servers/<guild_id>/requests/<request_id>.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) return Response.json({ error: "Invalid server id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { op?: unknown } | null;
  const op = FIX_ACTIONS.find((action) => action.op === body?.op)?.op as FixOp | undefined;
  if (!op) return Response.json({ error: "Unknown action." }, { status: 400 });
  try {
    const requester = await setupRequester(id);
    if ("message" in requester) return Response.json({ error: requester.message }, { status: requester.status });
    if ((await countPendingRequests(requester.userId)) >= 5) {
      return Response.json({ error: "Wait for your other requests to finish first." }, { status: 429 });
    }
    const requestId = crypto.randomUUID();
    await insertRequest({
      requestId,
      action: "server_setup",
      slotId: null,
      hostId: requester.userId,
      payload: { guild_id: id, op },
      guildId: id,
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[servers] fix failed:", error);
    return Response.json({ error: "The database is unavailable — try again shortly." }, { status: 503 });
  }
}
