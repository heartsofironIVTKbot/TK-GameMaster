import {
  ADD_ON_VALUES,
  addOnOption,
  categoryOfMode,
  isBookableDate,
  isLockLevel,
  type LockLevel,
  type LoggingMode,
} from "@/lib/scheduleOptions";
import type { GamePreset, PresetGroup, ResourceEntry } from "@/lib/presetTypes";
import type {
  CalendarDayLock,
  CalendarSlot,
  SchedulePayload,
  SlotEditability,
  SlotSettings,
  TimeEditPayload,
} from "@/lib/scheduleTypes";
import {
  validateSchedulePayload,
  validateTimeEdit,
  type IssueSection,
  type ValidationIssue,
} from "@/lib/scheduleValidation";
import {
  dateInZone,
  mondayOf,
  timeInZone,
  weekdayName,
  zonedToUnixMs,
  type ConversionStatus,
} from "@/lib/timeEngine";

/** Form state of the game setup page and how it becomes a bot payload. */

export type TabId = IssueSection | "review";

export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "game", label: "Game", icon: "🎮" },
  { id: "announce", label: "Announce", icon: "📣" },
  { id: "access", label: "Access", icon: "🔐" },
  { id: "nations", label: "Nations", icon: "🗺️" },
  { id: "extras", label: "Extras", icon: "✨" },
  { id: "review", label: "Review", icon: "✅" },
];

/** Tabs available after the announcement (only day/time/host can change). */
export const TIME_HOST_TABS: TabId[] = ["game", "review"];

/** Every game announces itself (manual /announce_game is gone). */
export type AnnounceMode = "now" | "before" | "custom";

export interface UnlockForm {
  enabled: boolean;
  target: LockLevel;
  hoursBefore: number;
}

export interface LockGroupForm {
  id: string;
  label: string;
  /** Bot reservation slot names. */
  nations: string[];
  releaseEnabled: boolean;
  releaseHoursBefore: number;
}

export interface SetupForm {
  mode: string;
  date: string;
  time: string;
  loggingMode: LoggingMode;
  addOn: string | null;
  fortunesMode: "casual" | "competitive";
  majorLevel: LockLevel;
  minorLevel: LockLevel;
  announceMode: AnnounceMode;
  announceHoursBefore: number;
  announceDate: string;
  announceTime: string;
  unlocks: { major: UnlockForm; minor: UnlockForm };
  autoReminder: boolean;
  checksum: string;
  lockGroups: LockGroupForm[];
  activeGroupId: string;
  /** Editing only: hand the game to this host (null = keep the host). */
  handoverTo: string | null;
  /** The preset loaded into the form (its settings are copied in). */
  presetId: string | null;
  presetName: string | null;
  /** A preset's own nation groups; null = the mode's standard groups. */
  layout: PresetGroup[] | null;
  /** Rules / mods to post; null = the mode's standard list. */
  rules: ResourceEntry[] | null;
  mods: ResourceEntry[] | null;
  /** Draft game settings; null = a normal game. */
  draft: DraftForm | null;
}

export interface DraftTeamForm {
  name: string;
  /** Nation groups the team drafts from. */
  groups: string[];
  captainId: string | null;
  captainName: string | null;
}

export interface DraftForm {
  teams: [DraftTeamForm, DraftTeamForm];
  coinFlip: boolean;
  firstPicker: 0 | 1;
}

/**
 * A new draft's teams: factions split Axis + GEACPS vs everyone else (the old
 * Allies / Axis rule); other layouts are split down the middle for the host
 * to adjust.
 */
export function defaultDraftForm(groups: string[]): DraftForm {
  const axisLike = (name: string) => /^(axis|geacps)$/i.test(name.trim());
  const team = (name: string, picked: string[]): DraftTeamForm => ({ name, groups: picked, captainId: null, captainName: null });
  if (groups.some(axisLike)) {
    return {
      teams: [team("Allies", groups.filter((name) => !axisLike(name))), team("Axis", groups.filter(axisLike))],
      coinFlip: true,
      firstPicker: 0,
    };
  }
  const half = Math.ceil(groups.length / 2);
  return { teams: [team("Team 1", groups.slice(0, half)), team("Team 2", groups.slice(half))], coinFlip: true, firstPicker: 0 };
}

