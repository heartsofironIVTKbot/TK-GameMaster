"use client";

import { Ban, Crown, Flag, Layers, Lock, LockOpen, Pencil, Plus, Search, Swords, Trash2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  FACTION_CATEGORIES,
  FACTION_ORDER,
  REGION_ORDER,
  boardDisplayName,
  canonicalName,
  majorTagsFor,
  nationMatchKeys,
} from "@/data/nationCategories";
import { getCountryData, placeholderFlag, type ScenarioId } from "@/data/scenarioData";
import {
  HOURS_BEFORE_PRESETS,
  MAX_LOCK_GROUPS,
  modeOption,
} from "@/lib/scheduleOptions";
import type { RosterNation } from "@/lib/types";
import { formatDurationMinutes, formatInZone, formatRelative } from "@/lib/timeEngine";
import { SectionCard, Slider, Toggle } from "../ui";
import { newLockGroup, type DerivedSetup, type LockGroupForm, type SetupForm } from "./model";

/**
 * Host nation locks. Nations live in lock groups; the group being edited
 * receives map clicks and quick-select toggles. Each group can stay locked
 * for the whole game or unlock automatically some hours before the start.
 * Groups store bot slot names (what /lock and /unlock use).
 */

interface QuickSet {
  key: string;
  label: ReactNode;
  slots: string[];
}

