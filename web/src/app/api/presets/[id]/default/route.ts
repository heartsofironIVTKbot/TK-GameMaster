import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { presetErrorResponse, setDefaultPreset } from "@/lib/presetStore";

/**
 * POST /api/presets/<id>/default {on: boolean}
 *
 * Make this preset the server's default for its mode (the calendar loads it
 * first), or with on: false leave the mode without a default (games start
 * from the whole map). Staff only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return Response.json({ error: "Invalid preset id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { on?: unknown } | null;
  if (typeof body?.on !== "boolean") return Response.json({ error: "Say on: true or false." }, { status: 400 });
  try {
    const preset = await setDefaultPreset(status.host, id, body.on);
    return Response.json({ preset });
  } catch (error) {
    return presetErrorResponse(error, "default");
  }
}
