import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { HOME_GUILD_ID, currentGuildId } from "@/lib/currentGuild";
import { lookupMembers } from "@/lib/memberDirectory";
import type {
  CalendarDayLock,
  CalendarSlot,
  DraftSettings,
  HostOption,
  HostProfile,
  NationLockGroupPayload,
  RequestAction,
  ScheduleRequestStatus,
  SlotDetails,
  SlotEditability,
  SlotSettings,
} from "@/lib/scheduleTypes";
import { applyDemoAttendance } from "@/lib/attendanceDemo";
import {
  DEMO_SOON_GAME_ID,
  DEMO_TFB_GAME_ID,
  advanceDemoLifecycle,
  applyDemoAccess,
  applyDemoDraft,
  applyDemoGameRoster,
  applyDemoGameMessage,
  applyDemoHotJoin,
  applyDemoRemind,
  applyDemoResources,
  applyDemoLogAnalysis,
  markDemoAiReward,
} from "@/lib/gameControlDemo";
import { applyDemoModeration } from "@/lib/databaseDemo";
import { applyDemoHostDm } from "@/lib/hostMessagesDemo";
import { applyDemoServerSetup } from "@/lib/serverSettingsDemo";
import { applyDemoMemberRoles, applyDemoRoleScan } from "@/lib/memberRolesDemo";
import { parsePresetData } from "@/lib/presetValidation";
import { parseBranches } from "@/lib/hostBranches";
import { currentAddOn } from "@/lib/scheduleOptions";
import { applyDemoRoster } from "@/lib/liveDemo";
import { applyDemoCrashReport } from "@/lib/crashReports";
import { addDays, mondayOf, weekdayName } from "@/lib/timeEngine";

/**
 * Data access for the host calendar.
 *
 * Reads come straight from the bot's tables (schedule_slots, locked_days,
 * games). Writes NEVER touch those: the bot keeps them in memory and
 * rewrites them on every save, so the web queues a row in
 * web_schedule_requests and the bot's web_schedule_request_loop applies it
 * (see bot.py.py). Both web_* tables are created by the bot at startup.
 *
 * Preview mode (SCHEDULER_DEMO=1 with `next dev` only) swaps MySQL for an
 * in-memory store with sample games and a simulated bot, so the pages can be
 * tried without the database or Discord login.
 */

export function isSchedulerDemo(): boolean {
  return process.env.NODE_ENV === "development" && process.env.SCHEDULER_DEMO === "1";
}

/** Thrown when the bot has not created the web_* tables yet. */
export class SchedulerSetupError extends Error {
  constructor() {
    super(
      "The Discord bot has not set up the calendar tables yet — restart the bot " +
        "with the latest code, then reload this page.",
    );
    this.name = "SchedulerSetupError";
  }
}

function rethrowMissingTable(error: unknown): never {
  if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") {
    throw new SchedulerSetupError();
  }
  throw error;
}

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

