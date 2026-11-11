"use client";

import { Dices, Minus, Plus, TrendingDown, UserPlus, Users, X } from "lucide-react";
import {
  ACHIEVEMENT_TIERS,
  CASINO_ROOMS,
  MAX_CO_HOSTS,
  MAX_REROLLS,
  STEP_DOWN_HOURS,
  fromCasinoLevel,
  stepDownHours,
  toCasinoLevel,
  type CasinoConfig,
  type CasinoRoom,
  type ReRolls,
} from "@/lib/casinoSettings";
import { LOCK_LEVELS, lockLevelLabel, type LockLevel } from "@/lib/scheduleOptions";
import type { HostOption } from "@/lib/scheduleTypes";
import { SectionCard, Toggle } from "../ui";
import type { SetupForm } from "./model";

/**
 * Extras → Casino: what the Casino's own Host panel used to set (which rooms
 * are on, re-rolls, the achievements' tiers and the access step-down), saved
 * with the game in the Casino's format (lib/casinoSettings.ts). Who may roll
 * at first is the Players tab's "who can reserve".
 */
export default function CasinoSection({
  form,
  update,
  gameSec,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  gameSec: number;
}) {
  const config = form.casino;
  const set = (change: (draft: CasinoConfig) => void) => {
    const next: CasinoConfig = structuredClone(config);
    change(next);
    update({ casino: next });
  };
  const rooms = config.randomizers;
  const locks = config.locks;
  const hours = stepDownHours(config, gameSec);

  return (
    <>
      <SectionCard
        icon={Dices}
        title="Casino rooms"
        subtitle="What players roll on tkcasino.online, and how many times they may roll again. Re-rolls are per room; majors and minors can differ."
      >
        <div className="grid gap-1.5">
          {CASINO_ROOMS.map((room) => {
            const box = rooms[room.key];
            return (
              <div key={room.key} className="gm-cut bg-ink-950 px-3 py-2.5 [--cut:8px]">
                <Toggle
                  checked={box.enabled}
                  onChange={(enabled) => set((draft) => void (draft.randomizers[room.key].enabled = enabled))}
                  label={room.label}
                  description={room.hint}
                />
                {box.enabled && (
                  <div className="gm-fade-up mt-2 space-y-2 pl-14">
                    {room.key === "build" ? (
                      <>
                        <RerollRow
                          label="Land re-rolls"
                          value={rooms.build.rerolls.land}
                          onChange={(value) => set((draft) => void (draft.randomizers.build.rerolls.land = value))}
                        />
                        <RerollRow
                          label="Navy and air re-rolls"
                          value={rooms.build.rerolls.navyAir}
                          onChange={(value) => set((draft) => void (draft.randomizers.build.rerolls.navyAir = value))}
                        />
                      </>
                    ) : (
                      <RerollRow
                        label="Re-rolls"
                        value={(box as { rerolls: ReRolls }).rerolls}
                        onChange={(value) => set((draft) => void ((draft.randomizers[room.key as Exclude<CasinoRoom, "build">].rerolls as ReRolls) = value))}
                      />
                    )}
                    {room.key === "achievements" && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-xs text-ink-400">Tiers</span>
                        {ACHIEVEMENT_TIERS.map((tier) => {
                          const on = rooms.achievements.tierFilter.includes(tier);
                          const last = on && rooms.achievements.tierFilter.length === 1;
                          return (
                            <button
                              key={tier}
                              type="button"
                              aria-pressed={on}
                              disabled={last}
                              title={last ? "At least one tier stays on" : undefined}
                              onClick={() =>
                                set((draft) => {
                                  const list = draft.randomizers.achievements.tierFilter;
                                  draft.randomizers.achievements.tierFilter = on ? list.filter((t) => t !== tier) : [...list, tier].sort((a, b) => a - b);
                                })
                              }
                              className={`gm-cut h-7 w-8 text-xs font-bold [--cut:5px] ${
                                on ? "bg-brand-400 text-brand-950" : "bg-ink-800 text-ink-400 hover:text-ink-100"
                              } disabled:cursor-not-allowed`}
                            >
                              {tier}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={TrendingDown}
        title="Access step-down"
        subtitle={`At first, ${lockLevelLabel(form.majorLevel)} roll majors and ${lockLevelLabel(form.minorLevel)} roll minors (the Players tab). Closer to the game, more players can roll.`}
      >
        <Toggle
          checked={locks.enabled}
          onChange={(enabled) => set((draft) => void (draft.locks.enabled = enabled))}
          label={locks.enabled ? "Step down before the game" : "No step-down"}
          description="One step, at the time you pick: the Casino lets the levels below roll from then on."
        />
        {locks.enabled && (
          <div className="gm-fade-up mt-3 space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-500">When</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {STEP_DOWN_HOURS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={hours === option}
                    onClick={() => set((draft) => void (draft.locks.threshold = { mode: "hours", seconds: option * 3600 }))}
                    className={`gm-cut h-8 px-3 text-xs font-semibold [--cut:6px] ${
                      hours === option ? "bg-brand-400 text-brand-950" : "bg-ink-950 text-ink-300 hover:text-ink-100"
                    }`}
                  >
                    {option} h before
                  </button>
                ))}
                <label className="flex items-center gap-1.5 text-xs text-ink-400">
                  or
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={hours}
                    onChange={(event) => {
                      const value = Math.max(1, Math.min(720, Math.round(Number(event.target.value) || 1)));
                      set((draft) => void (draft.locks.threshold = { mode: "hours", seconds: value * 3600 }));
                    }}
                    className="gm-input h-8 w-20 text-center text-sm"
                    aria-label="Hours before the game"
                  />
                  hours before
                </label>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["major", "minor"] as const).map((scope) => (
                <label key={scope} className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-500">Then {scope === "major" ? "majors" : "minors"}</span>
                  <select
                    value={fromCasinoLevel(locks.degraded[scope])}
                    onChange={(event) => set((draft) => void (draft.locks.degraded[scope] = toCasinoLevel(event.target.value as LockLevel)))}
                    className="gm-input w-full text-sm font-semibold"
                  >
                    {LOCK_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}: {level.hint}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}

/** Re-roll counters for majors and minors. */
function RerollRow({ label, value, onChange }: { label: string; value: ReRolls; onChange: (value: ReRolls) => void }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-400">{label}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Counter label="Majors" value={value.major} onChange={(major) => onChange({ ...value, major })} />
        <Counter label="Minors" value={value.minor} onChange={(minor) => onChange({ ...value, minor })} />
      </div>
    </div>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <span className="mr-0.5 text-[11px] font-semibold text-ink-500">{label}</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label={`One ${label.toLowerCase()} re-roll fewer`}
        className="gm-cut grid h-6 w-6 place-items-center bg-ink-800 text-ink-200 [--cut:5px] hover:text-ink-100 disabled:opacity-40"
      >
        <Minus aria-hidden className="h-3.5 w-3.5" />
      </button>
      <span className="w-5 text-center font-mono text-sm font-semibold text-ink-100" aria-label={`${label}: ${value}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(MAX_REROLLS, value + 1))}
        disabled={value >= MAX_REROLLS}
        aria-label={`One more ${label.toLowerCase()} re-roll`}
        className="gm-cut grid h-6 w-6 place-items-center bg-ink-800 text-ink-200 [--cut:5px] hover:text-ink-100 disabled:opacity-40"
      >
        <Plus aria-hidden className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** Casino games: hosts who help run it (host tools on its map and Games page; never start, end or cancel). */
export function CoHostsCard({
  form,
  update,
  hosts,
  hostId,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  hosts: HostOption[];
  /** The game's host (can't be their own co-host). */
  hostId: string;
}) {
  const nameOf = (id: string) => {
    const host = hosts.find((entry) => entry.discord_id === id);
    return host ? host.display_name || host.username || id : id;
  };
  const choices = hosts.filter((host) => host.discord_id !== hostId && !form.coHosts.includes(host.discord_id));
  const full = form.coHosts.length >= MAX_CO_HOSTS;
  return (
    <SectionCard
      icon={Users}
      title="Co-hosts"
      subtitle="They can use the host tools on this game: add or remove players, give rolls and see receipts. Starting, ending and cancelling stay with you."
    >
      {form.coHosts.length > 0 && (
        <ul className="mb-2.5 flex flex-wrap gap-1.5">
          {form.coHosts.map((id) => (
            <li key={id} className="gm-cut flex items-center gap-1.5 bg-ink-950 py-1 pl-2.5 pr-1 text-xs font-semibold text-ink-100 [--cut:6px]">
              {nameOf(id)}
              <button
                type="button"
                onClick={() => update({ coHosts: form.coHosts.filter((other) => other !== id) })}
                aria-label={`Remove ${nameOf(id)}`}
                className="grid h-5 w-5 place-items-center text-ink-400 hover:text-rose-300"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex items-center gap-2">
        <UserPlus aria-hidden className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.75} />
        <select
          value=""
          disabled={full || choices.length === 0}
          onChange={(event) => {
            if (event.target.value) update({ coHosts: [...form.coHosts, event.target.value] });
          }}
          className="gm-input w-full text-sm"
          aria-label="Add a co-host"
        >
          <option value="">{full ? `Up to ${MAX_CO_HOSTS} co-hosts` : choices.length === 0 ? "No other hosts to add" : "Add a co-host…"}</option>
          {choices.map((host) => (
            <option key={host.discord_id} value={host.discord_id}>
              {host.display_name || host.username || host.discord_id}
              {host.username && host.display_name ? ` (@${host.username})` : ""}
            </option>
          ))}
        </select>
      </label>
    </SectionCard>
  );
}