/** An existing game being edited (absent when creating). */
export interface EditTarget {
  slotId: string;
  editable: SlotEditability;
  /** Calendar date the game was on (a later staff lock never blocks it). */
  originalDate: string;
  originalGameSec: number;
  hostId: string;
  hostName: string | null;
}

let groupCounter = 0;

export function newLockGroup(index: number, label?: string): LockGroupForm {
  groupCounter += 1;
  return {
    id: `group-${Date.now().toString(36)}-${groupCounter}`,
    label: label ?? (index === 0 ? "Locked nations" : `Lock group ${index + 1}`),
    nations: [],
    releaseEnabled: false,
    releaseHoursBefore: 24,
  };
}

export function initialForm(date: string): SetupForm {
  const group = newLockGroup(0);
  return {
    mode: "",
    date,
    time: "20:00",
    loggingMode: "Strict",
    addOn: null,
    fortunesMode: "casual",
    majorLevel: "Trusted",
    minorLevel: "All Users",
    announceMode: "before",
    announceHoursBefore: 24,
    announceDate: date,
    announceTime: "18:00",
    unlocks: {
      major: { enabled: false, target: "All Users", hoursBefore: 12 },
      minor: { enabled: false, target: "All Users", hoursBefore: 24 },
    },
    autoReminder: true,
    checksum: randomChecksum(),
    lockGroups: [group],
    activeGroupId: group.id,
    handoverTo: null,
    presetId: null,
    presetName: null,
    layout: null,
    rules: null,
    mods: null,
    draft: null,
  };
}

/**
 * Load a preset into the form: its mode, who can reserve, nation locks,
 * nation groups, rules and mods. Day, time, announcement and extras stay.
 */
export function applyPreset(form: SetupForm, preset: GamePreset): SetupForm {
  const data = preset.data;
  const lockGroups =
    data.nation_locks.length > 0
      ? data.nation_locks.map((group, index) => ({
          ...newLockGroup(index, group.label),
          nations: [...group.nations],
          releaseEnabled: group.release_hours_before !== null,
          releaseHoursBefore: group.release_hours_before ?? 24,
        }))
      : [newLockGroup(0)];
  return {
    ...form,
    mode: preset.mode,
    majorLevel: data.major_lock_level,
    minorLevel: data.minor_lock_level,
    lockGroups,
    activeGroupId: lockGroups[0].id,
    presetId: preset.own_server ? preset.preset_id : null,
    presetName: preset.name,
    layout: data.layout ? structuredClone(data.layout) : null,
    rules: data.rules ? data.rules.map((entry) => ({ ...entry })) : null,
    mods: data.mods ? data.mods.map((entry) => ({ ...entry })) : null,
  };
}

/** Forget the loaded preset's groups, rules and mods (locks and access stay as they are). */
export function clearPreset(form: SetupForm): SetupForm {
  return { ...form, presetId: null, presetName: null, layout: null, rules: null, mods: null };
}

/** Hours between an earlier instant and the game, for the 1–72h sliders. */
function hoursBefore(gameSec: number, unixSec: number): number {
  return Math.min(72, Math.max(1, Math.round((gameSec - unixSec) / 3600)));
}

