"use client";

import { BellRing, CircleOff, ClipboardCheck, Construction, Dices, Shuffle, Skull, Sparkles, Spade, Trophy, PartyPopper, Waves, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import ResourceListEditor from "@/components/presets/ResourceListEditor";
import { PRESET_LIMITS, type ModeDefaults } from "@/lib/presetTypes";
import { ADD_ONS, HOME_ONLY_ADD_ONS, LOGGING_MODES, addOnLocked, addOnOption } from "@/lib/scheduleOptions";
import type { HostOption } from "@/lib/scheduleTypes";
import { DRAFT_BLOCKED_ADDONS } from "@/lib/scheduleValidation";
import { Segmented, SectionCard, Toggle } from "../ui";
import CasinoSection, { CoHostsCard } from "./CasinoSection";
import DraftSection from "./DraftSection";
import { randomChecksum, type SetupForm } from "./model";

/** Each add-on's line icon (the calendar shows add-on games purple). */
const ADD_ON_ICON: Record<string, LucideIcon> = {
  none: CircleOff,
  randomizer: Dices,
  fortunes: Spade,
  zombies: Skull,
  leviathan: Waves,
};

export default function ExtrasTab({
  form,
  update,
  modeDefaults,
  homeServer,
  isStaff = false,
  hosts,
  hostId,
  gameSec,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  /** The mode's standard rules and mods (from the bot). */
  modeDefaults?: ModeDefaults;
  /** TommyKay's server: the only one with the Casino and Fortunes of War. */
  homeServer: boolean;
  /** Host Management: can pick the Casino add-ons before they're switched on (a test game). */
  isStaff?: boolean;
  /** The server's hosts (co-hosts are picked from them). */
  hosts: HostOption[];
  /** The game's host. */
  hostId: string;
  gameSec: number;
}) {
  // Draft teams draft from the game's nation groups (the preset's turned-on ones, else the mode's).
  const draftGroups = form.layout
    ? form.layout.filter((group) => group.enabled).map((group) => group.name)
    : (modeDefaults?.groups ?? []).map((group) => group.name);
  const draftBlocked =
    form.addOn && DRAFT_BLOCKED_ADDONS.has(form.addOn)
      ? `${addOnOption(form.addOn).label} games hand out nations by luck — they can't be drafts.`
      : null;
  // Casino / Fortunes of War: shown but not pickable yet — a click explains why.
  const [unavailable, setUnavailable] = useState<string | null>(null);
  useEffect(() => {
    if (!unavailable) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUnavailable(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unavailable]);

  return (
    <div className="space-y-3">
      <SectionCard icon={Sparkles} title="Add-on" subtitle="Add-on games show purple on the calendar.">
        <div className="grid gap-1">
          {ADD_ONS.filter((addOn) => homeServer || !addOn.value || !HOME_ONLY_ADD_ONS.has(addOn.value)).map((addOn) => {
            const active = form.addOn === addOn.value;
            const locked = addOnLocked(addOn.value, isStaff);
            // Host Management before the switch-on: a test game.
            const testOnly = Boolean(addOn.unavailable) && !locked;
            const Icon = ADD_ON_ICON[addOn.value ?? "none"] ?? Sparkles;
            return (
              <button
                key={addOn.value ?? "none"}
                type="button"
                onClick={() => (locked ? setUnavailable(addOn.label) : update({ addOn: addOn.value }))}
                aria-disabled={locked || undefined}
                aria-pressed={active}
                className={`gm-cut grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 bg-ink-950 px-2.5 py-2 text-left [--cut:8px] ${
                  active
                    ? addOn.value
                      ? "shadow-[inset_0_0_0_1px_oklch(66%_0.2_312)]"
                      : "shadow-[inset_0_0_0_1px_var(--color-brand-400)]"
                    : locked
                      ? "opacity-45 hover:opacity-65"
                      : "hover:bg-ink-800/60"
                }`}
              >
                <span
                  className={`gm-cut grid h-[30px] w-[30px] place-items-center [--cut:6px] ${
                    active ? (addOn.value ? "bg-[oklch(66%_0.2_312)] text-white" : "bg-brand-400 text-brand-950") : "bg-ink-800 text-ink-300"
                  }`}
                >
                  <Icon aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-100">{addOn.label}</span>
                  <span className="block text-xs text-ink-400">
                    {testOnly ? "Not switched on yet: Host Management can schedule a test game." : addOn.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {unavailable && (
          <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-950/75 p-4"
            onClick={() => setUnavailable(null)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="addon-unavailable-title"
              className="gm-plate gm-fade-up flex w-full max-w-sm flex-col items-center bg-ink-950 p-5 text-center [--cut:16px]"
              onClick={(event) => event.stopPropagation()}
            >
              <Construction aria-hidden className="h-7 w-7 text-yellow-300" strokeWidth={1.75} />
              <h3 id="addon-unavailable-title" className="gm-title mt-3 text-[24px]">
                Not available right now
              </h3>
              <p className="mt-1.5 text-sm text-ink-300">
                {unavailable} can&apos;t be scheduled right now. It&apos;s coming back with the new Casino website.
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => setUnavailable(null)}
                className="gm-btn gm-btn-primary mt-4"
              >
                OK
              </button>
            </div>
          </div>
        )}
        {form.addOn === "fortunes" && (
          <div className="gm-fade-up mt-3">
            <p className="mb-1.5 text-xs font-semibold text-ink-500">Fortunes of War mode</p>
            <Segmented
              ariaLabel="Fortunes of War mode"
              value={form.fortunesMode}
              onChange={(fortunesMode) => update({ fortunesMode })}
              options={[
                { value: "casual", label: <span className="inline-flex items-center gap-1.5"><PartyPopper aria-hidden className="h-3.5 w-3.5" />Casual</span> },
                { value: "competitive", label: <span className="inline-flex items-center gap-1.5"><Trophy aria-hidden className="h-3.5 w-3.5" />Competitive</span> },
              ]}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard icon={ClipboardCheck} title="Attendance" subtitle="How no-shows are warned after the game">
        <div className="space-y-1">
          {LOGGING_MODES.map((mode) => {
            const active = form.loggingMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => update({ loggingMode: mode.value })}
                aria-pressed={active}
                className={`gm-cut flex w-full items-start gap-3 bg-ink-950 px-3 py-2.5 text-left [--cut:8px] ${
                  active ? "shadow-[inset_0_0_0_1px_var(--color-brand-400)]" : "hover:bg-ink-800/60"
                }`}
              >
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                    active ? "border-brand-400 bg-brand-400 shadow-[inset_0_0_0_3px_var(--color-ink-950)]" : "border-ink-500"
                  }`}
                />
                <span>
                  <span className="block text-[13px] font-semibold text-ink-100">{mode.label}</span>
                  <span className="block text-xs text-ink-400">{mode.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon={BellRing} title="Reminder" subtitle="DM every reserved player an hour before the game">
        <Toggle
          checked={form.autoReminder}
          onChange={(autoReminder) => update({ autoReminder })}
          label={form.autoReminder ? "Send a reminder" : "No reminder"}
          description="Players confirm they're coming with the code below."
        />
        {form.autoReminder && (
          <div className="gm-fade-up mt-3 flex items-center gap-2">
            <input
              value={form.checksum}
              maxLength={4}
              onChange={(event) =>
                update({ checksum: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) })
              }
              className="gm-input w-28 text-center font-mono text-lg font-semibold tracking-[0.3em] text-brand-300"
              aria-label="Reminder code (4 letters or digits)"
            />
            <button
              type="button"
              onClick={() => update({ checksum: randomChecksum() })}
              className="gm-btn gm-btn-secondary h-9 px-3 text-xs"
            >
              <Shuffle aria-hidden strokeWidth={1.75} /> New
            </button>
            <span className="text-[11px] text-ink-500">4 letters or digits</span>
          </div>
        )}
      </SectionCard>

      {form.mode && (
        <DraftSection draft={form.draft} groups={draftGroups} blocked={draftBlocked} onChange={(draft) => update({ draft })} />
      )}

      {form.mode && (
        <>
          <ResourceListEditor
            kind="rules"
            entries={form.rules}
            standard={modeDefaults?.rules ?? []}
            limit={PRESET_LIMITS.rules}
            onChange={(rules) => update({ rules })}
            note={
              addOnOption(form.addOn).casino
                ? "This is a casino game: the casino rules are added by themselves."
                : "Hosts can still change the list on the Games page after the announcement."
            }
          />
          <ResourceListEditor
            kind="mods"
            entries={form.mods}
            standard={modeDefaults?.mods ?? []}
            limit={PRESET_LIMITS.mods}
            onChange={(mods) => update({ mods })}
          />
        </>
      )}

      {/* Casino settings come last, under everything (Niko, 2026-11-08). */}
      {form.addOn === "randomizer" && <CasinoSection form={form} update={update} gameSec={gameSec} />}
      {(form.addOn === "randomizer" || form.addOn === "fortunes") && <CoHostsCard form={form} update={update} hosts={hosts} hostId={hostId} />}
    </div>
  );
}
