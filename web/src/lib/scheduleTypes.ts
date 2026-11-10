import type { CasinoConfig } from "@/lib/casinoSettings";
import type { HostBranch } from "@/lib/hostBranches";
import type { GameMessageProgress } from "@/lib/messageTypes";
import type { ModerationOutcome } from "@/lib/moderationTypes";
import type { PresetGroup, ResourceEntry } from "@/lib/presetTypes";
import type { RoleScanResult } from "@/lib/roleScanTypes";
import type { LockLevel, LoggingMode } from "@/lib/scheduleOptions";

/** Shared shapes for the host calendar API (client + server). */

/** The signed-in host, as the calendar pages see them. */
export interface HostProfile {
  discord_id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
  /** Host Management (and admins): day locks, other hosts' games. */
  is_staff: boolean;
  /** Senior Hosts + staff: give / take other hosts' Acclamations and Violations. */
  can_rate_hosts: boolean;
  /** Branches whose Acclamations / Violations they may give (staff: both; a Senior Host: their branch). */
  rate_branches: HostBranch[];
  /** Branches they host (RP → Roleplay games, HIST → Historical games; staff: both). */
  branches: HostBranch[];
  /** Game modes the server turned off in its settings (hidden on the calendar). */
  disabled_modes: string[];
  /**
   * How far ahead they may schedule, per branch, in days (null in a branch = no limit).
   * null = the weekly window: the server doesn't limit by rank (lib/bookingWindow.ts).
   */
  booking_days: Record<HostBranch, number | null> | null;
  /** The server the host pages are on (header server switcher). */
  guild_id: string;
  /** That server is TommyKay's (the home server): the Casino and Fortunes of War add-ons. */
  home_server: boolean;
  /** Every server the viewer hosts in (the switcher's list). */
  servers: HostServer[];
  /** Local preview mode (no database / Discord). */
  demo: boolean;
}

/** A server the viewer hosts in (multi-server). */
export interface HostServer {
  id: string;
  name: string;
  icon_url: string | null;
  is_staff: boolean;
  is_home: boolean;
}

/** A host the game can be handed over to. */
export interface HostOption {
  discord_id: string;
  username: string | null;
  display_name: string | null;
  /** Branches they can host (empty when the bot hasn't reported them yet = any). */
  branches: HostBranch[];
}

export type HostStatusResponse =
  | { status: "ok"; host: HostProfile }
  | { status: "anonymous" }
  | { status: "not_host"; username: string }
  | { status: "unavailable"; message: string };

/** One game on the schedule board (a schedule_slots row). */
export interface CalendarSlot {
  slot_id: string;
  mode: string;
  host_id: string;
  host_username: string | null;
  /** UTC unix seconds — the single source of truth for the game time. */
  game_timestamp: number;
  announce_timestamp: number | null;
  announced: boolean;
  /** scheduled | announced | cancelled | ended (bot lifecycle). */
  status: string | null;
  /** The host started the game (games.game_started): it's on-going until it ends. */
  started: boolean;
  add_on: string | null;
  /** Bot day/week the slot was booked under (host's calendar day). */
  day: string | null;
  week: string | null;
  locked_nations: number;
  from_web: boolean;
  mine: boolean;
  /** The game's reservation thread once announced (its Games page id). */
  thread_id: string | null;
}

/** A game on the Shared Calendar: day, time, mode and status only (no hosts or players). */
export interface SharedGame {
  id: string;
  guild_id: string;
  mode: string;
  game_timestamp: number;
  status: string | null;
  announced: boolean;
  started: boolean;
  add_on: string | null;
}

/** A server that shares its calendar. */
export interface SharedServer {
  id: string;
  name: string;
  icon_url: string | null;
  /** The server the viewer is working on. */
  is_yours: boolean;
}

export interface SharedCalendarResponse {
  /** The viewer's server shares its calendar (only then can its hosts see the others). */
  sharing: boolean;
  /** Host Management / admins of the viewer's server (they can turn sharing on). */
  can_enable: boolean;
  servers: SharedServer[];
  games: SharedGame[];
  server_time: number;
}

/** A staff day lock (/lock_day). */
export interface CalendarDayLock {
  week: string;
  day: string;
  reason: string | null;
}

/**
 * "confirm": the bot found warnings the host must accept (roster actions).
 * "running": a game start / end / cancel the bot is carrying out
 * (result.lifecycle has its progress so far).
 */
export type RequestState = "pending" | "running" | "done" | "error" | "confirm";

/** Progress of a game start / end / cancel (written by the bot as it goes). */
export interface LifecycleProgress {
  action: "game_start" | "game_end" | "game_cancel";
  state: "running" | "done" | "error";
  steps: { text: string; ts: number }[];
  started_at: number;
  finished_at?: number;
  title?: string;
  summary?: string;
  notes?: string[];
}

