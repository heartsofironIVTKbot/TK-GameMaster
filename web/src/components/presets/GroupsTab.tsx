"use client";

import { ArrowDown, ArrowUp, Ban, ChevronDown, Layers, Map as MapIcon, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PRESET_LIMITS, notPlayableNations, type ModeDefaults, type PresetGroup } from "@/lib/presetTypes";
import { Segmented, Toggle } from "@/components/schedule/ui";
import NationPicker from "./NationPicker";
import { Count, GroupMark, NationChip, Section } from "./parts";
import { customLayout, nationOwners, newGroup, placeNations, removeNations, type MakerState } from "./model";

/**
 * Nation groups of a preset: the whole map (every nation playable, grouped
 * the mode's standard way: regions or factions), or your own groups: rename,
 * reorder, turn off, add groups with sub-headings, and move nations between
 * them (here or by clicking the map). Nations outside every turned-on group
 * aren't playable: hidden from the reservation list and the map, and locked.
 */
export default function GroupsTab({
  state,
  update,
  defaults,
  allNations,
  majors,
  flagOf,
  disabled,
}: {
  state: MakerState;
  update: (patch: Partial<MakerState>) => void;
  defaults: ModeDefaults | undefined;
  allNations: string[];
  majors: Set<string>;
  /** A nation's flag image, when the map draws it. */
  flagOf: (nation: string) => string | null;
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
  const startCustom = () => {
    const next = customLayout(defaults);
    update({ layout: next, activeGroupId: next[0]?.id ?? null, activeTier: 0 });
  };
  const source = (
    <Segmented
      ariaLabel="Nation groups"
      size="sm"
      value={layout ? "custom" : "standard"}
      onChange={(value) => {
        if (value === "custom" && !layout) startCustom();
        if (value === "standard" && layout) update({ layout: null, activeGroupId: null, activeTier: 0 });
      }}
      options={[
        { value: "standard", label: "Whole map", disabled },
        { value: "custom", label: "Our own groups", disabled },
      ]}
    />
  );

  if (!layout) {
    return (
      <div className="space-y-3">
        <Section icon={Layers} title="Nation groups" subtitle="Which nations are playable, and how the reservation list groups them.">
          {source}
          <p className="mt-3 text-xs text-ink-400">
            Every nation on the map is playable, grouped the mode&apos;s usual way. Pick{" "}
            <b className="font-semibold text-ink-200">Our own groups</b> to rename, reorder or turn groups off (their nations
            stop being playable), or to build your own factions.
          </p>
          <ul className="mt-3 space-y-1">
            {(defaults?.groups ?? []).map((group, index) => (
              <li key={group.name} className="gm-cut flex items-center gap-2.5 bg-ink-950 px-2.5 py-1.5 [--cut:7px]">
                <GroupMark name={group.name} index={index} size={22} />
                <span className="flex-1 truncate text-[13px] font-semibold text-ink-200">{group.name}</span>
                <span className="text-[11px] text-ink-500">{group.tiers.reduce((sum, tier) => sum + tier.nations.length, 0)} nations</span>
              </li>
            ))}
          </ul>
        </Section>
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
  const nameClash =
    active && layout.some((group) => group.id !== active.id && group.name.trim().toLowerCase() === active.name.trim().toLowerCase());
  const iconButton = "grid h-7 w-7 place-items-center text-ink-500 hover:text-ink-100 disabled:opacity-25";

  return (
    <div className="space-y-3">
      <Section
        icon={Layers}
        title="Nation groups"
        subtitle="Click a group to edit it. Clicking the map puts nations into it."
        right={
          <Count>
            {layout.length}/{PRESET_LIMITS.groups}
          </Count>
        }
      >
        {source}
        <ul className="mt-3 space-y-1">
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
                className={`gm-cut flex cursor-pointer items-center gap-2.5 py-1.5 pl-2 pr-1 [--cut:7px] ${
                  isActive ? "bg-ink-800 shadow-[inset_3px_0_0_var(--color-brand-400)]" : "bg-ink-950 hover:bg-ink-800/60"
                } ${group.enabled ? "" : "opacity-55"}`}
              >
                <GroupMark name={group.name} index={index} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink-100">{group.name || "Unnamed group"}</span>
                  <span className="block truncate text-[11px] text-ink-400">
                    {count} nation{count === 1 ? "" : "s"}
                    {group.tiers.length > 1 ? `, ${group.tiers.length} sub-groups` : ""}
                    {group.enabled ? "" : ", off: not playable"}
                  </span>
                </span>
                {isActive && <span className="text-[11px] font-semibold text-brand-400">Editing</span>}
                <button type="button" disabled={disabled || index === 0} className={iconButton} aria-label={`Move ${group.name} up`}
                  onClick={(event) => { event.stopPropagation(); moveGroup(index, -1); }}>
                  <ArrowUp aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button type="button" disabled={disabled || index === layout.length - 1} className={iconButton} aria-label={`Move ${group.name} down`}
                  onClick={(event) => { event.stopPropagation(); moveGroup(index, 1); }}>
                  <ArrowDown aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button type="button" disabled={disabled} className={`${iconButton} hover:text-rose-300`} aria-label={`Delete ${group.name}`}
                  title="Delete the group (its nations stop being playable)"
                  onClick={(event) => { event.stopPropagation(); deleteGroup(group.id); }}>
                  <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={addGroup}
            disabled={disabled || layout.length >= PRESET_LIMITS.groups}
            className="gm-btn gm-btn-secondary h-8 flex-1 px-3 text-[13px]"
          >
            <Plus aria-hidden strokeWidth={2} /> Add a group
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={startCustom}
            className="gm-btn gm-btn-quiet h-8 px-3 text-[13px]"
            title="Start again from the whole map's groups"
          >
            <RotateCcw aria-hidden strokeWidth={1.75} /> Start over
          </button>
        </div>
      </Section>

      {active && (
        <Section icon={Pencil} title={`Editing ${active.name || "Unnamed group"}`} subtitle="Its name, whether it's playable, sub-groups and nations.">
          <input
            value={active.name}
            maxLength={PRESET_LIMITS.groupName}
            disabled={disabled}
            onChange={(event) => patchGroup(active.id, { name: event.target.value })}
            className={`gm-input w-full font-semibold ${nameClash || !active.name.trim() ? "shadow-[inset_0_0_0_1px_var(--color-rose-400)]" : ""}`}
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

          <div className="mt-3 space-y-2">
            {active.tiers.map((tier, tierIndex) => {
              const targeted = tierIndex === Math.min(state.activeTier, active.tiers.length - 1);
              return (
                <div
                  key={tierIndex}
                  className={`gm-cut p-2.5 [--cut:8px] ${targeted ? "bg-ink-950 shadow-[inset_0_0_0_1px_var(--color-brand-400)]" : "bg-ink-950"}`}
                >
                  <div className="flex items-center gap-1.5">
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
                      placeholder={active.tiers.length > 1 ? "Sub-heading (e.g. Majors)" : "Sub-heading (optional)"}
                      className="gm-input min-h-8 min-w-0 flex-1 py-1 text-[13px] [--cut:6px]"
                      aria-label={`Sub-group ${tierIndex + 1} heading`}
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => update({ activeTier: tierIndex })}
                      className={`gm-btn h-8 px-2.5 text-xs [--cut:6px] ${targeted ? "gm-btn-primary" : "gm-btn-secondary"}`}
                      title="Map clicks and searches put nations here"
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
                        className={`${iconButton} hover:text-rose-300`}
                        aria-label="Remove the sub-group"
                        title="Remove the sub-group (its nations move to the first one)"
                      >
                        <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                  {tier.nations.length === 0 ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-500">
                      <MapIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> No nations yet. Click them on the map or search below.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tier.nations.map((nation) => (
                        <NationChip
                          key={nation}
                          name={nation}
                          flag={flagOf(nation)}
                          major={majors.has(nation)}
                          disabled={disabled}
                          onRemove={() => setLayout(removeNations(layout, [nation]))}
                          removeLabel={`Take ${nation} out of the group`}
                        />
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
                className="gm-btn gm-btn-quiet h-8 w-full text-[12.5px]"
              >
                <Plus aria-hidden strokeWidth={2} /> Add a sub-group (e.g. Majors, Minors)
              </button>
            )}
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-ink-400">Add nations to {active.name || "this group"}</p>
            <NationPicker
              nations={allNations}
              majors={majors}
              flagOf={flagOf}
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
        </Section>
      )}

      <Section
        icon={Ban}
        title="Not playable"
        subtitle="Nations outside every turned-on group: hidden from the list and the map, and locked."
        right={<Count tone={hidden.length ? "rose" : "mint"}>{hidden.length}</Count>}
      >
        {hidden.length === 0 ? (
          <p className="text-xs text-ink-400">Every nation of the mode is playable.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHidden((value) => !value)}
                className="flex items-center gap-1 text-xs font-semibold text-ink-300 hover:text-ink-100"
                aria-expanded={showHidden}
              >
                {showHidden ? "Hide the list" : `Show the ${hidden.length} nations`}
                <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${showHidden ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
              {active && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => addTo(hidden.filter((nation) => !owners.has(nation)))}
                  className="gm-btn gm-btn-secondary ml-auto h-7 px-2.5 text-[11.5px] [--cut:6px]"
                  title="Nations in turned-off groups stay where they are"
                >
                  Add the ungrouped ones to {active.name || "this group"}
                </button>
              )}
            </div>
            {showHidden && (
              <div className="mt-2 flex flex-wrap gap-1">
                {hidden.map((nation) => {
                  const owner = owners.get(nation);
                  return (
                    <button
                      key={nation}
                      type="button"
                      disabled={disabled || !active}
                      onClick={() => addTo([nation])}
                      title={owner ? `In ${owner.group.name} (turned off). Click to move it to ${active?.name}` : `Click to add it to ${active?.name}`}
                      className="hover:opacity-80 disabled:opacity-60"
                    >
                      <NationChip name={owner ? `${nation} (${owner.group.name})` : nation} flag={flagOf(nation)} major={majors.has(nation)} tone="rose" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
