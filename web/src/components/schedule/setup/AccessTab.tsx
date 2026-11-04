"use client";

import { Crown, Dices, Flag, LockOpen, ShieldCheck } from "lucide-react";
import {
  HOURS_BEFORE_PRESETS,
  LOCK_LEVELS,
  LOCK_LEVEL_RANK,
  lockLevelLabel,
  type LockLevel,
} from "@/lib/scheduleOptions";
import { formatDurationMinutes, formatInZone, formatRelative } from "@/lib/timeEngine";
import { Segmented, SectionCard, Slider, Toggle } from "../ui";
import type { DerivedSetup, SetupForm, UnlockForm } from "./model";
import IronLegionChoice from "@/components/IronLegionChoice";

/**
 * Who may reserve major / minor nations, and when access widens
 * automatically (the bot's automated_unlocks — applied by
 * scheduled_nation_unlock_loop once the game is announced).
 */
export default function AccessTab({
  form,
  update,
  derived,
  timeZone,
  nowSec,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  derived: DerivedSetup;
  timeZone: string;
  nowSec: number;
}) {
  const setLevel = (scope: "major" | "minor", level: LockLevel) => {
    const unlock = form.unlocks[scope];
    // Keep the unlock target wider than the new starting level.
    const target =
      LOCK_LEVEL_RANK[unlock.target] > LOCK_LEVEL_RANK[level] ? unlock.target : "All Users";
    update({
      [scope === "major" ? "majorLevel" : "minorLevel"]: level,
      unlocks: {
        ...form.unlocks,
        [scope]: { ...unlock, target, enabled: unlock.enabled && level !== "All Users" },
      },
    } as Partial<SetupForm>);
  };
  const setUnlock = (scope: "major" | "minor", patch: Partial<UnlockForm>) =>
    update({ unlocks: { ...form.unlocks, [scope]: { ...form.unlocks[scope], ...patch } } });

  return (
    <div className="space-y-3">
      {derived.casino && (
        <p className="gm-cut flex gap-2.5 bg-fuchsia-950/50 px-3 py-2.5 text-xs leading-relaxed text-fuchsia-100 [--cut:9px]">
          <Dices aria-hidden className="mt-px h-4 w-4 shrink-0 text-fuchsia-300" strokeWidth={1.75} />
          <span>
            <b>Casino games</b> set their two-step access on the Casino Host Panel. Once the bot saves this game you
            get the panel link, here and in your Discord DMs.
          </span>
        </p>
      )}
      {(["major", "minor"] as const).map((scope) => (
        <ScopeCard
          key={scope}
          scope={scope}
          level={scope === "major" ? form.majorLevel : form.minorLevel}
          unlock={form.unlocks[scope]}
          unlockSec={derived.unlockSec[scope]}
          gameSec={derived.gameSec}
          nowSec={nowSec}
          timeZone={timeZone}
          allowUnlock={!derived.casino}
          onLevel={(level) => setLevel(scope, level)}
          onUnlock={(patch) => setUnlock(scope, patch)}
        />
      ))}
      <SectionCard icon={ShieldCheck} title="IronLegion" subtitle="Do players need to authenticate their Steam account with IronLegion to reserve?">
        <IronLegionChoice value={form.ironlegion} onChange={(ironlegion) => update({ ironlegion })} />
      </SectionCard>
    </div>
  );
}

function ScopeCard({
  scope,
  level,
  unlock,
  unlockSec,
  gameSec,
  nowSec,
  timeZone,
  allowUnlock,
  onLevel,
  onUnlock,
}: {
  scope: "major" | "minor";
  level: LockLevel;
  unlock: UnlockForm;
  unlockSec: number;
  gameSec: number;
  nowSec: number;
  timeZone: string;
  allowUnlock: boolean;
  onLevel: (level: LockLevel) => void;
  onUnlock: (patch: Partial<UnlockForm>) => void;
}) {
  const name = scope === "major" ? "Major nations" : "Minor nations";
  const maxHours = Math.max(1, Math.min(72, Math.floor((gameSec - nowSec) / 3600)));
  const widest = level === "All Users";
  return (
    <SectionCard
      icon={scope === "major" ? Crown : Flag}
      title={name}
      subtitle={scope === "major" ? "Germany, USA, Soviet Union… (usually Trusted+)" : "Everyone else (usually Everyone)"}
    >
      <p className="mb-1.5 text-xs font-semibold text-ink-500">Who can reserve at first</p>
      <Segmented
        ariaLabel={`${name} starting access`}
        value={level}
        onChange={onLevel}
        options={LOCK_LEVELS.map((entry) => ({ value: entry.value, label: entry.label, title: entry.hint }))}
      />

      {allowUnlock && (
        <div className="mt-3 border-t border-ink-800 pt-3">
          <Toggle
            checked={unlock.enabled && !widest}
            disabled={widest}
            onChange={(enabled) => onUnlock({ enabled })}
            label="Open up by itself"
            description={
              widest
                ? "Already open to everyone."
                : `Widen access to ${name.toLowerCase()} at a set time before the game.`
            }
          />
          {unlock.enabled && !widest && (
            <div className="gm-cut gm-fade-up mt-3 space-y-3 bg-ink-950 p-3 [--cut:8px]">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink-500">Open to</p>
                <Segmented
                  size="sm"
                  ariaLabel={`${name} unlock target`}
                  value={unlock.target}
                  onChange={(target) => onUnlock({ target })}
                  options={LOCK_LEVELS.map((entry) => ({
                    value: entry.value,
                    label: entry.label,
                    disabled: LOCK_LEVEL_RANK[entry.value] <= LOCK_LEVEL_RANK[level],
                  }))}
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-ink-500">Before the game</span>
                  <span className="text-sm font-semibold text-brand-300">
                    {formatDurationMinutes(unlock.hoursBefore * 60)}
                  </span>
                </div>
                <Slider
                  min={1}
                  max={Math.max(maxHours, unlock.hoursBefore)}
                  value={unlock.hoursBefore}
                  onChange={(hoursBefore) => onUnlock({ hoursBefore })}
                  ariaLabel={`${name} unlock hours before the game`}
                  marks={HOURS_BEFORE_PRESETS.filter((hours) => hours <= Math.max(maxHours, unlock.hoursBefore)).map(
                    (hours) => ({ value: hours, label: `${hours}h` }),
                  )}
                />
              </div>
              <p className="flex gap-2 text-xs text-ink-300">
                <LockOpen aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
                <span>
                  {lockLevelLabel(level)} to <b className="font-semibold text-ink-100">{lockLevelLabel(unlock.target)}</b> at{" "}
                  <b className="font-semibold text-ink-100">{formatInZone(unlockSec * 1000, timeZone)}</b>
                  {unlockSec <= nowSec ? (
                    <span className="text-brand-300">: already passed, so it applies as soon as the game is announced</span>
                  ) : (
                    <span className="text-ink-500">, {formatRelative(unlockSec * 1000)}</span>
                  )}
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
