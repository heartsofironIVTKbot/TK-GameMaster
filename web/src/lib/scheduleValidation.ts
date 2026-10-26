import {
  ADD_ON_VALUES,
  LOCK_LEVEL_RANK,
  MAX_LOCK_GROUPS,
  MAX_LOCKED_NATIONS,
  SCHEDULE_MODE_VALUES,
  addOnOption,
  isLockLevel,
  lockLevelLabel,
  type LockLevel,
} from "@/lib/scheduleOptions";
import type {
  DayLockPayload,
  DraftSettings,
  DraftTeamSettings,
  NationLockGroupPayload,
  RosterAssignPayload,
  RosterRemovePayload,
  SchedulePayload,
  TimeEditPayload,
} from "@/lib/scheduleTypes";
import {
  DAY_NAMES,
  dateInZone,
  isIsoDate,
  isValidTimeZone,
  mondayOf,
  weekdayName,
} from "@/lib/timeEngine";
import { PRESET_LIMITS } from "@/lib/presetTypes";
import { validateLayout, validateResourceList } from "@/lib/presetValidation";

const PRESET_ID_RE = /^[0-9a-f]{32}$/;

/**
 * Validation for a create request, shared by the setup page (live issue
 * list) and POST /api/schedule/requests. The bot re-checks everything that
 * depends on Discord state (host roles, staff day locks) when it applies
 * the request.
 */

export type IssueSection = "game" | "announce" | "access" | "nations" | "extras";

export interface ValidationIssue {
  section: IssueSection;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: SchedulePayload }
  | { ok: false; issues: ValidationIssue[] };

/** How far ahead a game may be booked (the bot's window is ≤ 3 weeks). */
export const MAX_BOOKING_AHEAD_SEC = 22 * 86_400;

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function asRecord(raw: unknown): Record<string, unknown> {
  return (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
}

function isBoardDay(day: string, week: string): boolean {
  return (DAY_NAMES as readonly string[]).includes(day) && isIsoDate(week) && mondayOf(week) === week;
}

/** Game time + the board day/week it belongs to (host's calendar day). */
function checkTime(
  input: Record<string, unknown>,
  nowSec: number,
  issue: (section: IssueSection, message: string) => void,
): TimeEditPayload {
  const timezone = typeof input.timezone === "string" ? input.timezone : "";
  if (!timezone || !isValidTimeZone(timezone)) issue("game", "Pick a valid time zone.");

  const gameTs = input.game_timestamp;
  let gameOk = false;
  if (!isInt(gameTs)) {
    issue("game", "Pick a game time.");
  } else if (gameTs <= nowSec + 60) {
    issue("game", "The game time is in the past — pick a later time.");
  } else if (gameTs > nowSec + MAX_BOOKING_AHEAD_SEC) {
    issue("game", "Games can only be booked up to three weeks ahead.");
  } else {
    gameOk = true;
  }

  const day = typeof input.day === "string" ? input.day : "";
  const week = typeof input.week === "string" ? input.week : "";
  if (!isBoardDay(day, week)) {
    issue("game", "Invalid calendar day.");
  } else if (gameOk && timezone && isValidTimeZone(timezone)) {
    // The board day must be the host's calendar day of the game time.
    const localDate = dateInZone((gameTs as number) * 1000, timezone);
    if (weekdayName(localDate) !== day || mondayOf(localDate) !== week) {
      issue("game", "The calendar day does not match the game time.");
    }
  }
  return { game_timestamp: gameTs as number, day, week, timezone };
}

/** Announced games: only the day and time change (plus an optional host). */
export function validateTimeEdit(
  raw: unknown,
  nowSec: number,
): { ok: true; value: TimeEditPayload } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const value = checkTime(asRecord(raw), nowSec, (section, message) => issues.push({ section, message }));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

const THREAD_ID_RE = /^\d{10,25}$/;
const SNOWFLAKE_RE = /^\d{5,25}$/;

/** Live map host tools: a roster_assign body, or null when malformed. */
export function validateRosterAssign(raw: unknown): RosterAssignPayload | null {
  const input = asRecord(raw);
  const threadId = typeof input.thread_id === "string" ? input.thread_id : "";
  const userId = typeof input.user_id === "string" ? input.user_id : "";
  const kind = input.kind;
  if (!THREAD_ID_RE.test(threadId) || !SNOWFLAKE_RE.test(userId)) return null;
  if (kind !== "nation" && kind !== "coop" && kind !== "filler") return null;
  const nation = typeof input.nation === "string" ? input.nation.trim().slice(0, 128) : "";
  const fillerName = typeof input.filler_name === "string" ? input.filler_name.trim().slice(0, 40) : "";
  if (kind !== "filler" && !nation) return null;
  if (kind === "filler" && !fillerName) return null;
  const occupied = input.occupied === "swap" || input.occupied === "replace" ? input.occupied : null;
  return {
    thread_id: threadId,
    user_id: userId,
    kind,
    nation: kind === "filler" ? null : nation,
    filler_name: kind === "filler" ? fillerName : null,
    occupied,
    force: input.force === true,
    notify: input.notify !== false,
  };
}

/** Live map host tools: a roster_remove body, or null when malformed. */
export function validateRosterRemove(raw: unknown): RosterRemovePayload | null {
  const input = asRecord(raw);
  const threadId = typeof input.thread_id === "string" ? input.thread_id : "";
  const userId = typeof input.user_id === "string" ? input.user_id : "";
  if (!THREAD_ID_RE.test(threadId) || !SNOWFLAKE_RE.test(userId)) return null;
  return { thread_id: threadId, user_id: userId, notify: input.notify !== false };
}

/** Staff day lock / unlock request body. */
export function validateDayLock(raw: unknown): DayLockPayload | null {
  const input = asRecord(raw);
  const day = typeof input.day === "string" ? input.day : "";
  const week = typeof input.week === "string" ? input.week : "";
  if (!isBoardDay(day, week)) return null;
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 200) : "";
  return { week, day, reason: reason || null };
}

