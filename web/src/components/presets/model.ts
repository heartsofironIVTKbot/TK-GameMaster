import { Check, FileText, Layers, Lock, ScrollText, type LucideIcon } from "lucide-react";
import { newLockGroup, type LockGroupForm } from "@/components/schedule/setup/model";
import {
  layoutFromDefaults,
  newGroupId,
  type ModeDefaults,
  type PresetGroup,
  type PresetInput,
  type ResourceEntry,
} from "@/lib/presetTypes";
import type { LockLevel } from "@/lib/scheduleOptions";

/** Form state of the preset maker and how it becomes a saved preset. */

export type MakerTab = "basics" | "groups" | "locks" | "resources" | "save";

export const MAKER_TABS: { id: MakerTab; label: string; icon: LucideIcon }[] = [
  { id: "basics", label: "Basics", icon: FileText },
  { id: "groups", label: "Groups", icon: Layers },
  { id: "locks", label: "Locks", icon: Lock },
  { id: "resources", label: "Rules and mods", icon: ScrollText },
  { id: "save", label: "Save", icon: Check },
];

export interface MakerState {
  mode: string;
  name: string;
  description: string;
  shared: boolean;
  /** null = the whole map. */
  layout: PresetGroup[] | null;
  /** The group map clicks and "add" buttons put nations into. */
  activeGroupId: string | null;
  /** …and the sub-group of it. */
  activeTier: number;
  majorLevel: LockLevel;
  minorLevel: LockLevel;
  /** Require IronLegion in games made from it; null = the server's setting. */
  ironlegion: boolean | null;
  locks: LockGroupForm[];
  activeLockId: string;
  rules: ResourceEntry[] | null;
  mods: ResourceEntry[] | null;
}

export function emptyMaker(mode: string): MakerState {
  const lock = newLockGroup(0);
  return {
    mode,
    name: "",
    description: "",
    shared: false,
    layout: null,
    activeGroupId: null,
    activeTier: 0,
    majorLevel: "Trusted",
    minorLevel: "All Users",
    ironlegion: null,
    locks: [lock],
    activeLockId: lock.id,
    rules: null,
    mods: null,
  };
}

export function makerFromInput(input: PresetInput): MakerState {
  const state = emptyMaker(input.mode);
  state.name = input.name;
  state.description = input.description ?? "";
  state.shared = input.shared;
  state.layout = input.data.layout ? structuredClone(input.data.layout) : null;
  state.activeGroupId = state.layout?.[0]?.id ?? null;
  state.majorLevel = input.data.major_lock_level;
  state.minorLevel = input.data.minor_lock_level;
  state.ironlegion = input.data.require_ironlegion ?? null;
  if (input.data.nation_locks.length > 0) {
    state.locks = input.data.nation_locks.map((group, index) => ({
      ...newLockGroup(index, group.label),
      nations: [...group.nations],
      releaseEnabled: group.release_hours_before !== null,
      releaseHoursBefore: group.release_hours_before ?? 24,
    }));
    state.activeLockId = state.locks[0].id;
  }
  state.rules = input.data.rules ? input.data.rules.map((entry) => ({ ...entry })) : null;
  state.mods = input.data.mods ? input.data.mods.map((entry) => ({ ...entry })) : null;
  return state;
}

export function makerToInput(state: MakerState): PresetInput {
  return {
    mode: state.mode,
    name: state.name.trim(),
    description: state.description.trim() || null,
    shared: state.shared,
    data: {
      layout: state.layout,
      nation_locks: state.locks
        .filter((group) => group.nations.length > 0)
        .map((group) => ({
          label: group.label.trim() || "Locked nations",
          nations: group.nations,
          release_hours_before: group.releaseEnabled ? group.releaseHoursBefore : null,
        })),
      major_lock_level: state.majorLevel,
      minor_lock_level: state.minorLevel,
      rules: state.rules,
      mods: state.mods,
      require_ironlegion: state.ironlegion,
    },
  };
}

/** Where each nation sits in a custom layout. */
export function nationOwners(layout: PresetGroup[] | null): Map<string, { group: PresetGroup; tier: number }> {
  const owners = new Map<string, { group: PresetGroup; tier: number }>();
  for (const group of layout ?? []) {
    group.tiers.forEach((tier, index) => {
      for (const nation of tier.nations) owners.set(nation, { group, tier: index });
    });
  }
  return owners;
}

/** Take nations out of every group. */
export function removeNations(layout: PresetGroup[], nations: string[]): PresetGroup[] {
  const drop = new Set(nations);
  return layout.map((group) => ({
    ...group,
    tiers: group.tiers.map((tier) => ({ ...tier, nations: tier.nations.filter((nation) => !drop.has(nation)) })),
  }));
}

/** Put nations into one group's sub-group (moving them out of any other). */
export function placeNations(layout: PresetGroup[], nations: string[], groupId: string, tierIndex: number): PresetGroup[] {
  const cleared = removeNations(layout, nations);
  return cleared.map((group) => {
    if (group.id !== groupId) return group;
    const tiers = group.tiers.length > 0 ? group.tiers : [{ label: null, nations: [] }];
    const index = Math.min(Math.max(0, tierIndex), tiers.length - 1);
    return {
      ...group,
      tiers: tiers.map((tier, position) =>
        position === index ? { ...tier, nations: [...tier.nations, ...nations] } : tier,
      ),
    };
  });
}

export function newGroup(index: number): PresetGroup {
  return { id: newGroupId(), name: `New group ${index + 1}`, enabled: true, builtin: false, tiers: [{ label: null, nations: [] }] };
}

/** Start customizing from the whole map, grouped the mode's standard way. */
export function customLayout(defaults: ModeDefaults | undefined): PresetGroup[] {
  const layout = layoutFromDefaults(defaults);
  return layout.length > 0 ? layout : [newGroup(0)];
}
