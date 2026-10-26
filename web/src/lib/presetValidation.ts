import {
  PRESET_LIMITS,
  newGroupId,
  notPlayableNations,
  type PresetData,
  type PresetGroup,
  type PresetInput,
  type PresetLock,
  type ResourceEntry,
} from "@/lib/presetTypes";
import { SCHEDULE_MODE_VALUES, isLockLevel } from "@/lib/scheduleOptions";

/**
 * Checks for presets (the Presets page live, and the /api/presets routes)
 * and for rules / mods lists (calendar, Games page). The bot re-checks the
 * nation groups, rules and mods when a game is scheduled with them.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const LINK_RE = /^https?:\/\/\S+$/i;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** A rules or mods list ({name, link}); null / undefined = the mode's standard list. */
export function validateResourceList(raw: unknown, limit: number, noun: "mods" | "rulesets"): Result<ResourceEntry[] | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!Array.isArray(raw)) return { ok: false, error: `Invalid ${noun} list.` };
  if (raw.length > limit) return { ok: false, error: `At most ${limit} ${noun}.` };
  const entries: ResourceEntry[] = [];
  for (const item of raw) {
    const entry = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const name = text(entry.name, 100);
    const link = typeof entry.link === "string" ? entry.link.trim() : "";
    if (!name) return { ok: false, error: `Every ${noun.slice(0, -1)} needs a name.` };
    if (!LINK_RE.test(link) || link.length > 400) {
      return { ok: false, error: `“${name}” needs a valid link (starting with https://).` };
    }
    entries.push({ name, link });
  }
  return { ok: true, value: entries };
}

/**
 * Custom nation groups; null = the mode's standard groups. `nations` = the
 * mode's nation names when known (names must match the bot's exactly).
 */
export function validateLayout(raw: unknown, nations: Set<string> | null): Result<PresetGroup[] | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > PRESET_LIMITS.groups) {
    return { ok: false, error: `Nation groups: 1–${PRESET_LIMITS.groups} groups.` };
  }
  const seen = new Set<string>();
  const names = new Set<string>();
  const layout: PresetGroup[] = [];
  for (const item of raw) {
    const group = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const name = text(group.name, PRESET_LIMITS.groupName);
    if (!name) return { ok: false, error: "Every nation group needs a name." };
    if (names.has(name.toLowerCase())) return { ok: false, error: `Two nation groups are called “${name}”.` };
    names.add(name.toLowerCase());
    const rawTiers = Array.isArray(group.tiers) ? group.tiers : [];
    if (rawTiers.length > PRESET_LIMITS.tiers) {
      return { ok: false, error: `“${name}” can have at most ${PRESET_LIMITS.tiers} sub-groups.` };
    }
    const tiers = [];
    for (const rawTier of rawTiers) {
      const tier = (typeof rawTier === "object" && rawTier !== null ? rawTier : {}) as Record<string, unknown>;
      const list: string[] = [];
      for (const value of Array.isArray(tier.nations) ? tier.nations : []) {
        const nation = text(value, 128);
        if (!nation) continue;
        if (nations && !nations.has(nation)) return { ok: false, error: `“${nation}” isn't a nation in this mode.` };
        if (seen.has(nation)) return { ok: false, error: `${nation} is in two groups — a nation can only be in one.` };
        seen.add(nation);
        list.push(nation);
      }
      tiers.push({ label: text(tier.label, PRESET_LIMITS.groupName) || null, nations: list });
    }
    layout.push({
      id: typeof group.id === "string" && group.id.length <= 40 && group.id ? group.id : newGroupId(),
      name,
      enabled: group.enabled !== false,
      builtin: group.builtin === true,
      tiers,
    });
  }
  if (!layout.some((group) => group.enabled && group.tiers.some((tier) => tier.nations.length > 0))) {
    return { ok: false, error: "Turn on at least one nation group that has nations in it." };
  }
  return { ok: true, value: layout };
}

