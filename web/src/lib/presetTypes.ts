import type { LockLevel } from "@/lib/scheduleOptions";

/**
 * Game mode presets (the Presets page) — shapes shared by the pages and the
 * API. A preset is one mode's saved setup: its own nation groups (or the
 * mode's standard ones), nation locks, who may reserve, rules and mods.
 *
 * Presets belong to one Discord server. Marking one "shared" lists it in the
 * public library, where other servers can copy it (a copy is theirs to edit).
 * GameMaster's own presets (`official`, TommyKay's curated lists) can't be
 * changed: editing one, or another server's, saves a copy. A copy notices
 * when its original changes and offers the update.
 *
 * No preset (layout null) means the whole map: every nation on the mode's
 * map is playable.
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
  /** null = the whole map, grouped the mode's standard way. */
  layout: PresetGroup[] | null;
  nation_locks: PresetLock[];
  major_lock_level: LockLevel;
  minor_lock_level: LockLevel;
  /** null = the mode's standard rulesets / mods. */
  rules: ResourceEntry[] | null;
  mods: ResourceEntry[] | null;
  /** Games made from it require IronLegion (true / false); null or missing = the server's setting. */
  require_ironlegion?: boolean | null;
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
  /** Its creator, or staff of its server (never for GameMaster's own presets). */
  can_edit: boolean;
  /** One of GameMaster's own presets (the bot's curated lists). */
  official: boolean;
  /** The one the calendar loads first for its mode on this server. */
  is_default: boolean;
  /** A copy whose original changed since it was copied (or last updated). */
  update_available: boolean;
}

/** What updating a copy from its original would change (GET /api/presets/<id>/update). */
export interface PresetUpdateCheck {
  source: GamePreset;
  changes: PresetChange[];
  /** The copy was changed after it was copied: updating replaces those changes. */
  own_edits: boolean;
}

export interface PresetChange {
  kind: "add" | "remove" | "change";
  label: string;
  /** add / remove: the nations or names it's about. */
  detail: string;
  /** change: the old and the new value. */
  from?: string;
  to?: string;
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

/** The whole map's groups (the mode's standard ones) as an editable layout, all turned on. */
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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The nations a layout makes playable. */
export function playableNations(layout: PresetGroup[]): string[] {
  return layout.filter((group) => group.enabled).flatMap((group) => group.tiers.flatMap((tier) => tier.nations));
}

export interface PresetFact {
  kind: "groups" | "locks" | "rules" | "mods";
  text: string;
}

/** Short facts for cards: "7 groups, 57 nations", "2 locked nations", "Standard rules", "3 mods". */
export function presetSummary(data: PresetData): PresetFact[] {
  const parts: PresetFact[] = [];
  if (data.layout) {
    const on = data.layout.filter((group) => group.enabled);
    const off = data.layout.length - on.length;
    parts.push({
      kind: "groups",
      text: `${plural(on.length, "group")}, ${plural(playableNations(data.layout).length, "nation")}${off ? ` (${off} off)` : ""}`,
    });
  } else {
    parts.push({ kind: "groups", text: "Whole map" });
  }
  const locked = data.nation_locks.reduce((sum, group) => sum + group.nations.length, 0);
  if (locked) parts.push({ kind: "locks", text: plural(locked, "locked nation") });
  parts.push({ kind: "rules", text: data.rules ? plural(data.rules.length, "ruleset") : "Standard rules" });
  parts.push({ kind: "mods", text: data.mods ? plural(data.mods.length, "mod") : "Standard mods" });
  return parts;
}

const LEVEL_LABEL: Record<LockLevel, string> = { VIP: "VIP+", Trusted: "Trusted+", Verified: "Verified+", "All Users": "Everyone" };

function listText(names: string[], max = 8): string {
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", ");
}

function resourceText(list: ResourceEntry[] | null): string {
  return list === null ? "Standard" : list.length === 0 ? "None" : list.map((entry) => entry.name).join(", ");
}

/**
 * What changes when `mine` (a copy) takes `theirs` (its original): nations
 * added to or removed from each group, groups added, taken out or turned
 * off, who can reserve, nation locks, rules, mods and IronLegion.
 */
