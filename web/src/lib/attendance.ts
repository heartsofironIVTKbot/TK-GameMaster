import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, currentGuildId } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { lookupMembers } from "@/lib/memberDirectory";
import { prettySlot } from "@/lib/playerProfile";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import type { DirectoryMember, HostProfile } from "@/lib/scheduleTypes";
import { demoAttendanceRaw } from "@/lib/attendanceDemo";
import {
  ATTENDANCE_REQUIRED_PRESENT,
  ATTENDANCE_SAMPLE_COUNT,
  type AttendanceGame,
  type AttendanceGameSummary,
  type AttendancePhase,
  type AttendancePlayer,
  type Participation,
  type Projection,
  type Verdict,
  type VoiceDetail,
  type VoiceState,
} from "@/lib/attendanceTypes";

/**
 * Web Attendance page data. Everything comes from what the bot already
 * keeps: the `games` row (game_data JSON: samples, participation, overrides,
 * finalize results), `game_reservations` (who holds which slot) and the
 * `attendance_events` audit table. The projection rules mirror the bot's
 * _finalize_attendance_results so the page shows what finalize will do.
 * One server at a time (multi-server): the server the host pages work on.
 */

/** A game as the bot stores it (game_data parsed with snowflakes kept as text). */
export interface RawAttendanceGame {
  storage_key: string;
  mode: string | null;
  status: string | null;
  thread_name: string | null;
  host_id: string | null;
  /** The game's Discord server (games.guild_id; home when not stored). */
  guild_id?: string;
  /** Scheduled start (the games.start_timestamp column). */
  start_timestamp?: number | null;
  data: Record<string, unknown>;
  /** slot_key → Discord id */
  reservations: Record<string, string>;
}

export interface RawAttendanceEvent {
  id: number;
  kind: string;
  user_id: string | null;
  actor_id: string | null;
  details: Record<string, unknown>;
  created_at: number;
}

/**
 * JSON.parse that keeps 16+ digit integers (Discord ids) exact by reading
 * them as strings. Only touches numbers outside string literals.
 */
export function parseBigJson(text: string): unknown {
  let out = "";
  let inString = false;
  let escaped = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === "-") {
      let j = i + 1;
      while (j < text.length && /[0-9.eE+-]/.test(text[j])) j += 1;
      const token = text.slice(i, j);
      out += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return JSON.parse(out);
}

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const idList = (value: unknown): string[] => arr(value).map(String).filter((id) => /^\d{5,25}$/.test(id));
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const VOICE_STATES: VoiceState[] = ["present", "lobby", "no_pass", "no_voice", "unknown", "dropped"];
const voiceState = (value: unknown): VoiceState | null =>
  VOICE_STATES.find((state) => state === value) ?? null;

function voiceDetail(value: unknown): VoiceDetail | null {
  const raw = obj(value);
  const state = voiceState(raw.state);
  if (!state) return null;
  return {
    state,
    vc: typeof raw.vc === "string" ? raw.vc : null,
    pass: Boolean(raw.pass),
    status: typeof raw.status === "string" ? raw.status : "unknown",
  };
}

export function stableId(raw: RawAttendanceGame): string {
  return String(raw.data.lobby_thread_id || raw.data.original_thread_id || raw.storage_key);
}

function phaseOf(raw: RawAttendanceGame): AttendancePhase {
  if (raw.data.snapshot_done) return "finalized";
  if (raw.status === "ended" || raw.status === "cancelled") return "ending";
  return "live";
}

function nameOf(names: Map<string, DirectoryMember>, id: string | null): string | null {
  if (!id) return null;
  const member = names.get(id);
  return member ? member.ingame_nickname || member.display_name || member.username || `#${id}` : `#${id}`;
}

interface Computed {
  summary: AttendanceGameSummary;
  roster: AttendancePlayer[];
  nextSampleAt: number | null;
}

