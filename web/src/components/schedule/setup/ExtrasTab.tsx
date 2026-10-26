"use client";

import { useEffect, useState } from "react";
import ResourceListEditor from "@/components/presets/ResourceListEditor";
import { PRESET_LIMITS, type ModeDefaults } from "@/lib/presetTypes";
import { ADD_ONS, LOGGING_MODES, addOnOption } from "@/lib/scheduleOptions";
import { DRAFT_BLOCKED_ADDONS } from "@/lib/scheduleValidation";
import { Segmented, SectionCard, Toggle } from "../ui";
import DraftSection from "./DraftSection";
import { randomChecksum, type SetupForm } from "./model";

export default function ExtrasTab({
  form,
  update,
  modeDefaults,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  /** The mode's standard rules and mods (from the bot). */
  modeDefaults?: ModeDefaults;
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
    <div className="space-y-4">
      <SectionCard icon="🧩" title="Add-on" subtitle="Special events show as 🟪 on the calendar">
        <div className="grid grid-cols-2 gap-1.5">
          {ADD_ONS.map((addOn) => {
            const active = form.addOn === addOn.value;
            return (
              <button
                key={addOn.value ?? "none"}
                type="button"
                onClick={() => (addOn.unavailable ? setUnavailable(addOn.label) : update({ addOn: addOn.value }))}
                aria-disabled={addOn.unavailable || undefined}
                className={`rounded-xl border p-2.5 text-left transition ${
                  active
                    ? "border-amber-300/80 bg-amber-400/15"
                    : addOn.unavailable
                      ? "border-white/5 bg-white/[0.02] opacity-50 hover:opacity-70"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-base">{addOn.emoji}</span>
                  <span className={`truncate text-[13px] font-bold ${active ? "text-amber-100" : "text-slate-100"}`}>{addOn.label}</span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{addOn.description}</span>
              </button>
            );
          })}
        </div>
        {unavailable && (
          <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            onClick={() => setUnavailable(null)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="addon-unavailable-title"
              className="gm-fade-up w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-5 text-center shadow-2xl shadow-black/60"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-3xl">🚧</p>
              <h3 id="addon-unavailable-title" className="mt-2 text-base font-black text-white">
                These modes are currently unavailable
              </h3>
              <p className="mt-1.5 text-sm text-slate-300">
                {unavailable} can&apos;t be scheduled right now. It&apos;s coming back with the new Casino website.
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => setUnavailable(null)}
                className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-300"
              >
                OK
              </button>
            </div>
          </div>
        )}
        {form.addOn === "fortunes" && (
          <div className="gm-fade-up mt-3">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-400">Fortunes of War mode</p>
            <Segmented
              ariaLabel="Fortunes of War mode"
              value={form.fortunesMode}
              onChange={(fortunesMode) => update({ fortunesMode })}
              options={[
                { value: "casual", label: "🎉 Casual" },
                { value: "competitive", label: "🏆 Competitive" },
              ]}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard icon="📋" title="Attendance logging" subtitle="How no-shows are warned after the game">
        <div className="space-y-1.5">
          {LOGGING_MODES.map((mode) => {
            const active = form.loggingMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => update({ loggingMode: mode.value })}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                  active ? "border-amber-300/80 bg-amber-400/15" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                }`}
              >
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                    active ? "border-amber-300 bg-amber-400 shadow-[inset_0_0_0_3px_#0f172a]" : "border-slate-500"
                  }`}
                />
                <span>
                  <span className="block text-sm font-bold text-slate-100">{mode.label}</span>
                  <span className="block text-[11px] text-slate-400">{mode.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon="⏰" title="Automatic reminder" subtitle="DM every reserved player one hour before the game">
        <Toggle
          checked={form.autoReminder}
          onChange={(autoReminder) => update({ autoReminder })}
          label={form.autoReminder ? "Reminder on" : "Reminder off"}
          description="Players confirm attendance with the checksum below."
        />
        {form.autoReminder && (
          <div className="gm-fade-up mt-3 flex items-center gap-2">
            <input
              value={form.checksum}
              maxLength={4}
              onChange={(event) =>
                update({ checksum: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) })
              }
              className="w-28 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-center font-mono text-lg font-black tracking-[0.3em] text-amber-200 focus:border-amber-300/50 focus:outline-none"
              aria-label="Reminder checksum (4 letters or digits)"
            />
            <button
              type="button"
              onClick={() => update({ checksum: randomChecksum() })}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-amber-300/40"
            >
              🎲 New
            </button>
            <span className="text-[11px] text-slate-500">4 letters or digits</span>
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
                ? "This is a casino game — the casino rules are added automatically."
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
    </div>
  );
}
