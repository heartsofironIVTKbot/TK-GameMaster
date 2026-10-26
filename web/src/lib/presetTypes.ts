import type { LockLevel } from "@/lib/scheduleOptions";

/**
 * Game mode presets (the Presets page) — shapes shared by the pages and the
 * API. A preset is one mode's saved setup: its own nation groups (or the
 * mode's standard ones), nation locks, who may reserve, rules and mods.
 *
 * Presets belong to one Discord server. Marking one "shared" lists it in the
 * public library, where other servers can copy it (a copy is theirs to edit).
 */

/** Limits — the bot enforces the same ones (bot.py.py WEB_PRESET_* / WEB_GAME_MAX_*). */
export const PRESET_LIMITS = {
  name: 60,
  description: 300,
  groups: 24,
  groupName: 40,
  tiers: 4,
  lockGroups: 12,
  mods: 5,
  /** Rulesets in a preset / on the calendar (casino games add the casino rules). */
  rules: 4,
  /** Rulesets on an announced game (Games page). */
  gameRules: 5,
  perServer: 200,
} as const;

/** A sub-heading inside a group ("Majors", "Important Minors"…); label null = none. */
export interface PresetTier {
  label: string | null;
  nations: string[];
}

export interface PresetGroup {
  id: string;
  name: string;
  /** Off = its nations aren't playable in games that use the preset. */
  enabled: boolean;
  /** Started as one of the mode's standard groups. */
  builtin: boolean;
  tiers: PresetTier[];
}

export interface PresetLock {
  label: string;
  /** Bot nation names. */
  nations: string[];
  /** Unlock this many hours before the game; null = locked all game. */
  release_hours_before: number | null;
}

export interface ResourceEntry {
  name: string;
  link: string;
}

export interface PresetData {
  /** null = the mode's standard nation groups. */
  layout: PresetGroup[] | null;
  nation_locks: PresetLock[];
  major_lock_level: LockLevel;
  minor_lock_level: LockLevel;
  /** null = the mode's standard rulesets / mods. */
  rules: ResourceEntry[] | null;
  mods: ResourceEntry[] | null;
}

/** What the Presets page saves. */
export interface PresetInput {
  mode: string;
  name: string;
  description: string | null;
  shared: boolean;
  data: PresetData;
}

export interface GamePreset extends PresetInput {
  preset_id: string;
  created_by: string;
  created_by_name: string | null;
  /** The library preset this one was copied from. */
  copied_from: string | null;
  /** Games scheduled with it. */
  uses: number;
  created_at: number;
  updated_at: number;
  /** The Discord server it belongs to. */
  server_name: string | null;
  /** Belongs to this server (false = a library preset from another server). */
  own_server: boolean;
  /** Its creator, or staff of its server. */
  can_edit: boolean;
}

/** A mode's standard setup, as the bot publishes it. */
export interface ModeDefaults {
  groups: { name: string; tiers: PresetTier[] }[];
  majors: string[];
  minors: string[];
  mods: ResourceEntry[];
  rules: ResourceEntry[];
}

export interface PresetDefaults {
  /** False until the bot has published its lists (restart the bot). */
  ready: boolean;
  modes: Record<string, ModeDefaults>;
  server: { id: string; name: string | null };
}

/** Every nation of the mode that isn't in a turned-on group (not playable). */
export function notPlayableNations(layout: PresetGroup[] | null, allNations: string[]): string[] {
  if (!layout) return [];
  const playable = new Set(
    layout.filter((group) => group.enabled).flatMap((group) => group.tiers.flatMap((tier) => tier.nations)),
  );
  return allNations.filter((nation) => !playable.has(nation));
}

let idCounter = 0;

export function newGroupId(): string {
  idCounter += 1;
  return `g-${Date.now().toString(36)}-${idCounter}`;
}

/** The mode's standard groups as an editable layout (all turned on). */
export function layoutFromDefaults(defaults: ModeDefaults | undefined): PresetGroup[] {
  return (defaults?.groups ?? []).map((group) => ({
    id: newGroupId(),
    name: group.name,
    enabled: true,
    builtin: true,
    tiers: group.tiers
      .map((tier) => ({ label: tier.label, nations: [...tier.nations] }))
      .filter((tier, index, tiers) => tier.nations.length > 0 || tiers.length === 1),
  }));
}

/** Short counts for cards: "7 groups · 2 off · 3 locks · 2 rules · 3 mods". */
export function presetSummary(data: PresetData): string[] {
  const parts: string[] = [];
  if (data.layout) {
    const off = data.layout.filter((group) => !group.enabled).length;
    parts.push(`${data.layout.length} custom group${data.layout.length === 1 ? "" : "s"}${off ? ` (${off} off)` : ""}`);
  } else {
    parts.push("Standard groups");
  }
  const locked = data.nation_locks.reduce((sum, group) => sum + group.nations.length, 0);
  if (locked) parts.push(`${locked} locked nation${locked === 1 ? "" : "s"}`);
  parts.push(data.rules ? `${data.rules.length} ruleset${data.rules.length === 1 ? "" : "s"}` : "Standard rules");
  parts.push(data.mods ? `${data.mods.length} mod${data.mods.length === 1 ? "" : "s"}` : "Standard mods");
  return parts;
}
