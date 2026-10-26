/**
 * Time conversion engine for the host calendar.
 *
 * Hosts pick a date + wall-clock time in THEIR time zone; everything stored
 * or sent to the bot is a UTC unix timestamp (seconds), and every viewer
 * renders that timestamp back in their own zone. All conversions go through
 * the built-in Intl time-zone database — no offsets are hard-coded, so DST
 * changes are handled per date.
 *
 * Calendar dates are plain "YYYY-MM-DD" strings (no zone attached); date-only
 * arithmetic treats them as UTC midnights so it never shifts across zones.
 */

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type DayName = (typeof DAY_NAMES)[number];

/** Wall-clock reading of an instant in one time zone. */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export type ConversionStatus =
  /** The wall time exists exactly once in the zone. */
  | "ok"
  /** Clocks jump forward over this time (DST start) — shifted later. */
  | "skipped"
  /** Clocks fall back over this time (DST end) — the earlier one is used. */
  | "ambiguous";

const MS_PER_DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(unixMs: number, timeZone: string): ZonedParts {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(unixMs))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  };
}

/** Minutes the zone is ahead of UTC at that instant (e.g. +120 for CEST). */
export function offsetMinutes(unixMs: number, timeZone: string): number {
  const p = zonedParts(unixMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(unixMs / 1000) * 1000) / 60_000);
}

function parseDate(dateIso: string): [number, number, number] {
  const [year, month, day] = dateIso.split("-").map(Number);
  return [year, month, day];
}

function parseTime(time: string): [number, number] {
  const [hour, minute] = time.split(":").map(Number);
  return [hour, minute];
}

/**
 * Wall-clock date + time in `timeZone` → UTC unix milliseconds.
 *
 * Tries the zone's offset from 12h before and 12h after the wall time; the
 * candidates that read back as the same wall time are valid. Two valid
 * candidates = ambiguous (fall-back hour, earlier one wins); none = the time
 * falls in a spring-forward gap and is shifted by the jump.
 */
export function zonedToUnixMs(
  dateIso: string,
  time: string,
  timeZone: string,
): { unixMs: number; status: ConversionStatus } {
  const [year, month, day] = parseDate(dateIso);
  const [hour, minute] = parseTime(time);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set([
    offsetMinutes(wall - MS_PER_DAY / 2, timeZone),
    offsetMinutes(wall + MS_PER_DAY / 2, timeZone),
  ]);
  const valid = [...offsets]
    .map((offset) => wall - offset * 60_000)
    .filter((candidate) => {
      const p = zonedParts(candidate, timeZone);
      return (
        p.year === year &&
        p.month === month &&
        p.day === day &&
        p.hour === hour &&
        p.minute === minute
      );
    })
    .sort((a, b) => a - b);
  if (valid.length === 0) {
    const before = offsetMinutes(wall - MS_PER_DAY / 2, timeZone);
    return { unixMs: wall - before * 60_000, status: "skipped" };
  }
  return { unixMs: valid[0], status: valid.length > 1 ? "ambiguous" : "ok" };
}

/** Calendar date ("YYYY-MM-DD") an instant falls on in `timeZone`. */
export function dateInZone(unixMs: number, timeZone: string): string {
  const p = zonedParts(unixMs, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" an instant shows in `timeZone`. */
export function timeInZone(unixMs: number, timeZone: string): string {
  const p = zonedParts(unixMs, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function todayInZone(timeZone: string, nowMs = Date.now()): string {
  return dateInZone(nowMs, timeZone);
}

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function addDays(dateIso: string, days: number): string {
  const [year, month, day] = parseDate(dateIso);
  return new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** 0 = Monday … 6 = Sunday (the bot's week starts on Monday). */
export function weekdayIndex(dateIso: string): number {
  const [year, month, day] = parseDate(dateIso);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function weekdayName(dateIso: string): DayName {
  return DAY_NAMES[weekdayIndex(dateIso)];
}

/** Monday of the week containing the date — the bot's week key. */
export function mondayOf(dateIso: string): string {
  return addDays(dateIso, -weekdayIndex(dateIso));
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = parseDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isHHMM(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function minutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function hhmmToMinutes(time: string): number {
  const [hour, minute] = parseTime(time);
  return hour * 60 + minute;
}

/** The browser's zone, falling back to UTC. */
export function detectTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

/** Every IANA zone the runtime knows (UTC first). */
export function allTimeZones(): string[] {
  try {
    const zones = Intl.supportedValuesOf("timeZone");
    return ["UTC", ...zones.filter((zone) => zone !== "UTC")];
  } catch {
    return ["UTC"];
  }
}

/** "UTC+02:00" style label. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "Europe/Berlin" → "Berlin", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replace(/_/g, " ");
}

/** Human date/time of an instant in a zone, e.g. "Tue 20 Oct, 19:00". */
export function formatInZone(
  unixMs: number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(
    new Date(unixMs),
  );
}

/** Long label for a calendar date, e.g. "Tuesday, 20 October 2026". */
export function formatDateLong(dateIso: string): string {
  const [year, month, day] = parseDate(dateIso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "in 3 days", "2 hours ago" … relative to now. */
export function formatRelative(unixMs: number, nowMs = Date.now()): string {
  const diffSec = Math.round((unixMs - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86_400), "day");
}

/** Compact duration, e.g. 90 → "1h 30m", 2880 → "2d". */
export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (rest || parts.length === 0) parts.push(`${rest}m`);
  return parts.join(" ");
}

/** Discord's native timestamp markup — renders in every reader's zone. */
export function discordTag(unixSeconds: number, style: "F" | "R" | "t" | "f" = "F"): string {
  return `<t:${unixSeconds}:${style}>`;
}
