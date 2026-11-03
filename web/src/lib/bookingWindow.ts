import { branchOfMode, HOST_BRANCH_VALUES, type HostBranch } from "@/lib/hostBranches";
import { lastBookableDate } from "@/lib/scheduleOptions";
import { dateInZone } from "@/lib/timeEngine";

/**
 * How far ahead a host may schedule (client-safe; the bot's
 * _booking_window_error enforces it). With the server setting "Limit by host
 * rank" (features.booking_limits) each branch has a number of days from now,
 * by the host's rank in it, and staff have no limit. Without it every host
 * gets the weekly window (lastBookableDate in scheduleOptions.ts).
 *
 * `BookingDays`: null = the weekly window; per branch null = no limit.
 */
export type BookingDays = Record<HostBranch, number | null> | null;

/** The most a host can book in any branch (for the calendar, before a mode is picked). */
function widest(booking: Record<HostBranch, number | null>): number | null {
  const days = HOST_BRANCH_VALUES.map((branch) => booking[branch]);
  return days.some((value) => value === null) ? null : Math.max(...(days as number[]));
}

/** The last day the host can set up a game on; null = no limit. `mode` narrows it to that game's branch. */
export function lastBookableDay(
  booking: BookingDays,
  today: string,
  nowMs: number,
  timeZone: string,
  mode?: string | null,
): string | null {
  if (!booking) return lastBookableDate(today);
  const days = mode ? booking[branchOfMode(mode)] : widest(booking);
  return days === null ? null : dateInZone(nowMs + days * 86_400_000, timeZone);
}

export function canBookDay(
  booking: BookingDays,
  date: string,
  today: string,
  nowMs: number,
  timeZone: string,
  mode?: string | null,
): boolean {
  const last = lastBookableDay(booking, today, nowMs, timeZone, mode);
  return date >= today && (last === null || date <= last);
}

/** The hour-exact check for one game time (the last day's limit falls mid-day). */
export function bookingTimeIssue(booking: BookingDays, mode: string, gameSec: number, nowSec: number): string | null {
  if (!booking || !mode) return null;
  const branch = branchOfMode(mode);
  const days = booking[branch];
  if (days === null || gameSec <= nowSec + days * 86_400) return null;
  return `You can schedule ${branch} games up to ${days} days ahead (${days * 24} hours from now). Pick an earlier time.`;
}

/** What the calendar footer says about the window. */
export function bookingSummary(booking: BookingDays, today: string, formatDate: (date: string) => string): string {
  if (!booking) return `Bookable until ${formatDate(lastBookableDate(today))}.`;
  if (HOST_BRANCH_VALUES.every((branch) => booking[branch] === null)) return "You can schedule any time ahead.";
  const parts = HOST_BRANCH_VALUES.map((branch) =>
    booking[branch] === null ? `${branch} games any time ahead` : `${branch} games up to ${booking[branch]} days ahead`,
  );
  return `You can schedule ${parts.join(", ")}.`;
}