function compute(raw: RawAttendanceGame, names: Map<string, DirectoryMember>, nowSec: number): Computed {
  const data = raw.data;
  const phase = phaseOf(raw);
  const finalized = phase === "finalized";
  const samples = arr(data.presence_snapshots).map(obj);
  const sampleSets = samples.map((sample) => new Set(idList(sample.present_ids)));
  const present = new Set(idList(data.present_ids));
  const dropped = new Set(idList(data.dropped_out));
  const confirmed = new Set(idList(data.confirmed_ids));
  const declined = new Set(idList(data.declined_ids));
  const dropReasons = obj(data.drop_reasons);
  const overrides = obj(data.attendance_overrides);
  const storedHits = obj(data.presence_hit_counts);
  const penalties = obj(data.attendance_penalties);
  const vipIds = new Set(idList(data.attendance_vip_ids));
  const applied = obj(data.applied_warns);
  const lateJoin = new Set(arr(data.late_join_nations).map(String));
  const hints = new Map(
    arr(data.attendance_log_suggestions).map((entry) => {
      const hint = obj(entry);
      return [String(hint.user_id), { tag: String(hint.tag ?? ""), nation: String(hint.nation ?? "") }] as const;
    }),
  );
  const liveCheck = obj(data.attendance_live_check);
  const livePlayers = obj(liveCheck.players);
  const remaining = Math.max(0, ATTENDANCE_SAMPLE_COUNT - samples.length);

  const slotsByUser = new Map<string, string[]>();
  for (const [slot, userId] of Object.entries(raw.reservations)) {
    if (!/^\d{5,25}$/.test(userId)) continue;
    slotsByUser.set(userId, [...(slotsByUser.get(userId) ?? []), slot]);
  }

  const roster: AttendancePlayer[] = [];
  for (const [userId, slots] of slotsByUser) {
    const hits =
      finalized && storedHits[userId] !== undefined
        ? num(storedHits[userId])
        : sampleSets.filter((set) => set.has(userId)).length;
    const perSample = samples.map((sample, index) => {
      const detail = voiceState(obj(obj(sample.states)[userId]).state);
      return detail ?? (sampleSets[index].has(userId) ? "present" : null);
    });
    const rawOverride = obj(overrides[userId]);
    const overrideVerdict = (["present", "absent", "excused"] as const).find((v) => v === rawOverride.verdict) ?? null;
    const participation: Participation = confirmed.has(userId)
      ? "confirmed"
      : dropped.has(userId)
        ? "dropped"
        : declined.has(userId)
          ? "declined"
          : "no_reply";

    let verdict: Verdict;
    let projection: Projection | null = null;
    if (finalized) {
      verdict =
        overrideVerdict === "excused" || (dropped.has(userId) && !present.has(userId))
          ? "excused"
          : present.has(userId)
            ? "present"
            : "absent";
    } else if (overrideVerdict) {
      verdict = overrideVerdict;
      projection = overrideVerdict;
    } else if (dropped.has(userId)) {
      verdict = "excused";
      projection = "excused";
    } else if (present.has(userId) || hits >= ATTENDANCE_REQUIRED_PRESENT) {
      verdict = "present";
      projection = "present";
    } else {
      verdict = "absent";
      projection = hits + remaining >= ATTENDANCE_REQUIRED_PRESENT && phase === "live" ? "at_risk" : "absent";
    }

    const vip = vipIds.has(userId);
    const penalty = vip ? 0 : slots.reduce((sum, slot) => sum + (penalties[slot] === undefined ? 1 : num(penalties[slot])), 0);
    const member = names.get(userId);
    const hint = hints.get(userId);
    roster.push({
      user_id: userId,
      name: nameOf(names, userId) ?? `#${userId}`,
      username: member?.username ?? null,
      avatar_url: member?.avatar_url ?? null,
      slots: slots.map((key) => ({
        key,
        label: prettySlot(key),
        penalty: vip ? 0 : penalties[key] === undefined ? 1 : num(penalties[key]),
      })),
      late_join: slots.some((slot) => lateJoin.has(slot)),
      vip,
      participation,
      drop_reason: typeof dropReasons[userId] === "string" ? (dropReasons[userId] as string) : null,
      hits,
      samples: perSample,
      live: voiceDetail(livePlayers[userId]),
      verdict,
      projection,
      override: overrideVerdict
        ? {
            verdict: overrideVerdict,
            reason: String(rawOverride.reason ?? ""),
            by_name: nameOf(names, rawOverride.by ? String(rawOverride.by) : null),
            ts: rawOverride.ts ? num(rawOverride.ts) : null,
          }
        : null,
      warnings_applied: num(applied[userId]),
      penalty,
      chatlog_hint: hint && verdict !== "present" ? hint : null,
    });
  }
  const order: Record<Verdict, number> = { absent: 0, present: 2, excused: 3 };
  roster.sort(
    (a, b) =>
      (a.projection === "at_risk" ? -1 : order[a.verdict]) - (b.projection === "at_risk" ? -1 : order[b.verdict]) ||
      a.slots[0].label.localeCompare(b.slots[0].label),
  );

  const interval = num(data.snapshot_interval_minutes) || 20;
  const startedAt = num(data.game_started_at) || null;
  const lastTs = samples.length ? num(samples[samples.length - 1].ts) : startedAt;
  const nextSampleAt = phase === "live" && remaining > 0 && lastTs ? lastTs + interval * 60 : null;
  const presentCount = roster.filter((player) => player.verdict === "present").length;
  const needsReview = roster.filter(
    (player) => player.projection === "at_risk" || (player.chatlog_hint !== null && player.verdict !== "present"),
  ).length;
  void nowSec;

  return {
    roster,
    nextSampleAt,
    summary: {
      id: stableId(raw),
      name: (raw.thread_name || `Game ${stableId(raw)}`).replace(/\s*Reservations\s*$/i, ""),
      mode: raw.mode || "Unknown",
      host_id: raw.host_id,
      host_name: nameOf(names, raw.host_id),
      phase,
      started_at: startedAt,
      interval_minutes: interval,
      samples_done: samples.length,
      players: roster.length,
      present: presentCount,
      needs_review: needsReview,
      logging_mode: String(data.logging_mode || "Strict"),
    },
  };
}

