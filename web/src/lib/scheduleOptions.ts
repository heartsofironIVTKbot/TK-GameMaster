import type { ScenarioId } from "@/data/scenarioData";
import { addDays, mondayOf, weekdayIndex } from "@/lib/timeEngine";

/**
 * Choices offered by the host calendar. Values are the bot's own
 * (SCHEDULE_MODE_CHOICES / SCHEDULE_ADDON_CHOICES / LOCK_LEVEL_CHOICES in
 * bot.py.py) — the bot rejects anything else, so keep them in sync.
 */

export type ScheduleCategory = "Roleplay" | "Historical";

export interface ScheduleModeOption {
  /** Bot mode name stored on the schedule slot. */
  value: string;
  label: string;
  category: ScheduleCategory;
  /** Interactive nation map for host locks; null = no map for this mode. */
  scenarioId: ScenarioId | null;
}

export const SCHEDULE_MODES: ScheduleModeOption[] = [
  { value: "Roleplay", label: "Roleplay", category: "Roleplay", scenarioId: "road_to_56" },
  { value: "Roleplay (Millennium Dawn)", label: "Millennium Dawn", category: "Roleplay", scenarioId: "modern_md" },
  { value: "Roleplay (Novum Vexillum)", label: "Novum Vexillum", category: "Roleplay", scenarioId: "modern_nv" },
  { value: "Kaiserreich (FFA)", label: "Kaiserreich", category: "Roleplay", scenarioId: "kaiserreich" },
  { value: "TFR", label: "The Fire Rises", category: "Roleplay", scenarioId: "modern_tfr" },
  { value: "Historical (Vanilla)", label: "Vanilla", category: "Historical", scenarioId: "vanilla_1936" },
  { value: "Historical (TFB)", label: "Their Finest Bruh", category: "Historical", scenarioId: "tfb" },
  { value: "Historical (Oak)", label: "Hearts of Oak", category: "Historical", scenarioId: "oak" },
  { value: "Historical (Horst)", label: "Horstorical", category: "Historical", scenarioId: "horst" },
  { value: "Historical (BFFU)", label: "BFFU 2", category: "Historical", scenarioId: "bffu" },
];

export const SCHEDULE_MODE_VALUES = new Set(SCHEDULE_MODES.map((mode) => mode.value));

export function modeOption(value: string | null | undefined): ScheduleModeOption | null {
  return SCHEDULE_MODES.find((mode) => mode.value === value) ?? null;
}

/** Same collapse as the bot's _schedule_category(). */
export function categoryOfMode(mode: string): ScheduleCategory {
  if (mode.includes("Historical")) return "Historical";
  return "Roleplay";
}

export const CATEGORY_META: Record<
  ScheduleCategory,
  { emoji: string; dot: string; chip: string; ring: string; text: string }
> = {
  Roleplay: {
    emoji: "🎭",
    dot: "bg-violet-400",
    chip: "border-violet-400/40 bg-violet-500/15 text-violet-100",
    ring: "ring-violet-400/60",
    text: "text-violet-300",
  },
  Historical: {
    emoji: "🎖️",
    dot: "bg-brand-400",
    chip: "border-brand-400/40 bg-brand-500/15 text-brand-100",
    ring: "ring-brand-400/60",
    text: "text-brand-300",
  },
};

/**
 * Where a game stands, as the calendars colour it (globals.css .gm-game):
 * yellow scheduled, green announced, blue on-going, grey ended, red cancelled.
 */
export type GameState = "scheduled" | "announced" | "live" | "ended" | "cancelled";

export const GAME_STATES: { value: GameState; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "announced", label: "Announced" },
  { value: "live", label: "On-going" },
  { value: "ended", label: "Ended" },
  { value: "cancelled", label: "Cancelled" },
];

export function gameStateLabel(state: GameState): string {
  return GAME_STATES.find((entry) => entry.value === state)?.label ?? state;
}

export function gameState(
  game: { status: string | null; announced: boolean; started: boolean; game_timestamp: number },
  nowSec: number,
): GameState {
  if (game.status === "cancelled") return "cancelled";
  if (game.status === "ended") return "ended";
  if (game.started) return "live";
  // Never started and long past: the bot never marked it, but it's over.
  if (game.game_timestamp < nowSec - 6 * 3600) return "ended";
  return game.announced ? "announced" : "scheduled";
}

export interface AddOnOption {
  value: string | null;
  label: string;
  emoji: string;
  description: string;
  /** Casino add-ons: 2-tier locks live on the Casino Host Panel. */
  casino?: boolean;
  /** Shown, but can't be picked yet (Casino integration, TommyKay only). */
  unavailable?: boolean;
}

/**
 * The Casino and Fortunes of War (TommyKay only; docs/casino-integration.md).
 * Switch on for every host here and with CASINO_ADDONS_LIVE in the bot. Until
 * then Host Management can still schedule them (a test game; ExtrasTab), and
 * the local dev server can always pick them.
 */
export const CASINO_ADDONS_LIVE = false;
const CASINO_READY = CASINO_ADDONS_LIVE || process.env.NODE_ENV === "development";

