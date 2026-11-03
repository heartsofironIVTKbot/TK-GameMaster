"use client";

import { useMemo } from "react";
import {
  CATEGORY_META,
  SCHEDULE_MODES,
  modeOption,
  type ScheduleCategory,
} from "@/lib/scheduleOptions";
import type { CalendarDayLock, HostOption } from "@/lib/scheduleTypes";
import { branchOfMode, type HostBranch } from "@/lib/hostBranches";
import { canBookDay, lastBookableDay, type BookingDays } from "@/lib/bookingWindow";
import {
  DAY_NAMES,
  addDays,
  dateInZone,
  discordTag,
  formatInZone,
  formatOffset,
  formatRelative,
  hhmmToMinutes,
  isHHMM,
  minutesToHHMM,
  mondayOf,
  offsetMinutes,
  timeInZone,
  weekdayIndex,
  zoneCity,
} from "@/lib/timeEngine";
import type { GamePreset } from "@/lib/presetTypes";
import { CopyButton, SectionCard, Slider } from "../ui";
import { clearPreset, type DerivedSetup, type EditTarget, type SetupForm } from "./model";
import PresetPicker from "./PresetPicker";

/** Zones shown in "what players see" (deduped against the host's zone). */
const SAMPLE_ZONES = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const QUICK_TIMES = ["16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

export default function GameTab({
  form,
  update,
  derived,
  timeZone,
  today,
  locks,
  onModeChange,
  onApplyPreset,
  editing,
  hosts,
  branches,
  disabledModes,
  booking,
  nowMs,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  derived: DerivedSetup;
  timeZone: string;
  today: string;
  locks: CalendarDayLock[];
  onModeChange: (mode: string) => void;
  onApplyPreset: (preset: GamePreset) => void;
  editing: EditTarget | null;
  hosts: HostOption[];
  /** Host branches the viewer may host (RP → Roleplay modes, HIST → Historical; staff: both). */
  branches: HostBranch[];
  /** Modes the server turned off in its settings. */
  disabledModes: string[];
  /** How far ahead the host may book (HostProfile.booking_days). */
  booking: BookingDays;
  nowMs: number;
}) {
  // No limit (staff): four weeks of buttons, and a date field for anything later.
  const lastDay = lastBookableDay(booking, today, nowMs, timeZone, form.mode || null);
  const bookableDays = useMemo(() => {
    const days: string[] = [];
    const last = lastDay ?? addDays(today, 27);
    for (let date = today; date <= last; date = addDays(date, 1)) days.push(date);
    // An edited game may sit outside today's booking window — keep its day.
    if (editing && !days.includes(editing.originalDate) && editing.originalDate >= today) {
      days.push(editing.originalDate);
      days.sort();
    }
    return days;
  }, [today, editing, lastDay]);
  const timeOnly = editing?.editable === "time_host";
  const lockedDates = useMemo(() => {
    const set = new Set<string>();
    for (const lock of locks) {
      const index = (DAY_NAMES as readonly string[]).indexOf(lock.day);
      if (index >= 0) set.add(addDays(lock.week, index));
    }
    return set;
  }, [locks]);

  const gameMs = derived.gameSec * 1000;
  const minutes = hhmmToMinutes(form.time);

  return (
    <div className="space-y-4">
      {editing && <HostCard form={form} update={update} editing={editing} hosts={hosts} />}
      {!timeOnly && form.mode && !branches.includes(branchOfMode(form.mode)) && (
        <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {form.mode} is a {branchOfMode(form.mode) === "RP" ? "Roleplay" : "Historical"} game — you need an{" "}
          {branchOfMode(form.mode)} host rank to host it.
          {branches.length > 0 &&
            ` Pick a ${branches.map((branch) => (branch === "RP" ? "Roleplay" : "Historical")).join(" or ")} mode.`}
        </p>
      )}
      {timeOnly ? (
        <SectionCard icon="🎮" title={modeOption(form.mode)?.label ?? form.mode} subtitle="Game mode">
          <p className="text-xs text-ink-400">
            The mode, nation locks and other settings are fixed here once a game is announced — change
            access, nation locks, rules and mods on the Games page.
          </p>
        </SectionCard>
      ) : (
        <>
          <ModePicker value={form.mode} onChange={onModeChange} branches={branches} hidden={disabledModes} />
          <PresetPicker
            mode={form.mode}
            presetId={form.presetId}
            presetName={form.presetName}
            onApply={onApplyPreset}
            onClear={() => update(clearPreset(form))}
          />
        </>
      )}

      <SectionCard icon="📅" title="Day" subtitle="Bookable days — 🔒 days are locked by staff">
        <div className="roster-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {bookableDays.map((date) => {
            const active = date === form.date;
            // Staff locks never block the day an edited game is already on.
            const locked = lockedDates.has(date) && date !== editing?.originalDate;
            return (
              <button
                key={date}
                type="button"
                disabled={locked}
                onClick={() => update({ date })}
                title={locked ? "Locked by staff" : undefined}
                className={`flex w-12 shrink-0 flex-col items-center rounded-xl border py-1.5 transition ${
                  active
                    ? "border-brand-300 bg-brand-400 text-ink-950"
                    : locked
                      ? "gm-hatch cursor-not-allowed border-white/10 text-ink-500"
                      : "border-white/10 bg-white/[0.03] text-ink-200 hover:border-white/30"
                } ${weekdayIndex(date) === 0 && date !== today ? "ml-2" : ""}`}
              >
                <span className="text-[10px] font-bold uppercase">{DAY_NAMES[weekdayIndex(date)].slice(0, 3)}</span>
                <span className="text-base font-black leading-tight">{Number(date.slice(8))}</span>
                <span className="text-[9px] font-semibold opacity-70">{locked ? "🔒" : date === today ? "today" : ""}</span>
              </button>
            );
          })}
        </div>
        {lastDay === null && (
          <label className="mt-2 flex items-center gap-2 text-xs text-ink-400">
            Later date
            <input
              type="date"
              min={today}
              value={bookableDays.includes(form.date) ? "" : form.date}
              onChange={(event) => event.target.value && update({ date: event.target.value })}
              className="rounded-lg border border-white/10 bg-ink-950/70 px-2 py-1 text-xs text-ink-100 [color-scheme:dark]"
            />
          </label>
        )}
        {!canBookDay(booking, form.date, today, nowMs, timeZone, form.mode || null) && form.date !== editing?.originalDate && (
          <p className="mt-2 text-xs text-rose-300">
            {form.date} isn&apos;t bookable any more — pick one of the days above.
          </p>
        )}
        <p className="mt-2 text-[11px] text-ink-500">
          Board week of {mondayOf(form.date)} · {DAY_NAMES[weekdayIndex(form.date)]}
        </p>
      </SectionCard>

      <SectionCard
        icon="🕒"
        title="Start time"
        subtitle={`Your local time · ${zoneCity(timeZone)} (${formatOffset(offsetMinutes(gameMs, timeZone))})`}
      >
        <div className="flex items-end justify-between gap-3">
          <p className="text-5xl font-black tabular-nums tracking-tight text-white">{form.time}</p>
          <input
            type="time"
            value={form.time}
            step={60}
            onChange={(event) => {
              if (isHHMM(event.target.value)) update({ time: event.target.value });
            }}
            className="rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm font-semibold text-ink-100 [color-scheme:dark] focus:border-brand-300/50 focus:outline-none"
            aria-label="Exact start time"
          />
        </div>
        <div className="mt-3">
          <Slider
            min={0}
            max={23 * 60 + 45}
            step={15}
            value={Math.min(minutes - (minutes % 15), 23 * 60 + 45)}
            onChange={(value) => update({ time: minutesToHHMM(value) })}
            ariaLabel="Start time"
            marks={[
              { value: 0, label: "00" },
              { value: 360, label: "06" },
              { value: 720, label: "12" },
              { value: 1080, label: "18" },
              { value: 1425, label: "24" },
            ]}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => update({ time })}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold tabular-nums transition ${
                form.time === time
                  ? "border-brand-300 bg-brand-400 text-ink-950"
                  : "border-white/10 bg-white/[0.04] text-ink-300 hover:border-white/30"
              }`}
            >
              {time}
            </button>
          ))}
        </div>
        {derived.conversion === "skipped" && (
          <p className="mt-3 rounded-lg border border-brand-300/30 bg-brand-400/10 px-3 py-2 text-xs text-brand-100">
            ⚠️ Clocks jump forward that night — {form.time} doesn&apos;t exist in {zoneCity(timeZone)}, so the game is
            set to {timeInZone(gameMs, timeZone)}.
          </p>
        )}
        {derived.conversion === "ambiguous" && (
          <p className="mt-3 rounded-lg border border-brand-300/30 bg-brand-400/10 px-3 py-2 text-xs text-brand-100">
            ⚠️ Clocks fall back that night, so {form.time} happens twice — the first one is used.
          </p>
        )}
      </SectionCard>

      <ConversionCard gameSec={derived.gameSec} timeZone={timeZone} />

      {(derived.sameDay.length > 0 || form.mode) && (
        <SectionCard icon="👥" title="Same day" subtitle="Other games on the board that day">
          {derived.sameDay.length === 0 ? (
            <p className="text-xs text-ink-400">No other games yet — the day is yours.</p>
          ) : (
            <ul className="space-y-1.5">
              {derived.sameDay.map((slot) => {
                const conflict = derived.conflicts.includes(slot);
                return (
                  <li
                    key={slot.slot_id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                      conflict ? "border-brand-300/40 bg-brand-400/10 text-brand-100" : "border-white/10 text-ink-300"
                    }`}
                  >
                    <span className="tabular-nums font-bold">{timeInZone(slot.game_timestamp * 1000, timeZone)}</span>
                    <span className="truncate">{modeOption(slot.mode)?.label ?? slot.mode}</span>
                    <span className="ml-auto truncate text-ink-400">
                      {slot.mine ? "you" : slot.host_username ? `@${slot.host_username}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {derived.conflicts.length > 0 && (
            <p className="mt-2 text-[11px] text-brand-200/80">
              Another host already runs a {modeOption(form.mode)?.category ?? ""} game this day. That&apos;s allowed —
              you&apos;ll be asked to confirm.
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function ModePicker({
  value,
  onChange,
  branches,
  hidden,
}: {
  value: string;
  onChange: (mode: string) => void;
  branches: readonly HostBranch[];
  /** Modes the server turned off (server settings → Game modes). */
  hidden: readonly string[];
}) {
  return (
    <SectionCard icon="🎮" title="Game mode" subtitle="What are you hosting?">
      <div className="space-y-3">
        {(["Roleplay", "Historical"] as ScheduleCategory[]).map((category) => {
          const branch: HostBranch = category === "Roleplay" ? "RP" : "HIST";
          const allowed = branches.includes(branch);
          if (!SCHEDULE_MODES.some((mode) => mode.category === category && !hidden.includes(mode.value))) return null;
          return (
          <div key={category} className={allowed ? "" : "opacity-50"}>
            <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${CATEGORY_META[category].text}`}>
              {CATEGORY_META[category].emoji} {category}
              {!allowed && <span className="ml-1 normal-case tracking-normal text-ink-400">· needs an {branch} host rank</span>}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {SCHEDULE_MODES.filter((mode) => mode.category === category && !hidden.includes(mode.value)).map((mode) => {
                const active = value === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    disabled={!allowed}
                    onClick={() => onChange(mode.value)}
                    title={allowed ? undefined : `Only ${branch} hosts host ${category} games`}
                    className={`group rounded-xl border px-3 py-2 text-left transition-all disabled:cursor-not-allowed ${
                      active
                        ? "border-brand-300/80 bg-brand-400/15 shadow-[0_0_18px_rgba(251,191,36,0.18)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className={`block truncate text-[13px] font-bold ${active ? "text-brand-100" : "text-ink-100"}`}>
                      {mode.label}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1 text-[10px] font-semibold">
                      {mode.scenarioId ? (
                        <span className="text-emerald-300/80">🗺️ Map</span>
                      ) : (
                        <span className="text-ink-500">No map</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/** Editing: who hosts the game, with an optional handover to another host. */
function HostCard({
  form,
  update,
  editing,
  hosts,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  editing: EditTarget;
  hosts: HostOption[];
}) {
  const current = form.handoverTo ?? editing.hostId;
  // Only hosts of this game's branch (RP → Roleplay, HIST → Historical) can take it over.
  const branch = branchOfMode(form.mode);
  const eligible = hosts.filter(
    (host) => host.discord_id === editing.hostId || host.branches.length === 0 || host.branches.includes(branch),
  );
  const options = eligible.some((host) => host.discord_id === editing.hostId)
    ? eligible
    : [{ discord_id: editing.hostId, username: editing.hostName, display_name: null, branches: [] }, ...eligible];
  return (
    <SectionCard icon="🎙️" title="Host" subtitle={`Hand the game over to another ${branch} host if needed`}>
      <select
        value={current}
        onChange={(event) =>
          update({ handoverTo: event.target.value === editing.hostId ? null : event.target.value })
        }
        className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm font-semibold text-ink-100 [color-scheme:dark] focus:border-brand-300/50 focus:outline-none"
        aria-label="Host"
      >
        {options.map((host) => (
          <option key={host.discord_id} value={host.discord_id}>
            {host.display_name || host.username || host.discord_id}
            {host.username && host.display_name ? ` (@${host.username})` : ""}
            {host.discord_id === editing.hostId ? " — current host" : ""}
          </option>
        ))}
      </select>
      {form.handoverTo && (
        <p className="mt-2 text-xs text-brand-200">
          The game moves to the new host when you save
          {editing.editable === "time_host" ? "; the announcement and reserved players are updated too." : "."}
        </p>
      )}
    </SectionCard>
  );
}

/** The conversion engine, made visible: local → UTC → unix → every zone. */
function ConversionCard({ gameSec, timeZone }: { gameSec: number; timeZone: string }) {
  const gameMs = gameSec * 1000;
  const hostDate = dateInZone(gameMs, timeZone);
  const zones = SAMPLE_ZONES.filter((zone) => zone !== timeZone).slice(0, 6);
  return (
    <SectionCard icon="🌍" title="Time conversion" subtitle="Everyone sees the game in their own time zone">
      <dl className="space-y-2 text-xs">
        <Row label="Your time" value={`${formatInZone(gameMs, timeZone)} · ${formatRelative(gameMs)}`} strong />
        <Row label="UTC" value={formatInZone(gameMs, "UTC")} />
        <Row label="Unix timestamp" value={String(gameSec)} copy={String(gameSec)} mono />
        <Row label="Discord tag" value={discordTag(gameSec)} copy={discordTag(gameSec)} mono />
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {zones.map((zone) => {
          const date = dateInZone(gameMs, zone);
          const shift = date === hostDate ? "" : date > hostDate ? "+1d" : "−1d";
          return (
            <div key={zone} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5">
              <span className="truncate text-[11px] text-ink-400">{zoneCity(zone)}</span>
              <span className="text-xs font-bold tabular-nums text-ink-100">
                {timeInZone(gameMs, zone)}
                {shift && <span className="ml-1 text-[10px] font-semibold text-brand-300">{shift}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function Row({
  label,
  value,
  copy,
  mono,
  strong,
}: {
  label: string;
  value: string;
  copy?: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-28 shrink-0 text-ink-500">{label}</dt>
      <dd className={`min-w-0 flex-1 truncate ${mono ? "font-mono" : ""} ${strong ? "font-bold text-white" : "text-ink-200"}`}>
        {value}
      </dd>
      {copy && <CopyButton text={copy} />}
    </div>
  );
}