/** Nation lock groups; not-playable (`hidden`) nations are dropped — they're locked for good anyway. */
export function validateLocks(raw: unknown, nations: Set<string> | null, hidden: Set<string>): Result<PresetLock[]> {
  if (raw === null || raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw) || raw.length > PRESET_LIMITS.lockGroups) {
    return { ok: false, error: `Use at most ${PRESET_LIMITS.lockGroups} lock groups.` };
  }
  const seen = new Set<string>();
  const locks: PresetLock[] = [];
  for (const item of raw) {
    const group = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const label = text(group.label, 40) || "Locked nations";
    const list: string[] = [];
    for (const value of Array.isArray(group.nations) ? group.nations : []) {
      const nation = text(value, 128);
      if (!nation || seen.has(nation) || hidden.has(nation)) continue;
      if (nations && !nations.has(nation)) return { ok: false, error: `“${nation}” isn't a nation in this mode.` };
      seen.add(nation);
      list.push(nation);
    }
    if (list.length === 0) continue;
    const hours = group.release_hours_before;
    if (hours !== null && hours !== undefined && !(Number.isInteger(hours) && (hours as number) >= 1 && (hours as number) <= 72)) {
      return { ok: false, error: `“${label}” must unlock 1–72 hours before the game.` };
    }
    locks.push({ label, nations: list, release_hours_before: typeof hours === "number" ? hours : null });
  }
  return { ok: true, value: locks };
}

/** A whole preset from the Presets page. `modeNations` = the mode's nations when known. */
export function validatePresetInput(raw: unknown, modeNations: string[] | null): Result<PresetInput> {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const mode = typeof input.mode === "string" ? input.mode : "";
  if (!SCHEDULE_MODE_VALUES.has(mode)) return { ok: false, error: "Pick a game mode." };
  const name = text(input.name, PRESET_LIMITS.name);
  if (!name) return { ok: false, error: "Give the preset a name." };
  const description = text(input.description, PRESET_LIMITS.description) || null;
  const data = (typeof input.data === "object" && input.data !== null ? input.data : {}) as Record<string, unknown>;
  const nations = modeNations && modeNations.length > 0 ? new Set(modeNations) : null;

  const layout = validateLayout(data.layout, nations);
  if (!layout.ok) return layout;
  const hidden = new Set(nations ? notPlayableNations(layout.value, [...nations]) : []);
  const locks = validateLocks(data.nation_locks, nations, hidden);
  if (!locks.ok) return locks;
  if (!isLockLevel(data.major_lock_level) || !isLockLevel(data.minor_lock_level)) {
    return { ok: false, error: "Pick who can reserve major and minor nations." };
  }
  const rules = validateResourceList(data.rules, PRESET_LIMITS.rules, "rulesets");
  if (!rules.ok) return rules;
  const mods = validateResourceList(data.mods, PRESET_LIMITS.mods, "mods");
  if (!mods.ok) return mods;

  const value: PresetData = {
    layout: layout.value,
    nation_locks: locks.value,
    major_lock_level: data.major_lock_level,
    minor_lock_level: data.minor_lock_level,
    rules: rules.value,
    mods: mods.value,
  };
  return { ok: true, value: { mode, name, description, shared: input.shared === true, data: value } };
}

/** A stored preset document (lenient: anything malformed falls back to standard). */
export function parsePresetData(raw: unknown): PresetData {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = {};
    }
  }
  const data = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const layout = validateLayout(data.layout, null);
  const locks = validateLocks(data.nation_locks, null, new Set());
  const rules = validateResourceList(data.rules, 20, "rulesets");
  const mods = validateResourceList(data.mods, 20, "mods");
  return {
    layout: layout.ok ? layout.value : null,
    nation_locks: locks.ok ? locks.value : [],
    major_lock_level: isLockLevel(data.major_lock_level) ? data.major_lock_level : "Trusted",
    minor_lock_level: isLockLevel(data.minor_lock_level) ? data.minor_lock_level : "All Users",
    rules: rules.ok ? rules.value : null,
    mods: mods.ok ? mods.value : null,
  };
}
