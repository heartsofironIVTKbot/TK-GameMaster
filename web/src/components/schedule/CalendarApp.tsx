"use client";

import Link from "next/link";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_META,
  addOnOption,
  categoryOfMode,
  isBookableDate,
  lastBookableDate,
  modeOption,
} from "@/lib/scheduleOptions";
import type {
  CalendarDayLock,
  CalendarResponse,
  CalendarSlot,
  HostProfile,
  RequestAction,
  ScheduleRequestStatus,
} from "@/lib/scheduleTypes";
import {
  DAY_NAMES,
  addDays,
  dateInZone,
  formatDateLong,
  formatInZone,
  formatRelative,
  mondayOf,
  timeInZone,
  todayInZone,
  weekdayIndex,
} from "@/lib/timeEngine";
import TimeZonePicker, { useHostTimeZone } from "./TimeZonePicker";
import { GLASS, HostAvatar, Spinner } from "./ui";
import { submitScheduleRequest, useRequestPoller } from "./useRequestPoller";

/**
 * Live host calendar: a month grid of every game on the schedule board,
 * rendered in the viewer's time zone, with staff day locks and the host's
 * in-flight web requests. Clicking a day opens its agenda; bookable days
 * lead to the game setup page.
 */

const POLL_MS = 20_000;
const FAST_POLL_MS = 4_000;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const REQUEST_LABELS: Record<RequestAction, string> = {
  create: "New game",
  update: "Edit",
  cancel: "Cancel",
  lock_day: "Day lock",
  unlock_day: "Day unlock",
  roster_assign: "Player move",
  roster_remove: "Player removal",
  moderation: "Moderation",
  dishonored: "Dishonored",
  host_rating: "Host rating",
  att_check: "Voice check",
  att_sample: "Attendance sample",
  att_override: "Attendance change",
  att_finalize: "Attendance finalize",
  game_start: "Game start",
  game_end: "Game end",
  game_cancel: "Game cancel",
  game_access: "Reservation access",
  game_remind: "Game reminder",
  game_resources: "Rules & mods",
  draft_join: "Draft sign-up",
  draft_leave: "Draft leave",
  draft_pick: "Draft pick",
  draft_control: "Draft",
  member_roles: "Verification / VIP",
  role_scan: "Role check",
  host_dm: "Message to a member",
  game_message: "Message to players",
  game_log_analysis: "AI chat-log analysis",
  hotjoin_request: "Hot-join request",
  hotjoin_cancel: "Hot-join withdrawal",
  hotjoin_decide: "Hot-join decision",
  crash_report: "Crash report",
  server_setup: "Server setup",
};

