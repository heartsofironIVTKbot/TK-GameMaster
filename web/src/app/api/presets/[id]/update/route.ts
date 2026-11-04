import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { checkPresetUpdate, presetErrorResponse, syncPreset } from "@/lib/presetStore";

/**
 * A copy whose original changed ("Update available").
 *
 * GET  /api/presets/<id>/update — what updating would change, and whether
 *                                 the copy was changed since it was made.
 * POST /api/presets/<id>/update {action: "update" | "new" | "keep"} —
 *      update: take the original's settings; new: save them as another
 *      preset; keep: keep this one and stop asking until the next change.
 */
type Context = { params: Promise<{ id: string }> };
const ID_RE = /^[0-9a-f]{32}$/;
const ACTIONS = new Set(["update", "new", "keep"]);

export async function GET(_request: Request, { params }: Context) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid preset id" }, { status: 400 });
  try {
    return Response.json(await checkPresetUpdate(status.host, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return presetErrorResponse(error, "update check");
  }
}

export async function POST(request: Request, { params }: Context) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid preset id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = typeof body?.action === "string" && ACTIONS.has(body.action) ? (body.action as "update" | "new" | "keep") : null;
  if (!action) return Response.json({ error: "Pick update, new or keep." }, { status: 400 });
  try {
    const preset = await syncPreset(status.host, id, action);
    return Response.json({ preset });
  } catch (error) {
    return presetErrorResponse(error, "update");
  }
}
