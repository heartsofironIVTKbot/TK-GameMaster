import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import {
  createPreset,
  listPresets,
  modeNationNames,
  presetErrorResponse,
} from "@/lib/presetStore";
import { validatePresetInput } from "@/lib/presetValidation";
import { SCHEDULE_MODE_VALUES } from "@/lib/scheduleOptions";

/**
 * GET  /api/presets[?mode=<mode>]  — this server's game mode presets (hosts).
 * POST /api/presets                — save a new one ({mode, name, description,
 *                                    shared, data}); any host may create.
 */
export async function GET(request: Request) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const mode = new URL(request.url).searchParams.get("mode");
  try {
    const presets = await listPresets(status.host, mode && SCHEDULE_MODE_VALUES.has(mode) ? mode : null);
    return Response.json({ presets, server_id: status.host.guild_id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return presetErrorResponse(error, "list");
  }
}

export async function POST(request: Request) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const mode = typeof (body as { mode?: unknown })?.mode === "string" ? (body as { mode: string }).mode : "";
    const validation = validatePresetInput(body, await modeNationNames(mode, status.host.guild_id));
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
    const preset = await createPreset(status.host, validation.value);
    return Response.json({ preset }, { status: 201 });
  } catch (error) {
    return presetErrorResponse(error, "create");
  }
}
