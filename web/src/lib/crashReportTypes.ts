/**
 * Crash reports on the website (/crash — replaces the Crash Report panel in
 * the reservation thread and its DM upload). Client-safe. The numbers mirror
 * bot.py.py (CRASH_REPORT_MIN_ARCHIVE_BYTES, CRASH_REPORT_MERIT_*).
 */

/** A real logs folder with a minidump is never this small. */
export const CRASH_ZIP_MIN_BYTES = 500 * 1024;
/** Upload limit (the database keeps the file until the bot has posted it). */
export const CRASH_ZIP_MAX_BYTES = 15 * 1024 * 1024;
export const CRASH_TEXT_MAX = 1000;
export const CRASH_NOTES_MAX = 500;
export const CRASH_MERIT_VERIFIED = 2;
export const CRASH_MERIT_UNVERIFIED = 1;

export type CrashReportStatus = "pending" | "delivered" | "rejected";

/** One of the viewer's reports for a game. */
export interface CrashReportView {
  id: string;
  filename: string;
  bytes: number;
  status: CrashReportStatus;
  /** What the bot said (why it was refused, or the Merit it gave). */
  note: string | null;
  merit: number;
  created_at: number;
}

/** GET /api/crash-reports?game=<id> */
export interface CrashPageData {
  game: {
    id: string;
    name: string;
    mode: string;
    started: boolean;
    finished: boolean;
  } | null;
  /** The viewer's reports for this game, newest first. */
  reports: CrashReportView[];
}
