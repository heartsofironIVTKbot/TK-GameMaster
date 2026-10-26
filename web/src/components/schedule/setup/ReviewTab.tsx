"use client";

import { addOnOption, lockLevelLabel, modeOption } from "@/lib/scheduleOptions";
import type { HostOption } from "@/lib/scheduleTypes";
import { formatInZone, formatRelative, zoneCity } from "@/lib/timeEngine";
import { SectionCard } from "../ui";
import { TABS, type DerivedSetup, type EditTarget, type SetupForm, type TabId } from "./model";
import Timeline, { type TimelineMarker } from "./Timeline";

export default function ReviewTab({
  form,
  derived,
  timeZone,
  nowSec,
  markers,
  onGoTo,
  editing,
  hosts,
}: {
  form: SetupForm;
  derived: DerivedSetup;
  timeZone: string;
  nowSec: number;
  markers: TimelineMarker[];
  onGoTo: (tab: TabId) => void;
  editing: EditTarget | null;
  hosts: HostOption[];
}) {
  const hostName = (id: string | null) => {
    const host = hosts.find((entry) => entry.discord_id === id);
    return host?.display_name || host?.username || (id === editing?.hostId ? editing?.hostName : null) || "host";
  };
  const mode = modeOption(form.mode);
  const addOn = addOnOption(form.addOn);
  const lockedGroups = form.lockGroups.filter((group) => group.nations.length > 0);
  const gameMs = derived.gameSec * 1000;

  return (
    <div className="space-y-4">
      {derived.issues.length > 0 ? (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4">
          <p className="text-sm font-bold text-rose-100">Fix {derived.issues.length === 1 ? "this" : "these"} first</p>
          <ul className="mt-2 space-y-1.5">
            {derived.issues.map((issue) => (
              <li key={`${issue.section}-${issue.message}`}>
                <button
                  type="button"
                  onClick={() => onGoTo(issue.section)}
                  className="flex w-full items-start gap-2 text-left text-xs text-rose-100/90 hover:text-white"
                >
                  <span className="rounded bg-rose-500/30 px-1.5 py-px text-[10px] font-bold uppercase">
                    {TABS.find((tab) => tab.id === issue.section)?.label}
                  </span>
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
          ✓ Everything checks out — ready to send to the bot.
        </div>
      )}

      {derived.conflicts.length > 0 && (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4 text-xs text-amber-100">
          ⚠️ Another host already has a {mode?.category} game that day (
          {derived.conflicts.map((slot) => (slot.host_username ? `@${slot.host_username}` : "a host")).join(", ")}
          ). Both games can run — you&apos;ll confirm when you schedule.
        </div>
      )}

      <SectionCard icon="🎮" title={mode ? mode.label : "No mode picked"} subtitle={mode?.category}>
        <p className="text-2xl font-black text-white">{formatInZone(gameMs, timeZone)}</p>
        <p className="text-xs text-slate-400">
          {zoneCity(timeZone)} time · {formatRelative(gameMs)} · unix {derived.gameSec}
        </p>
        {editing && (
          <dl className="mt-3 grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 border-t border-white/5 pt-3 text-xs">
            <dt className="text-slate-500">Was</dt>
            <dd className={editing.originalGameSec === derived.gameSec ? "text-slate-400" : "text-amber-200"}>
              {editing.originalGameSec === derived.gameSec
                ? "Time unchanged"
                : formatInZone(editing.originalGameSec * 1000, timeZone)}
            </dd>
            <dt className="text-slate-500">Host</dt>
            <dd className={form.handoverTo ? "text-amber-200" : "text-slate-400"}>
              {form.handoverTo
                ? `${hostName(editing.hostId)} → ${hostName(form.handoverTo)}`
                : hostName(editing.hostId)}
            </dd>
          </dl>
        )}
        {editing?.editable === "time_host" && (
          <p className="mt-3 text-xs text-sky-200">
            📨 Already announced: the announcement updates, and every reserved player
            gets a DM about the change.
          </p>
        )}
      </SectionCard>

      {editing?.editable === "time_host" ? null : (
        <Timeline nowSec={nowSec} gameSec={derived.gameSec} markers={markers} timeZone={timeZone} />
      )}

      {editing?.editable !== "time_host" && <SectionCard icon="📋" title="Settings">
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-slate-500">Announcement</dt>
          <dd className="text-slate-200">
            {derived.announceSec === null
              ? "Not set"
              : form.announceMode === "now"
                ? "Right away"
                : formatInZone(derived.announceSec * 1000, timeZone)}
          </dd>
          <dt className="text-slate-500">Majors</dt>
          <dd className="text-slate-200">
            {lockLevelLabel(form.majorLevel)}
            {!derived.casino && form.unlocks.major.enabled && form.majorLevel !== "All Users" &&
              ` → ${lockLevelLabel(form.unlocks.major.target)} at ${formatInZone(derived.unlockSec.major * 1000, timeZone)}`}
          </dd>
          <dt className="text-slate-500">Minors</dt>
          <dd className="text-slate-200">
            {lockLevelLabel(form.minorLevel)}
            {!derived.casino && form.unlocks.minor.enabled && form.minorLevel !== "All Users" &&
              ` → ${lockLevelLabel(form.unlocks.minor.target)} at ${formatInZone(derived.unlockSec.minor * 1000, timeZone)}`}
          </dd>
          <dt className="text-slate-500">Nation locks</dt>
          <dd className="text-slate-200">
            {lockedGroups.length === 0
              ? "None"
              : lockedGroups
                  .map(
                    (group) =>
                      `${group.label} (${group.nations.length}${
                        group.releaseEnabled
                          ? `, unlocks ${formatInZone(derived.releaseSec[group.id] * 1000, timeZone)}`
                          : ", all game"
                      })`,
                  )
                  .join(" · ")}
          </dd>
          <dt className="text-slate-500">Preset</dt>
          <dd className="text-slate-200">{form.presetName ?? "None"}</dd>
          <dt className="text-slate-500">Nation groups</dt>
          <dd className="text-slate-200">
            {form.layout
              ? `${form.layout.filter((group) => group.enabled).map((group) => group.name).join(", ") || "none"}${
                  form.layout.some((group) => !group.enabled)
                    ? ` · off: ${form.layout.filter((group) => !group.enabled).map((group) => group.name).join(", ")}`
                    : ""
                }`
              : "Standard"}
          </dd>
          <dt className="text-slate-500">Rules</dt>
          <dd className="text-slate-200">
            {form.rules ? form.rules.map((entry) => entry.name || "(unnamed)").join(", ") || "None" : "Standard"}
            {addOn.casino && " + casino rules"}
          </dd>
          <dt className="text-slate-500">Mods</dt>
          <dd className="text-slate-200">
            {form.mods ? form.mods.map((entry) => entry.name || "(unnamed)").join(", ") || "None" : "Standard"}
          </dd>
          <dt className="text-slate-500">Draft</dt>
          <dd className="text-slate-200">
            {form.draft
              ? `${form.draft.teams
                  .map((team) => `${team.name || "?"} (${team.captainName ?? "no captain"}: ${team.groups.join(", ") || "no groups"})`)
                  .join(" vs ")} · ${form.draft.coinFlip ? "coin toss" : `${form.draft.teams[form.draft.firstPicker].name} first`}`
              : "No"}
          </dd>
          <dt className="text-slate-500">Add-on</dt>
          <dd className="text-slate-200">
            {addOn.emoji} {addOn.label}
            {form.addOn === "fortunes" && ` (${form.fortunesMode})`}
          </dd>
          <dt className="text-slate-500">Logging</dt>
          <dd className="text-slate-200">{form.loggingMode}</dd>
          <dt className="text-slate-500">Reminder</dt>
          <dd className="text-slate-200">{form.autoReminder ? `On · checksum ${form.checksum}` : "Off"}</dd>
        </dl>
      </SectionCard>}
    </div>
  );
}