function idsToName(raw: RawAttendanceGame, events: RawAttendanceEvent[] = []): string[] {
  const data = raw.data;
  const overrides = obj(data.attendance_overrides);
  return [
    ...Object.values(raw.reservations),
    raw.host_id ?? "",
    ...Object.values(overrides).map((entry) => String(obj(entry).by ?? "")),
    ...arr(data.presence_snapshots).map((sample) => String(obj(sample).by ?? "")),
    String(obj(data.attendance_live_check).by ?? ""),
    ...events.flatMap((event) => [event.user_id ?? "", event.actor_id ?? ""]),
  ].filter((id) => /^\d{5,25}$/.test(id));
}

export function buildSummary(raw: RawAttendanceGame, names: Map<string, DirectoryMember>, nowSec: number): AttendanceGameSummary {
  return compute(raw, names, nowSec).summary;
}

export function buildAttendanceGame(
  raw: RawAttendanceGame,
  events: RawAttendanceEvent[],
  names: Map<string, DirectoryMember>,
  viewer: HostProfile,
  nowSec: number,
): AttendanceGame {
  const { summary, roster, nextSampleAt } = compute(raw, names, nowSec);
  const data = raw.data;
  const liveCheck = obj(data.attendance_live_check);
  const livePlayers = Object.values(obj(liveCheck.players));
  return {
    ...summary,
    sample_count: ATTENDANCE_SAMPLE_COUNT,
    required: ATTENDANCE_REQUIRED_PRESENT,
    next_sample_at: nextSampleAt,
    finalized_at: num(data.attendance_finalized_at) || null,
    finalized_by:
      data.attendance_finalized_by && data.attendance_finalized_by !== "auto"
        ? nameOf(names, String(data.attendance_finalized_by))
        : data.snapshot_done
          ? "Automatic"
          : null,
    confident: data.attendance_confident === undefined ? true : Boolean(data.attendance_confident),
    early_ended: Boolean(data.attendance_early_ended),
    samples: arr(data.presence_snapshots).map((entry, index) => {
      const sample = obj(entry);
      return {
        index: num(sample.index) || index + 1,
        ts: num(sample.ts),
        count: num(sample.count),
        manual: Boolean(sample.manual),
        by_name: sample.by ? nameOf(names, String(sample.by)) : null,
        final_bonus: Boolean(sample.final_bonus),
      };
    }),
    roster,
    live_check: liveCheck.ts
      ? {
          ts: num(liveCheck.ts),
          by_name: nameOf(names, liveCheck.by ? String(liveCheck.by) : null),
          in_voice: livePlayers.filter((detail) => obj(detail).state === "present").length,
        }
      : null,
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      user_id: event.user_id,
      user_name: nameOf(names, event.user_id),
      actor_name: nameOf(names, event.actor_id),
      details: event.details,
      created_at: event.created_at,
    })),
    can_edit: viewer.is_staff || viewer.discord_id === raw.host_id,
  };
}

// --- MySQL --------------------------------------------------------------------

export interface GameRow extends RowDataPacket {
  thread_id: string;
  mode: string | null;
  status: string | null;
  thread_name: string | null;
  host_id: string | null;
  guild_id: string | null;
  start_timestamp: number | string | null;
  game_data_text: string | null;
}

interface SlotRow extends RowDataPacket {
  thread_id: string;
  slot_key: string;
  user_id: string;
}

interface EventRow extends RowDataPacket {
  id: number;
  kind: string;
  user_id: string | null;
  actor_id: string | null;
  details_text: string | null;
  created_at: number;
}

export const GAME_COLUMNS = `thread_id, mode, status, thread_name, CAST(host_id AS CHAR) AS host_id,
  CAST(guild_id AS CHAR) AS guild_id, start_timestamp, CAST(game_data AS CHAR) AS game_data_text`;