function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return `${MONTH_NAMES[index - 1]} ${year}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function daysInMonth(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

function modeLabel(mode: string): string {
  return modeOption(mode)?.label ?? mode;
}

interface SlotBadge {
  label: string;
  className: string;
}

function slotBadge(slot: CalendarSlot, nowSec: number, timeZone: string): SlotBadge {
  if (slot.status === "cancelled") {
    return { label: "Cancelled", className: "border-rose-400/40 bg-rose-500/15 text-rose-200" };
  }
  if (slot.status === "ended" || slot.game_timestamp < nowSec - 6 * 3600) {
    return { label: "Finished", className: "border-stone-400/30 bg-stone-500/15 text-stone-300" };
  }
  if (slot.announced) {
    return { label: "Announced", className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" };
  }
  if (slot.announce_timestamp) {
    return {
      label: `Announces ${formatInZone(slot.announce_timestamp * 1000, timeZone)}`,
      className: "border-sky-400/40 bg-sky-500/15 text-sky-200",
    };
  }
  return { label: "Scheduled", className: "border-yellow-300/40 bg-yellow-400/10 text-yellow-100" };
}

export default function CalendarApp({ host }: { host: HostProfile }) {
  const [timeZone, setTimeZone] = useHostTimeZone();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const today = todayInZone(timeZone, nowMs);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const panelRef = useRef<HTMLElement>(null);

  // Phones stack the day panel under the grid — bring it into view.
  const selectDate = useCallback((date: string) => {
    setSelectedDate(date);
    if (window.innerWidth < 1024) {
      window.requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, []);

  // Clock tick: relative labels, "today" and the sync age stay current.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const gridStart = mondayOf(`${month}-01`);
  const rows = Math.ceil((weekdayIndex(`${month}-01`) + daysInMonth(month)) / 7);
  const gridDays = useMemo(
    () => Array.from({ length: rows * 7 }, (_, index) => addDays(gridStart, index)),
    [gridStart, rows],
  );
  const gridEnd = gridDays[gridDays.length - 1];

  const hasPending = Boolean(data?.requests.some((request) => request.status === "pending"));

  const refresh = useCallback(() => setRefreshNonce((nonce) => nonce + 1), []);

  // Live data: fetch the visible weeks (±1 day for zone edges) and keep
  // polling while the tab is visible — faster while the bot is busy.
  useEffect(() => {
    let cancelled = false;
    const from = Math.floor(Date.parse(`${gridStart}T00:00:00Z`) / 1000) - 86_400;
    const to = Math.floor(Date.parse(`${gridEnd}T23:59:59Z`) / 1000) + 86_400;
    const load = async () => {
      try {
        const response = await fetch(`/api/schedule/calendar?from=${from}&to=${to}`, {
          cache: "no-store",
        });
        const result = (await response.json().catch(() => null)) as
          | (CalendarResponse & { error?: string })
          | null;
        if (cancelled) return;
        if (!response.ok || !result) {
          setLoadError(result?.error ?? `Could not load the calendar (HTTP ${response.status})`);
          return;
        }
        setData(result);
        setLoadError(null);
        setLastSync(Date.now());
      } catch {
        if (!cancelled) setLoadError("Network error — retrying…");
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, hasPending ? FAST_POLL_MS : POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [gridStart, gridEnd, hasPending, refreshNonce]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    for (const slot of data?.slots ?? []) {
      const date = dateInZone(slot.game_timestamp * 1000, timeZone);
      const list = map.get(date) ?? [];
      list.push(slot);
      map.set(date, list);
    }
    return map;
  }, [data, timeZone]);

  const pendingByDate = useMemo(() => {
    const map = new Map<string, ScheduleRequestStatus[]>();
    for (const request of data?.requests ?? []) {
      if (request.action !== "create" || request.status !== "pending" || !request.preview) continue;
      const date = dateInZone(request.preview.game_timestamp * 1000, timeZone);
      map.set(date, [...(map.get(date) ?? []), request]);
    }
    return map;
  }, [data, timeZone]);

  // Staff lock / unlock requests the bot hasn't applied yet, by date.
  const dayRequestsByDate = useMemo(() => {
    const map = new Map<string, ScheduleRequestStatus>();
    for (const request of data?.requests ?? []) {
      if (request.status !== "pending" || !request.day_preview) continue;
      const index = (DAY_NAMES as readonly string[]).indexOf(request.day_preview.day);
      if (index >= 0) map.set(addDays(request.day_preview.week, index), request);
    }
    return map;
  }, [data]);

  // Staff locks are stored as (week, day) — the calendar date they name.
  const locksByDate = useMemo(() => {
    const map = new Map<string, CalendarDayLock>();
    for (const lock of data?.locks ?? []) {
      const index = (DAY_NAMES as readonly string[]).indexOf(lock.day);
      if (index >= 0) map.set(addDays(lock.week, index), lock);
    }
    return map;
  }, [data]);

  const nowSec = Math.floor(nowMs / 1000);
  const syncAge = lastSync ? Math.max(0, Math.round((nowMs - lastSync) / 1000)) : null;

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-600 text-lg shadow-lg shadow-amber-500/30">
              🗓️
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Host Calendar</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · Calendar</span>
            </span>
          </Link>

          <span
            className="ml-1 flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-200"
            title="The calendar refreshes automatically"
          >
            <span className="relative flex h-2 w-2">
              <span className="gm-live-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            LIVE
            {syncAge !== null && <span className="font-medium text-emerald-300/70">· {syncAge}s ago</span>}
          </span>
          {host.demo && (
            <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-bold text-fuchsia-200">
              PREVIEW MODE · sample data
            </span>
          )}
          <ServerSwitcher host={host} />

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Link
              href="/games"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
              title="Start, end and cancel games"
            >
              🎮 Games
            </Link>
            <Link
              href="/presets"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
              title="Game mode presets — nation groups, locks, rules and mods"
            >
              🧩 Presets
            </Link>
            <Link
              href="/database"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
              title="Search players and manage commends, warnings, bans and Dishonored"
            >
              🗂️ Database
            </Link>
            <Link
              href="/attendance"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
              title="Live attendance for started games"
            >
              🎯 Attendance
            </Link>
            <TimeZonePicker value={timeZone} onChange={setTimeZone} />
            <div className="hidden items-center gap-2 sm:flex">
              <HostAvatar host={host} />
              <span className="text-xs font-semibold text-slate-300">
                {host.display_name || host.username}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Month grid */}
        <section className={`rounded-3xl p-3 sm:p-5 ${GLASS}`}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
              className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-amber-300/40 hover:text-white"
              aria-label="Previous month"
            >
              ‹
            </button>
            <h1 className="min-w-[170px] text-center text-xl font-black tracking-tight text-white">
              {monthLabel(month)}
            </h1>
            <button
              type="button"
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
              className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-amber-300/40 hover:text-white"
              aria-label="Next month"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth(today.slice(0, 7));
                selectDate(today);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-amber-300/40"
            >
              Today
            </button>
            <Legend />
          </div>

          {loadError && (
            <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
              {loadError}
            </div>
          )}

          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:gap-2">
            {DAY_NAMES.map((day) => (
              <div key={day} className="pb-1">
                <span className="hidden sm:inline">{day.slice(0, 3)}</span>
                <span className="sm:hidden">{day.slice(0, 1)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {gridDays.map((date, index) => (
              <DayCell
                key={date}
                date={date}
                index={index}
                inMonth={date.slice(0, 7) === month}
                today={today}
                selected={date === selectedDate}
                slots={slotsByDate.get(date) ?? []}
                pending={pendingByDate.get(date) ?? []}
                lock={locksByDate.get(date) ?? null}
                dayPending={dayRequestsByDate.has(date)}
                timeZone={timeZone}
                loading={!data}
                onSelect={() => selectDate(date)}
              />
            ))}
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-500">
            Bookable until {formatDateLong(lastBookableDate(today))} · all times in{" "}
            {timeZone.replace(/_/g, " ")}
          </p>
        </section>

        {/* Side panel: day agenda, or the host's own overview */}
        <aside ref={panelRef} className="scroll-mt-20 lg:sticky lg:top-[84px] lg:self-start">
          {selectedDate ? (
            <DayPanel
              key={selectedDate}
              date={selectedDate}
              today={today}
              host={host}
              slots={slotsByDate.get(selectedDate) ?? []}
              pending={pendingByDate.get(selectedDate) ?? []}
              lock={locksByDate.get(selectedDate) ?? null}
              dayRequest={dayRequestsByDate.get(selectedDate) ?? null}
              timeZone={timeZone}
              nowSec={nowSec}
              onClose={() => setSelectedDate(null)}
              onChanged={refresh}
            />
          ) : (
            <OverviewPanel
              data={data}
              timeZone={timeZone}
              nowSec={nowSec}
              today={today}
              onPick={(date) => {
                setMonth(date.slice(0, 7));
                selectDate(date);
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="ml-auto hidden flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-400 md:flex">
      {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]).map((category) => (
        <span key={category} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${CATEGORY_META[category].dot}`} />
          {category}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-amber-400" />
        Yours
      </span>
      <span className="flex items-center gap-1.5">
        <span className="gm-hatch h-2.5 w-3.5 rounded-sm border border-white/20" />
        Staff lock
      </span>
    </div>
  );
}

