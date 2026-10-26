"use client";

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
    <div className="space-y-4">
      {derived.casino && (
        <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4 text-xs leading-relaxed text-fuchsia-100">
          🎰 <b>Casino games</b> manage their 2-tier access step-down on the Casino Host Panel. After the bot
          saves this game you&apos;ll get the panel link (here and in your Discord DMs) to configure it.
        </div>
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
      icon={scope === "major" ? "👑" : "🏳️"}
      title={name}
      subtitle={scope === "major" ? "Germany, USA, Soviet Union… (default Trusted+)" : "Everyone else (default Everyone)"}
    >
      <p className="mb-1.5 text-[11px] font-semibold text-slate-400">Who can reserve at first</p>
      <Segmented
        ariaLabel={`${name} starting access`}
        value={level}
        onChange={onLevel}
        options={LOCK_LEVELS.map((entry) => ({ value: entry.value, label: entry.label, title: entry.hint }))}
      />

      {allowUnlock && (
        <div className="mt-4 border-t border-white/5 pt-4">
          <Toggle
            checked={unlock.enabled && !widest}
            disabled={widest}
            onChange={(enabled) => onUnlock({ enabled })}
            label="Open up automatically"
            description={
              widest
                ? "Already open to everyone."
                : `Widen access to ${name.toLowerCase()} at a set time before the game.`
            }
          />
          {unlock.enabled && !widest && (
            <div className="gm-fade-up mt-3 space-y-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-slate-400">Open to</p>
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
                  <span className="text-[11px] font-semibold text-slate-400">Before the game</span>
                  <span className="text-sm font-black text-amber-200">
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
              <p className="text-xs text-slate-300">
                🔓 {lockLevelLabel(level)} → <b className="text-white">{lockLevelLabel(unlock.target)}</b> at{" "}
                <b className="text-white">{formatInZone(unlockSec * 1000, timeZone)}</b>
                {unlockSec <= nowSec ? (
                  <span className="text-amber-300"> — already passed, applies as soon as the game is announced</span>
                ) : (
                  <span className="text-slate-500"> · {formatRelative(unlockSec * 1000)}</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
