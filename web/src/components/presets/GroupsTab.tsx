"use client";

import { useMemo, useState } from "react";
import { PRESET_LIMITS, notPlayableNations, type ModeDefaults, type PresetGroup } from "@/lib/presetTypes";
import { SectionCard, Segmented, Toggle } from "@/components/schedule/ui";
import NationPicker from "./NationPicker";
import {
  GROUP_COLORS,
  customLayout,
  nationOwners,
  newGroup,
  placeNations,
  removeNations,
  type MakerState,
} from "./model";

/**
 * Nation groups of a preset: keep the mode's standard groups (Europe,
 * Asia… or the factions), or make custom ones — rename, reorder, turn off,
 * add new groups with sub-headings, and move nations between them (here or
 * by clicking the map). Nations outside every turned-on group aren't
 * playable: hidden from the reservation list and the map, and locked.
 */
export default function GroupsTab({
  state,
  update,
  defaults,
  allNations,
  majors,
  disabled,
}: {
  state: MakerState;
  update: (patch: Partial<MakerState>) => void;
  defaults: ModeDefaults | undefined;
  allNations: string[];
  majors: Set<string>;
  disabled: boolean;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const layout = state.layout;
  const owners = useMemo(() => nationOwners(layout), [layout]);
  const hidden = useMemo(() => notPlayableNations(layout, allNations), [layout, allNations]);
  const active = layout?.find((group) => group.id === state.activeGroupId) ?? layout?.[0] ?? null;

  const setLayout = (next: PresetGroup[], patch: Partial<MakerState> = {}) => update({ layout: next, ...patch });
  const patchGroup = (id: string, patch: Partial<PresetGroup>) =>
    layout && setLayout(layout.map((group) => (group.id === id ? { ...group, ...patch } : group)));

  if (!layout) {
    return (
      <div className="space-y-4">
        <SectionCard
          icon="🧩"
          title="Nation groups"
          subtitle="How nations are grouped on the reservation list and the map."
        >
          <Segmented
            ariaLabel="Nation groups"
            size="sm"
            value="standard"
            onChange={(value) => {
              if (value !== "custom") return;
              const next = customLayout(defaults);
              update({ layout: next, activeGroupId: next[0]?.id ?? null, activeTier: 0 });
            }}
            options={[
              { value: "standard", label: "Mode's standard groups", disabled },
              { value: "custom", label: "Custom groups", disabled },
            ]}
          />
          <p className="mt-3 text-xs text-slate-400">
            Games with this preset use the mode&apos;s usual groups. Pick <b className="text-slate-200">Custom groups</b> to
            rename, reorder or turn groups off (their nations stop being playable), or to build your own factions.
          </p>
          <ul className="mt-3 space-y-1.5">
            {(defaults?.groups ?? []).map((group, index) => (
              <li key={group.name} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLORS[index % GROUP_COLORS.length] }} />
                <span className="flex-1 text-sm font-semibold text-slate-200">{group.name}</span>
                <span className="text-[11px] text-slate-500">
                  {group.tiers.reduce((sum, tier) => sum + tier.nations.length, 0)} nations
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    );
  }

  const addGroup = () => {
    if (layout.length >= PRESET_LIMITS.groups) return;
    const group = newGroup(layout.length);
    setLayout([...layout, group], { activeGroupId: group.id, activeTier: 0 });
  };
  const deleteGroup = (id: string) => {
    const rest = layout.filter((group) => group.id !== id);
    const next = rest.length > 0 ? rest : [newGroup(0)];
    setLayout(next, { activeGroupId: state.activeGroupId === id ? next[0].id : state.activeGroupId, activeTier: 0 });
  };
  const moveGroup = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= layout.length) return;
    const next = [...layout];
    [next[index], next[target]] = [next[target], next[index]];
    setLayout(next);
  };
  const addTo = (nations: string[]) => {
    if (!active) return;
    setLayout(placeNations(layout, nations, active.id, state.activeTier));
  };

  const groupColor = (id: string) => GROUP_COLORS[Math.max(0, layout.findIndex((group) => group.id === id)) % GROUP_COLORS.length];
  const nameClash =
    active && layout.some((group) => group.id !== active.id && group.name.trim().toLowerCase() === active.name.trim().toLowerCase());

  return (
    <div className="space-y-4">
      <SectionCard
        icon="🧩"
        title="Nation groups"
        subtitle="Click a group to edit it — map clicks put nations into it."
        right={
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300">
            {layout.length}/{PRESET_LIMITS.groups}
          </span>
        }
      >
        <Segmented
          ariaLabel="Nation groups"
          size="sm"
          value="custom"
          onChange={(value) => {
            if (value === "standard") update({ layout: null, activeGroupId: null, activeTier: 0 });
          }}
          options={[
            { value: "standard", label: "Mode's standard groups", disabled },
            { value: "custom", label: "Custom groups", disabled },
          ]}
        />
        <ul className="mt-3 space-y-1.5">
          {layout.map((group, index) => {
            const isActive = group.id === active?.id;
            const count = group.tiers.reduce((sum, tier) => sum + tier.nations.length, 0);
            return (
              <li
                key={group.id}
                role="button"
                tabIndex={0}
                onClick={() => update({ activeGroupId: group.id, activeTier: 0 })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") update({ activeGroupId: group.id, activeTier: 0 });
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${
                  isActive ? "border-rose-400/60 bg-rose-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                } ${group.enabled ? "" : "opacity-60"}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: groupColor(group.id) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{group.name || "Unnamed group"}</span>
                  <span className="block text-[11px] text-slate-400">
                    {count} nation{count === 1 ? "" : "s"}
                    {group.tiers.length > 1 ? ` · ${group.tiers.length} sub-groups` : ""}
                    {group.enabled ? "" : " · off — not playable"}
                    {group.builtin ? " · standard" : ""}
                  </span>
                </span>
                {isActive && <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Editing</span>}
                <button type="button" disabled={disabled || index === 0}
                  onClick={(event) => { event.stopPropagation(); moveGroup(index, -1); }}
                  className="rounded-md px-1 text-slate-500 hover:text-white disabled:opacity-25" aria-label={`Move ${group.name} up`}>↑</button>
                <button type="button" disabled={disabled || index === layout.length - 1}
                  onClick={(event) => { event.stopPropagation(); moveGroup(index, 1); }}
                  className="rounded-md px-1 text-slate-500 hover:text-white disabled:opacity-25" aria-label={`Move ${group.name} down`}>↓</button>
                <button type="button" disabled={disabled}
                  onClick={(event) => { event.stopPropagation(); deleteGroup(group.id); }}
                  className="rounded-md px-1 text-slate-500 hover:text-rose-300 disabled:opacity-25" title="Delete group (its nations stop being playable)"
                  aria-label={`Delete ${group.name}`}>✕</button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={addGroup}
            disabled={disabled || layout.length >= PRESET_LIMITS.groups}
            className="flex-1 rounded-xl border border-dashed border-white/15 py-2 text-xs font-semibold text-slate-400 transition hover:border-amber-300/40 hover:text-amber-200 disabled:opacity-40"
          >
            ＋ New group (e.g. &quot;Axis&quot;, &quot;Pacific&quot;)
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = customLayout(defaults);
              update({ layout: next, activeGroupId: next[0]?.id ?? null, activeTier: 0 });
            }}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-white/25 hover:text-white disabled:opacity-40"
            title="Start again from the mode's standard groups"
          >
            ↺ Reset
          </button>
        </div>
      </SectionCard>

      {active && (
        <SectionCard icon="✏️" title={`Editing: ${active.name || "Unnamed group"}`} subtitle="Name, on / off, sub-groups and nations">
          <input
            value={active.name}
            maxLength={PRESET_LIMITS.groupName}
            disabled={disabled}
            onChange={(event) => patchGroup(active.id, { name: event.target.value })}
            className={`w-full rounded-lg border bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none ${
              nameClash || !active.name.trim() ? "border-rose-400/60" : "border-white/10 focus:border-amber-300/50"
            }`}
            aria-label="Group name"
          />
          {nameClash && <p className="mt-1 text-[11px] text-rose-300">Another group already has this name.</p>}
          <div className="mt-3">
            <Toggle
              checked={active.enabled}
              disabled={disabled}
              onChange={(enabled) => patchGroup(active.id, { enabled })}
              label="Playable"
              description={
                active.enabled
                  ? "Its nations are on the reservation list and the map."
                  : "Off: its nations are hidden and locked in games with this preset."
              }
            />
          </div>

          <div className="mt-4 space-y-3">
            {active.tiers.map((tier, tierIndex) => {
              const targeted = tierIndex === Math.min(state.activeTier, active.tiers.length - 1);
              return (
                <div
                  key={tierIndex}
                  className={`rounded-xl border p-2.5 ${targeted ? "border-amber-300/40 bg-amber-400/[0.04]" : "border-white/10 bg-white/[0.02]"}`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={tier.label ?? ""}
                      maxLength={PRESET_LIMITS.groupName}
                      disabled={disabled}
                      onChange={(event) =>
                        patchGroup(active.id, {
                          tiers: active.tiers.map((entry, position) =>
                            position === tierIndex ? { ...entry, label: event.target.value || null } : entry,
                          ),
                        })
                      }
                      placeholder={active.tiers.length > 1 ? "Sub-heading (e.g. Majors)" : "Optional sub-heading"}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-xs font-semibold text-slate-100 placeholder:text-slate-600 focus:border-amber-300/50 focus:outline-none"
                      aria-label={`Sub-group ${tierIndex + 1} heading`}
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => update({ activeTier: tierIndex })}
                      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        targeted ? "bg-amber-400 text-slate-950" : "bg-white/5 text-slate-400 hover:text-white"
                      }`}
                      title="New nations go here"
                    >
                      {targeted ? "Adding here" : "Add here"}
                    </button>
                    {active.tiers.length > 1 && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          // Its nations move to the first remaining sub-group.
                          const rest = active.tiers.filter((_, position) => position !== tierIndex);
                          rest[0] = { ...rest[0], nations: [...rest[0].nations, ...tier.nations] };
                          patchGroup(active.id, { tiers: rest });
                          update({ activeTier: 0 });
                        }}
                        className="rounded-md px-1 text-slate-500 hover:text-rose-300"
                        aria-label="Remove sub-group"
                        title="Remove sub-group (its nations move to the first one)"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {tier.nations.length === 0 ? (
                    <p className="mt-2 text-[11px] text-slate-500">No nations yet — click them on the map or search below.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tier.nations.map((nation) => (
                        <span
                          key={nation}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] py-0.5 pl-2 pr-1 text-xs font-semibold text-slate-100"
                        >
                          {majors.has(nation) && <span title="Major nation">👑</span>}
                          <span className="max-w-[150px] truncate">{nation}</span>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setLayout(removeNations(layout, [nation]))}
                            className="rounded px-1 text-slate-400 hover:bg-rose-500/30 hover:text-white"
                            aria-label={`Take ${nation} out of the group`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {active.tiers.length < PRESET_LIMITS.tiers && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  patchGroup(active.id, { tiers: [...active.tiers, { label: null, nations: [] }] });
                  update({ activeTier: active.tiers.length });
                }}
                className="w-full rounded-xl border border-dashed border-white/15 py-1.5 text-[11px] font-semibold text-slate-400 hover:border-amber-300/40 hover:text-amber-200"
              >
                ＋ Sub-group (e.g. &quot;Majors&quot; / &quot;Minors&quot;)
              </button>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-400">Add nations to {active.name || "this group"}</p>
            <NationPicker
              nations={allNations}
              majors={majors}
              disabled={disabled}
              status={(nation) => {
                const owner = owners.get(nation);
                return owner ? (owner.group.id === active.id ? "in this group" : `in ${owner.group.name}`) : "not playable";
              }}
              action={(nation) => {
                const owner = owners.get(nation);
                if (!owner) return "Add";
                return owner.group.id === active.id ? null : "Move here";
              }}
              onPick={(nation) => addTo([nation])}
            />
          </div>
        </SectionCard>
      )}

      <SectionCard
        icon="🚫"
        title="Not playable"
        subtitle="Nations outside every turned-on group — hidden from the list and the map, and locked."
        right={
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${hidden.length ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"}`}>
            {hidden.length}
          </span>
        }
      >
        {hidden.length === 0 ? (
          <p className="text-xs text-slate-400">Every nation of the mode is playable.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHidden((value) => !value)}
                className="text-xs font-semibold text-slate-300 hover:text-white"
              >
                {showHidden ? "Hide the list ▴" : `Show the ${hidden.length} nations ▾`}
              </button>
              {active && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => addTo(hidden.filter((nation) => !owners.has(nation)))}
                  className="ml-auto rounded-md bg-white/5 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-amber-400/20 hover:text-amber-100 disabled:opacity-40"
                  title="Nations in turned-off groups stay where they are"
                >
                  Add every ungrouped one to {active.name || "this group"}
                </button>
              )}
            </div>
            {showHidden && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hidden.map((nation) => {
                  const owner = owners.get(nation);
                  return (
                    <button
                      key={nation}
                      type="button"
                      disabled={disabled || !active}
                      onClick={() => addTo([nation])}
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-100 hover:border-amber-300/50"
                      title={owner ? `In ${owner.group.name} (turned off) — click to move to ${active?.name}` : `Click to add to ${active?.name}`}
                    >
                      {majors.has(nation) ? "👑 " : ""}
                      {nation}
                      {owner && <span className="ml-1 text-[10px] text-rose-300/70">· {owner.group.name}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