export function validateSchedulePayload(raw: unknown, nowSec: number): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue = (section: IssueSection, message: string) =>
    issues.push({ section, message });
  const input = asRecord(raw);

  const mode = typeof input.mode === "string" ? input.mode : "";
  if (!SCHEDULE_MODE_VALUES.has(mode)) issue("game", "Pick a game mode.");

  const { game_timestamp: gameTs, day, week, timezone } = checkTime(input, nowSec, issue);

  const loggingMode = input.logging_mode;
  if (loggingMode !== "Strict" && loggingMode !== "Casual") {
    issue("extras", "Pick a logging mode.");
  }

  const addOn = input.add_on ?? null;
  if (addOn !== null && (typeof addOn !== "string" || !ADD_ON_VALUES.has(addOn))) {
    issue("extras", "Unknown add-on.");
  } else if (typeof addOn === "string" && addOnOption(addOn).unavailable) {
    issue("extras", "Casino and Fortunes of War are currently unavailable.");
  }
  const casino = typeof addOn === "string" && Boolean(addOnOption(addOn).casino);

  let fortunesMode: SchedulePayload["fortunes_mode"] = null;
  if (addOn === "fortunes") {
    fortunesMode = input.fortunes_mode === "competitive" ? "competitive" : "casual";
  }

  const majorLevel = input.major_lock_level;
  const minorLevel = input.minor_lock_level;
  if (!isLockLevel(majorLevel) || !isLockLevel(minorLevel)) {
    issue("access", "Pick who can reserve major and minor nations.");
  }

  let announceTs: number | null = null;
  if (input.announce_timestamp === null || input.announce_timestamp === undefined) {
    // Manual announcing (/announce_game) is gone — every game announces itself.
    issue("announce", "Pick when the game should be announced (or announce it right away).");
  } else {
    if (!isInt(input.announce_timestamp)) {
      issue("announce", "Pick an announcement time.");
    } else if (isInt(gameTs) && input.announce_timestamp >= gameTs) {
      issue("announce", "The announcement must go out before the game starts.");
    } else if (input.announce_timestamp < nowSec - 600) {
      issue("announce", "The announcement time is in the past.");
    } else {
      announceTs = input.announce_timestamp;
    }
  }

  const automatedUnlocks: SchedulePayload["automated_unlocks"] = {};
  const rawUnlocks =
    typeof input.automated_unlocks === "object" && input.automated_unlocks !== null
      ? (input.automated_unlocks as Record<string, unknown>)
      : {};
  if (!casino && isLockLevel(majorLevel) && isLockLevel(minorLevel)) {
    for (const [scope, current] of [
      ["major", majorLevel],
      ["minor", minorLevel],
    ] as const) {
      const config = rawUnlocks[scope];
      if (config === undefined || config === null) continue;
      const entry = (typeof config === "object" ? config : {}) as Record<string, unknown>;
      const target = entry.target_level;
      const unlockTs = entry.unlock_timestamp;
      const scopeName = scope === "major" ? "Major" : "Minor";
      if (!isLockLevel(target) || !isInt(unlockTs)) {
        issue("access", `${scopeName} nation unlock is incomplete.`);
        continue;
      }
      if (LOCK_LEVEL_RANK[target] <= LOCK_LEVEL_RANK[current as LockLevel]) {
        issue(
          "access",
          `${scopeName} nations must unlock to a wider group than ${lockLevelLabel(current as LockLevel)}.`,
        );
        continue;
      }
      if (isInt(gameTs) && unlockTs >= gameTs) {
        issue("access", `${scopeName} nations must unlock before the game starts.`);
        continue;
      }
      automatedUnlocks[scope] = { target_level: target, unlock_timestamp: unlockTs };
    }
  }

  const automaticReminder = input.automatic_reminder === true;
  let checksum: string | null = null;
  if (automaticReminder) {
    checksum = typeof input.scheduled_checksum === "string"
      ? input.scheduled_checksum.trim().toUpperCase()
      : "";
    if (!/^[A-Z0-9]{4}$/.test(checksum)) {
      issue("extras", "The reminder checksum must be exactly 4 letters or digits.");
    }
  }

  const nationLocks: NationLockGroupPayload[] = [];
  const rawGroups = input.nation_locks ?? [];
  if (!Array.isArray(rawGroups) || rawGroups.length > MAX_LOCK_GROUPS) {
    issue("nations", `Use at most ${MAX_LOCK_GROUPS} lock groups.`);
  } else {
    let total = 0;
    for (const rawGroup of rawGroups) {
      const group = (typeof rawGroup === "object" && rawGroup !== null ? rawGroup : {}) as Record<
        string,
        unknown
      >;
      const label =
        (typeof group.label === "string" ? group.label.trim().slice(0, 40) : "") ||
        "Locked nations";
      const nations = Array.isArray(group.nations)
        ? group.nations
            .filter((name): name is string => typeof name === "string")
            .map((name) => name.trim().slice(0, 128))
            .filter(Boolean)
        : [];
      if (nations.length === 0) continue;
      let release: number | null = null;
      if (group.release_timestamp !== null && group.release_timestamp !== undefined) {
        if (!isInt(group.release_timestamp)) {
          issue("nations", `Pick when "${label}" unlocks.`);
          continue;
        }
        if (isInt(gameTs) && group.release_timestamp >= gameTs) {
          issue("nations", `"${label}" must unlock before the game starts.`);
          continue;
        }
        release = group.release_timestamp;
      }
      total += nations.length;
      nationLocks.push({ label, nations, release_timestamp: release });
    }
    if (total > MAX_LOCKED_NATIONS) {
      issue("nations", `At most ${MAX_LOCKED_NATIONS} nations can be locked.`);
    }
  }

  // A preset's nation groups, rules and mods (the bot checks the nation names).
  const presetId = typeof input.preset_id === "string" && PRESET_ID_RE.test(input.preset_id) ? input.preset_id : null;
  const presetName = presetId && typeof input.preset_name === "string" ? input.preset_name.trim().slice(0, PRESET_LIMITS.name) || null : null;
  const layout = validateLayout(input.nation_layout, null);
  if (!layout.ok) issue("nations", layout.error);
  const rules = validateResourceList(input.rules, PRESET_LIMITS.rules, "rulesets");
  if (!rules.ok) issue("extras", `Rules: ${rules.error}`);
  const mods = validateResourceList(input.mods, PRESET_LIMITS.mods, "mods");
  if (!mods.ok) issue("extras", `Mods: ${mods.error}`);

  // Draft game (the bot checks the groups against the game's layout and the captains).
  const draft = validateDraftSettings(input.draft, typeof addOn === "string" ? addOn : null);
  if (!draft.ok) issue("extras", draft.error);

  if (issues.length > 0 || !layout.ok || !rules.ok || !mods.ok || !draft.ok) return { ok: false, issues };
  return {
    ok: true,
    value: {
      mode,
      game_timestamp: gameTs as number,
      day,
      week,
      timezone,
      logging_mode: loggingMode as SchedulePayload["logging_mode"],
      add_on: addOn as string | null,
      fortunes_mode: fortunesMode,
      major_lock_level: majorLevel as LockLevel,
      minor_lock_level: minorLevel as LockLevel,
      announce_timestamp: announceTs,
      automated_unlock: casino ? input.automated_unlock === true : Object.keys(automatedUnlocks).length > 0,
      automated_unlocks: casino ? {} : automatedUnlocks,
      automatic_reminder: automaticReminder,
      scheduled_checksum: checksum,
      nation_locks: nationLocks,
      preset_id: presetId,
      preset_name: presetName,
      nation_layout: layout.value,
      rules: rules.value,
      mods: mods.value,
      draft: draft.value,
    },
  };
}

