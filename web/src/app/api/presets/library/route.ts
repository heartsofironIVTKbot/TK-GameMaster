import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { listLibrary, presetErrorResponse } from "@/lib/presetStore";
import { SCHEDULE_MODE_VALUES } from "@/lib/scheduleOptions";

/**
 * GET /api/presets/library[?mode=<mode>&q=<search>]
 *
 * The public library: presets any server marked as shared (this server's
 * own shared ones included). Copy one with POST /api/presets/<id>/copy.
 */
export async function GET(request: Request) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode");
  const search = (params.get("q") ?? "").trim().slice(0, 60) || null;
  try {
    const presets = await listLibrary(status.host, mode && SCHEDULE_MODE_VALUES.has(mode) ? mode : null, search);
    return Response.json({ presets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return presetErrorResponse(error, "library");
  }
}