export type RequestAction =
  | "create"
  | "update"
  | "cancel"
  | "remove_slot"
  | "lock_day"
  | "unlock_day"
  | "roster_assign"
  | "roster_remove"
  | "casino_roll"
  | "casino_extra"
  | "casino_emergency_unreserve"
  | "fortunes_redraw"
  | "fortunes_reset"
  | "casino_fallback"
  | "moderation"
  | "dishonored"
  | "host_rating"
  | "att_check"
  | "att_sample"
  | "att_override"
  | "att_finalize"
  | "game_start"
  | "game_end"
  | "game_cancel"
  | "game_access"
  | "game_remind"
  | "game_resources"
  | "draft_join"
  | "draft_leave"
  | "draft_pick"
  | "draft_control"
  | "member_roles"
  | "role_scan"
  | "host_dm"
  | "game_message"
  | "game_log_analysis"
  | "hotjoin_request"
  | "hotjoin_cancel"
  | "hotjoin_decide"
  | "coop_request"
  | "coop_cancel"
  | "coop_decide"
  | "coop_kick"
  | "coop_promote"
  | "crash_report"
  | "feedback_rate"
  | "server_setup";

/** A queued web → bot request. */
export interface ScheduleRequestStatus {
  request_id: string;
  action: RequestAction;
  slot_id: string | null;
  status: RequestState;
  error: string | null;
  result: {
    slot_id?: string;
    notified?: number;
    /** Casino host tools: the player got their Casino link by DM. */
    dm_sent?: boolean;
    /** Roster actions: why the bot wants the host to confirm. */
    warnings?: string[];
    slot_key?: string;
    moved_from?: string | null;
    displaced?: string | null;
    removed?: string | null;
    /** Casino Emergency Unreserve: the nation the player left. */
    unreserved?: string;
    /** Database page: what the moderation engine did. */
    moderation?: ModerationOutcome;
    /** Attendance page: what the bot did (voice check / sample / override / finalize). */
    attendance?: ModerationOutcome;
    /** Games page: start / end / cancel progress and outcome. */
    lifecycle?: LifecycleProgress;
    /** Games page: what a reservation access change did. */
    access?: ModerationOutcome;
    /** Games page: who a reminder reached. */
    reminder?: ModerationOutcome;
    /** Games page: a game's rules / mods list after the change. */
    resources?: ModerationOutcome & { entries?: ResourceEntry[] };
    /** Draft games: what a join / pick / host draft action did. */
    draft?: ModerationOutcome;
    /** Database page role check (preview / apply); `state: "running"` while it works. */
    role_scan?: RoleScanResult | { state: "running"; applied: boolean; started_at: number };
    /** Database page DM / Games page message to players (progress while "running"). */
    message?: ModerationOutcome | GameMessageProgress;
    /** Games page AI chat-log analysis (`state: "running"` while the AI reads the log). */
    analysis?: ModerationOutcome | { state: "running"; started_at: number };
    /** Server setup "Create for me": the role / channel the bot made. */
    setup?: { title: string; summary: string; created: { id: string; name: string; kind: string } | null };
    /** Roster assign on a started game went through the late-join flow. */
    late_join?: boolean;
    /** Hot-join request / decision: where the request stands now. */
    hotjoin?: "pending" | "approved" | "declined" | "withdrawn" | "none";
    nation?: string;
    /** Crash report from the website: delivered, with the Merit it earned. */
    crash?: { merit: number; cooldown: boolean; verified: boolean };
  } | null;
  created_at: number;
  processed_at: number | null;
  /** Mode + time of a create/update request (pending chips on the calendar). */
  preview: { mode: string; game_timestamp: number } | null;
  /** Day of a lock_day / unlock_day request. */
  day_preview: { week: string; day: string } | null;
}

/**
 * What can still change on a scheduled game:
 *  - full       not announced yet: every setting
 *  - time_host  announced: day, time and host (players get a DM)
 *  - locked     started, ended, cancelled or in the past
 */
export type SlotEditability = "full" | "time_host" | "locked";

/** The settings the setup form edits (from the slot's stored document). */
export interface SlotSettings {
  mode: string;
  game_timestamp: number;
  announce_timestamp: number | null;
  logging_mode: string;
  add_on: string | null;
  fortunes_mode: string | null;
  major_lock_level: string;
  minor_lock_level: string;
  automated_unlock: boolean;
  automated_unlocks: Partial<
    Record<"major" | "minor", { target_level: string; unlock_timestamp: number }>
  >;
  automatic_reminder: boolean;
  scheduled_checksum: string | null;
  nation_locks: NationLockGroupPayload[];
  preset_id: string | null;
  preset_name: string | null;
  /** The game requires IronLegion (true / false); null or missing = the server's setting. */
  require_ironlegion?: boolean | null;
  /** A preset's own nation groups (playable ones), null = standard. */
  nation_layout: PresetGroup[] | null;
  rules: ResourceEntry[] | null;
  mods: ResourceEntry[] | null;
  draft: DraftSettings | null;
  casino_settings: CasinoConfig | null;
  co_hosts: string[];
}

export interface SlotDetails {
  slot: CalendarSlot;
  editable: SlotEditability;
  /** Why the game can't (fully) be edited. */
  reason: string | null;
  settings: SlotSettings;
}

export interface CalendarResponse {
  slots: CalendarSlot[];
  locks: CalendarDayLock[];
  requests: ScheduleRequestStatus[];
  server_time: number;
}

