"use client";

import { FileText, Gamepad2, Globe } from "lucide-react";
import ModeIcon from "@/components/schedule/ModeIcon";
import { Toggle } from "@/components/schedule/ui";
import { PRESET_LIMITS } from "@/lib/presetTypes";
import { SCHEDULE_MODES } from "@/lib/scheduleOptions";
import { Section } from "./parts";
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
    <div className="space-y-3">
      <Section
        icon={Gamepad2}
        title="Game mode"
        subtitle={modeLocked ? "A saved preset keeps its mode. Duplicate it for another mode." : "A preset belongs to one mode."}
      >
        <div className="grid grid-cols-2 gap-1">
          {SCHEDULE_MODES.map((mode) => {
            const active = mode.value === state.mode;
            return (
              <button
                key={mode.value}
                type="button"
                disabled={disabled || (modeLocked && !active)}
                onClick={() => onModeChange(mode.value)}
                aria-pressed={active}
                className={`gm-cut flex h-9 items-center gap-2 px-2.5 text-left text-[13px] font-semibold [--cut:7px] disabled:cursor-not-allowed disabled:opacity-30 ${
                  active ? "bg-brand-400 text-brand-950" : "bg-ink-950 text-ink-300 hover:text-ink-100"
                }`}
              >
                <ModeIcon mode={mode.value} className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{mode.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section icon={FileText} title="Name and description">
        <input
          value={state.name}
          maxLength={PRESET_LIMITS.name}
          disabled={disabled}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="e.g. Europe only, Axis vs Allies, Tournament rules"
          className={`gm-input w-full font-semibold ${state.name.trim() ? "" : "shadow-[inset_0_0_0_1px_var(--color-rose-400)]"}`}
          aria-label="Preset name"
        />
        <textarea
          value={state.description}
          maxLength={PRESET_LIMITS.description}
          disabled={disabled}
          onChange={(event) => update({ description: event.target.value })}
          rows={3}
          placeholder="What's special about it? Shown on the preset's card and in the library."
          className="gm-input mt-2 w-full resize-none"
          aria-label="Description"
        />
        <p className="mt-1 text-right text-[11px] text-ink-500">
          {state.description.length}/{PRESET_LIMITS.description}
        </p>
      </Section>

      <Section icon={Globe} title="Sharing">
        <Toggle
          checked={state.shared}
          disabled={disabled}
          onChange={(shared) => update({ shared })}
          label="Share in the public library"
          description={
            state.shared
              ? "Other servers can see it and copy it. Their copies are theirs; yours stays yours."
              : `Only ${serverName ?? "this server"} can see and use it.`
          }
        />
        <p className="mt-3 text-xs text-ink-400">
          Every host of {serverName ?? "this server"} can use it when setting up a game. Only you and staff can change or
          delete it.
        </p>
      </Section>
    </div>
  );
}
