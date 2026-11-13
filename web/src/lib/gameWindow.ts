/**
 * When a game stops taking reservations without being started or ended.
 *
 * A game that was announced but never started (the host never pressed Start,
 * or only removed it from the calendar) used to stay open on the map forever.
 * Twelve hours after its start time it's closed: the map no longer lists it
 * and reserving refuses it. A host who starts late still has plenty of time.
 */
export const UNSTARTED_GAME_CLOSES_AFTER_SEC = 12 * 3600;

/** Has this never-started game's time passed (epoch seconds)? */
export function unstartedGamePassed(startTimestamp: number | null | undefined, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const start = Number(startTimestamp ?? 0);
  return start > 0 && nowSec - start > UNSTARTED_GAME_CLOSES_AFTER_SEC;
}

/** A game still marked running this long after it started was never ended (an old import, or forgotten). */
export const RUNNING_GAME_STALE_AFTER_SEC = 2 * 86400;

/**
 * Leave this open game off lists of current games (the Games page, 2026-11-14):
 * announced but never started and its time passed 12 hours ago (the map's
 * rule), or "running" with no known start or one more than two days old.
 */
export function staleOpenGame(
  phase: string,
  scheduledAt: number | null | undefined,
  startedAt: number | null | undefined,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (phase === "announced") return unstartedGamePassed(scheduledAt, nowSec);
  if (phase === "live") {
    const since = Number(startedAt || scheduledAt || 0);
    return since <= 0 || nowSec - since > RUNNING_GAME_STALE_AFTER_SEC;
  }
  return false;
}
