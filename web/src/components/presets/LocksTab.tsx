"use client";

import { useMemo } from "react";
import { newLockGroup, type LockGroupForm } from "@/components/schedule/setup/model";
import { SectionCard, Segmented, Slider, Toggle } from "@/components/schedule/ui";
import { PRESET_LIMITS } from "@/lib/presetTypes";
import { HOURS_BEFORE_PRESETS, LOCK_LEVELS, type LockLevel } from "@/lib/scheduleOptions";
import { formatDurationMinutes } from "@/lib/timeEngine";
import NationPicker from "./NationPicker";
import type { MakerState } from "./model";

/**
 * Who may reserve, and nation locks: groups of nations that start locked —
 * all game, or until some hours before the start. Same rules as the
 * calendar's Nations tab; times are "hours before the game" because a
 * preset has no date yet.
 */
export default function LocksTab({
  state,
  update,
  allNations,
  majors,
  hidden,
  disabled,
}: {
  state: MakerState;
  update: (patch: Partial<MakerState>) => void;
  allNations: string[];
  majors: Set<string>;
  /** Not-playable nations (locked for good, so not offered here). */
  hidden: Set<string>;
  disabled: boolean;
}) {
  const active = state.locks.find((group) => group.id === state.activeLockId) ?? state.locks[0];
  const ownerOf = useMemo(() => {
    const map = new Map<string, LockGroupForm>();
    for (const group of state.locks) for (const nation of group.nations) map.set(nation, group);
    return map;
  }, [state.locks]);
  const lockable = useMemo(() => allNations.filter((nation) => !hidden.has(nation)), [allNations, hidden]);

  const patchLock = (id: string, patch: Partial<LockGroupForm>) =>
    update({ locks: state.locks.map((group) => (group.id === id ? { ...group, ...patch } : group)) });
  const toggle = (nation: string) => {
    const inActive = active.nations.includes(nation);
    update({
      locks: state.locks.map((group) =>
        group.id === active.id
          ? { ...group, nations: inActive ? group.nations.filter((n) => n !== nation) : [...group.nations, nation] }
          : inActive
            ? group
            : { ...group, nations: group.nations.filter((n) => n !== nation) },
      ),
    });
  };
  const levelOptions = LOCK_LEVELS.map((level) => ({ value: level.value, label: level.label, title: level.hint, disabled }));

  return (
    <div className="space-y-4">
      <SectionCard icon="🔐" title="Who can reserve" subtitle="The game starts with these access levels (hosts can change them on the Games page).">
        <p className="mb-1.5 text-[11px] font-semibold text-slate-400">👑 Major nations</p>
        <Segmented<LockLevel>
          ariaLabel="Who can reserve major nations"
          size="sm"
          value={state.majorLevel}
          onChange={(majorLevel) => update({ majorLevel })}
          options={levelOptions}
        />
        <p className="mb-1.5 mt-3 text-[11px] font-semibold text-slate-400">🏳️ Minor nations</p>
        <Segmented<LockLevel>
          ariaLabel="Who can reserve minor nations"
          size="sm"
          value={state.minorLevel}
          onChange={(minorLevel) => update({ minorLevel })}
          options={levelOptions}
        />
      </SectionCard>

      <SectionCard
        icon="🗺️"
        title="Nation locks"
        subtitle="Nations nobody can reserve — click them on the map, or search below."
        right={
          <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-200">
            {ownerOf.size} locked
          </span>
        }
      >
        <div className="space-y-1.5">
          {state.locks.map((group) => {
            const isActive = group.id === active.id;
            return (
              <div
                key={group.id}
                role="button"
                tabIndex={0}
                onClick={() => update({ activeLockId: group.id })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") update({ activeLockId: group.id });
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
                  isActive ? "border-rose-400/60 bg-rose-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: isActive ? "#ff5266" : "#3cc4ff" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{group.label || "Locked nations"}</span>
                  <span className="block text-[11px] text-slate-400">
                    {group.nations.length} nation{group.nations.length === 1 ? "" : "s"} ·{" "}
                    {group.releaseEnabled ? `unlocks ${formatDurationMinutes(group.releaseHoursBefore * 60)} before` : "locked all game"}
                  </span>
                </span>
                {isActive && <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Editing</span>}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    const rest = state.locks.filter((entry) => entry.id !== group.id);
                    const next = rest.length > 0 ? rest : [newLockGroup(0)];
                    update({ locks: next, activeLockId: state.activeLockId === group.id ? next[0].id : state.activeLockId });
                  }}
                  className="rounded-md px-1.5 text-slate-500 hover:text-rose-300 disabled:opacity-30"
                  aria-label={`Delete ${group.label}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          disabled={disabled || state.locks.length >= PRESET_LIMITS.lockGroups}
          onClick={() => {
            const group = newLockGroup(state.locks.length);
            update({ locks: [...state.locks, group], activeLockId: group.id });
          }}
          className="mt-2 w-full rounded-xl border border-dashed border-white/15 py-2 text-xs font-semibold text-slate-400 transition hover:border-amber-300/40 hover:text-amber-200 disabled:opacity-40"
        >
          ＋ New lock group (e.g. &quot;Axis majors until 12h before&quot;)
        </button>
      </SectionCard>

      <SectionCard icon="✏️" title={`Editing: ${active.label || "Locked nations"}`} subtitle="Name, unlock time and nations of this lock group">
        <input
          value={active.label}
          maxLength={40}
          disabled={disabled}
          onChange={(event) => patchLock(active.id, { label: event.target.value })}
          className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 focus:border-amber-300/50 focus:outline-none"
          aria-label="Lock group name"
        />
        <div className="mt-3">
          <Toggle
            checked={active.releaseEnabled}
            disabled={disabled}
            onChange={(releaseEnabled) => patchLock(active.id, { releaseEnabled })}
            label="Unlock automatically before the game"
            description={active.releaseEnabled ? undefined : "Off: these nations stay locked until a host unlocks them on the Games page."}
          />
          {active.releaseEnabled && (
            <div className="gm-fade-up mt-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold text-slate-400">Before the game</span>
                <span className="text-sm font-black text-amber-200">{formatDurationMinutes(active.releaseHoursBefore * 60)}</span>
              </div>
              <Slider
                min={1}
                max={72}
                value={active.releaseHoursBefore}
                disabled={disabled}
                onChange={(releaseHoursBefore) => patchLock(active.id, { releaseHoursBefore })}
                ariaLabel="Unlock hours before the game"
                marks={HOURS_BEFORE_PRESETS.map((hours) => ({ value: hours, label: `${hours}h` }))}
              />
            </div>
          )}
        </div>

        <div className="mt-4">
          <NationPicker
            nations={lockable}
            majors={majors}
            disabled={disabled}
            status={(nation) => {
              const owner = ownerOf.get(nation);
              return owner && owner.id !== active.id ? `in ${owner.label}` : null;
            }}
            action={(nation) => {
              const owner = ownerOf.get(nation);
              return owner?.id === active.id ? "Unlock" : owner ? "Move here" : "Lock";
            }}
            onPick={toggle}
          />
          {hidden.size > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              {hidden.size} not-playable nation{hidden.size === 1 ? " is" : "s are"} locked for good and not listed here.
            </p>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-400">In this group ({active.nations.length})</p>
          {active.nations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
              Click a nation on the map to lock it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {active.nations.map((nation) => (
                <span
                  key={nation}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/15 py-0.5 pl-2 pr-1 text-xs font-semibold text-rose-100"
                >
                  {majors.has(nation) && <span>👑</span>}
                  <span className="max-w-[150px] truncate">{nation}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(nation)}
                    className="rounded px-1 text-rose-200/70 hover:bg-rose-500/30 hover:text-white"
                    aria-label={`Unlock ${nation}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