function DayCell({
  date,
  index,
  inMonth,
  today,
  selected,
  slots,
  pending,
  lock,
  dayPending,
  timeZone,
  loading,
  onSelect,
}: {
  date: string;
  index: number;
  inMonth: boolean;
  today: string;
  selected: boolean;
  slots: CalendarSlot[];
  pending: ScheduleRequestStatus[];
  lock: CalendarDayLock | null;
  /** A staff lock/unlock of this day is waiting for the bot. */
  dayPending: boolean;
  timeZone: string;
  loading: boolean;
  onSelect: () => void;
}) {
  const isToday = date === today;
  const past = date < today;
  const bookable = isBookableDate(date, today) && !lock;
  const visible = slots.slice(0, pending.length > 0 ? 1 : 2);
  const more = slots.length - visible.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{ animationDelay: `${Math.min(index, 41) * 8}ms` }}
      className={`gm-fade-up group relative flex min-h-[64px] cursor-pointer flex-col rounded-xl border p-1.5 text-left transition-all sm:min-h-[118px] sm:p-2 ${
        lock ? "gm-hatch border-slate-600/50" : "bg-slate-900/40"
      } ${
        selected
          ? "border-amber-300/80 shadow-[0_0_0_1px_rgba(252,211,77,0.5),0_0_24px_rgba(251,191,36,0.18)]"
          : "border-white/[0.07] hover:border-white/25 hover:bg-slate-800/50"
      } ${inMonth ? "" : "opacity-40"} ${past && inMonth ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ${
            isToday ? "bg-amber-400 text-slate-950" : "text-slate-300"
          }`}
        >
          {Number(date.slice(8))}
        </span>
        {dayPending ? (
          <span title="Waiting for the bot to update this day lock">
            <Spinner className="h-3 w-3 text-slate-300" />
          </span>
        ) : lock ? (
          <span
            className="hidden rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300 sm:inline"
            title={lock.reason ? `Locked by staff: ${lock.reason}` : "Locked by staff"}
          >
            🔒<span className="ml-1 hidden xl:inline">Locked</span>
          </span>
        ) : (
          bookable && (
            <Link
              href={`/schedule/new?date=${date}`}
              onClick={(event) => event.stopPropagation()}
              className="hidden h-6 w-6 items-center justify-center rounded-lg bg-amber-400/90 text-sm font-black text-slate-950 opacity-0 shadow-lg shadow-amber-500/30 transition group-hover:opacity-100 sm:flex"
              title="Set up a game on this day"
              aria-label={`Set up a game on ${formatDateLong(date)}`}
            >
              +
            </Link>
          )
        )}
      </div>

      {/* Phone: dots only; larger screens: chips. */}
      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
        {slots.map((slot) => (
          <span
            key={slot.slot_id}
            className={`h-1.5 w-1.5 rounded-full ${CATEGORY_META[categoryOfMode(slot.mode)].dot}`}
          />
        ))}
      </div>
      <div className="mt-1 hidden flex-col gap-1 sm:flex">
        {visible.map((slot) => {
          const meta = CATEGORY_META[categoryOfMode(slot.mode)];
          return (
            <span
              key={slot.slot_id}
              className={`block min-w-0 rounded-md border px-1.5 py-0.5 leading-tight ${meta.chip} ${
                slot.mine ? "ring-1 ring-amber-300/80" : ""
              } ${slot.status === "cancelled" ? "line-through opacity-60" : ""}`}
              title={`${modeLabel(slot.mode)} · ${slot.host_username ? `@${slot.host_username}` : "host"}`}
            >
              <span className="flex items-center gap-1 text-[11px] font-bold">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                <span className="tabular-nums text-white">{timeInZone(slot.game_timestamp * 1000, timeZone)}</span>
                {slot.announced && <span className="ml-auto text-emerald-300" title="Announced">✓</span>}
              </span>
              <span className="block truncate text-[10px] font-semibold opacity-90">{modeLabel(slot.mode)}</span>
            </span>
          );
        })}
        {pending.map((request) => (
          <span
            key={request.request_id}
            className="block min-w-0 rounded-md border border-dashed border-amber-300/60 bg-amber-400/10 px-1.5 py-0.5 leading-tight text-amber-100"
            title="Waiting for the bot to add this game"
          >
            <span className="flex items-center gap-1 text-[11px] font-bold">
              <Spinner className="h-2.5 w-2.5" />
              Sending…
            </span>
            <span className="block truncate text-[10px] font-semibold opacity-90">
              {request.preview ? modeLabel(request.preview.mode) : "New game"}
            </span>
          </span>
        ))}
        {more > 0 && <span className="px-1 text-[10px] font-bold text-slate-400">+{more} more</span>}
        {loading && inMonth && <span className="h-3 w-3/4 animate-pulse rounded bg-white/5" />}
      </div>
    </div>
  );
}

