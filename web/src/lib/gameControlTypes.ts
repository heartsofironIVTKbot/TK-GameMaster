/**
 * Games page shapes (GET /api/control/games[/id]) and the start / end /
 * cancel requests the bot carries out (_process_web_game_lifecycle in
 * bot.py.py — formerly /game_start, /game_end and /game_cancel). Client-safe.
 */
import type { GameAiAnalysis, GameChatLog } from "@/lib/aiAnalysisTypes";
import type { LobbyDraft } from "@/lib/draft";
import type { HotJoinRequestView } from "@/lib/hotJoinTypes";
import type { GameMessageEntry, GameMessageRecipient } from "@/lib/messageTypes";
import type { ResourceEntry } from "@/lib/presetTypes";

/** Mirrors GAME_START_INTERVALS in bot.py.py (minutes between attendance samples). */
export const GAME_START_INTERVALS = [20, 30, 40] as const;
export type GameStartInterval = (typeof GAME_START_INTERVALS)[number];

export type LifecycleAction = "game_start" | "game_end" | "game_cancel";

/**
 * announced  open for reservations, not started
 * starting   the bot is starting it (or a start was cut off — retry after 10 min)
 * live       started
 * ending     ending (or an end was cut off — End again finishes it)
 * ended / cancelled
 */
export type GamePhase = "announced" | "starting" | "live" | "ending" | "ended" | "cancelled";

export interface GameControlPlayer {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  /** Pretty slot name ("Germany", "Italy (Co-op)", "Filler"). */
  slot: string;
  /** Answered the participation DM (started games only; null before the start). */
  confirmed: boolean | null;
}

export interface GameInFlight {
  request_id: string;
  action: LifecycleAction;
  /** Sent by the viewer (only they can follow its progress). */
  mine: boolean;
}

export interface GameControlSummary {
  /** Stable id (the announcement post; older games: the reservation thread) — used in URLs and requests. */
  id: string;
  name: string;
  mode: string;
  host_id: string | null;
  host_name: string | null;
  phase: GamePhase;
  /** Scheduled start (epoch seconds). */
  scheduled_at: number | null;
  started_at: number | null;
  players: number;
  mine: boolean;
  in_flight: LifecycleAction | null;
}

export interface GameControl extends GameControlSummary {
  /** The bot's key for the game. */
  storage_key: string;
  logging_mode: string;
  add_on: string | null;
  ended_at: number | null;
  cancelled_at: number | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  interval_minutes: number | null;
  /** Attendance so far (started games). */
  samples_done: number;
  present: number;
  roster: GameControlPlayer[];
  /** Draft games: teams, turn, the pool (with notes — hosts only); it must be done before the start. */
  draft: GameDraft | null;
  /** Prefilled into the start form. */
  scheduled_checksum: string | null;
  /** The game in Discord: its announcement post (an older game's reservation thread until it ends). */
  discord_url: string | null;
  /** An older game with a reservation thread (newer games have only the announcement post). */
  has_thread: boolean;
  /** The viewer is the game's host or Host Management. */
  can_manage: boolean;
  in_flight_request: GameInFlight | null;
  /** Who may reserve (formerly /lock, /unlock, /lockdown, /nation_lock). */
  access: GameAccess;
  /** The mode's nation names (null until the bot has published them). */
  nations: { majors: string[]; minors: string[] } | null;
  /** Reminder DMs (formerly /remind). */
  reminders: GameReminders;
  /** The preset it was set up from (copied in when it was scheduled), or null. */
  preset: GamePresetInfo | null;
  /** Its public mods and rules posts (formerly /post_mods, /post_rules). */
  resources: GameResources;
  /** Who a message to the players can reach (formerly /dm_participants). */
  message_recipients: GameMessageRecipient[];
  /** Messages sent to its players, newest first (last 5). */
  messages: GameMessageEntry[];
  /** The uploaded chat log (.txt), or null. */
  chat_log: GameChatLog | null;
  /** The latest AI chat-log analysis, or null. */
  ai_analysis: GameAiAnalysis | null;
  /** Hot-join requests from the map (running games), waiting ones first. */
  hotjoin: HotJoinRequestView[];
}

export interface GameDraft extends LobbyDraft {
  complete: boolean;
  pool_left: number;
  /** user id → note left when joining the pool. */
  notes: Record<string, string>;
}

export interface GamePresetInfo {
  name: string | null;
  /** The preset's playable groups (null = the mode's standard groups). */
  groups: { name: string; count: number }[] | null;
  /** Nations its groups leave out — hidden and locked for good. */
  not_playable: string[];
}

export interface GameResources {
  mods: ResourceEntry[];
  rules: ResourceEntry[];
  /** Casino / All Add-ons game (the casino rules belong on the list). */
  casino: boolean;
}

/** POST /api/schedule/requests {action: "game_resources"} (bot: _process_web_game_resources). */
export interface GameResourcesPayload {
  thread_id: string;
  resource: "mods" | "rules";
  /** The whole new list, in order. */
  entries: ResourceEntry[];
}

export type ReminderKind = "early" | "late";

export interface GameReminders {
  /** The automatic one-hour reminder is switched on for this game. */
  automatic: boolean;
  /** When it went out (or an early reminder replaced it). */
  automatic_sent_at: number | null;
  last: { kind: ReminderKind; ts: number; by_name: string | null; sent: number; failed: number } | null;
}

/** POST /api/schedule/requests {action: "game_remind"} (bot: _process_web_game_remind). */
export interface GameRemindPayload {
  thread_id: string;
  kind: ReminderKind;
}

/** Mirrors WEB_ACCESS_LEVELS in bot.py.py ("All Users" = everyone). */
export const ACCESS_LEVELS = ["VIP", "Trusted", "Verified", "All Users"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export interface GameAccess {
  major_level: AccessLevel;
  minor_level: AccessLevel;
  /** Public reservations blocked (host tools still work). */
  lockdown: boolean;
  /** Nations nobody can reserve. */
  locked_nations: string[];
}

export type GameAccessOp = "levels" | "lockdown" | "nation_lock" | "nation_unlock" | "clear";

/** POST /api/schedule/requests {action: "game_access"} (bot: _process_web_game_access). */
export interface GameAccessPayload {
  thread_id: string;
  op: GameAccessOp;
  major_level?: AccessLevel;
  minor_level?: AccessLevel;
  enabled?: boolean;
  nation?: string;
}

/** Request payloads (POST /api/schedule/requests). */
export interface GameStartPayload {
  thread_id: string;
  /** In-game server id. */
  server_id: string;
  password: string;
  checksum: string;
  interval_minutes: GameStartInterval;
}
export interface GameEndPayload {
  thread_id: string;
}
export interface GameCancelPayload {
  thread_id: string;
  reason: string;
}
