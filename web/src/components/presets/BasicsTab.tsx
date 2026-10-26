"use client";

import { SectionCard, Toggle } from "@/components/schedule/ui";
import { PRESET_LIMITS } from "@/lib/presetTypes";
import { CATEGORY_META, SCHEDULE_MODES } from "@/lib/scheduleOptions";
import type { MakerState } from "./model";

/** Mode, name, description and sharing of a preset. */
export default function BasicsTab({
  state,
  update,
  onModeChange,
  modeLocked,
  serverName,
  disabled,
}: {
  state: MakerState;
  update: (patch: Partial<MakerState>) => void;
  onModeChange: (mode: string) => void;
  /** Saved presets keep their mode (their groups and locks belong to it). */
  modeLocked: boolean;
  serverName: string | null;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <SectionCard
        icon="🎮"
        title="Game mode"
        subtitle={modeLocked ? "A saved preset keeps its mode — duplicate it for another mode." : "Presets belong to one mode."}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {SCHEDULE_MODES.map((mode) => {
            const active = mode.value === state.mode;
            const meta = CATEGORY_META[mode.category];
            return (
              <button
                key={mode.value}
                type="button"
                disabled={disabled || (modeLocked && !active)}
                onClick={() => onModeChange(mode.value)}
                className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                  active
                    ? "border-amber-300/70 bg-amber-400/15 text-amber-100"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 disabled:opacity-35 disabled:hover:border-white/10"
                }`}
              >
                <span className={meta.text}>{meta.emoji}</span> {mode.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon="📝" title="Name & description">
        <input
          value={state.name}
          maxLength={PRESET_LIMITS.name}
          disabled={disabled}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="e.g. Europe only, Axis vs Allies, Tournament rules"
          className={`w-full rounded-lg border bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none ${
            state.name.trim() ? "border-white/10 focus:border-amber-300/50" : "border-rose-400/50"
          }`}
          aria-label="Preset name"
        />
        <textarea
          value={state.description}
          maxLength={PRESET_LIMITS.description}
          disabled={disabled}
          onChange={(event) => update({ description: event.target.value })}
          rows={3}
          placeholder="What's special about it? (shown on the preset card and in the library)"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-300/50 focus:outline-none"
          aria-label="Description"
        />
        <p className="mt-1 text-right text-[10px] text-slate-500">
          {state.description.length}/{PRESET_LIMITS.description}
        </p>
      </SectionCard>

      <SectionCard icon="🌐" title="Sharing">
        <Toggle
          checked={state.shared}
          disabled={disabled}
          onChange={(shared) => update({ shared })}
          label="Share in the public library"
          description={
            state.shared
              ? "Other servers can see this preset and copy it into their own list. Their copies are theirs — your preset stays yours."
              : `Only ${serverName ?? "this server"} can see and use it.`
          }
        />
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
          Every host of {serverName ?? "this server"} can use this preset when scheduling a game. Only you (and staff) can
          change or delete it.
        </p>
      </SectionCard>
    </div>
  );
}