function StatusLine({ date, today, lock }: { date: string; today: string; lock: CalendarDayLock | null }) {
  if (lock) {
    return (
      <div className="gm-hatch rounded-xl border border-slate-500/40 px-3 py-2 text-xs font-semibold text-slate-200">
        🔒 Locked by staff{lock.reason ? ` — ${lock.reason}` : ""}. No games can be scheduled or announced.
      </div>
    );
  }
  if (date < today) {
    return <p className="text-xs text-slate-500">This day has passed.</p>;
  }
  if (!isBookableDate(date, today)) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
        Booking for this week opens later — hosts can book this week and next week (plus the week
        after from Friday).
      </p>
    );
  }
  return null;
}

function DayPanel({
  date,
  today,
  host,
  slots,
  pending,
  lock,
  dayRequest,
  timeZone,
  nowSec,
  onClose,
  onChanged,
}: {
  date: string;
  today: string;
  host: HostProfile;
  slots: CalendarSlot[];
  pending: ScheduleRequestStatus[];
  lock: CalendarDayLock | null;
  dayRequest: ScheduleRequestStatus | null;
  timeZone: string;
  nowSec: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const bookable = isBookableDate(date, today) && !lock;
  return (
    <div className={`gm-slide-in rounded-3xl p-5 ${GLASS}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
            {date === today ? "Today" : formatRelativeDay(date, today)}
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-white">{formatDateLong(date)}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white"
          aria-label="Close day"
        >
          ✕
        </button>
      </div>

      <div className="mt-3">
        <StatusLine date={date} today={today} lock={lock} />
      </div>

      {host.is_staff && date >= today && (
        <DayLockControl date={date} lock={lock} pendingRequest={dayRequest} onChanged={onChanged} />
      )}

      {bookable && (
        <Link
          href={`/schedule/new?date=${date}`}
          className="reserve-cta-glow mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:scale-[1.02]"
        >
          ＋ Set up a game this day
        </Link>
      )}

      <div className="mt-5 space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          {slots.length + pending.length === 0 ? "No games yet" : `Games (${slots.length + pending.length})`}
        </h3>
        {pending.map((request) => (
          <div
            key={request.request_id}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-300/50 bg-amber-400/5 p-3 text-sm"
          >
            <Spinner className="h-4 w-4 text-amber-300" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-amber-100">
                {request.preview ? modeLabel(request.preview.mode) : "New game"}
              </p>
              <p className="text-xs text-amber-200/70">Waiting for the bot to add it to the board…</p>
            </div>
          </div>
        ))}
        {slots
          .slice()
          .sort((a, b) => a.game_timestamp - b.game_timestamp)
          .map((slot) => (
            <GameRow
              key={slot.slot_id}
              slot={slot}
              host={host}
              timeZone={timeZone}
              nowSec={nowSec}
              onChanged={onChanged}
            />
          ))}
      </div>
    </div>
  );
}

/** Staff: lock a day (no games can be scheduled or announced) or unlock it. */
function DayLockControl({
  date,
  lock,
  pendingRequest,
  onChanged,
}: {
  date: string;
  lock: CalendarDayLock | null;
  pendingRequest: ScheduleRequestStatus | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { status } = useRequestPoller(requestId);
  const waiting = (requestId !== null && (!status || status.status === "pending")) || pendingRequest !== null;

  useEffect(() => {
    if (status?.status === "done") onChanged();
  }, [status?.status, onChanged]);

  const send = async (action: "lock_day" | "unlock_day") => {
    setError(null);
    const result = await submitScheduleRequest({
      action,
      payload: { week: mondayOf(date), day: DAY_NAMES[weekdayIndex(date)], reason: reason.trim() || null },
    });
    if (result.ok) {
      setRequestId(result.requestId);
      setOpen(false);
      setReason("");
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Staff</p>
      {waiting ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Spinner className="h-3 w-3" /> Updating the day lock…
        </p>
      ) : lock ? (
        <button
          type="button"
          onClick={() => void send("unlock_day")}
          className="w-full rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
        >
          🔓 Unlock this day
        </button>
      ) : open ? (
        <div className="space-y-2">
          <input
            value={reason}
            maxLength={200}
            autoFocus
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional, shown on the board)"
            className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void send("lock_day")}
              className="flex-1 rounded-xl bg-slate-200 px-3 py-2 text-xs font-black text-slate-950 hover:bg-white"
            >
              🔒 Lock day
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-slate-500">Games already booked that day stay on the board.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:border-white/25"
        >
          🔒 Lock this day…
        </button>
      )}
      {(error || status?.status === "error") && (
        <p className="mt-2 text-xs text-rose-300">{error ?? status?.error}</p>
      )}
    </div>
  );
}

function formatRelativeDay(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

function GameRow({
  slot,
  host,
  timeZone,
  nowSec,
  onChanged,
}: {
  slot: CalendarSlot;
  host: HostProfile;
  timeZone: string;
  nowSec: number;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { status } = useRequestPoller(requestId);
  const meta = CATEGORY_META[categoryOfMode(slot.mode)];
  const badge = slotBadge(slot, nowSec, timeZone);
  const addOn = slot.add_on ? addOnOption(slot.add_on) : null;
  const canEdit =
    (slot.mine || host.is_staff) &&
    slot.status !== "cancelled" &&
    slot.status !== "ended" &&
    slot.game_timestamp > nowSec;
  const canCancel = canEdit && !slot.announced;
  const cancelling = requestId !== null && (!status || status.status === "pending");
  const cancelError = status?.status === "error" ? status.error : error;

  useEffect(() => {
    if (status?.status === "done") onChanged();
  }, [status?.status, onChanged]);

  return (
    <div
      className={`rounded-2xl border bg-slate-950/50 p-3.5 transition ${
        slot.mine ? "border-amber-300/40" : "border-white/10"
      } ${status?.status === "done" ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl ${meta.chip}`}>
          {meta.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-black tabular-nums text-white">
              {timeInZone(slot.game_timestamp * 1000, timeZone)}
            </p>
            <p className="text-[11px] text-slate-500">{formatRelative(slot.game_timestamp * 1000)}</p>
          </div>
          <p className="truncate text-sm font-semibold text-slate-100">{modeLabel(slot.mode)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            Host {slot.host_username ? `@${slot.host_username}` : "unknown"}
            {slot.mine && <span className="ml-1.5 rounded bg-amber-400/20 px-1.5 py-px font-bold text-amber-200">You</span>}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
        <span className={`rounded-md border px-2 py-0.5 ${badge.className}`}>{badge.label}</span>
        {addOn && (
          <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-100">
            {addOn.emoji} {addOn.label}
          </span>
        )}
        {slot.locked_nations > 0 && (
          <span className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-rose-200">
            🔒 {slot.locked_nations} locked
          </span>
        )}
        {slot.thread_id && slot.status !== "cancelled" && (
          <Link
            href={`/games?game=${slot.thread_id}`}
            className="ml-auto rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 font-bold text-amber-100 hover:bg-amber-400/20"
            title="Start, end or cancel this game"
          >
            🎮 Game controls
          </Link>
        )}
      </div>

      {canEdit && status?.status !== "done" && (
        <div className="mt-3 border-t border-white/5 pt-3">
          {cancelling ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-200">
              <Spinner className="h-3 w-3" /> Removing from the board…
            </p>
          ) : confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Remove this game from the board?</span>
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  const result = await submitScheduleRequest({ action: "cancel", slot_id: slot.slot_id });
                  if (result.ok) setRequestId(result.requestId);
                  else setError(result.error);
                  setConfirming(false);
                }}
                className="ml-auto rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-white hover:bg-rose-400"
              >
                Yes, cancel
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-300"
              >
                Keep
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={`/schedule/edit?slot=${slot.slot_id}`}
                className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-100 hover:bg-amber-400/20"
                title={slot.announced ? "Move the day / time or hand it to another host" : "Change any setting"}
              >
                ✎ {slot.announced ? "Edit time / host" : "Edit"}
              </Link>
              {canCancel && (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="ml-auto text-xs font-semibold text-rose-300/80 hover:text-rose-200"
                >
                  Cancel game…
                </button>
              )}
            </div>
          )}
          {cancelError && <p className="mt-2 text-xs text-rose-300">{cancelError}</p>}
        </div>
      )}
      {status?.status === "done" && <p className="mt-2 text-xs font-semibold text-emerald-300">Removed from the board.</p>}
    </div>
  );
}

function OverviewPanel({
  data,
  timeZone,
  nowSec,
  today,
  onPick,
}: {
  data: CalendarResponse | null;
  timeZone: string;
  nowSec: number;
  today: string;
  onPick: (date: string) => void;
}) {
  const mine = (data?.slots ?? [])
    .filter((slot) => slot.mine && slot.game_timestamp > nowSec - 3600 && slot.status !== "cancelled")
    .sort((a, b) => a.game_timestamp - b.game_timestamp);
  const failed = (data?.requests ?? []).filter((request) => request.status === "error");
  return (
    <div className={`gm-fade-up rounded-3xl p-5 ${GLASS}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300/80">Your schedule</p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-white">Upcoming games</h2>
      <p className="mt-1 text-xs text-slate-400">Pick a day on the calendar to see its games or set up a new one.</p>

      <div className="mt-4 space-y-2">
        {!data && <div className="h-16 animate-pulse rounded-2xl bg-white/5" />}
        {data && mine.length === 0 && (
          <button
            type="button"
            onClick={() => onPick(today)}
            className="w-full rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-slate-400 transition hover:border-amber-300/40 hover:text-amber-200"
          >
            You have no upcoming games — pick a day to schedule one.
          </button>
        )}
        {mine.map((slot) => {
          const meta = CATEGORY_META[categoryOfMode(slot.mode)];
          const date = dateInZone(slot.game_timestamp * 1000, timeZone);
          return (
            <button
              key={slot.slot_id}
              type="button"
              onClick={() => onPick(date)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-left transition hover:border-amber-300/40"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg ${meta.chip}`}>
                {meta.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{modeLabel(slot.mode)}</span>
                <span className="block text-xs text-slate-400">
                  {formatInZone(slot.game_timestamp * 1000, timeZone)} · {formatRelative(slot.game_timestamp * 1000)}
                </span>
              </span>
              <span className="text-slate-500">›</span>
            </button>
          );
        })}
      </div>

      {failed.length > 0 && (
        <div className="mt-5 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300/80">Didn&apos;t go through</h3>
          {failed.map((request) => (
            <div key={request.request_id} className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
              <p className="font-semibold">
                {REQUEST_LABELS[request.action]}
                {request.preview && ` · ${modeLabel(request.preview.mode)} · ${formatInZone(request.preview.game_timestamp * 1000, timeZone)}`}
                {request.day_preview && ` · ${request.day_preview.day} (week of ${request.day_preview.week})`}
              </p>
              <p className="mt-1 text-rose-200/80">{request.error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
