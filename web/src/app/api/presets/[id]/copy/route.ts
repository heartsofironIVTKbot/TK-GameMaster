import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { copyPreset, presetErrorResponse } from "@/lib/presetStore";

/**
 * POST /api/presets/<id>/copy
 *
 * Copy a preset (usually from the public library) into this server's list.
 * The copy belongs to the host who copied it and starts unshared.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return Response.json({ error: "Invalid preset id" }, { status: 400 });
  try {
    const preset = await copyPreset(status.host, id);
    return Response.json({ preset }, { status: 201 });
  } catch (error) {
    return presetErrorResponse(error, "copy");
  }
}