export interface NationLockGroupPayload {
  label: string;
  /** Bot reservation slot names (the same names /lock uses). */
  nations: string[];
  /** UTC unix seconds the group unlocks at; null = stays locked. */
  release_timestamp: number | null;
}

/** Body of a create request — mirrors the bot's /schedule fields. */
export interface SchedulePayload {
  mode: string;
  game_timestamp: number;
  /** Host's calendar day + Monday-ISO week (the bot's board grouping). */
  day: string;
  week: string;
  /** Host's IANA zone (audit trail only — the timestamp is already UTC). */
  timezone: string;
  logging_mode: LoggingMode;
  add_on: string | null;
  fortunes_mode: "casual" | "competitive" | null;
  major_lock_level: LockLevel;
  minor_lock_level: LockLevel;
  /** When the bot announces it (required for new games; null only on older games). */
  announce_timestamp: number | null;
  automated_unlock: boolean;
  automated_unlocks: Partial<
    Record<"major" | "minor", { target_level: LockLevel; unlock_timestamp: number }>
  >;
  automatic_reminder: boolean;
  scheduled_checksum: string | null;
  nation_locks: NationLockGroupPayload[];
  /** The preset it was set up from (copied in — later preset edits don't change the game). */
  preset_id: string | null;
  preset_name: string | null;
  /** The game requires IronLegion (true / false); null = the server's setting. */
  require_ironlegion: boolean | null;
  /** Custom nation groups; nations outside the turned-on groups aren't playable. null = standard. */
  nation_layout: PresetGroup[] | null;
  /** Rules / mods posted at the announcement; null = the mode's standard list. */
  rules: ResourceEntry[] | null;
  mods: ResourceEntry[] | null;
  /** Draft game: two teams (nation groups + a captain each) and the pick order; null = a normal game. */
  draft: DraftSettings | null;
  /** Casino games: the rooms, re-rolls and step-down, in the Casino's format; null for other games. */
  casino_settings: CasinoConfig | null;
  /** Casino / Fortunes games: hosts who help run it (Discord ids); empty for other games. */
  co_hosts: string[];
}

export interface DraftTeamSettings {
  name: string;
  /** Nation groups this team drafts from (the preset's groups or the mode's). */
  groups: string[];
  captain_id: string;
  /** Display only (the form shows who the captain is). */
  captain_name?: string | null;
}

export interface DraftSettings {
  teams: DraftTeamSettings[];
  /** Coin toss decides who opens (with 3 picks); off = first_picker opens with 1. */
  coin_flip: boolean;
  /** Team index (0 / 1) that picks first when there's no coin toss. */
  first_picker: number | null;
}

/** Body of an announced-game edit: only the time (and day) can change. */
export interface TimeEditPayload {
  game_timestamp: number;
  day: string;
  week: string;
  timezone: string;
}

/** Body of a lock_day / unlock_day request. */
export interface DayLockPayload {
  week: string;
  day: string;
  reason: string | null;
}

/** Live map host tools: what a dropped player becomes. */
export type RosterSlotKind = "nation" | "coop" | "filler";

/**
 * Put a player on a nation / co-op / filler slot (formerly /add, /add_coop,
 * /add_filler). A taken nation needs `occupied`: "swap" gives the other
 * player the mover's old slot, "replace" removes them.
 */
export interface RosterAssignPayload {
  thread_id: string;
  user_id: string;
  kind: RosterSlotKind;
  /** Nation slot name (the main nation for a co-op). */
  nation: string | null;
  filler_name: string | null;
  occupied: "swap" | "replace" | null;
  /** Accept the warnings the bot answered with ("confirm"). */
  force: boolean;
  /** DM the players this changes (Host Tool → Notify players). Missing = on. */
  notify?: boolean;
  /** The map nation's tag: the website turns the map's name into the bot's (lib/botNation.ts). */
  tag?: string | null;
  /** Host Tool "Keep players where I put them": they can't change it themselves until a host does (else 30 s). */
  lock?: boolean;
}

/** Take a player off a game (formerly /remove). */
export interface RosterRemovePayload {
  thread_id: string;
  user_id: string;
  /** DM the removed player. Missing = on. */
  notify?: boolean;
}

/**
 * Casino games' Host Tool (docs/casino-integration.md, step 5): "casino_roll"
 * gives a player without a nation a whole new roll; "casino_extra" gives a
 * player with one more rolls for some rooms. The bot DMs them a Casino link.
 */
export interface CasinoGrantPayload {
  thread_id: string;
  user_id: string;
  /** casino_extra: the rooms (ideology, path, doctrine, build, achievements). */
  rooms: string[];
  /** casino_extra: rolls per room, 1–10. */
  count: number;
  /** Accept the warnings the bot answered with ("confirm"). */
  force: boolean;
  notify?: boolean;
}

/** A server member, from the bot-mirrored member directory. */
export interface DirectoryMember {
  discord_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  /** Steam verified via LegionMaster (or a role that bypasses it). */
  verified: boolean;
  is_vip: boolean;
  ingame_nickname: string | null;
}