function parseData(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    return obj(parseBigJson(text));
  } catch {
    return {};
  }
}

/** `games` rows → raw games with their reservations (one extra query). */
export async function rawGames(rows: GameRow[]): Promise<RawAttendanceGame[]> {
  if (rows.length === 0) return [];
  const [slots] = await getPool().query<SlotRow[]>(
    `SELECT thread_id, slot_key, CAST(user_id AS CHAR) AS user_id FROM game_reservations WHERE thread_id IN (?)`,
    [rows.map((row) => row.thread_id)],
  );
  return rows.map((row) => ({
    storage_key: String(row.thread_id),
    mode: row.mode,
    status: row.status,
    thread_name: row.thread_name,
    host_id: row.host_id,
    guild_id: row.guild_id ? String(row.guild_id) : HOME_GUILD_ID,
    start_timestamp: row.start_timestamp === null ? null : num(row.start_timestamp) || null,
    data: parseData(row.game_data_text),
    reservations: Object.fromEntries(
      slots.filter((slot) => String(slot.thread_id) === String(row.thread_id)).map((slot) => [slot.slot_key, String(slot.user_id)]),
    ),
  }));
}

async function attendanceEvents(gameId: string): Promise<RawAttendanceEvent[]> {
  try {
    const [rows] = await getPool().query<EventRow[]>(
      `SELECT id, kind, CAST(user_id AS CHAR) AS user_id, CAST(actor_id AS CHAR) AS actor_id,
              CAST(details AS CHAR) AS details_text, created_at
       FROM attendance_events WHERE game_id = ? ORDER BY created_at DESC, id DESC LIMIT 300`,
      [gameId],
    );
    return rows.map((row) => ({
      id: num(row.id),
      kind: row.kind,
      user_id: row.user_id,
      actor_id: row.actor_id,
      details: parseData(row.details_text),
      created_at: num(row.created_at),
    }));
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

/** Started games on a server, newest first (live and recently finished). */
export async function listAttendanceGames(guildId?: string): Promise<AttendanceGameSummary[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const guild = guildId ?? (await currentGuildId());
  let raws: RawAttendanceGame[];
  if (isSchedulerDemo()) {
    // The sample games belong to the home server; other sample servers have none.
    raws =
      guild === HOME_GUILD_ID
        ? demoAttendanceRaw()
            .map((entry) => entry.game)
            .filter((game) => game.status !== "cancelled")
        : [];
  } else {
    const [rows] = await getPool().query<GameRow[]>(
      `SELECT ${GAME_COLUMNS} FROM games
       WHERE guild_id = ? AND game_started = 1 AND (status IS NULL OR status <> 'cancelled')
       ORDER BY updated_at DESC LIMIT 40`,
      [guild],
    );
    raws = await rawGames(rows);
  }
  const names = await lookupMembers(raws.flatMap((raw) => idsToName(raw)), guild);
  return raws
    .map((raw) => buildSummary(raw, names, nowSec))
    .sort((a, b) => Number(a.phase === "finalized") - Number(b.phase === "finalized") || (b.started_at ?? 0) - (a.started_at ?? 0));
}

/** One game's full attendance record, by stable id or storage key. */
export async function getAttendanceGame(gameId: string, viewer: HostProfile): Promise<AttendanceGame | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  let raw: RawAttendanceGame | undefined;
  let events: RawAttendanceEvent[] = [];
  // Only the viewer's current server's games (an id from another server is "not found").
  const guild = viewer.guild_id;
  if (isSchedulerDemo()) {
    const entry =
      guild === HOME_GUILD_ID
        ? demoAttendanceRaw().find((item) => stableId(item.game) === gameId || item.game.storage_key === gameId)
        : undefined;
    raw = entry?.game;
    events = entry?.events ?? [];
  } else {
    const [rows] = await getPool().query<GameRow[]>(
      `SELECT ${GAME_COLUMNS} FROM games
       WHERE guild_id = ? AND (thread_id = ?
          OR JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.lobby_thread_id')) = ?
          OR JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.original_thread_id')) = ?)
       ORDER BY (thread_id = ?) DESC LIMIT 1`,
      [guild, gameId, gameId, gameId, gameId],
    );
    raw = (await rawGames(rows))[0];
    if (raw) events = await attendanceEvents(stableId(raw));
  }
  if (!raw || !raw.data.game_started) return null;
  const names = await lookupMembers(idsToName(raw, events), guild);
  return buildAttendanceGame(raw, events, names, viewer, nowSec);
}
