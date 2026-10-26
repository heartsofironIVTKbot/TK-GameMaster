import crypto from "node:crypto";
import { DatabaseConfigError } from "@/lib/db";
import { countPendingRequests, insertRequest } from "@/lib/scheduleStore";
import { setupRequester } from "@/lib/serverSettings";
import type { CreateItemBody } from "@/lib/serverSettingsTypes";

/**
 * POST /api/servers/<guild_id>/create
 *
 * The setup wizard's "Create for me": queue a role or channel for the bot to
 * create (bot: _process_web_server_setup, which re-checks that the requester
 * may change this server). Body: CreateItemBody. Returns {request_id}; poll
 * GET /api/servers/<guild_id>/requests/<request_id>.
 */

const KINDS = ["text", "voice", "category", "forum"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) return Response.json({ error: "Invalid server id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Partial<CreateItemBody> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return Response.json({ error: "Give it a name." }, { status: 400 });
  if (body?.op !== "create_role" && body?.op !== "create_channel") return Response.json({ error: "Unknown action." }, { status: 400 });
  const kind = KINDS.find((entry) => entry === body.kind) ?? "text";
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
      payload: {
        guild_id: id,
        op: body.op,
        name,
        ...(body.op === "create_channel" ? { kind, parent_id: typeof body.parent_id === "string" ? body.parent_id : null } : {}),
        ...(body.op === "create_role"
          ? {
              color: typeof body.color === "string" && /^#?[0-9a-f]{6}$/i.test(body.color) ? body.color : null,
              mentionable: body.mentionable === true,
              hoist: body.hoist === true,
            }
          : {}),
      },
      guildId: id,
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[servers] create failed:", error);
    return Response.json({ error: "The database is unavailable — try again shortly." }, { status: 503 });
  }
}