export default function NationsTab({
  form,
  update,
  derived,
  timeZone,
  nowSec,
  scenarioId,
  nations,
  onToggleNations,
  onFocusNation,
  notPlayable = [],
  presetName = null,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  derived: DerivedSetup;
  timeZone: string;
  nowSec: number;
  scenarioId: ScenarioId | null;
  nations: RosterNation[];
  /** Toggle these slot names in the active group (all in → remove). */
  onToggleNations: (slots: string[]) => void;
  onFocusNation: (tag: string) => void;
  /** Nations the loaded preset's groups leave out (locked for good). */
  notPlayable?: string[];
  presetName?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const active =
    form.lockGroups.find((group) => group.id === form.activeGroupId) ?? form.lockGroups[0];
  const groupOf = useMemo(() => {
    const map = new Map<string, LockGroupForm>();
    for (const group of form.lockGroups) for (const slot of group.nations) map.set(slot, group);
    return map;
  }, [form.lockGroups]);
  const totalLocked = groupOf.size;

  // One row per slot name (several map tags can share a reservation slot).
  const bySlot = useMemo(() => {
    const map = new Map<string, RosterNation>();
    for (const nation of nations) {
      if (nation.slot_key && !map.has(nation.slot_key)) map.set(nation.slot_key, nation);
    }
    return map;
  }, [nations]);

  const quickSets = useMemo<QuickSet[]>(() => {
    if (!scenarioId || nations.length === 0) return [];
    const majors = majorTagsFor(scenarioId);
    const unique = [...bySlot.values()];
    const sets: QuickSet[] = [
      {
        key: "majors",
        label: <><Crown aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />Majors</>,
        slots: unique.filter((n) => majors.has(n.tag)).map((n) => n.slot_key as string),
      },
      {
        key: "minors",
        label: <><Flag aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />Minors</>,
        slots: unique.filter((n) => !majors.has(n.tag)).map((n) => n.slot_key as string),
      },
    ];
    const factions = FACTION_CATEGORIES[scenarioId];
    if (factions) {
      const ordered = [...factions].sort(
        (a, b) => FACTION_ORDER.indexOf(a.name) - FACTION_ORDER.indexOf(b.name),
      );
      for (const faction of ordered) {
        const wanted = new Set(faction.tiers.flatMap((tier) => tier.names.map(canonicalName)));
        const slots = unique
          .filter((nation) =>
            [...nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name)].some((key) => wanted.has(key)),
          )
          .map((nation) => nation.slot_key as string);
        if (slots.length > 0) {
          sets.push({
            key: `faction-${faction.name}`,
            label: <><Swords aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />{faction.name}</>,
            slots,
          });
        }
      }
    }
    for (const region of REGION_ORDER) {
      const slots = unique.filter((nation) => nation.region === region).map((nation) => nation.slot_key as string);
      if (slots.length > 0) sets.push({ key: `region-${region}`, label: region, slots });
    }
    return sets.filter((set) => set.slots.length > 0);
  }, [scenarioId, nations, bySlot]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return [...bySlot.values()]
      .filter(
        (nation) =>
          nation.name.toLowerCase().includes(needle) ||
          (nation.slot_key ?? "").toLowerCase().includes(needle) ||
          nation.tag.toLowerCase() === needle,
      )
      .slice(0, 40);
  }, [query, bySlot]);

  const updateGroup = (id: string, patch: Partial<LockGroupForm>) =>
    update({
      lockGroups: form.lockGroups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    });

  const addGroup = () => {
    if (form.lockGroups.length >= MAX_LOCK_GROUPS) return;
    const group = newLockGroup(form.lockGroups.length);
    update({ lockGroups: [...form.lockGroups, group], activeGroupId: group.id });
  };

  const removeGroup = (id: string) => {
    const rest = form.lockGroups.filter((group) => group.id !== id);
    const next = rest.length > 0 ? rest : [newLockGroup(0)];
    update({
      lockGroups: next,
      activeGroupId: form.activeGroupId === id ? next[0].id : form.activeGroupId,
    });
  };

  const maxHours = Math.max(1, Math.min(72, Math.floor((derived.gameSec - nowSec) / 3600)));
  const releaseSec = derived.releaseSec[active.id];

  return (
    <div className="space-y-3">
      {form.layout && (
        <SectionCard
          icon={Layers}
          title="Nation groups"
          subtitle={`From the preset ${presetName ?? "you loaded"}. Change them on the Presets page.`}
        >
          <div className="flex flex-wrap gap-1">
            {form.layout.map((group) => (
              <span
                key={group.id}
                className={`gm-cut inline-flex h-[26px] items-center gap-1.5 px-2.5 text-xs font-semibold [--cut:6px] ${
                  group.enabled ? "bg-ink-950 text-ink-300" : "bg-ink-950 text-ink-500 line-through"
                }`}
              >
                {group.name}
                <span className="font-medium text-ink-500">{group.tiers.reduce((sum, tier) => sum + tier.nations.length, 0)}</span>
              </span>
            ))}
          </div>
          {notPlayable.length > 0 && (
            <p className="mt-2 flex gap-2 text-xs text-ink-400" title={notPlayable.join(", ")}>
              <Ban aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
              <span>
                {notPlayable.length} nation{notPlayable.length === 1 ? " isn't" : "s aren't"} playable in this game: players
                see {notPlayable.length === 1 ? "it" : "them"} greyed out and locked, so there&apos;s no need to lock them here.
              </span>
            </p>
          )}
        </SectionCard>
      )}
      <SectionCard
        icon={Lock}
        title="Nation locks"
        subtitle={
          scenarioId
            ? "Click nations on the map to lock them, or lock a whole group below."
            : `${modeOption(form.mode)?.label ?? "This mode"} has no map: add nations by name.`
        }
        right={
          <span className={`gm-cut shrink-0 px-2 py-0.5 text-[11px] font-semibold [--cut:4px] ${totalLocked ? "bg-rose-950 text-rose-300" : "bg-ink-800 text-ink-300"}`}>
            {totalLocked} locked
          </span>
        }
      >
        <div className="space-y-1">
          {form.lockGroups.map((group) => {
            const isActive = group.id === active.id;
            return (
              <div
                key={group.id}
                role="button"
                tabIndex={0}
                onClick={() => update({ activeGroupId: group.id })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") update({ activeGroupId: group.id });
                }}
                className={`gm-cut flex cursor-pointer items-center gap-2.5 py-1.5 pl-2.5 pr-1 [--cut:7px] ${
                  isActive ? "bg-ink-800 shadow-[inset_3px_0_0_var(--color-brand-400)]" : "bg-ink-950 hover:bg-ink-800/60"
                }`}
              >
                <Lock
                  aria-hidden
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-[#c07dff]" : "text-[#3cc4ff]"}`}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink-100">{group.label}</span>
                  <span className="block truncate text-[11px] text-ink-400">
                    {group.nations.length} nation{group.nations.length === 1 ? "" : "s"},{" "}
                    {group.releaseEnabled
                      ? `unlocks ${formatDurationMinutes(group.releaseHoursBefore * 60)} before`
                      : "locked all game"}
                  </span>
                </span>
                {isActive && <span className="text-[11px] font-semibold text-brand-400">Editing</span>}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeGroup(group.id);
                  }}
                  className="grid h-7 w-7 place-items-center text-ink-500 hover:text-rose-300"
                  aria-label={`Delete ${group.label}`}
                  title="Delete group"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addGroup}
          disabled={form.lockGroups.length >= MAX_LOCK_GROUPS}
          className="gm-btn gm-btn-secondary mt-2 h-8 w-full text-[13px]"
        >
          <Plus aria-hidden strokeWidth={2} /> Add a lock group (e.g. Axis Majors until 12h before)
        </button>
      </SectionCard>

      <SectionCard icon={Pencil} title={`Editing ${active.label}`} subtitle="Its name, when it unlocks and its nations.">
        <input
          value={active.label}
          maxLength={40}
          onChange={(event) => updateGroup(active.id, { label: event.target.value })}
          className="gm-input w-full font-semibold"
          aria-label="Group name"
        />
        <div className="mt-3">
          <Toggle
            checked={active.releaseEnabled}
            onChange={(releaseEnabled) => updateGroup(active.id, { releaseEnabled })}
            label="Unlock by itself before the game"
            description={
              active.releaseEnabled
                ? undefined
                : "Off: these nations stay locked until you unlock them on the Games page."
            }
          />
          {active.releaseEnabled && (
            <div className="gm-cut gm-fade-up mt-3 bg-ink-950 p-3 [--cut:8px]">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-ink-500">Before the game</span>
                <span className="text-sm font-semibold text-brand-300">
                  {formatDurationMinutes(active.releaseHoursBefore * 60)}
                </span>
              </div>
              <Slider
                min={1}
                max={Math.max(maxHours, active.releaseHoursBefore)}
                value={active.releaseHoursBefore}
                onChange={(releaseHoursBefore) => updateGroup(active.id, { releaseHoursBefore })}
                ariaLabel="Group unlock hours before the game"
                marks={HOURS_BEFORE_PRESETS.filter((hours) => hours <= Math.max(maxHours, active.releaseHoursBefore)).map(
                  (hours) => ({ value: hours, label: `${hours}h` }),
                )}
              />
              <p className="mt-1 flex gap-2 text-xs text-ink-300">
                <LockOpen aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
                <span>
                  Unlocks <b className="font-semibold text-ink-100">{formatInZone(releaseSec * 1000, timeZone)}</b>
                  <span className="text-ink-500">
                    , {releaseSec <= nowSec ? "right after the announcement" : formatRelative(releaseSec * 1000)}
                  </span>
                </span>
              </p>
            </div>
          )}
        </div>

        {quickSets.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-ink-500">Lock a whole group (click again to unlock it)</p>
            <div className="flex flex-wrap gap-1">
              {quickSets.map((set) => {
                const inActive = set.slots.filter((slot) => active.nations.includes(slot)).length;
                const state = inActive === 0 ? "none" : inActive === set.slots.length ? "all" : "some";
                return (
                  <button
                    key={set.key}
                    type="button"
                    onClick={() => onToggleNations(set.slots)}
                    className={`gm-cut inline-flex h-[26px] items-center gap-1.5 px-2.5 text-xs font-semibold [--cut:6px] ${
                      state === "all"
                        ? "bg-[#c07dff] text-ink-950"
                        : state === "some"
                          ? "bg-ink-950 text-ink-100 shadow-[inset_0_0_0_1px_#c07dff]"
                          : "bg-ink-950 text-ink-300 hover:text-ink-100"
                    }`}
                    title={state === "all" ? "Click to unlock all" : "Click to lock all"}
                  >
                    {set.label}
                    <span className="text-[11px] font-medium opacity-70">
                      {state === "none" ? set.slots.length : `${inActive}/${set.slots.length}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {scenarioId ? (
          <div className="mt-3">
            <label className="gm-field">
              <Search aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a nation"
                aria-label="Find a nation"
              />
            </label>
            {results.length > 0 && (
              <ul className="roster-scroll mt-1.5 max-h-56 space-y-0.5 overflow-y-auto">
                {results.map((nation) => {
                  const slot = nation.slot_key as string;
                  const owner = groupOf.get(slot);
                  return (
                    <li key={slot}>
                      <NationRow
                        nation={nation}
                        scenarioId={scenarioId}
                        owner={owner ?? null}
                        activeId={active.id}
                        onToggle={() => onToggleNations([slot])}
                        onFocus={() => onFocusNation(nation.tag)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            {query.trim() && results.length === 0 && (
              <p className="mt-2 text-xs text-ink-500">No nation matches “{query}”.</p>
            )}
          </div>
        ) : (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = manualName.trim();
              if (name && !active.nations.includes(name)) onToggleNations([name]);
              setManualName("");
            }}
          >
            <input
              value={manualName}
              maxLength={128}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="Nation name exactly as on the bot's list"
              className="gm-input flex-1 text-sm"
            />
            <button type="submit" className="gm-btn gm-btn-secondary">
              <Lock aria-hidden strokeWidth={1.75} /> Lock
            </button>
          </form>
        )}

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-500">In this group ({active.nations.length})</p>
            {active.nations.length > 0 && (
              <button
                type="button"
                onClick={() => updateGroup(active.id, { nations: [] })}
                className="text-xs font-semibold text-ink-500 hover:text-rose-300"
              >
                Clear
              </button>
            )}
          </div>
          {active.nations.length === 0 ? (
            <p className="gm-cut bg-ink-950 px-3 py-4 text-center text-xs text-ink-500 [--cut:8px]">
              {scenarioId ? "Click a nation on the map to lock it." : "Add nations by name above."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {active.nations.map((slot) => {
                const nation = bySlot.get(slot);
                return (
                  <span
                    key={slot}
                    className="gm-cut inline-flex h-6 items-center gap-1 bg-ink-950 pl-2 pr-0.5 text-xs text-ink-100 shadow-[inset_0_0_0_1px_#c07dff] [--cut:5px]"
                  >
                    <button
                      type="button"
                      onClick={() => nation && onFocusNation(nation.tag)}
                      className="max-w-[150px] truncate hover:underline"
                      title={nation ? "Show on the map" : slot}
                    >
                      {nation && scenarioId ? boardDisplayName(scenarioId, nation.tag, nation.name) : slot}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleNations([slot])}
                      className="grid h-5 w-5 place-items-center text-ink-400 hover:text-ink-100"
                      aria-label={`Unlock ${slot}`}
                    >
                      <X aria-hidden className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function NationRow({
  nation,
  scenarioId,
  owner,
  activeId,
  onToggle,
  onFocus,
}: {
  nation: RosterNation;
  scenarioId: ScenarioId;
  owner: LockGroupForm | null;
  activeId: string;
  onToggle: () => void;
  onFocus: () => void;
}) {
  const data = getCountryData(nation.tag, nation.name, scenarioId);
  const inActive = owner?.id === activeId;
  return (
    <div className="gm-cut flex items-center gap-2 bg-ink-950 py-1 pl-2 pr-1 [--cut:6px]">
      {/* Scraped flag assets (static files); plain <img> like the roster. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.flagUrl || `/assets/flags/${nation.tag}.png`}
        alt=""
        className="h-3 w-[18px] shrink-0 object-cover outline outline-1 outline-white/10"
        onError={(event) => {
          event.currentTarget.src = placeholderFlag(nation.tag);
        }}
      />
      <button type="button" onClick={onFocus} className="min-w-0 flex-1 truncate text-left text-[13px] text-ink-200 hover:text-ink-100">
        {boardDisplayName(scenarioId, nation.tag, nation.name)}
        <span className="ml-1.5 text-[11px] text-ink-500">{nation.region}</span>
      </button>
      {owner && !inActive && <span className="truncate text-[11px] text-ink-500">in {owner.label}</span>}
      <button
        type="button"
        onClick={onToggle}
        className={`gm-btn h-7 shrink-0 px-2.5 text-[11.5px] [--cut:6px] ${inActive ? "gm-btn-danger" : "gm-btn-secondary"}`}
      >
        {inActive ? "Unlock" : owner ? "Move here" : "Lock"}
      </button>
    </div>
  );
}
