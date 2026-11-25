import type { GGState } from "@/lib/greatGame/model";
import type { GGScratch } from "./useGreatGame";

/**
 * Step 3's tickets are scratched by hand, so a vice-captain draw stays hidden
 * (banner, counter, title, team box) until its ticket is scratched clear, or
 * until this long after the draw if the scratcher walks away.
 */
export const SCRATCH_AUTO_REVEAL_MS = 90_000;

/** The latest vice-captain draw while its ticket is still being scratched, else null. */
export function scratchHeld(state: GGState, scratch: GGScratch | null, now: number, localDone = false) {
  const draw = state.last_draw;
  if (!draw || draw.kind !== "vice" || state.phase !== "vice") return null;
  if (localDone) return null;
  if (scratch && scratch.seq === draw.seq && scratch.done) return null;
  if (now - draw.at > SCRATCH_AUTO_REVEAL_MS) return null;
  return draw;
}
