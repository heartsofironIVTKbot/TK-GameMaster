import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { getPresetDefaults, presetErrorResponse } from "@/lib/presetStore";
import { SCHEDULE_MODES } from "@/lib/scheduleOptions";

/**
 * GET /api/presets/defaults
 *
 * Every mode's standard nation groups, nation names, rulesets and mods (what
 * the bot publishes at startup) — where a new preset starts from.
 */
export async function GET() {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  try {
    const defaults = await getPresetDefaults(SCHEDULE_MODES.map((mode) => mode.value));
    return Response.json(defaults, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return presetErrorResponse(error, "defaults");
  }
}
