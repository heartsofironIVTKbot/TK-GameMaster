"use client";

import { CalendarDays, ChevronDown, Clock, Gamepad2, Globe, Info, Lock, Mic, TriangleAlert, Users } from "lucide-react";
import { useMemo, useState } from "react";
import ModeIcon from "../ModeIcon";
import {
  SCHEDULE_MODES,
  modeOption,
  type ScheduleCategory,
} from "@/lib/scheduleOptions";
import type { CalendarDayLock, HostOption } from "@/lib/scheduleTypes";
import { branchOfMode, type HostBranch } from "@/lib/hostBranches";
import { bookingSummary, canBookDay, lastBookableDay, type BookingDays } from "@/lib/bookingWindow";
import {
  DAY_NAMES,
  addDays,
  dateInZone,
  discordTag,
  formatDateLong,
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
    <div className="space-y-3">
      {editing && <HostCard form={form} update={update} editing={editing} hosts={hosts} />}
      {!timeOnly && form.mode && !branches.includes(branchOfMode(form.mode)) && (
        <p className="gm-cut bg-rose-950/70 px-3 py-2 text-xs text-rose-100 [--cut:8px]">
          {form.mode} is a {branchOfMode(form.mode) === "RP" ? "Roleplay" : "Historical"} game: you need an{" "}
          {branchOfMode(form.mode)} host rank to host it.
          {branches.length > 0 &&
            ` Pick a ${branches.map((branch) => (branch === "RP" ? "Roleplay" : "Historical")).join(" or ")} mode.`}
        </p>
      )}
      {timeOnly ? (
        <SectionCard icon={Gamepad2} title={modeOption(form.mode)?.label ?? form.mode} subtitle="Game mode">
          <p className="text-xs text-ink-400">
            Once a game is announced, its mode and settings are fixed here. Change access, nation locks, rules and
            mods on the Games page.
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

      <SectionCard icon={CalendarDays} title="Day" subtitle="Hatched days are locked by staff.">
        <div className="roster-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
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
                className={`gm-cut relative flex h-[54px] w-12 shrink-0 flex-col items-center justify-center [--cut:7px] ${
                  active
                    ? "bg-brand-400 text-brand-950"
                    : locked
                      ? "gm-hatch cursor-not-allowed text-ink-600"
                      : "bg-ink-950 text-ink-400 hover:text-ink-100"
                } ${weekdayIndex(date) === 0 && date !== today ? "ml-2" : ""}`}
              >
                <span className="text-[11px]">{DAY_NAMES[weekdayIndex(date)].slice(0, 3)}</span>
                <span className={`font-display text-xl font-extrabold leading-none ${active ? "text-brand-950" : locked ? "text-ink-600" : "text-ink-100"}`}>
                  {Number(date.slice(8))}
                </span>
                {locked ? (
                  <Lock aria-label="Locked by staff" className="absolute right-1 top-1 h-[11px] w-[11px]" strokeWidth={2} />
                ) : date === today ? (
                  <span className={`text-[9.5px] ${active ? "text-brand-950" : "text-brand-400"}`}>today</span>
                ) : null}
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
              className="gm-input min-h-8 py-1 text-xs [--cut:6px]"
            />
          </label>
        )}
        {!canBookDay(booking, form.date, today, nowMs, timeZone, form.mode || null) && form.date !== editing?.originalDate && (
          <p className="mt-2 text-xs text-rose-300">
            {form.date} can&apos;t be booked any more. Pick one of the days above.
          </p>
        )}
        <p className="mt-2 flex gap-2 text-xs text-ink-400">
          <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
          <span>
            {bookingSummary(booking, today, formatDateLong)} Board week of {mondayOf(form.date)}.
          </span>
        </p>
      </SectionCard>

      <SectionCard
        icon={Clock}
        title="Start time"
        subtitle={`Your time, ${zoneCity(timeZone)} (${formatOffset(offsetMinutes(gameMs, timeZone))}). Everyone sees it in their own time.`}
      >
        <div className="flex items-end justify-between gap-3">
          <p className="leading-none">
            <span className="gm-title text-[44px] tabular-nums">{form.time}</span>
            <span className="ml-2.5 text-xs text-ink-400">{formatRelative(gameMs)}</span>
          </p>
          <input
            type="time"
            value={form.time}
            step={60}
            onChange={(event) => {
              if (isHHMM(event.target.value)) update({ time: event.target.value });
            }}
            className="gm-input text-sm font-semibold"
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
        <div className="mt-3 grid grid-cols-7 gap-1">
          {QUICK_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => update({ time })}
              className={`gm-cut h-[30px] text-xs font-semibold tabular-nums [--cut:6px] ${
                form.time === time ? "bg-brand-400 text-brand-950" : "bg-ink-950 text-ink-300 hover:text-ink-100"
              }`}
            >
              {time}
            </button>
          ))}
        </div>
        {derived.conversion === "skipped" && (
          <p className="gm-cut mt-3 flex gap-2 bg-yellow-950/60 px-3 py-2 text-xs text-yellow-100 [--cut:7px]">
            <TriangleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-yellow-300" strokeWidth={1.75} />
            Clocks jump forward that night: {form.time} doesn&apos;t exist in {zoneCity(timeZone)}, so the game is set to{" "}
            {timeInZone(gameMs, timeZone)}.
          </p>
        )}
        {derived.conversion === "ambiguous" && (
          <p className="gm-cut mt-3 flex gap-2 bg-yellow-950/60 px-3 py-2 text-xs text-yellow-100 [--cut:7px]">
            <TriangleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-yellow-300" strokeWidth={1.75} />
            Clocks fall back that night, so {form.time} happens twice. The first one is used.
          </p>
        )}
      </SectionCard>

      <ConversionCard gameSec={derived.gameSec} timeZone={timeZone} />

      {(derived.sameDay.length > 0 || form.mode) && (
        <SectionCard icon={Users} title="Same day" subtitle="Other games on the board that day">
          {derived.sameDay.length === 0 ? (
            <p className="text-xs text-ink-400">No other games yet: the day is yours.</p>
          ) : (
            <ul className="space-y-1">
              {derived.sameDay.map((slot) => {
                const conflict = derived.conflicts.includes(slot);
                return (
                  <li
                    key={slot.slot_id}
                    className={`gm-cut flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] [--cut:7px] ${
                      conflict ? "bg-yellow-950/50 text-ink-100" : "bg-ink-950 text-ink-300"
                    }`}
                  >
                    <ModeIcon mode={slot.mode} className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.75} />
                    <span className="font-semibold tabular-nums text-ink-100">{timeInZone(slot.game_timestamp * 1000, timeZone)}</span>
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
            <p className="mt-2 text-[11px] text-yellow-200/90">
              Another host already runs a {modeOption(form.mode)?.category ?? ""} game this day. That&apos;s allowed:
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
    <SectionCard icon={Gamepad2} title="Game mode" subtitle="What are you hosting?">
      <div className="space-y-3">
        {(["Roleplay", "Historical"] as ScheduleCategory[]).map((category) => {
          const branch: HostBranch = category === "Roleplay" ? "RP" : "HIST";
          const allowed = branches.includes(branch);
          if (!SCHEDULE_MODES.some((mode) => mode.category === category && !hidden.includes(mode.value))) return null;
          return (
            <div key={category}>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-500">
                <ModeIcon mode={category} className="h-3.5 w-3.5" strokeWidth={1.75} />
                {category}
                {!allowed && <span className="font-normal text-ink-500">, needs a {branch} host rank</span>}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {SCHEDULE_MODES.filter((mode) => mode.category === category && !hidden.includes(mode.value)).map((mode) => {
                  const active = value === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      disabled={!allowed}
                      onClick={() => onChange(mode.value)}
                      aria-pressed={active}
                      title={allowed ? undefined : `Only ${branch} hosts host ${category} games`}
                      className={`gm-cut flex h-9 items-center gap-2 px-2.5 text-left text-[13px] font-semibold [--cut:7px] disabled:cursor-not-allowed disabled:opacity-35 ${
                        active ? "bg-brand-400 text-brand-950" : "bg-ink-950 text-ink-300 hover:text-ink-100"
                      }`}
                    >
                      <ModeIcon mode={mode.value} className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{mode.label}</span>
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
    <SectionCard icon={Mic} title="Host" subtitle={`Hand the game over to another ${branch} host if needed`}>
      <select
        value={current}
        onChange={(event) =>
          update({ handoverTo: event.target.value === editing.hostId ? null : event.target.value })
        }
        className="gm-input w-full text-sm font-semibold"
        aria-label="Host"
      >
        {options.map((host) => (
          <option key={host.discord_id} value={host.discord_id}>
            {host.display_name || host.username || host.discord_id}
            {host.username && host.display_name ? ` (@${host.username})` : ""}
            {host.discord_id === editing.hostId ? " (current host)" : ""}
          </option>
        ))}
      </select>
      {form.handoverTo && (
        <p className="mt-2 text-xs text-ink-300">
          The game moves to the new host when you save
          {editing.editable === "time_host" ? "; the announcement and reserved players are updated too." : "."}
        </p>
      )}
    </SectionCard>
  );
}

/** The conversion engine, made visible: local → UTC → unix → every zone. Folded until opened. */
function ConversionCard({ gameSec, timeZone }: { gameSec: number; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const gameMs = gameSec * 1000;
  const hostDate = dateInZone(gameMs, timeZone);
  const zones = SAMPLE_ZONES.filter((zone) => zone !== timeZone).slice(0, 6);
  const shiftOf = (zone: string) => {
    const date = dateInZone(gameMs, zone);
    return date === hostDate ? "" : date > hostDate ? "+1d" : "−1d";
  };
  return (
    <section className="gm-cut bg-ink-900 [--cut:10px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 p-3.5 text-left"
      >
        <Globe aria-hidden className="h-[17px] w-[17px] shrink-0 text-brand-400" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-100">Other time zones</span>
          <span className="block truncate text-xs text-ink-400">
            {zones
              .slice(0, 3)
              .map((zone) => `${zoneCity(zone)} ${timeInZone(gameMs, zone)}${shiftOf(zone)}`)
              .join(", ")}
            , and the Discord tag
          </span>
        </span>
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="gm-fade-up px-3.5 pb-3.5">
          <dl className="space-y-1.5 text-xs">
            <Row label="Your time" value={`${formatInZone(gameMs, timeZone)}, ${formatRelative(gameMs)}`} strong />
            <Row label="UTC" value={formatInZone(gameMs, "UTC")} />
            <Row label="Unix timestamp" value={String(gameSec)} copy={String(gameSec)} mono />
            <Row label="Discord tag" value={discordTag(gameSec)} copy={discordTag(gameSec)} mono />
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-1">
            {zones.map((zone) => (
              <div key={zone} className="gm-cut flex items-center justify-between bg-ink-950 px-2.5 py-1.5 [--cut:6px]">
                <span className="truncate text-[11.5px] text-ink-400">{zoneCity(zone)}</span>
                <span className="text-xs font-semibold tabular-nums text-ink-100">
                  {timeInZone(gameMs, zone)}
                  {shiftOf(zone) && <span className="ml-1 text-[10px] text-brand-300">{shiftOf(zone)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
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
      <dd className={`min-w-0 flex-1 truncate ${mono ? "font-mono" : ""} ${strong ? "font-semibold text-ink-100" : "text-ink-300"}`}>
        {value}
      </dd>
      {copy && <CopyButton text={copy} />}
    </div>
  );
}
