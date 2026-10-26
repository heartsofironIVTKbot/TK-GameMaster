"use client";

import { useMemo, useState } from "react";
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
  label: string;
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
      { key: "majors", label: "👑 Majors", slots: unique.filter((n) => majors.has(n.tag)).map((n) => n.slot_key as string) },
      { key: "minors", label: "🏳️ Minors", slots: unique.filter((n) => !majors.has(n.tag)).map((n) => n.slot_key as string) },
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
        if (slots.length > 0) sets.push({ key: `faction-${faction.name}`, label: `⚔️ ${faction.name}`, slots });
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
    <div className="space-y-4">
      {form.layout && (
        <SectionCard
          icon="🧩"
          title="Nation groups"
          subtitle={`From the preset “${presetName ?? "custom"}” — edit them on the Presets page.`}
        >
          <div className="flex flex-wrap gap-1.5">
            {form.layout.map((group) => (
              <span
                key={group.id}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  group.enabled ? "bg-white/5 text-slate-200" : "bg-rose-500/10 text-rose-200 line-through"
                }`}
              >
                {group.name} ({group.tiers.reduce((sum, tier) => sum + tier.nations.length, 0)})
              </span>
            ))}
          </div>
          {notPlayable.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400" title={notPlayable.join(", ")}>
              🚫 {notPlayable.length} nation{notPlayable.length === 1 ? " isn't" : "s aren't"} playable in this game —
              hidden from the list and the map, and locked for good (no need to lock them here).
            </p>
          )}
        </SectionCard>
      )}
      <SectionCard
        icon="🗺️"
        title="Nation locks"
        subtitle={
          scenarioId
            ? "Click nations on the map to lock them, or use the quick picks below."
            : `${modeOption(form.mode)?.label ?? "This mode"} has no interactive map — add nations by name.`
        }
        right={
          <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-200">
            {totalLocked} locked
          </span>
        }
      >
        <div className="space-y-1.5">
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
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
                  isActive ? "border-rose-400/60 bg-rose-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                }`}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: isActive ? "#ff5266" : "#3cc4ff" }}
                  title={isActive ? "Editing — red on the map" : "Blue on the map"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{group.label}</span>
                  <span className="block text-[11px] text-slate-400">
                    {group.nations.length} nation{group.nations.length === 1 ? "" : "s"} ·{" "}
                    {group.releaseEnabled
                      ? `unlocks ${formatDurationMinutes(group.releaseHoursBefore * 60)} before`
                      : "locked all game"}
                  </span>
                </span>
                {isActive && <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Editing</span>}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeGroup(group.id);
                  }}
                  className="rounded-md px-1.5 text-slate-500 hover:text-rose-300"
                  aria-label={`Delete ${group.label}`}
                  title="Delete group"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addGroup}
          disabled={form.lockGroups.length >= MAX_LOCK_GROUPS}
          className="mt-2 w-full rounded-xl border border-dashed border-white/15 py-2 text-xs font-semibold text-slate-400 transition hover:border-amber-300/40 hover:text-amber-200 disabled:opacity-40"
        >
          ＋ New lock group (e.g. &quot;Axis majors until 12h before&quot;)
        </button>
      </SectionCard>

      <SectionCard icon="✏️" title={`Editing: ${active.label}`} subtitle="Name, unlock time and nations of this group">
        <input
          value={active.label}
          maxLength={40}
          onChange={(event) => updateGroup(active.id, { label: event.target.value })}
          className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 focus:border-amber-300/50 focus:outline-none"
          aria-label="Group name"
        />
        <div className="mt-3">
          <Toggle
            checked={active.releaseEnabled}
            onChange={(releaseEnabled) => updateGroup(active.id, { releaseEnabled })}
            label="Unlock automatically before the game"
            description={
              active.releaseEnabled
                ? undefined
                : "Off: these nations stay locked until you unlock them on the Games page."
            }
          />
          {active.releaseEnabled && (
            <div className="gm-fade-up mt-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold text-slate-400">Before the game</span>
                <span className="text-sm font-black text-amber-200">
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
              <p className="mt-1 text-xs text-slate-300">
                🔓 Unlocks <b className="text-white">{formatInZone(releaseSec * 1000, timeZone)}</b>{" "}
                <span className="text-slate-500">
                  · {releaseSec <= nowSec ? "right after the announcement" : formatRelative(releaseSec * 1000)}
                </span>
              </p>
            </div>
          )}
        </div>

        {quickSets.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-400">Quick picks — toggle a whole group of nations</p>
            <div className="flex flex-wrap gap-1.5">
              {quickSets.map((set) => {
                const inActive = set.slots.filter((slot) => active.nations.includes(slot)).length;
                const state = inActive === 0 ? "none" : inActive === set.slots.length ? "all" : "some";
                return (
                  <button
                    key={set.key}
                    type="button"
                    onClick={() => onToggleNations(set.slots)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      state === "all"
                        ? "border-rose-400/70 bg-rose-500/25 text-rose-100"
                        : state === "some"
                          ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/30"
                    }`}
                    title={state === "all" ? "Click to unlock all" : "Click to lock all"}
                  >
                    {set.label}
                    <span className="ml-1 text-[10px] opacity-70">
                      {state === "none" ? set.slots.length : `${inActive}/${set.slots.length}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {scenarioId ? (
          <div className="mt-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="🔎 Find a nation…"
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
            />
            {results.length > 0 && (
              <ul className="roster-scroll mt-2 max-h-56 space-y-1 overflow-y-auto">
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
              <p className="mt-2 text-xs text-slate-500">No nation matches “{query}”.</p>
            )}
          </div>
        ) : (
          <form
            className="mt-4 flex gap-2"
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
              className="flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
            />
            <button type="submit" className="rounded-lg bg-rose-500 px-3 text-sm font-bold text-white hover:bg-rose-400">
              Lock
            </button>
          </form>
        )}

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-400">In this group ({active.nations.length})</p>
            {active.nations.length > 0 && (
              <button
                type="button"
                onClick={() => updateGroup(active.id, { nations: [] })}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-300"
              >
                Clear
              </button>
            )}
          </div>
          {active.nations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
              {scenarioId ? "Click a nation on the map to lock it." : "Add nations by name above."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {active.nations.map((slot) => {
                const nation = bySlot.get(slot);
                return (
                  <span
                    key={slot}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/15 py-0.5 pl-2 pr-1 text-xs font-semibold text-rose-100"
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
                      className="rounded px-1 text-rose-200/70 hover:bg-rose-500/30 hover:text-white"
                      aria-label={`Unlock ${slot}`}
                    >
                      ×
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
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
      {/* Scraped flag assets (static files); plain <img> like the roster. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.flagUrl || `/assets/flags/${nation.tag}.png`}
        alt=""
        className="h-4 w-6 shrink-0 rounded-[2px] border border-slate-700 object-cover"
        onError={(event) => {
          event.currentTarget.src = placeholderFlag(nation.tag);
        }}
      />
      <button type="button" onClick={onFocus} className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-slate-200 hover:text-white">
        {boardDisplayName(scenarioId, nation.tag, nation.name)}
        <span className="ml-1.5 text-[10px] font-normal text-slate-500">{nation.region}</span>
      </button>
      {owner && !inActive && <span className="truncate text-[10px] text-sky-300">in {owner.label}</span>}
      <button
        type="button"
        onClick={onToggle}
        className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
          inActive ? "bg-rose-500/25 text-rose-100 hover:bg-rose-500/40" : "bg-white/5 text-slate-300 hover:bg-rose-500/25 hover:text-rose-100"
        }`}
      >
        {inActive ? "Unlock" : owner ? "Move here" : "Lock"}
      </button>
    </div>
  );
}
