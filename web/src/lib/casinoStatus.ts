import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * Is tkcasino.online up? (docs/casino-integration.md, step 8: the fallback.)
 * GameMaster asks the Casino's /api/health before sending a player there, and
 * the Games page shows it to the host, who can switch the game to normal
 * reserving if it stays down. Cached briefly so a rush of players doesn't
 * hammer it.
 */

/** tkcasino.online (CASINO_URL to point it elsewhere, e.g. a local copy). */
export const CASINO_URL = (process.env.CASINO_URL || "https://tkcasino.online").replace(/\/+$/, "");

const CACHE_MS = 20_000;
const TIMEOUT_MS = 3_500;
let cached: { at: number; up: boolean } | null = null;

export async function casinoUp(): Promise<boolean> {
  if (isSchedulerDemo()) return true;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.up;
  let up = false;
  try {
    const response = await fetch(`${CASINO_URL}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = (await response.json().catch(() => null)) as { ok?: unknown } | null;
    up = response.ok && body?.ok === true;
  } catch {
    up = false;
  }
  cached = { at: Date.now(), up };
  return up;
}

export const CASINO_DOWN_MESSAGE =
  "tkcasino.online isn't answering right now. Try again in a few minutes. If it stays down, the host can switch this game to normal reserving.";
