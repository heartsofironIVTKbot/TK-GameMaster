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