/** Add-ons that hand out nations by luck — they can't be drafts (bot: DRAFT_BLOCKED_ADDONS). */
export const DRAFT_BLOCKED_ADDONS = new Set(["randomizer", "fortunes"]);

/** Draft settings of a scheduled game (null = a normal game). */
export function validateDraftSettings(
  raw: unknown,
  addOn: string | null,
): { ok: true; value: DraftSettings | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === false) return { ok: true, value: null };
  const input = asRecord(raw);
  if (addOn && DRAFT_BLOCKED_ADDONS.has(addOn)) {
    return { ok: false, error: "Draft games can't use the Casino, Fortunes of War or All Add-ons add-ons." };
  }
  const rawTeams = Array.isArray(input.teams) ? input.teams : [];
  if (rawTeams.length !== 2) return { ok: false, error: "A draft needs exactly two teams." };
  const names = new Set<string>();
  const captains = new Set<string>();
  const used = new Set<string>();
  const teams: DraftTeamSettings[] = [];
  for (const rawTeam of rawTeams) {
    const team = asRecord(rawTeam);
    const name = typeof team.name === "string" ? team.name.trim().slice(0, 30) : "";
    if (!name) return { ok: false, error: "Give both draft teams a name." };
    if (names.has(name.toLowerCase())) return { ok: false, error: "The two draft teams need different names." };
    names.add(name.toLowerCase());
    const captain = typeof team.captain_id === "string" ? team.captain_id : "";
    if (!SNOWFLAKE_RE.test(captain)) return { ok: false, error: `Pick a captain for ${name}.` };
    if (captains.has(captain)) return { ok: false, error: "The two draft teams need different captains." };
    captains.add(captain);
    const groups: string[] = [];
    for (const group of Array.isArray(team.groups) ? team.groups : []) {
      if (typeof group !== "string" || !group.trim()) continue;
      const key = group.trim().toLowerCase();
      if (used.has(key)) return { ok: false, error: `${group.trim()} is in both draft teams.` };
      used.add(key);
      groups.push(group.trim().slice(0, 40));
    }
    if (groups.length === 0) return { ok: false, error: `Put at least one nation group in ${name}.` };
    teams.push({ name, groups, captain_id: captain });
  }
  const coinFlip = input.coin_flip !== false;
  const first = input.first_picker === 1 ? 1 : 0;
  return { ok: true, value: { teams, coin_flip: coinFlip, first_picker: coinFlip ? null : first } };
}
