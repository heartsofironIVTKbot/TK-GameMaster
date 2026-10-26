import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import {
  deletePreset,
  getPreset,
  modeNationNames,
  presetErrorResponse,
  updatePreset,
} from "@/lib/presetStore";
import { validatePresetInput } from "@/lib/presetValidation";

/**
 * GET    /api/presets/<id>  — one preset (this server's, or a shared one)
 * PUT    /api/presets/<id>  — change it (its creator or staff, this server only)
 * DELETE /api/presets/<id>  — delete it (same rule)
 *
 * Games already scheduled keep the settings they were scheduled with.
 */
const ID_RE = /^[0-9a-f]{32}$/;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid preset id" }, { status: 400 });
  try {
    const preset = await getPreset(status.host, id);
    if (!preset) return Response.json({ error: "That preset no longer exists." }, { status: 404 });
    return Response.json({ preset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return presetErrorResponse(error, "get");
  }
}

export async function PUT(request: Request, { params }: Context) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid preset id" }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const mode = typeof (body as { mode?: unknown })?.mode === "string" ? (body as { mode: string }).mode : "";
    const validation = validatePresetInput(body, await modeNationNames(mode));
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
    const preset = await updatePreset(status.host, id, validation.value);
    return Response.json({ preset });
  } catch (error) {
    return presetErrorResponse(error, "update");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!ID_RE.test(id)) return Response.json({ error: "Invalid preset id" }, { status: 400 });
  try {
    await deletePreset(status.host, id);
    return Response.json({ ok: true });
  } catch (error) {
    return presetErrorResponse(error, "delete");
  }
}