export function presetDiff(mine: PresetData, theirs: PresetData): PresetChange[] {
  const changes: PresetChange[] = [];
  const change = (label: string, from: string, to: string) => changes.push({ kind: "change", label, detail: "", from, to });
  const groupsOf = (layout: PresetGroup[] | null) =>
    new Map((layout ?? []).map((group) => [group.name.trim().toLowerCase(), group] as const));
  if (!mine.layout !== !theirs.layout) {
    change(
      "Nation groups",
      mine.layout ? plural(mine.layout.length, "group") : "Whole map",
      theirs.layout ? plural(theirs.layout.length, "group") : "Whole map",
    );
  } else if (mine.layout && theirs.layout) {
    const before = groupsOf(mine.layout);
    const after = groupsOf(theirs.layout);
    for (const [key, group] of after) {
      const old = before.get(key);
      const nations = group.tiers.flatMap((tier) => tier.nations);
      if (!old) {
        changes.push({ kind: "add", label: `New group ${group.name}`, detail: listText(nations) || "no nations" });
        continue;
      }
      const had = new Set(old.tiers.flatMap((tier) => tier.nations));
      const has = new Set(nations);
      const added = nations.filter((nation) => !had.has(nation));
      const removed = [...had].filter((nation) => !has.has(nation));
      if (added.length) changes.push({ kind: "add", label: `Added to ${group.name}`, detail: listText(added) });
      if (removed.length) changes.push({ kind: "remove", label: `Removed from ${group.name}`, detail: listText(removed) });
      if (old.enabled !== group.enabled) change(group.name, old.enabled ? "Playable" : "Off", group.enabled ? "Playable" : "Off");
    }
    for (const [key, group] of before) {
      if (!after.has(key)) changes.push({ kind: "remove", label: `Group ${group.name}`, detail: "taken out" });
    }
  }
  if (mine.major_lock_level !== theirs.major_lock_level) {
    change("Who can reserve Majors", LEVEL_LABEL[mine.major_lock_level], LEVEL_LABEL[theirs.major_lock_level]);
  }
  if (mine.minor_lock_level !== theirs.minor_lock_level) {
    change("Who can reserve Minors", LEVEL_LABEL[mine.minor_lock_level], LEVEL_LABEL[theirs.minor_lock_level]);
  }
  const locked = (data: PresetData) => new Set(data.nation_locks.flatMap((group) => group.nations));
  const lockedBefore = locked(mine);
  const lockedAfter = locked(theirs);
  const newlyLocked = [...lockedAfter].filter((nation) => !lockedBefore.has(nation));
  const unlocked = [...lockedBefore].filter((nation) => !lockedAfter.has(nation));
  if (newlyLocked.length) changes.push({ kind: "add", label: "Locked", detail: listText(newlyLocked) });
  if (unlocked.length) changes.push({ kind: "remove", label: "No longer locked", detail: listText(unlocked) });
  for (const [label, before, after] of [
    ["Rules", mine.rules, theirs.rules],
    ["Mods", mine.mods, theirs.mods],
  ] as const) {
    if (before === null || after === null) {
      if (resourceText(before) !== resourceText(after)) change(label, resourceText(before), resourceText(after));
      continue;
    }
    const key = (entry: ResourceEntry) => `${entry.name}|${entry.link}`;
    const had = new Set(before.map(key));
    const has = new Set(after.map(key));
    const added = after.filter((entry) => !had.has(key(entry))).map((entry) => entry.name);
    const removed = before.filter((entry) => !has.has(key(entry))).map((entry) => entry.name);
    if (added.length) changes.push({ kind: "add", label, detail: listText(added) });
    if (removed.length) changes.push({ kind: "remove", label: `${label} taken out`, detail: listText(removed) });
  }
  const ironLegion = (value: boolean | null | undefined) =>
    value === true ? "Required" : value === false ? "Not required" : "The server's setting";
  if ((mine.require_ironlegion ?? null) !== (theirs.require_ironlegion ?? null)) {
    change("IronLegion", ironLegion(mine.require_ironlegion), ironLegion(theirs.require_ironlegion));
  }
  return changes;
}
