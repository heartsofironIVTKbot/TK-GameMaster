import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  CRASH_MERIT_VERIFIED,
  CRASH_ZIP_MIN_BYTES,
  type CrashReportStatus,
  type CrashReportView,
} from "@/lib/crashReportTypes";
import type { RequestState, ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * Crash reports sent on the website's /crash page. The bot reads the zip
 * from here, checks it, posts it to the crash-report channel and gives the
 * Merit (bot.py.py _process_web_crash_report). Once it's in Discord the file
 * is dropped — unless it was too big to attach, then staff download it here.
 */

// Own check (not scheduleStore's) so scheduleStore can import this file.
const isSchedulerDemo = () => process.env.NODE_ENV === "development" && process.env.SCHEDULER_DEMO === "1";

const DDL = `CREATE TABLE IF NOT EXISTS crash_reports (
    report_id VARCHAR(32) NOT NULL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    game_id VARCHAR(32) NOT NULL,
    user_id BIGINT NOT NULL,
    what_happened TEXT NOT NULL,
    notes TEXT NULL,
    filename VARCHAR(200) NOT NULL,
    bytes INT NOT NULL,
    content LONGBLOB NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    result_text TEXT NULL,
    merit INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    delivered_at BIGINT NULL,
    INDEX idx_crash_reports_user (user_id, created_at),
    INDEX idx_crash_reports_guild (guild_id, created_at)
)`;

let ready: Promise<void> | null = null;
async function ensureTable(): Promise<void> {
  if (!ready) {
    ready = getPool()
      .query(DDL)
      .then(() => undefined)
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  await ready;
}

interface DemoReport extends CrashReportView {
  game_id: string;
  user_id: string;
}

function demoReports(): DemoReport[] {
  const holder = globalThis as { __gmCrashReportsDemoV1?: DemoReport[] };
  holder.__gmCrashReportsDemoV1 ??= [];
  return holder.__gmCrashReportsDemoV1;
}

/** Keep only a safe, short file name. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "logs.zip";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120).trim() || "logs.zip";
}

const STATUSES: CrashReportStatus[] = ["pending", "delivered", "rejected"];

/** Store a report (the bot picks it up from a "crash_report" request). Returns its id. */
export async function saveCrashReport(input: {
  guildId: string;
  gameId: string;
  userId: string;
  whatHappened: string;
  notes: string;
  filename: string;
  content: Buffer;
}): Promise<string> {
  const id = crypto.randomBytes(16).toString("hex");
  const createdAt = Math.floor(Date.now() / 1000);
  const filename = cleanName(input.filename);
  if (isSchedulerDemo()) {
    demoReports().unshift({
      id,
      game_id: input.gameId,
      user_id: input.userId,
      filename,
      bytes: input.content.length,
      status: "pending",
      note: null,
      merit: 0,
      created_at: createdAt,
    });
    return id;
  }
  await ensureTable();
  await getPool().query(
    `INSERT INTO crash_reports (report_id, guild_id, game_id, user_id, what_happened, notes, filename, bytes, content, created_at)
     VALUES (?, ?, ?, CAST(? AS UNSIGNED), ?, ?, ?, ?, ?, ?)`,
    [id, input.guildId, input.gameId, input.userId, input.whatHappened, input.notes || null, filename, input.content.length, input.content, createdAt],
  );
  return id;
}

interface ReportRow extends RowDataPacket {
  report_id: string;
  filename: string;
  bytes: number;
  status: string;
  result_text: string | null;
  merit: number;
  created_at: number;
}

/** The viewer's latest reports for one game. */
export async function listMyCrashReports(userId: string, gameId: string): Promise<CrashReportView[]> {
  if (isSchedulerDemo()) {
    return demoReports()
      .filter((report) => report.user_id === userId && report.game_id === gameId)
      .slice(0, 5)
      .map((report) => ({
        id: report.id,
        filename: report.filename,
        bytes: report.bytes,
        status: report.status,
        note: report.note,
        merit: report.merit,
        created_at: report.created_at,
      }));
  }
  try {
    const [rows] = await getPool().query<ReportRow[]>(
      `SELECT report_id, filename, bytes, status, result_text, merit, created_at
         FROM crash_reports WHERE user_id = CAST(? AS UNSIGNED) AND game_id = ? ORDER BY created_at DESC LIMIT 5`,
      [userId, gameId],
    );
    return rows.map((row) => ({
      id: String(row.report_id),
      filename: String(row.filename),
      bytes: Number(row.bytes) || 0,
      status: STATUSES.find((status) => status === row.status) ?? "pending",
      note: row.result_text ? String(row.result_text) : null,
      merit: Number(row.merit) || 0,
      created_at: Number(row.created_at) || 0,
    }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

interface FileRow extends RowDataPacket {
  guild_id: string;
  filename: string;
  content: Buffer | null;
}

/** A kept file (one too big for Discord), for staff to download. */
export async function crashReportFile(reportId: string): Promise<{ guild_id: string; filename: string; content: Buffer } | null> {
  if (isSchedulerDemo()) return null;
  try {
    const [rows] = await getPool().query<FileRow[]>(
      "SELECT guild_id, filename, content FROM crash_reports WHERE report_id = ?",
      [reportId],
    );
    const row = rows[0];
    return row?.content ? { guild_id: String(row.guild_id), filename: String(row.filename), content: row.content } : null;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return null;
    throw error;
  }
}

type DemoOutcome = { status: RequestState; result: ScheduleRequestStatus["result"]; error: string | null };

/** Preview: the simulated bot checks the upload and "delivers" it. */
export function applyDemoCrashReport(payload: Record<string, unknown>, userId: string): DemoOutcome {
  const report = demoReports().find((entry) => entry.id === String(payload.report_id ?? "") && entry.user_id === userId);
  if (!report) return { status: "error", result: null, error: "❌ That crash report wasn't found — send it again." };
  if (report.bytes < CRASH_ZIP_MIN_BYTES) {
    report.status = "rejected";
    report.note = "❌ File too small. Please ensure you are zipping the entire crash folder containing your minidump and logs.";
    return { status: "error", result: null, error: report.note };
  }
  // One reward every 6 hours, like the bot.
  const rewardedRecently = demoReports().some(
    (entry) => entry !== report && entry.user_id === userId && entry.merit > 0 && report.created_at - entry.created_at < 6 * 3600,
  );
  const merit = rewardedRecently ? 0 : CRASH_MERIT_VERIFIED;
  report.status = "delivered";
  report.merit = merit;
  report.note = merit ? `Delivered. +${merit} Merit.` : "Delivered. No Merit this time (one reward every 6 hours).";
  return { status: "done", result: { crash: { merit, cooldown: rewardedRecently, verified: true } }, error: null };
}