/** Add-ons only TommyKay's server (the home server) can use. */
export const HOME_ONLY_ADD_ONS = new Set(["randomizer", "fortunes"]);

export const ADD_ONS: AddOnOption[] = [
  { value: null, label: "No add-on", emoji: "✨", description: "Standard game — players reserve on the map." },
  {
    value: "randomizer",
    label: "Casino",
    emoji: "🎲",
    description: CASINO_READY ? "Players roll their nation and more on tkcasino.online." : "Currently unavailable.",
    casino: true,
    unavailable: !CASINO_READY,
  },
  {
    value: "fortunes",
    label: "Fortunes of War",
    emoji: "🃏",
    description: CASINO_READY ? "Players draw power-up cards on tkcasino.online." : "Currently unavailable.",
    unavailable: !CASINO_READY,
  },
  { value: "zombies", label: "Zombies", emoji: "🧟", description: "Submod required." },
  { value: "leviathan", label: "Leviathan", emoji: "🔱", description: "Submod required." },
];

/**
 * Removed add-ons (bot.py.py _RETIRED_ADDONS): games scheduled with them keep
 * their slot. All Add-ons becomes Casino (its reserving part); Tommy's
 * Lootboxes and Star Wars become plain games.
 */
const RETIRED_ADD_ONS: Record<string, string | null> = { all: "randomizer", lootbox: null, starwars: null };

/**
 * A saved slot's add-on, with a removed one swapped for what replaced it.
 * Unavailable add-ons (Casino, Fortunes of War) read as none, as the bot
 * announces those games as normal map games, unless the slot is Host
 * Management's test game (`addon_test`).
 */
export function currentAddOn(value: string | null | undefined, test = false): string | null {
  if (!value) return null;
  const next = value in RETIRED_ADD_ONS ? RETIRED_ADD_ONS[value] : value;
  return next && addOnOption(next).unavailable && !test ? null : next;
}

/** Host Management can schedule the not-yet-live Casino add-ons (a test game). */
export function addOnLocked(value: string | null | undefined, isStaff: boolean): boolean {
  return Boolean(value) && addOnOption(value).unavailable === true && !isStaff;
}

export const ADD_ON_VALUES = new Set(
  ADD_ONS.map((addOn) => addOn.value).filter((value): value is string => value !== null),
);

export function addOnOption(value: string | null | undefined): AddOnOption {
  return ADD_ONS.find((addOn) => addOn.value === (value ?? null)) ?? ADD_ONS[0];
}

export type LockLevel = "VIP" | "Trusted" | "Verified" | "All Users";

export const LOCK_LEVELS: { value: LockLevel; label: string; hint: string }[] = [
  { value: "VIP", label: "VIP+", hint: "VIP members only" },
  { value: "Trusted", label: "Trusted+", hint: "Trusted players and up" },
  { value: "Verified", label: "Verified+", hint: "Verified players and up" },
  { value: "All Users", label: "Everyone", hint: "Any player" },
];

/** Lower rank = stricter (bot: VIP 0 … All Users 3). */
export const LOCK_LEVEL_RANK: Record<LockLevel, number> = {
  VIP: 0,
  Trusted: 1,
  Verified: 2,
  "All Users": 3,
};

export function isLockLevel(value: unknown): value is LockLevel {
  return typeof value === "string" && value in LOCK_LEVEL_RANK;
}

export function lockLevelLabel(level: LockLevel): string {
  return LOCK_LEVELS.find((entry) => entry.value === level)?.label ?? level;
}

export const LOGGING_MODES = [
  {
    value: "Strict" as const,
    label: "Strict",
    description: "Warn every no-show — majors ×2, minors / fillers / co-ops ×1.",
  },
  {
    value: "Casual" as const,
    label: "Casual",
    description: "Only warn major no-shows (×2). Minors, fillers and co-ops are ignored.",
  },
];

export type LoggingMode = (typeof LOGGING_MODES)[number]["value"];

/** Quick picks for "N hours before the game" sliders (bot wizard presets). */
export const HOURS_BEFORE_PRESETS = [6, 12, 24, 48];

export const MAX_LOCK_GROUPS = 12;
export const MAX_LOCKED_NATIONS = 400;

/**
 * Monday-ISO weeks a host may book, as of `today` (a date in the host's
 * zone): this week and next week, plus the week after next from Friday on —
 * the same window as the bot's _candidate_schedule_weeks().
 */
export function bookableWeeks(today: string): string[] {
  const thisMonday = mondayOf(today);
  const weeks = [thisMonday, addDays(thisMonday, 7)];
  if (weekdayIndex(today) >= 4) weeks.push(addDays(thisMonday, 14));
  return weeks;
}

/** Last bookable date (Sunday of the furthest bookable week). */
export function lastBookableDate(today: string): string {
  const weeks = bookableWeeks(today);
  return addDays(weeks[weeks.length - 1], 6);
}

export function isBookableDate(date: string, today: string): boolean {
  return date >= today && date <= lastBookableDate(today);
}