/** Prefill the form from a stored game (shown in the host's zone). */
export function formFromSettings(settings: SlotSettings, timeZone: string): SetupForm {
  const gameSec = settings.game_timestamp;
  const date = dateInZone(gameSec * 1000, timeZone);
  const form = initialForm(date);
  form.mode = settings.mode;
  form.time = timeInZone(gameSec * 1000, timeZone);
  form.loggingMode = settings.logging_mode === "Casual" ? "Casual" : "Strict";
  form.addOn = settings.add_on && ADD_ON_VALUES.has(settings.add_on) && !addOnOption(settings.add_on).unavailable ? settings.add_on : null;
  form.fortunesMode = settings.fortunes_mode === "competitive" ? "competitive" : "casual";
  form.majorLevel = isLockLevel(settings.major_lock_level) ? settings.major_lock_level : "Trusted";
  form.minorLevel = isLockLevel(settings.minor_lock_level) ? settings.minor_lock_level : "All Users";

  const announce = settings.announce_timestamp;
  if (announce === null) {
    // Older games scheduled for a manual /announce_game: suggest a time.
    const hoursLeft = Math.floor((gameSec - Date.now() / 1000) / 3600);
    if (hoursLeft >= 2) {
      form.announceMode = "before";
      form.announceHoursBefore = Math.min(24, hoursLeft - 1);
    } else {
      form.announceMode = "now";
    }
  } else {
    const diff = gameSec - announce;
    if (diff > 0 && diff % 3600 === 0 && diff / 3600 <= 72) {
      form.announceMode = "before";
      form.announceHoursBefore = diff / 3600;
    } else {
      form.announceMode = "custom";
    }
    form.announceDate = dateInZone(announce * 1000, timeZone);
    form.announceTime = timeInZone(announce * 1000, timeZone);
  }

  for (const scope of ["major", "minor"] as const) {
    const unlock = settings.automated_unlocks[scope];
    if (unlock && isLockLevel(unlock.target_level)) {
      form.unlocks[scope] = {
        enabled: true,
        target: unlock.target_level,
        hoursBefore: hoursBefore(gameSec, unlock.unlock_timestamp),
      };
    }
  }

  form.autoReminder = settings.automatic_reminder;
  if (settings.scheduled_checksum) form.checksum = settings.scheduled_checksum;

  if (settings.nation_locks.length > 0) {
    form.lockGroups = settings.nation_locks.map((group, index) => ({
      ...newLockGroup(index, group.label),
      nations: [...group.nations],
      releaseEnabled: group.release_timestamp !== null,
      releaseHoursBefore:
        group.release_timestamp !== null ? hoursBefore(gameSec, group.release_timestamp) : 24,
    }));
    form.activeGroupId = form.lockGroups[0].id;
  }
  form.presetId = settings.preset_id;
  form.presetName = settings.preset_name;
  form.layout = settings.nation_layout;
  form.rules = settings.rules;
  form.mods = settings.mods;
  if (settings.draft && settings.draft.teams.length === 2) {
    const [one, two] = settings.draft.teams.map((team) => ({
      name: team.name,
      groups: [...team.groups],
      captainId: team.captain_id || null,
      captainName: team.captain_name ?? null,
    }));
    form.draft = {
      teams: [one, two],
      coinFlip: settings.draft.coin_flip,
      firstPicker: settings.draft.first_picker === 1 ? 1 : 0,
    };
  }
  return form;
}

