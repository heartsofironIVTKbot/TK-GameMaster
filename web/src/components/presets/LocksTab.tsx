"use client";

import { Crown, Flag as FlagIcon, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import IronLegionChoice from "@/components/IronLegionChoice";
import { useMemo } from "react";
import { newLockGroup, type LockGroupForm } from "@/components/schedule/setup/model";
import { Segmented, Slider, Toggle } from "@/components/schedule/ui";
import { PRESET_LIMITS } from "@/lib/presetTypes";
import { HOURS_BEFORE_PRESETS, LOCK_LEVELS, type LockLevel } from "@/lib/scheduleOptions";
import { formatDurationMinutes } from "@/lib/timeEngine";
import NationPicker from "./NationPicker";
import { Count, NationChip, Section } from "./parts";
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
  flagOf,
  disabled,
}: {
  state: MakerState;
  update: (patch: Partial<MakerState>) => void;
  allNations: string[];
  majors: Set<string>;
  /** Not-playable nations (locked for good, so not offered here). */
  hidden: Set<string>;
  flagOf: (nation: string) => string | null;
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
    <div className="space-y-3">
      <Section icon={ShieldCheck} title="Who can reserve" subtitle="Games start with these. Hosts can change them on the Games page.">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-400">
          <Crown aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> Major nations
        </p>
        <Segmented<LockLevel>
          ariaLabel="Who can reserve major nations"
          size="sm"
          value={state.majorLevel}
          onChange={(majorLevel) => update({ majorLevel })}
          options={levelOptions}
        />
        <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink-400">
          <FlagIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> Minor nations
        </p>
        <Segmented<LockLevel>
          ariaLabel="Who can reserve minor nations"
          size="sm"
          value={state.minorLevel}
          onChange={(minorLevel) => update({ minorLevel })}
          options={levelOptions}
        />
        <div className="mt-4">
          <IronLegionChoice value={state.ironlegion} onChange={(ironlegion) => update({ ironlegion })} disabled={disabled} />
        </div>
      </Section>

      <Section
        icon={Lock}
        title="Nation locks"
        subtitle="Nations nobody can reserve. Click them on the map, or search below."
        right={<Count tone={ownerOf.size ? "rose" : "ink"}>{ownerOf.size} locked</Count>}
      >
        <div className="space-y-1">
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
                className={`gm-cut flex cursor-pointer items-center gap-2.5 py-1.5 pl-2.5 pr-1 [--cut:7px] ${
                  isActive ? "bg-ink-800 shadow-[inset_3px_0_0_var(--color-brand-400)]" : "bg-ink-950 hover:bg-ink-800/60"
                }`}
              >
                <Lock aria-hidden className={`h-4 w-4 shrink-0 ${isActive ? "text-rose-300" : "text-sky-300"}`} strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink-100">{group.label || "Locked nations"}</span>
                  <span className="block truncate text-[11px] text-ink-400">
                    {group.nations.length} nation{group.nations.length === 1 ? "" : "s"},{" "}
                    {group.releaseEnabled ? `unlocks ${formatDurationMinutes(group.releaseHoursBefore * 60)} before` : "locked all game"}
                  </span>
                </span>
                {isActive && <span className="text-[11px] font-semibold text-brand-400">Editing</span>}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    const rest = state.locks.filter((entry) => entry.id !== group.id);
                    const next = rest.length > 0 ? rest : [newLockGroup(0)];
                    update({ locks: next, activeLockId: state.activeLockId === group.id ? next[0].id : state.activeLockId });
                  }}
                  className="grid h-7 w-7 place-items-center text-ink-500 hover:text-rose-300 disabled:opacity-30"
                  aria-label={`Delete ${group.label}`}
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
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
          className="gm-btn gm-btn-secondary mt-2 h-8 w-full text-[13px]"
        >
          <Plus aria-hidden strokeWidth={2} /> Add a lock group (e.g. Axis Majors until 12h before)
        </button>
      </Section>

      <Section icon={Pencil} title={`Editing ${active.label || "Locked nations"}`} subtitle="Its name, when it unlocks and its nations.">
        <input
          value={active.label}
          maxLength={40}
          disabled={disabled}
          onChange={(event) => patchLock(active.id, { label: event.target.value })}
          className="gm-input w-full font-semibold"
          aria-label="Lock group name"
        />
        <div className="mt-3">
          <Toggle
            checked={active.releaseEnabled}
            disabled={disabled}
            onChange={(releaseEnabled) => patchLock(active.id, { releaseEnabled })}
            label="Unlock by itself before the game"
            description={active.releaseEnabled ? undefined : "Off: these nations stay locked until a host unlocks them on the Games page."}
          />
          {active.releaseEnabled && (
            <div className="gm-cut gm-fade-up mt-3 bg-ink-950 p-3 [--cut:8px]">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-ink-400">Before the game</span>
                <span className="text-sm font-semibold text-brand-300">{formatDurationMinutes(active.releaseHoursBefore * 60)}</span>
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

        <div className="mt-3">
          <NationPicker
            nations={lockable}
            majors={majors}
            flagOf={flagOf}
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
            <p className="mt-2 text-[11px] text-ink-500">
              {hidden.size} not-playable nation{hidden.size === 1 ? " is" : "s are"} locked for good and not listed here.
            </p>
          )}
        </div>

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-ink-400">In this group ({active.nations.length})</p>
          {active.nations.length === 0 ? (
            <p className="gm-cut bg-ink-950 px-3 py-4 text-center text-xs text-ink-500 [--cut:8px]">Click a nation on the map to lock it.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {active.nations.map((nation) => (
                <NationChip
                  key={nation}
                  name={nation}
                  flag={flagOf(nation)}
                  major={majors.has(nation)}
                  tone="rose"
                  disabled={disabled}
                  onRemove={() => toggle(nation)}
                  removeLabel={`Unlock ${nation}`}
                />
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
