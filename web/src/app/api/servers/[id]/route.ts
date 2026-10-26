import { DatabaseConfigError } from "@/lib/db";
import { getServerDetail, saveServerSettings } from "@/lib/serverSettings";
import type { SaveSettingsBody } from "@/lib/serverSettingsTypes";

/**
 * GET /api/servers/<guild_id>  — the server's settings, the bot's snapshot of
 *                                its roles / channels, and the change history.
 * PUT /api/servers/<guild_id>  — {settings, version, step?, finish?}: save a
 *                                setup step or the settings page; finish=true
 *                                completes setup (only with no blocking problems).
 *
 * Owner, admins, or Host Management when the owner allowed it. Saving is refused
 * when someone else saved in between (version), or when it would break a
 * finished setup.
 */

const ID_RE = /^\d{15,25}$/;

function failure(error: unknown, label: string) {
  if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
  console.error(`[servers] ${label} failed:`, error);
  return Response.json({ error: "The database is unavailable — try again shortly." }, { status: 503 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid server id" }, { status: 400 });
  try {
    const detail = await getServerDetail(id);
    if ("message" in detail) return Response.json({ error: detail.message }, { status: detail.status });
    return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "detail");
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid server id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as SaveSettingsBody | null;
  if (!body || typeof body !== "object" || typeof body.settings !== "object" || typeof body.version !== "number") {
    return Response.json({ error: "Invalid settings." }, { status: 400 });
  }
  try {
    const result = await saveServerSettings(id, body);
    if ("message" in result) return Response.json({ error: result.message }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    return failure(error, "save");
  }
}