function toInt(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? Math.trunc(number) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Settings the setup form edits, read from a slot's stored document. */
function settingsFromSlotData(data: Record<string, unknown>, fallbackTs: number): SlotSettings {
  const unlocks = parseJson(data.automated_unlocks);
  const automatedUnlocks: SlotSettings["automated_unlocks"] = {};
  for (const scope of ["major", "minor"] as const) {
    const entry = parseJson(unlocks[scope]);
    const target = str(entry.target_level);
    const unlockTs = toInt(entry.unlock_timestamp);
    if (target && unlockTs !== null) {
      automatedUnlocks[scope] = { target_level: target, unlock_timestamp: unlockTs };
    }
  }
  const nationLocks: NationLockGroupPayload[] = Array.isArray(data.nation_locks)
    ? data.nation_locks.map((raw) => {
        const group = parseJson(raw);
        return {
          label: str(group.label) ?? "Locked nations",
          nations: Array.isArray(group.nations) ? group.nations.filter((n): n is string => typeof n === "string") : [],
          release_timestamp: toInt(group.release_timestamp),
        };
      })
    : Array.isArray(data.locked_regions) && data.locked_regions.length > 0
      ? [
          {
            label: "Locked nations",
            nations: data.locked_regions.filter((n): n is string => typeof n === "string"),
            release_timestamp: null,
          },
        ]
      : [];
  // A preset's groups (the bot keeps the playable ones, as {name, tiers}), rules and mods.
  const preset = parsePresetData({ layout: data.nation_layout ?? null, rules: data.rules ?? null, mods: data.mods ?? null });
  return {
    mode: str(data.mode) ?? "Unknown",
    game_timestamp: toInt(data.game_timestamp) ?? fallbackTs,
    announce_timestamp: toInt(data.announce_timestamp),
    logging_mode: str(data.logging_mode) ?? "Strict",
    add_on: currentAddOn(str(data.add_on)),
    fortunes_mode: str(data.fortunes_mode),
    major_lock_level: str(data.major_lock_level) ?? "Trusted",
    minor_lock_level: str(data.minor_lock_level) ?? "All Users",
    automated_unlock: Boolean(data.automated_unlock),
    automated_unlocks: automatedUnlocks,
    automatic_reminder: Boolean(data.automatic_reminder),
    scheduled_checksum: str(data.scheduled_checksum),
    nation_locks: nationLocks,
    preset_id: str(data.preset_id),
    preset_name: str(data.preset_name),
    nation_layout: preset.layout,
    rules: preset.rules,
    mods: preset.mods,
    draft: draftFromSlotData(data),
  };
}

/** A slot's draft settings (bot: is_draft + draft_teams); older Discord drafts aren't editable here. */
function draftFromSlotData(data: Record<string, unknown>): DraftSettings | null {
  if (!data.is_draft || !Array.isArray(data.draft_teams) || data.draft_teams.length !== 2) return null;
  const first = data.draft_first_picker;
  return {
    teams: data.draft_teams.map((raw) => {
      const team = parseJson(raw);
      return {
        name: str(team.name) ?? "Team",
        groups: Array.isArray(team.groups) ? team.groups.map(String) : [],
        captain_id: String(team.captain_id ?? ""),
        captain_name: null,
      };
    }),
    coin_flip: data.draft_coin_flip !== false,
    first_picker: first === 1 ? 1 : first === 0 ? 0 : null,
  };
}

/** Captain names for the edit form. */
async function withCaptainNames(details: SlotDetails): Promise<SlotDetails> {
  const draft = details.settings.draft;
  if (!draft) return details;
  const names = await lookupMembers(draft.teams.map((team) => team.captain_id)).catch(() => null);
  return {
    ...details,
    settings: {
      ...details.settings,
      draft: {
        ...draft,
        teams: draft.teams.map((team) => {
          const member = names?.get(team.captain_id);
          return { ...team, captain_name: member ? member.display_name || member.username || null : null };
        }),
      },
    },
  };
}

/** What can still change on a game (mirrors the bot's edit rules). */
export function slotEditability(
  slot: CalendarSlot,
  announcedThread: boolean,
  gameStarted: boolean,
  nowSec: number,
): { editable: SlotEditability; reason: string | null } {
  if (slot.status === "cancelled" || slot.status === "ended") {
    return { editable: "locked", reason: "This game has ended or was cancelled." };
  }
  if (gameStarted || slot.game_timestamp <= nowSec) {
    return { editable: "locked", reason: "This game has already started." };
  }
  if (slot.announced || announcedThread) {
    return {
      editable: "time_host",
      reason: "Already announced — you can still move the day and time or hand it to another host. Reserved players get a DM.",
    };
  }
  return { editable: "full", reason: null };
}

// --- MySQL ------------------------------------------------------------------

interface SlotRow extends RowDataPacket {
  slot_id: string;
  week: string | null;
  day: string | null;
  host_id: string;
  host_username: string | null;
  status: string | null;
  mode: string | null;
  game_timestamp: number | string | null;
  announce_timestamp: number | string | null;
  announced: number | boolean;
  slot_data: unknown;
}

interface LockRow extends RowDataPacket {
  week: string;
  day: string;
  lock_data: unknown;
}

interface RequestRow extends RowDataPacket {
  request_id: string;
  action: string;
  slot_id: string | null;
  host_id: string;
  payload: unknown;
  status: string;
  result: unknown;
  error: string | null;
  created_at: number | string;
  processed_at: number | string | null;
}

interface RosterRow extends RowDataPacket {
  user_id_text: string;
  username: string | null;
  display_name: string | null;
  is_senior: number | boolean;
  /** "RP,HIST" — missing until the bot adds the column. */
  branches?: string | null;
}

interface GameStateRow extends RowDataPacket {
  game_started: number | boolean;
  status: string | null;
}

// BIGINT snowflakes exceed 2^53, so ids are read as strings (CAST AS CHAR).
// `week` is DATE in schema.sql but VARCHAR in the bot's DDL — CAST covers both.
const SLOT_COLUMNS = `slot_id, CAST(week AS CHAR) AS week, day,
  CAST(host_id AS CHAR) AS host_id, host_username, status, mode,
  game_timestamp, announce_timestamp, announced, slot_data`;

function slotFromRow(row: SlotRow, viewerId: string): CalendarSlot {
  const data = parseJson(row.slot_data);
  const hostId = row.host_id && row.host_id !== "0" ? row.host_id : String(data.host_id ?? "");
  const lockedRegions = Array.isArray(data.locked_regions) ? data.locked_regions : [];
  return {
    slot_id: String(row.slot_id),
    mode: row.mode ?? String(data.mode ?? "Unknown"),
    host_id: hostId,
    host_username: row.host_username ?? str(data.host_username),
    game_timestamp: toInt(row.game_timestamp) ?? toInt(data.game_timestamp) ?? 0,
    announce_timestamp: toInt(row.announce_timestamp),
    announced: Boolean(row.announced) || Boolean(data.announced),
    status: row.status ?? str(data.status),
    add_on: currentAddOn(str(data.add_on)),
    day: row.day,
    week: row.week ? row.week.slice(0, 10) : null,
    locked_nations: lockedRegions.length,
    from_web: data.source === "web",
    mine: hostId === viewerId,
    thread_id: /^\d{5,25}$/.test(String(data.thread_id ?? "")) ? String(data.thread_id) : null,
  };
}

function requestFromRow(row: RequestRow): ScheduleRequestStatus {
  const payload = parseJson(row.payload);
  const result = parseJson(row.result);
  const gameTs = toInt(payload.game_timestamp);
  const action = (
    [
      "create",
      "update",
      "cancel",
      "lock_day",
      "unlock_day",
      "roster_assign",
      "roster_remove",
      "moderation",
      "dishonored",
      "host_rating",
      "att_check",
      "att_sample",
      "att_override",
      "att_finalize",
      "game_start",
      "game_end",
      "game_cancel",
      "game_access",
      "game_remind",
      "game_resources",
      "draft_join",
      "draft_leave",
      "draft_pick",
      "draft_control",
      "member_roles",
      "role_scan",
      "host_dm",
      "game_message",
      "game_log_analysis",
      "server_setup",
    ] as const
  ).find((known) => known === row.action) ?? "create";
  const isDay = action === "lock_day" || action === "unlock_day";
  const status =
    (["running", "done", "error", "confirm"] as const).find((known) => known === row.status) ?? "pending";
  return {
    request_id: row.request_id,
    action,
    slot_id: row.slot_id,
    status,
    error: row.error,
    result: Object.keys(result).length > 0 ? (result as ScheduleRequestStatus["result"]) : null,
    created_at: toInt(row.created_at) ?? 0,
    processed_at: toInt(row.processed_at),
    preview:
      !isDay && typeof payload.mode === "string" && gameTs !== null
        ? { mode: payload.mode, game_timestamp: gameTs }
        : null,
    day_preview:
      isDay && typeof payload.week === "string" && typeof payload.day === "string"
        ? { week: payload.week, day: payload.day }
        : null,
  };
}

const REQUEST_COLUMNS = `request_id, action, slot_id, CAST(host_id AS CHAR) AS host_id,
  payload, status, result, error, created_at, processed_at`;

// SELECT * keeps working before the bot adds the `branches` column.
async function mysqlHostRoster(userId: string, guildId: string) {
  try {
    const [rows] = await getPool().query<RosterRow[]>(
      "SELECT *, CAST(user_id AS CHAR) AS user_id_text FROM web_host_roster WHERE user_id = CAST(? AS UNSIGNED) AND guild_id = ?",
      [userId, guildId],
    );
    const row = rows[0];
    return row
      ? {
          username: row.username,
          display_name: row.display_name,
          is_staff: Boolean(row.is_senior),
          branches: parseBranches(row.branches),
        }
      : null;
  } catch (error) {
    rethrowMissingTable(error);
  }
}

async function mysqlHosts(guildId: string): Promise<HostOption[]> {
  try {
    const [rows] = await getPool().query<RosterRow[]>(
      `SELECT *, CAST(user_id AS CHAR) AS user_id_text
       FROM web_host_roster WHERE guild_id = ? ORDER BY COALESCE(display_name, username)`,
      [guildId],
    );
    return rows.map((row) => ({
      discord_id: row.user_id_text,
      username: row.username,
      display_name: row.display_name,
      branches: parseBranches(row.branches),
    }));
  } catch (error) {
    rethrowMissingTable(error);
  }
}

async function mysqlCalendar(fromSec: number, toSec: number, viewerId: string, guildId: string) {
  const pool = getPool();
  const [slotRows] = await pool.query<SlotRow[]>(
    `SELECT ${SLOT_COLUMNS} FROM schedule_slots
     WHERE guild_id = ? AND game_timestamp BETWEEN ? AND ? ORDER BY game_timestamp`,
    [guildId, fromSec, toSec],
  );
  let lockRows: LockRow[] = [];
  try {
    [lockRows] = await pool.query<LockRow[]>(
      "SELECT CAST(week AS CHAR) AS week, day, lock_data FROM locked_days WHERE guild_id = ?",
      [guildId],
    );
  } catch (error) {
    // No day locks have ever been created on this database.
    if ((error as { code?: string } | null)?.code !== "ER_NO_SUCH_TABLE") throw error;
  }
  return {
    slots: slotRows.map((row) => slotFromRow(row, viewerId)),
    locks: lockRows.map((row) => ({
      week: String(row.week).slice(0, 10),
      day: row.day,
      reason: str(parseJson(row.lock_data).reason)?.trim() || null,
    })),
  };
}

async function mysqlSlotDetails(slotId: string, viewerId: string, guildId: string): Promise<SlotDetails | null> {
  const pool = getPool();
  const [rows] = await pool.query<SlotRow[]>(
    `SELECT ${SLOT_COLUMNS} FROM schedule_slots WHERE slot_id = ? AND guild_id = ?`,
    [slotId, guildId],
  );
  const row = rows[0];
  if (!row) return null;
  const slot = slotFromRow(row, viewerId);
  const data = parseJson(row.slot_data);
  const threadId = data.thread_id ? String(data.thread_id) : null;
  let gameStarted = false;
  if (threadId) {
    const [games] = await pool.query<GameStateRow[]>(
      "SELECT game_started, status FROM games WHERE thread_id = ?",
      [threadId],
    );
    const game = games[0];
    gameStarted = Boolean(game?.game_started) || game?.status === "ended" || game?.status === "cancelled";
  }
  return {
    slot,
    ...slotEditability(slot, Boolean(threadId), gameStarted, Math.floor(Date.now() / 1000)),
    settings: settingsFromSlotData(data, slot.game_timestamp),
  };
}

async function mysqlRequests(hostId: string, sinceSec: number, guildId: string) {
  try {
    const [rows] = await getPool().query<RequestRow[]>(
      `SELECT ${REQUEST_COLUMNS} FROM web_schedule_requests
       WHERE host_id = CAST(? AS UNSIGNED) AND guild_id = ? AND (status = 'pending' OR created_at >= ?)
       ORDER BY created_at DESC LIMIT 25`,
      [hostId, guildId, sinceSec],
    );
    return rows.map(requestFromRow);
  } catch (error) {
    rethrowMissingTable(error);
  }
}

async function mysqlRequest(requestId: string, hostId: string) {
  try {
    const [rows] = await getPool().query<RequestRow[]>(
      `SELECT ${REQUEST_COLUMNS} FROM web_schedule_requests WHERE request_id = ? AND host_id = CAST(? AS UNSIGNED)`,
      [requestId, hostId],
    );
    return rows[0] ? requestFromRow(rows[0]) : null;
  } catch (error) {
    rethrowMissingTable(error);
  }
}

async function mysqlPendingCount(hostId: string) {
  try {
    const [rows] = await getPool().query<(RowDataPacket & { total: number })[]>(
      "SELECT COUNT(*) AS total FROM web_schedule_requests WHERE host_id = CAST(? AS UNSIGNED) AND status = 'pending'",
      [hostId],
    );
    return Number(rows[0]?.total ?? 0);
  } catch (error) {
    rethrowMissingTable(error);
  }
}

async function mysqlInsertRequest(request: NewRequest) {
  try {
    await getPool().query(
      `INSERT INTO web_schedule_requests
         (request_id, action, slot_id, host_id, payload, status, created_at, guild_id)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        request.requestId,
        request.action,
        request.slotId,
        request.hostId,
        request.payload ? JSON.stringify(request.payload) : null,
        Math.floor(Date.now() / 1000),
        request.guildId ?? (await currentGuildId()),
      ],
    );
  } catch (error) {
    rethrowMissingTable(error);
  }
}

// --- Preview mode (in-memory) -----------------------------------------------

export const DEMO_HOST: HostProfile = {
  discord_id: "100000000000000001",
  username: "demo_host",
  display_name: "Demo Host",
  avatar: null,
  is_staff: true,
  can_rate_hosts: true,
  rate_branches: ["RP", "HIST"],
  branches: ["RP", "HIST"],
  disabled_modes: [],
  guild_id: HOME_GUILD_ID,
  servers: [],
  demo: true,
};

const DEMO_HOSTS: HostOption[] = [
  { discord_id: DEMO_HOST.discord_id, username: DEMO_HOST.username, display_name: DEMO_HOST.display_name, branches: ["RP", "HIST"] },
  { discord_id: "200000000000000002", username: "senior_host", display_name: "Senior Host", branches: ["RP", "HIST"] },
  { discord_id: "300000000000000003", username: "casino_host", display_name: "Casino Host", branches: ["RP"] },
  { discord_id: "400000000000000004", username: "md_enjoyer", display_name: "MD Enjoyer", branches: ["HIST"] },
];

interface DemoRequest extends ScheduleRequestStatus {
  host_id: string;
  payload: Record<string, unknown> | null;
}

interface DemoSlot extends CalendarSlot {
  thread_id: string | null;
  game_started: boolean;
  /** The slot document (what the bot stores in slot_data). */
  data: Record<string, unknown>;
}

interface DemoState {
  slots: DemoSlot[];
  locks: CalendarDayLock[];
  requests: DemoRequest[];
}

const DEMO_PROCESS_DELAY_SEC = 2;

function utcDate(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

function demoSlot(
  offsetDays: number,
  hourUtc: number,
  mode: string,
  extra: Partial<DemoSlot> = {},
): DemoSlot {
  const today = utcDate(Math.floor(Date.now() / 1000));
  const date = addDays(today, offsetDays);
  const gameTs = Math.floor(Date.parse(`${date}T${String(hourUtc).padStart(2, "0")}:00:00Z`) / 1000);
  const slot: DemoSlot = {
    slot_id: crypto.randomBytes(16).toString("hex"),
    mode,
    host_id: "200000000000000002",
    host_username: "senior_host",
    game_timestamp: gameTs,
    announce_timestamp: null,
    announced: false,
    status: "scheduled",
    add_on: null,
    day: weekdayName(date),
    week: mondayOf(date),
    locked_nations: 0,
    from_web: false,
    mine: false,
    thread_id: null,
    game_started: false,
    data: {},
    ...extra,
  };
  slot.data = {
    mode,
    game_timestamp: gameTs,
    announce_timestamp: slot.announce_timestamp,
    logging_mode: "Strict",
    add_on: slot.add_on,
    major_lock_level: "Trusted",
    minor_lock_level: "All Users",
    automatic_reminder: false,
    ...slot.data,
  };
  return slot;
}

function demoState(): DemoState {
  const holder = globalThis as { __gmSchedulerDemoV5?: DemoState };
  if (!holder.__gmSchedulerDemoV5) {
    const nowSec = Math.floor(Date.now() / 1000);
    const today = utcDate(nowSec);
    const lockDate = addDays(today, 4);
    const soon = nowSec + 25 * 60;
    holder.__gmSchedulerDemoV5 = {
      slots: [
        demoSlot(-2, 18, "Historical (Vanilla)", { status: "ended", announced: true }),
        demoSlot(0, 0, "Roleplay", {
          host_id: DEMO_HOST.discord_id,
          host_username: DEMO_HOST.username,
          game_timestamp: soon,
          announce_timestamp: soon - 24 * 3600,
          announced: true,
          status: "announced",
          from_web: true,
          thread_id: DEMO_SOON_GAME_ID,
          data: { game_timestamp: soon, scheduled_checksum: "R56X" },
        }),
        demoSlot(1, 19, "Roleplay", {
          host_id: DEMO_HOST.discord_id,
          host_username: DEMO_HOST.username,
          announce_timestamp: Math.floor(Date.now() / 1000) + 6 * 3600,
          locked_nations: 3,
          from_web: true,
          data: {
            automatic_reminder: true,
            scheduled_checksum: "K7QX",
            locked_regions: ["Germany", "Italy", "Japan"],
            nation_locks: [{ label: "Axis majors", nations: ["Germany", "Italy", "Japan"], release_timestamp: null }],
          },
        }),
        demoSlot(2, 18, "Historical (TFB)", {
          host_id: DEMO_HOST.discord_id,
          host_username: DEMO_HOST.username,
          announced: true,
          status: "announced",
          thread_id: DEMO_TFB_GAME_ID,
        }),
        demoSlot(3, 20, "Kaiserreich (FFA)", { add_on: "randomizer", host_username: "casino_host", host_id: "300000000000000003" }),
        demoSlot(3, 17, "Roleplay (Millennium Dawn)", { host_username: "md_enjoyer", host_id: "400000000000000004" }),
        demoSlot(6, 16, "Historical (Oak)", { host_username: "oak_host" }),
      ],
      locks: [{ week: mondayOf(lockDate), day: weekdayName(lockDate), reason: "Server maintenance" }],
      requests: [],
    };
  }
  return holder.__gmSchedulerDemoV5;
}

function demoHostName(hostId: string): string {
  return DEMO_HOSTS.find((host) => host.discord_id === hostId)?.username ?? "host";
}

/** The slot fields the bot's _web_parse_draft stores for a calendar draft setting. */
function demoDraftFields(raw: unknown): Record<string, unknown> {
  const draft = parseJson(raw);
  if (!Array.isArray(draft.teams)) {
    return { is_draft: false, draft_teams: null, draft_coin_flip: null, draft_first_picker: null };
  }
  const coinFlip = draft.coin_flip !== false;
  return {
    is_draft: true,
    draft_teams: draft.teams,
    draft_coin_flip: coinFlip,
    draft_first_picker: coinFlip ? null : draft.first_picker === 1 ? 1 : 0,
  };
}

/** The simulated bot: applies queued requests a few seconds after creation. */
function processDemoRequests(): void {
  const state = demoState();
  const now = Math.floor(Date.now() / 1000);
  const fail = (request: DemoRequest, error: string) => {
    request.status = "error";
    request.error = error;
  };
  for (const request of state.requests) {
    // Game start / end / cancel run for a while, with progress (like the bot).
    if (
      (request.action === "game_start" || request.action === "game_end" || request.action === "game_cancel") &&
      (request.status === "pending" || request.status === "running")
    ) {
      const outcome = advanceDemoLifecycle(
        request.action,
        request.payload ?? {},
        request.host_id,
        request.status,
        request.created_at,
      );
      if (outcome) {
        request.status = outcome.status;
        request.result = outcome.result;
        request.error = outcome.error;
        if (outcome.status !== "running") request.processed_at = now;
        // The bot marks the calendar slot too (_mark_schedule_slot_board_status).
        const slot = state.slots.find((entry) => entry.thread_id && entry.thread_id === String(request.payload?.thread_id ?? ""));
        if (slot && outcome.status === "done" && request.action !== "game_start") {
          slot.status = request.action === "game_end" ? "ended" : "cancelled";
        }
      }
      continue;
    }
    if (request.status !== "pending" || now - request.created_at < DEMO_PROCESS_DELAY_SEC) continue;
    request.processed_at = now;
    const payload = request.payload ?? {};
    const week = String(payload.week ?? "");
    const day = String(payload.day ?? "");
    const isLocked = state.locks.some((lock) => lock.week === week && lock.day === day);

    if (request.action.startsWith("draft_")) {
      const outcome = applyDemoDraft(request.action, payload, request.host_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action.startsWith("hotjoin_") || request.action === "crash_report") {
      const outcome =
        request.action === "crash_report"
          ? applyDemoCrashReport(payload, request.host_id)
          : applyDemoHotJoin(request.action, payload, request.host_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "game_access" || request.action === "game_remind" || request.action === "game_resources") {
      const outcome =
        request.action === "game_access"
          ? applyDemoAccess(payload, request.host_id)
          : request.action === "game_remind"
            ? applyDemoRemind(payload, request.host_id)
            : applyDemoResources(payload, request.host_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "roster_assign" || request.action === "roster_remove") {
      // Games page games first (a started game = late join), else the live map's lobbies.
      const outcome =
        (request.action === "roster_assign" ? applyDemoGameRoster(payload) : null) ??
        applyDemoRoster(request.action, payload);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "moderation" || request.action === "dishonored" || request.action === "host_rating") {
      const outcome = applyDemoModeration(request.action, payload, request.host_id);
      if (outcome.status === "done" && payload.ai_reward === true && typeof payload.game_id === "string") {
        markDemoAiReward(payload.game_id, String(payload.user_id), String(payload.kind), Number(payload.amount) || 1, request.host_id);
      }
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "server_setup") {
      const outcome = applyDemoServerSetup(payload);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "game_log_analysis") {
      const outcome = applyDemoLogAnalysis(payload, request.host_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "host_dm" || request.action === "game_message") {
      const outcome =
        request.action === "host_dm"
          ? applyDemoHostDm(payload, request.host_id, demoHostName(request.host_id))
          : applyDemoGameMessage(payload, request.host_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "role_scan") {
      const outcome = applyDemoRoleScan(payload, request.host_id, request.host_id === DEMO_HOST.discord_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "member_roles") {
      const outcome = applyDemoMemberRoles(payload, request.host_id, request.host_id === DEMO_HOST.discord_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action.startsWith("att_")) {
      const outcome = applyDemoAttendance(request.action, payload, request.host_id);
      request.status = outcome.status;
      request.result = outcome.result;
      request.error = outcome.error;
      continue;
    }

    if (request.action === "lock_day" || request.action === "unlock_day") {
      state.locks = state.locks.filter((lock) => !(lock.week === week && lock.day === day));
      if (request.action === "lock_day") {
        state.locks.push({ week, day, reason: typeof payload.reason === "string" ? payload.reason : null });
      }
      request.status = "done";
      request.result = {};
      continue;
    }

    const slot = state.slots.find((entry) => entry.slot_id === request.slot_id);
    if (request.action === "cancel") {
      if (slot?.announced) {
        fail(request, "❌ This game is already announced — cancel it from the Games page.");
        continue;
      }
      state.slots = state.slots.filter((entry) => entry.slot_id !== request.slot_id);
      request.status = "done";
      request.result = { slot_id: request.slot_id ?? undefined };
      continue;
    }

    const gameTs = toInt(payload.game_timestamp) ?? 0;
    if (gameTs <= now) {
      fail(request, "❌ The game time has already passed — pick a later time.");
      continue;
    }
    const newHostId = str(payload.new_host_id);

    if (request.action === "update") {
      if (!slot) {
        fail(request, "❌ This game is no longer on the schedule.");
        continue;
      }
      const dayChanged = slot.week !== week || slot.day !== day;
      if (dayChanged && isLocked) {
        fail(request, `⛔ ${day} is locked by staff and cannot be scheduled.`);
        continue;
      }
      if (!(slot.announced || slot.thread_id)) {
        slot.mode = String(payload.mode);
        slot.add_on = str(payload.add_on);
        slot.announce_timestamp = toInt(payload.announce_timestamp);
        const groups = Array.isArray(payload.nation_locks) ? (payload.nation_locks as NationLockGroupPayload[]) : [];
        slot.locked_nations = groups.reduce((sum, group) => sum + group.nations.length, 0);
        slot.data = {
          ...slot.data,
          ...payload,
          ...demoDraftFields(payload.draft),
          locked_regions: groups.flatMap((group) => group.nations),
        };
      }
      slot.game_timestamp = gameTs;
      slot.data.game_timestamp = gameTs;
      slot.day = day;
      slot.week = week;
      if (newHostId && newHostId !== slot.host_id) {
        slot.host_id = newHostId;
        slot.host_username = demoHostName(newHostId);
      }
      request.status = "done";
      request.result = { slot_id: slot.slot_id, notified: slot.announced ? 3 : 0 };
      continue;
    }

    // create
    if (isLocked) {
      fail(request, `⛔ ${day} is locked by staff and cannot be scheduled.`);
      continue;
    }
    const groups = Array.isArray(payload.nation_locks) ? (payload.nation_locks as NationLockGroupPayload[]) : [];
    state.slots.push({
      slot_id: request.slot_id ?? crypto.randomBytes(16).toString("hex"),
      mode: String(payload.mode),
      host_id: request.host_id,
      host_username: demoHostName(request.host_id),
      game_timestamp: gameTs,
      announce_timestamp: toInt(payload.announce_timestamp),
      announced: false,
      status: "scheduled",
      add_on: str(payload.add_on),
      day,
      week,
      locked_nations: groups.reduce((sum, group) => sum + group.nations.length, 0),
      from_web: true,
      mine: true,
      thread_id: null,
      game_started: false,
      data: { ...payload, ...demoDraftFields(payload.draft), locked_regions: groups.flatMap((group) => group.nations) },
    });
    request.status = "done";
    request.result = { slot_id: request.slot_id ?? undefined };
  }
}

function publicSlot(slot: DemoSlot, viewerId: string): CalendarSlot {
  return {
    slot_id: slot.slot_id,
    mode: slot.mode,
    host_id: slot.host_id,
    host_username: slot.host_username,
    game_timestamp: slot.game_timestamp,
    announce_timestamp: slot.announce_timestamp,
    announced: slot.announced,
    status: slot.status,
    add_on: slot.add_on,
    day: slot.day,
    week: slot.week,
    locked_nations: slot.locked_nations,
    from_web: slot.from_web,
    mine: slot.host_id === viewerId,
    thread_id: slot.thread_id,
  };
}

function publicRequest(request: DemoRequest): ScheduleRequestStatus {
  // Drop the demo-only fields (host_id/payload) from the API response.
  const { request_id, action, slot_id, status, error, result, created_at, processed_at, preview, day_preview } =
    request;
  return { request_id, action, slot_id, status, error, result, created_at, processed_at, preview, day_preview };
}

// --- Public API -------------------------------------------------------------

export interface NewRequest {
  requestId: string;
  action: RequestAction;
  slotId: string | null;
  hostId: string;
  payload: Record<string, unknown> | null;
  /** The server it's for (default: the server the host pages are on). */
  guildId?: string;
}

/** The viewer's host-roster entry on a server (the current one by default). */
export async function getHostRosterEntry(userId: string, guildId?: string) {
  return mysqlHostRoster(userId, guildId ?? (await currentGuildId()));
}

/** The server a game belongs to (null when the game doesn't exist). */
export async function gameGuildOf(threadId: string): Promise<string | null> {
  if (isSchedulerDemo()) return HOME_GUILD_ID;
  const [rows] = await getPool().query<(RowDataPacket & { guild_id: string | null })[]>(
    "SELECT CAST(guild_id AS CHAR) AS guild_id FROM games WHERE thread_id = ?",
    [threadId],
  );
  if (!rows[0]) return null;
  return rows[0].guild_id ? String(rows[0].guild_id) : HOME_GUILD_ID;
}

/** The viewer's host-roster entry on one specific server (a game's server), or null.
 *  Preview mode: the demo host hosts everywhere. */
export async function hostEntryOn(userId: string, guildId: string) {
  if (isSchedulerDemo()) return { is_staff: DEMO_HOST.is_staff };
  const entry = await mysqlHostRoster(userId, guildId);
  return entry ? { is_staff: entry.is_staff } : null;
}

/** Every host a game can be handed over to (on the current server). */
export async function listHosts(): Promise<HostOption[]> {
  return isSchedulerDemo() ? DEMO_HOSTS : mysqlHosts(await currentGuildId());
}

/** Preview mode keeps one server's sample data: other servers start empty. */
async function demoOtherServer(): Promise<boolean> {
  return (await currentGuildId()) !== HOME_GUILD_ID;
}

export async function listCalendar(
  fromSec: number,
  toSec: number,
  viewerId: string,
): Promise<{ slots: CalendarSlot[]; locks: CalendarDayLock[] }> {
  if (!isSchedulerDemo()) return mysqlCalendar(fromSec, toSec, viewerId, await currentGuildId());
  if (await demoOtherServer()) return { slots: [], locks: [] };
  processDemoRequests();
  const state = demoState();
  return {
    slots: state.slots
      .filter((slot) => slot.game_timestamp >= fromSec && slot.game_timestamp <= toSec)
      .map((slot) => publicSlot(slot, viewerId))
      .sort((a, b) => a.game_timestamp - b.game_timestamp),
    locks: state.locks,
  };
}

/** A game with its editable settings and what may still change. */
export async function getSlotDetails(slotId: string, viewerId: string): Promise<SlotDetails | null> {
  if (!isSchedulerDemo()) {
    const details = await mysqlSlotDetails(slotId, viewerId, await currentGuildId());
    return details ? withCaptainNames(details) : null;
  }
  if (await demoOtherServer()) return null;
  processDemoRequests();
  const found = demoState().slots.find((entry) => entry.slot_id === slotId);
  if (!found) return null;
  const slot = publicSlot(found, viewerId);
  return withCaptainNames({
    slot,
    ...slotEditability(slot, Boolean(found.thread_id), found.game_started, Math.floor(Date.now() / 1000)),
    settings: settingsFromSlotData(found.data, found.game_timestamp),
  });
}

export async function listRequests(hostId: string, sinceSec: number) {
  if (!isSchedulerDemo()) return mysqlRequests(hostId, sinceSec, await currentGuildId());
  processDemoRequests();
  return demoState()
    .requests.filter(
      (request) =>
        request.host_id === hostId &&
        (request.status === "pending" || request.created_at >= sinceSec),
    )
    .sort((a, b) => b.created_at - a.created_at)
    .map(publicRequest);
}

export async function getRequest(requestId: string, hostId: string) {
  if (!isSchedulerDemo()) return mysqlRequest(requestId, hostId);
  processDemoRequests();
  const request = demoState().requests.find(
    (entry) => entry.request_id === requestId && entry.host_id === hostId,
  );
  return request ? publicRequest(request) : null;
}

/** A game start / end / cancel the bot hasn't finished yet. */
export interface InFlightLifecycle {
  request_id: string;
  action: "game_start" | "game_end" | "game_cancel";
  host_id: string;
  thread_id: string;
}

const LIFECYCLE_ACTIONS = ["game_start", "game_end", "game_cancel"] as const;

interface InFlightRow extends RowDataPacket {
  request_id: string;
  action: string;
  host_id: string;
  thread_id: string | null;
}

/** Start / end / cancel requests still queued or running (last hour). */
export async function listInFlightLifecycle(): Promise<InFlightLifecycle[]> {
  const since = Math.floor(Date.now() / 1000) - 3600;
  const asAction = (value: string) => LIFECYCLE_ACTIONS.find((action) => action === value) ?? null;
  if (isSchedulerDemo()) {
    processDemoRequests();
    return demoState().requests.flatMap((request) => {
      const action = asAction(request.action);
      const threadId = String(request.payload?.thread_id ?? "");
      return action && (request.status === "pending" || request.status === "running") && request.created_at >= since
        ? [{ request_id: request.request_id, action, host_id: request.host_id, thread_id: threadId }]
        : [];
    });
  }
  try {
    const [rows] = await getPool().query<InFlightRow[]>(
      `SELECT request_id, action, CAST(host_id AS CHAR) AS host_id,
              JSON_UNQUOTE(JSON_EXTRACT(payload, '$.thread_id')) AS thread_id
       FROM web_schedule_requests
       WHERE action IN (?) AND guild_id = ? AND status IN ('pending', 'running') AND created_at >= ?`,
      [[...LIFECYCLE_ACTIONS], await currentGuildId(), since],
    );
    return rows.flatMap((row) => {
      const action = asAction(row.action);
      return action && row.thread_id
        ? [{ request_id: row.request_id, action, host_id: row.host_id, thread_id: String(row.thread_id) }]
        : [];
    });
  } catch (error) {
    rethrowMissingTable(error);
  }
}

export async function countPendingRequests(hostId: string) {
  if (!isSchedulerDemo()) return mysqlPendingCount(hostId);
  return demoState().requests.filter(
    (request) => request.host_id === hostId && request.status === "pending",
  ).length;
}

export async function insertRequest(request: NewRequest): Promise<void> {
  if (!isSchedulerDemo()) return mysqlInsertRequest(request);
  const payload = request.payload ?? {};
  const isDay = request.action === "lock_day" || request.action === "unlock_day";
  const gameTs = toInt(payload.game_timestamp);
  demoState().requests.push({
    request_id: request.requestId,
    action: request.action,
    slot_id: request.slotId,
    status: "pending",
    error: null,
    result: null,
    created_at: Math.floor(Date.now() / 1000),
    processed_at: null,
    preview:
      !isDay && typeof payload.mode === "string" && gameTs !== null
        ? { mode: payload.mode, game_timestamp: gameTs }
        : null,
    day_preview: isDay ? { week: String(payload.week), day: String(payload.day) } : null,
    host_id: request.hostId,
    payload: request.payload,
  });
}