export function randomChecksum(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let index = 0; index < 4; index += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export interface SetupContext {
  timeZone: string;
  nowSec: number;
  today: string;
  /** Games on the board around the chosen day (for conflict warnings). */
  slots: CalendarSlot[];
  locks: CalendarDayLock[];
  editing: EditTarget | null;
}

export interface DerivedSetup {
  gameSec: number;
  conversion: ConversionStatus;
  announceSec: number | null;
  unlockSec: { major: number; minor: number };
  releaseSec: Record<string, number>;
  casino: boolean;
  /** Ready-to-send body (a time-only edit after the announcement). */
  payload: SchedulePayload | TimeEditPayload | null;
  issues: ValidationIssue[];
  /** Same-day games of the same category by other hosts (heads-up only). */
  conflicts: CalendarSlot[];
  sameDay: CalendarSlot[];
  lockedDay: CalendarDayLock | null;
}

export function deriveSetup(form: SetupForm, context: SetupContext): DerivedSetup {
  const { timeZone, nowSec, today, editing } = context;
  const { unixMs, status } = zonedToUnixMs(form.date, form.time, timeZone);
  const gameSec = Math.floor(unixMs / 1000);
  const casino = Boolean(addOnOption(form.addOn).casino);
  const timeOnly = editing?.editable === "time_host";

  let announceSec: number | null = null;
  if (!timeOnly) {
    if (form.announceMode === "now") announceSec = nowSec;
    if (form.announceMode === "before") announceSec = gameSec - form.announceHoursBefore * 3600;
    if (form.announceMode === "custom") {
      announceSec = Math.floor(
        zonedToUnixMs(form.announceDate, form.announceTime, timeZone).unixMs / 1000,
      );
    }
  }

  const unlockSec = {
    major: gameSec - form.unlocks.major.hoursBefore * 3600,
    minor: gameSec - form.unlocks.minor.hoursBefore * 3600,
  };
  const releaseSec: Record<string, number> = {};
  for (const group of form.lockGroups) {
    releaseSec[group.id] = gameSec - group.releaseHoursBefore * 3600;
  }

  const automatedUnlocks: SchedulePayload["automated_unlocks"] = {};
  if (!casino) {
    for (const scope of ["major", "minor"] as const) {
      const unlock = form.unlocks[scope];
      if (unlock.enabled) {
        automatedUnlocks[scope] = { target_level: unlock.target, unlock_timestamp: unlockSec[scope] };
      }
    }
  }

  const timeFields = {
    game_timestamp: gameSec,
    day: weekdayName(form.date),
    week: mondayOf(form.date),
    timezone: timeZone,
  };
  const raw = {
    ...timeFields,
    mode: form.mode,
    logging_mode: form.loggingMode,
    add_on: form.addOn,
    fortunes_mode: form.addOn === "fortunes" ? form.fortunesMode : null,
    major_lock_level: form.majorLevel,
    minor_lock_level: form.minorLevel,
    announce_timestamp: announceSec,
    automated_unlock: casino || Object.keys(automatedUnlocks).length > 0,
    automated_unlocks: automatedUnlocks,
    automatic_reminder: form.autoReminder,
    scheduled_checksum: form.autoReminder ? form.checksum : null,
    nation_locks: form.lockGroups
      .filter((group) => group.nations.length > 0)
      .map((group) => ({
        label: group.label,
        nations: group.nations,
        release_timestamp: group.releaseEnabled ? releaseSec[group.id] : null,
      })),
    preset_id: form.presetId,
    preset_name: form.presetName,
    nation_layout: form.layout,
    rules: form.rules,
    mods: form.mods,
    draft: form.draft
      ? {
          teams: form.draft.teams.map((team) => ({ name: team.name, groups: team.groups, captain_id: team.captainId ?? "" })),
          coin_flip: form.draft.coinFlip,
          first_picker: form.draft.coinFlip ? null : form.draft.firstPicker,
        }
      : null,
  };

  const validation = timeOnly
    ? validateTimeEdit(timeFields, nowSec)
    : validateSchedulePayload(raw, nowSec);
  const issues: ValidationIssue[] = validation.ok ? [] : [...validation.issues];

  // A game keeps its own day even if staff locked it after it was booked.
  const keepsDay = editing !== null && form.date === editing.originalDate;
  const lockedDay =
    context.locks.find(
      (lock) => lock.week === mondayOf(form.date) && lock.day === weekdayName(form.date),
    ) ?? null;
  if (lockedDay && !keepsDay) {
    issues.unshift({
      section: "game",
      message: `Staff locked ${weekdayName(form.date)}${lockedDay.reason ? ` (${lockedDay.reason})` : ""} — pick another day.`,
    });
  } else if (!keepsDay && !isBookableDate(form.date, today)) {
    issues.unshift({ section: "game", message: "That day isn't open for booking — pick another day." });
  }

  const sameDay = context.slots.filter(
    (slot) =>
      slot.slot_id !== editing?.slotId &&
      dateInZone(slot.game_timestamp * 1000, timeZone) === form.date &&
      slot.status !== "cancelled",
  );
  const conflicts = form.mode
    ? sameDay.filter(
        (slot) => !slot.mine && categoryOfMode(slot.mode) === categoryOfMode(form.mode),
      )
    : [];

  return {
    gameSec,
    conversion: status,
    announceSec,
    unlockSec,
    releaseSec,
    casino,
    payload: validation.ok && issues.length === 0 ? validation.value : null,
    issues: dedupeIssues(issues),
    conflicts,
    sameDay,
    lockedDay: keepsDay ? null : lockedDay,
  };
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.section}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
