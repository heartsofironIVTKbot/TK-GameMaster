/**
 * Web Attendance page shapes (GET /api/attendance/games[/id]) and the
 * attendance requests the bot applies (att_check / att_sample /
 * att_override / att_finalize — _process_web_attendance in bot.py.py).
 * Client-safe.
 */

/** Mirrors ATTENDANCE_SAMPLE_COUNT / ATTENDANCE_REQUIRED_PRESENT in bot.py.py. */
export const ATTENDANCE_SAMPLE_COUNT = 5;
export const ATTENDANCE_REQUIRED_PRESENT = 2;

/** Why a player did or didn't count in a voice scan (the bot's _scan_voice_states). */
export type VoiceState = "present" | "lobby" | "no_pass" | "no_voice" | "unknown" | "dropped";

export interface VoiceDetail {
  state: VoiceState;
  /** Voice channel name, when in one. */
  vc: string | null;
  /** Holds this game's Gamer Pass role. */
  pass: boolean;
  /** Discord status (online / idle / do not disturb / offline). */
  status: string;
}

export interface AttendanceSample {
  index: number;
  /** Epoch seconds. */
  ts: number;
  count: number;
  /** Taken early from the web ("Take sample now"). */
  manual: boolean;
  by_name: string | null;
  /** The live scan /game_end takes when it finalizes early. */
  final_bonus: boolean;
}

/** Participation DM reply: Yes / No (with the outcome the bot decided). */
export type Participation = "confirmed" | "dropped" | "declined" | "no_reply";

export type Verdict = "present" | "absent" | "excused";
/** Before finalize: where the player is heading. */
export type Projection = "present" | "at_risk" | "absent" | "excused";

export interface AttendanceOverride {
  verdict: Verdict;
  reason: string;
  by_name: string | null;
  /** Epoch seconds. */
  ts: number | null;
}

export interface AttendanceSlot {
  key: string;
  /** Pretty name ("Germany", "Italy (Co-op)", "Filler"). */
  label: string;
  /** No-show warnings this slot carries (0 = none in this logging mode). */
  penalty: number;
}

export interface AttendancePlayer {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  slots: AttendanceSlot[];
  late_join: boolean;
  vip: boolean;
  participation: Participation;
  drop_reason: string | null;
  /** Samples they were seen in. */
  hits: number;
  /** Per sample (in order): their state, or null when that sample has no detail. */
  samples: (VoiceState | null)[];
  /** The latest "Check voice now" result for them. */
  live: VoiceDetail | null;
  /** Finalized: the result. Before: the projection's verdict. */
  verdict: Verdict;
  projection: Projection | null;
  override: AttendanceOverride | null;
  /** No-show warnings this game gave them. */
  warnings_applied: number;
  /** No-show warnings they'd get if absent (0 for VIPs). */
  penalty: number;
  /** Chat log shows their country tag although they weren't counted. */
  chatlog_hint: { tag: string; nation: string } | null;
}

export interface AttendanceEvent {
  id: number;
  kind: string;
  user_id: string | null;
  user_name: string | null;
  actor_name: string | null;
  details: Record<string, unknown>;
  /** Epoch seconds. */
  created_at: number;
}

/** live = sampling · ending = game ended, finalize pending · finalized. */
export type AttendancePhase = "live" | "ending" | "finalized";

export interface AttendanceGameSummary {
  /** Stable id (the lobby thread) — used in URLs and the audit log. */
  id: string;
  name: string;
  mode: string;
  host_id: string | null;
  host_name: string | null;
  phase: AttendancePhase;
  /** Epoch seconds. */
  started_at: number | null;
  interval_minutes: number;
  samples_done: number;
  players: number;
  present: number;
  /** Players the host should look at (at risk / chat-log hints / no reply). */
  needs_review: number;
  logging_mode: string;
}

export interface AttendanceGame extends AttendanceGameSummary {
  sample_count: number;
  required: number;
  /** Epoch seconds the next sample is due (null when none is due). */
  next_sample_at: number | null;
  finalized_at: number | null;
  finalized_by: string | null;
  confident: boolean;
  early_ended: boolean;
  samples: AttendanceSample[];
  roster: AttendancePlayer[];
  live_check: { ts: number; by_name: string | null; in_voice: number } | null;
  events: AttendanceEvent[];
  /** The viewer is the game's host or staff (may change attendance). */
  can_edit: boolean;
}

/** Request payloads (POST /api/schedule/requests). */
export interface AttendanceGamePayload {
  game_id: string;
}
export interface AttendanceOverridePayload extends AttendanceGamePayload {
  user_id: string;
  /** "auto" (before finalize only) = back to the samples. */
  verdict: Verdict | "auto";
  reason: string;
}
