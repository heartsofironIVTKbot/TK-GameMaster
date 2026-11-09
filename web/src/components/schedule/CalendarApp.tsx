"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Gamepad2, Lock, LockOpen, Megaphone, Pencil, Plus, X } from "lucide-react";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addOnOption,
  gameState,
  gameStateLabel,
  modeOption,
  type GameState,
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
import { Spinner } from "./ui";
import { bookingSummary, lastBookableDay } from "@/lib/bookingWindow";
import ModeIcon from "./ModeIcon";
import { CalendarTabs, LiveTag, StateLegend } from "./calendarParts";
import { submitScheduleRequest, useRequestPoller } from "./useRequestPoller";
import SiteHeader from "@/components/site/SiteHeader";
import { useTutorialFacts } from "@/components/tutorial/TutorialProvider";

/**
 * Live host calendar: a month grid of every game on the schedule board,
 * rendered in the viewer's time zone, with staff day locks and the host's
 * in-flight web requests. Clicking a day opens its agenda; bookable days
 * lead to the game setup page. A game's colour is its status (GameState in
 * lib/scheduleOptions.ts), its mode an icon. Design: docs/design/calendar.html.
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
  remove_slot: "Removed from calendar",
  lock_day: "Day lock",
  unlock_day: "Day unlock",
  roster_assign: "Player move",
  roster_remove: "Player removal",
  casino_roll: "Casino roll",
  casino_extra: "Casino extra rolls",
  casino_emergency_unreserve: "Emergency Unreserve",
  fortunes_redraw: "Fortunes redraw",
  fortunes_reset: "Fortunes card reset",
  casino_fallback: "Casino switched off",
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
  feedback_rate: "Game rating",
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

/** Open for booking: from today to the host's last bookable day (null = no limit). */
function isOpenDay(date: string, today: string, lastDay: string | null): boolean {
  return date >= today && (lastDay === null || date <= lastDay);
}

function addOnLabel(slot: CalendarSlot): string | null {
  return slot.add_on ? addOnOption(slot.add_on).label : null;
}

function slotTitle(slot: CalendarSlot, state: GameState): string {
  const addOn = addOnLabel(slot);
  return [modeLabel(slot.mode), gameStateLabel(state), addOn, slot.host_username ? `@${slot.host_username}` : null]
    .filter(Boolean)
    .join(", ");
}

export default function CalendarApp({ host }: { host: HostProfile }) {
  useTutorialFacts({ isHost: true, isStaff: host.is_staff });
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
  const serverName = host.servers.find((server) => server.id === host.guild_id)?.name;
  // How far ahead this host can book (server setting "Limit by host rank", else the weekly window).
  const lastDay = lastBookableDay(host.booking_days, today, nowMs, timeZone);

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="calendar" title="Calendar" subtitle={serverName}>
        <CalendarTabs current="ours" />
        <LiveTag syncAge={syncAge} />
        {host.demo && <span className="gm-tag bg-fuchsia-500/15 text-fuchsia-200">Preview: sample data</span>}
        <ServerSwitcher host={host} />
        <span data-tour="calendar.timezone" className="inline-flex">
          <TimeZonePicker value={timeZone} onChange={setTimeZone} />
        </span>
      </SiteHeader>

      <div className="mx-auto grid max-w-[1700px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Month grid */}
        <section data-tour="calendar.grid" className="gm-plate flex min-w-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-3 py-2.5 sm:px-3.5 sm:py-3">
            <button
              type="button"
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
              className="gm-btn gm-btn-secondary h-8 w-8 p-0"
              aria-label="Previous month"
            >
              <ChevronLeft aria-hidden />
            </button>
            <h1 className="gm-title min-w-0 px-1 text-[22px] sm:text-[28px]">{monthLabel(month)}</h1>
            <button
              type="button"
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
              className="gm-btn gm-btn-secondary h-8 w-8 p-0"
              aria-label="Next month"
            >
              <ChevronRight aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth(today.slice(0, 7));
                selectDate(today);
              }}
              className="gm-btn gm-btn-secondary ml-auto h-8 px-3 text-[13px] sm:ml-0"
            >
              Today
            </button>
          </div>

          {loadError && (
            <div className="border-b border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{loadError}</div>
          )}

          <div className="grid grid-cols-7 bg-ink-950">
            {DAY_NAMES.map((day) => (
              <div
                key={day}
                className="border-b border-ink-800 py-1.5 text-center text-xs font-semibold text-ink-500 sm:px-2.5 sm:py-2 sm:text-left"
              >
                <span className="hidden sm:inline">{day.slice(0, 3)}</span>
                <span className="sm:hidden">{day.slice(0, 1)}</span>
              </div>
            ))}
            {gridDays.map((date, index) => (
              <DayCell
                key={date}
                date={date}
                lastColumn={index % 7 === 6}
                lastRow={index >= gridDays.length - 7}
                inMonth={date.slice(0, 7) === month}
                today={today}
                lastDay={lastDay}
                selected={date === selectedDate}
                slots={slotsByDate.get(date) ?? []}
                pending={pendingByDate.get(date) ?? []}
                lock={locksByDate.get(date) ?? null}
                dayPending={dayRequestsByDate.has(date)}
                timeZone={timeZone}
                nowSec={nowSec}
                loading={!data}
                onSelect={() => selectDate(date)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-800 px-3.5 py-2.5">
            <div className="hidden md:block">
              <StateLegend />
            </div>
            <p className="text-xs text-ink-500 md:ml-auto">
              {bookingSummary(host.booking_days, today, formatDateLong)} All times in {timeZone.replace(/_/g, " ")}.
            </p>
          </div>
        </section>

        {/* Side panel: day agenda, or the host's own overview */}
        <aside ref={panelRef} className="min-w-0 scroll-mt-20 lg:sticky lg:top-[72px] lg:self-start">
          {selectedDate ? (
            <DayPanel
              key={selectedDate}
              date={selectedDate}
              today={today}
              lastDay={lastDay}
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

function DayCell({
  date,
  lastColumn,
  lastRow,
  inMonth,
  today,
  lastDay,
  selected,
  slots,
  pending,
  lock,
  dayPending,
  timeZone,
  nowSec,
  loading,
  onSelect,
}: {
  date: string;
  lastColumn: boolean;
  lastRow: boolean;
  inMonth: boolean;
  today: string;
  lastDay: string | null;
  selected: boolean;
  slots: CalendarSlot[];
  pending: ScheduleRequestStatus[];
  lock: CalendarDayLock | null;
  /** A staff lock/unlock of this day is waiting for the bot. */
  dayPending: boolean;
  timeZone: string;
  nowSec: number;
  loading: boolean;
  onSelect: () => void;
}) {
  const isToday = date === today;
  const past = date < today;
  // Later than the booking window: dimmed, nothing can be set up yet.
  const closed = !past && !isOpenDay(date, today, lastDay);
  const bookable = isOpenDay(date, today, lastDay) && !lock;
  const sorted = slots.slice().sort((a, b) => a.game_timestamp - b.game_timestamp);
  // Two or more games share one card's space as slanted slices (three at most, then "+N").
  const slices = sorted.length > 3 ? sorted.slice(0, 2) : sorted;
  const extra = sorted.length - slices.length;

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
      aria-pressed={selected}
      aria-label={formatDateLong(date)}
      className={`group relative flex min-h-[54px] min-w-0 cursor-pointer flex-col items-center gap-1 p-1 text-left outline-none transition-colors focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink-300)] sm:min-h-[118px] sm:items-stretch sm:gap-[5px] sm:p-[7px] ${
        lastColumn ? "" : "border-r border-ink-800"
      } ${lastRow ? "" : "border-b border-ink-800"} ${lock ? "gm-hatch-faint" : ""} ${
        selected
          ? "bg-ink-900 shadow-[inset_0_2px_0_var(--color-brand-400)]"
          : closed || !inMonth
            ? "bg-black/20 hover:bg-ink-900/60"
            : "hover:bg-ink-900/60"
      }`}
    >
      {/* Every number sits in the same 24px box, so today's green tile doesn't push its games down. */}
      <div className="flex h-6 w-full items-center justify-center gap-1.5 sm:justify-start">
        <span
          className={`flex h-6 min-w-6 items-center font-display text-base font-semibold leading-none sm:text-lg ${
            isToday
              ? "gm-cut justify-center bg-brand-400 px-1 text-brand-950 [--cut:6px]"
              : `justify-center sm:justify-start ${!inMonth || closed ? "text-ink-700" : past ? "text-ink-500" : "text-ink-400"}`
          }`}
        >
          {Number(date.slice(8))}
        </span>
        {dayPending ? (
          <span title="Waiting for the bot to update this day lock" className="ml-auto hidden sm:block">
            <Spinner className="h-3 w-3 text-ink-300" />
          </span>
        ) : lock ? (
          <span
            className="ml-auto hidden items-center gap-1 text-[11px] font-semibold text-ink-400 sm:flex"
            title={lock.reason ? `Locked by staff: ${lock.reason}` : "Locked by staff"}
          >
            <Lock aria-hidden className="h-3 w-3" />
            <span className="hidden xl:inline">Locked</span>
          </span>
        ) : (
          bookable && (
            <Link
              href={`/schedule/new?date=${date}`}
              onClick={(event) => event.stopPropagation()}
              className={`gm-cut ml-auto hidden h-[22px] w-[22px] items-center justify-center bg-brand-400 text-brand-950 [--cut:5px] sm:flex ${
                selected ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`}
              title="Set up a game on this day"
              aria-label={`Set up a game on ${formatDateLong(date)}`}
            >
              <Plus aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
            </Link>
          )
        )}
      </div>

      {/* Phone: a small bar per game; larger screens: the games themselves. */}
      <div className="flex flex-wrap justify-center gap-[3px] sm:hidden">
        {sorted.map((slot) => (
          <span
            key={slot.slot_id}
            data-game-state={gameState(slot, nowSec)}
            className={`gm-state-bar h-1 w-3.5 ${slot.add_on ? "gm-addon" : ""}`}
          />
        ))}
      </div>
      <div className="hidden min-w-0 flex-col gap-[5px] sm:flex">
        {sorted.length === 1 && <GameCard slot={sorted[0]} timeZone={timeZone} nowSec={nowSec} />}
        {sorted.length > 1 && (
          <div className={`gm-split ${slices.length + (extra ? 1 : 0) >= 3 ? "gm-split-3" : ""}`}>
            {slices.map((slot) => (
              <GameSlice key={slot.slot_id} slot={slot} timeZone={timeZone} nowSec={nowSec} compact={sorted.length > 2} />
            ))}
            {extra > 0 && (
              <span className="gm-slice gm-slice-more font-bold" title={`${extra} more ${extra === 1 ? "game" : "games"}`}>
                +{extra}
              </span>
            )}
          </div>
        )}
        {pending.map((request) => (
          <span
            key={request.request_id}
            className="gm-cut block min-w-0 bg-ink-800 py-[5px] pl-2 pr-2 text-xs leading-tight text-ink-300 [--cut:7px]"
            title="Waiting for the bot to add this game"
          >
            <span className="flex items-center gap-1.5 font-bold text-ink-100">
              <Spinner className="h-3 w-3" />
              Sending…
            </span>
            <span className="block truncate text-ink-400">
              {request.preview ? modeLabel(request.preview.mode) : "New game"}
            </span>
          </span>
        ))}
        {loading && inMonth && <span className="h-3 w-3/4 animate-pulse bg-ink-800" />}
      </div>
    </div>
  );
}

/** One game in a day square. */
function GameCard({ slot, timeZone, nowSec }: { slot: CalendarSlot; timeZone: string; nowSec: number }) {
  const state = gameState(slot, nowSec);
  const over = state === "ended" || state === "cancelled";
  return (
    <span
      data-game-state={state}
      className={`gm-game gm-cut block min-w-0 py-[5px] pl-2 pr-2 text-xs leading-tight ${slot.add_on ? "gm-addon" : ""} ${
        slot.mine ? "gm-mine" : ""
      }`}
      title={slotTitle(slot, state)}
    >
      <span className={`flex items-center gap-1.5 font-bold ${over ? "text-ink-400" : "text-ink-100"}`}>
        <ModeIcon mode={slot.mode} className="h-[13px] w-[13px] shrink-0 text-ink-300" />
        <span className={`tabular-nums ${state === "cancelled" ? "line-through" : ""}`}>
          {timeInZone(slot.game_timestamp * 1000, timeZone)}
        </span>
      </span>
      <span className="block truncate text-ink-400">{modeLabel(slot.mode)}</span>
    </span>
  );
}

/** One game of a busy day: a slanted slice. `compact` (3 slices): icon and time only. */
function GameSlice({
  slot,
  timeZone,
  nowSec,
  compact,
}: {
  slot: CalendarSlot;
  timeZone: string;
  nowSec: number;
  compact: boolean;
}) {
  const state = gameState(slot, nowSec);
  const over = state === "ended" || state === "cancelled";
  const time = (
    <span className={`tabular-nums font-bold ${state === "cancelled" ? "line-through" : ""}`}>
      {timeInZone(slot.game_timestamp * 1000, timeZone)}
    </span>
  );
  const icon = <ModeIcon mode={slot.mode} className="h-[13px] w-[13px] shrink-0 text-ink-300" />;
  return (
    <span
      data-game-state={state}
      className={`gm-slice ${slot.add_on ? "gm-addon" : ""} ${slot.mine ? "gm-mine" : ""} ${over ? "text-ink-400" : "text-ink-100"}`}
      title={`${timeInZone(slot.game_timestamp * 1000, timeZone)} ${slotTitle(slot, state)}`}
    >
      {compact ? (
        <>
          {icon}
          {time}
        </>
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-1">
            {icon}
            {time}
          </span>
          <span className="truncate text-ink-400">{modeLabel(slot.mode)}</span>
        </>
      )}
    </span>
  );
}

function StatusLine({
  date,
  today,
  lastDay,
  booking,
  lock,
}: {
  date: string;
  today: string;
  lastDay: string | null;
  booking: HostProfile["booking_days"];
  lock: CalendarDayLock | null;
}) {
  if (lock) {
    return (
      <div className="gm-cut gm-hatch-faint flex items-start gap-2 bg-ink-950 px-3 py-2.5 text-xs font-semibold text-ink-200 [--cut:8px]">
        <Lock aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          Locked by staff{lock.reason ? `: ${lock.reason}` : ""}. No games can be scheduled or announced.
        </span>
      </div>
    );
  }
  if (date < today) {
    return <p className="text-xs text-ink-500">This day has passed.</p>;
  }
  if (!isOpenDay(date, today, lastDay)) {
    return (
      <p className="text-xs text-ink-400">
        {booking
          ? `Too far ahead for you. ${bookingSummary(booking, today, formatDateLong)}`
          : "Booking for this week opens later: hosts can book this week and next week (plus the week after from Friday)."}
      </p>
    );
  }
  return null;
}

function DayPanel({
  date,
  today,
  lastDay,
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
  lastDay: string | null;
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
  const bookable = isOpenDay(date, today, lastDay) && !lock;
  const count = slots.length + pending.length;
  return (
    <div data-tour="calendar.dayPanel" className="gm-plate p-4 sm:p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-400">{date === today ? "Today" : formatRelativeDay(date, today)}</p>
          <h2 className="gm-title mt-0.5 text-[22px] sm:text-[26px]">{formatDateLong(date)}</h2>
        </div>
        <button type="button" onClick={onClose} className="gm-btn gm-btn-quiet h-8 w-8 shrink-0 p-0" aria-label="Close day">
          <X aria-hidden />
        </button>
      </div>

      <div className="mt-3 empty:hidden">
        <StatusLine date={date} today={today} lastDay={lastDay} booking={host.booking_days} lock={lock} />
      </div>

      {host.is_staff && date >= today && (
        <div data-tour="calendar.dayLock">
          <DayLockControl date={date} lock={lock} pendingRequest={dayRequest} onChanged={onChanged} />
        </div>
      )}

      {bookable && (
        <Link
          href={`/schedule/new?date=${date}`}
          data-tour="calendar.newGame"
          className="gm-btn gm-btn-primary mt-4 h-[50px] w-full font-display text-xl font-extrabold uppercase tracking-[0.02em] [--cut:11px]"
        >
          <Plus aria-hidden className="!h-5 !w-5" strokeWidth={2.5} />
          Set up a game this day
        </Link>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold text-ink-500">
        {count === 0 ? "No games on this day yet" : `Games on this day (${count})`}
      </h3>
      <div className="space-y-2.5">
        {pending.map((request) => (
          <div key={request.request_id} className="gm-cut flex items-center gap-3 bg-ink-800 p-3 text-sm [--cut:10px]">
            <Spinner className="h-4 w-4 text-brand-300" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-100">
                {request.preview ? modeLabel(request.preview.mode) : "New game"}
              </p>
              <p className="text-xs text-ink-400">Waiting for the bot to add it to the board…</p>
            </div>
          </div>
        ))}
        {slots
          .slice()
          .sort((a, b) => a.game_timestamp - b.game_timestamp)
          .map((slot) => (
            <GameRow key={slot.slot_id} slot={slot} host={host} timeZone={timeZone} nowSec={nowSec} onChanged={onChanged} />
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
    <div className="gm-plate mt-3.5 bg-ink-950 px-3 py-2.5 [--cut:10px]">
      <p className="mb-2 text-xs text-ink-500">Staff</p>
      {waiting ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-300">
          <Spinner className="h-3 w-3" /> Updating the day lock…
        </p>
      ) : lock ? (
        <button type="button" onClick={() => void send("unlock_day")} className="gm-btn gm-btn-secondary h-[34px] w-full">
          <LockOpen aria-hidden />
          Unlock this day
        </button>
      ) : open ? (
        <div className="space-y-2">
          <label className="gm-field">
            <input
              value={reason}
              maxLength={200}
              autoFocus
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (optional, shown on the board)"
              aria-label="Reason for the lock"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => void send("lock_day")} className="gm-btn gm-btn-primary h-[34px] flex-1">
              <Lock aria-hidden />
              Lock day
            </button>
            <button type="button" onClick={() => setOpen(false)} className="gm-btn gm-btn-quiet h-[34px]">
              Cancel
            </button>
          </div>
          <p className="text-xs text-ink-500">Games already booked that day stay on the board.</p>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="gm-btn gm-btn-secondary h-[34px] w-full">
          <Lock aria-hidden />
          Lock this day
        </button>
      )}
      {(error || status?.status === "error") && <p className="mt-2 text-xs text-rose-300">{error ?? status?.error}</p>}
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
  const state = gameState(slot, nowSec);
  const addOn = addOnLabel(slot);
  const canEdit =
    (slot.mine || host.is_staff) &&
    slot.status !== "cancelled" &&
    slot.status !== "ended" &&
    slot.game_timestamp > nowSec;
  const canCancel = canEdit && !slot.announced;
  // Host Management: anything the normal cancel doesn't cover (announced, past, ended, cancelled).
  const canRemove = host.is_staff && !canCancel;
  const cancelling = requestId !== null && (!status || status.status === "pending");
  const cancelError = status?.status === "error" ? status.error : error;
  const controls = slot.thread_id && slot.status !== "cancelled";

  useEffect(() => {
    if (status?.status === "done") onChanged();
  }, [status?.status, onChanged]);

  return (
    <div
      data-game-state={state}
      className={`gm-plate relative isolate border-l-[3px] bg-ink-950 p-3.5 [--cut:12px] ${status?.status === "done" ? "opacity-40" : ""}`}
      style={{ borderLeftColor: "var(--s)" }}
    >
      {addOn && (
        <>
          <span aria-hidden className="gm-addon-wash" />
          <span aria-hidden className="gm-addon-edge absolute -left-[3px] bottom-0 top-0 w-[3px]" />
        </>
      )}
      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3">
        <span className="gm-cut flex h-10 w-10 items-center justify-center bg-ink-800 text-ink-100">
          <ModeIcon mode={slot.mode} className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className={`font-display text-[30px] font-extrabold leading-none text-ink-100 ${state === "cancelled" ? "line-through" : ""}`}>
            {timeInZone(slot.game_timestamp * 1000, timeZone)}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink-100">{modeLabel(slot.mode)}</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-400">
            <span className="truncate">Host {slot.host_username ? `@${slot.host_username}` : "unknown"}</span>
            {slot.mine && <span className="gm-tag h-[19px] bg-brand-950 text-brand-400">You</span>}
          </p>
        </div>
        <span className="text-xs text-ink-500">{formatRelative(slot.game_timestamp * 1000)}</span>
      </div>

      <div className="my-3 flex flex-wrap gap-1.5">
        <span data-game-state={state} className="gm-tag gm-tag-dot gm-state-tag">
          {gameStateLabel(state)}
        </span>
        {addOn && <span className="gm-tag gm-addon-tag">{addOn}</span>}
        {state === "scheduled" && slot.announce_timestamp && (
          <span className="gm-tag bg-ink-800 text-ink-300">
            <Megaphone aria-hidden className="h-3 w-3" />
            Announces {formatInZone(slot.announce_timestamp * 1000, timeZone)}
          </span>
        )}
        {slot.locked_nations > 0 && (
          <span className="gm-tag bg-ink-800 text-ink-300">
            <Lock aria-hidden className="h-3 w-3" />
            {slot.locked_nations} {slot.locked_nations === 1 ? "nation" : "nations"} locked
          </span>
        )}
      </div>

      {status?.status === "done" ? (
        <p className="text-xs font-semibold text-emerald-300">Removed from the board.</p>
      ) : cancelling ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-300">
          <Spinner className="h-3 w-3" /> Removing from the board…
        </p>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-300">
            {canRemove
              ? slot.announced && slot.status !== "cancelled" && slot.status !== "ended"
                ? "Remove this entry from the calendar for good? The announced game itself isn't cancelled: use Game controls for that."
                : "Remove this entry from the calendar for good?"
              : "Remove this game from the board?"}
          </span>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              const result = await submitScheduleRequest({ action: canRemove ? "remove_slot" : "cancel", slot_id: slot.slot_id });
              if (result.ok) setRequestId(result.requestId);
              else setError(result.error);
              setConfirming(false);
            }}
            className="gm-btn ml-auto h-8 bg-rose-500 px-3 text-xs text-white hover:bg-rose-400"
          >
            {canRemove ? "Yes, remove it" : "Yes, cancel it"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="gm-btn gm-btn-quiet h-8 px-3 text-xs">
            Keep
          </button>
        </div>
      ) : (
        (canEdit || controls || canRemove) && (
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Link
                href={`/schedule/edit?slot=${slot.slot_id}`}
                className="gm-btn gm-btn-secondary h-8 px-3 text-[13px]"
                title={slot.announced ? "Move the day / time or hand it to another host" : "Change any setting"}
              >
                <Pencil aria-hidden />
                {slot.announced ? "Edit time or host" : "Edit"}
              </Link>
            )}
            {controls && (
              <Link
                href={`/games?game=${slot.thread_id}`}
                className="gm-btn gm-btn-secondary h-8 px-3 text-[13px]"
                title="Start, end or cancel this game"
              >
                <Gamepad2 aria-hidden />
                Game controls
              </Link>
            )}
            {canCancel && (
              <button type="button" onClick={() => setConfirming(true)} className="gm-btn gm-btn-danger ml-auto h-8 px-3 text-[13px]">
                Cancel game
              </button>
            )}
            {canRemove && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="gm-btn gm-btn-danger ml-auto h-8 px-3 text-[13px]"
                title="Host Management: take this entry off the calendar"
              >
                Remove from calendar
              </button>
            )}
          </div>
        )
      )}
      {cancelError && <p className="mt-2 text-xs text-rose-300">{cancelError}</p>}
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
    .map((slot) => ({ slot, state: gameState(slot, nowSec) }))
    .filter(
      ({ slot, state }) =>
        slot.mine && state !== "cancelled" && state !== "ended" && (state === "live" || slot.game_timestamp > nowSec - 3600),
    )
    .sort((a, b) => a.slot.game_timestamp - b.slot.game_timestamp);
  const failed = (data?.requests ?? []).filter((request) => request.status === "error");
  return (
    <div data-tour="calendar.overview" className="gm-plate p-4 sm:p-[18px]">
      <p className="text-xs text-ink-400">Your schedule</p>
      <h2 className="gm-title mt-0.5 text-[22px] sm:text-[26px]">Upcoming games</h2>
      <p className="mt-1 text-[13px] text-ink-400">Pick a day on the calendar to see its games or set up a new one.</p>

      <div className="mt-3.5 space-y-2">
        {!data && <div className="h-16 animate-pulse bg-ink-800" />}
        {data && mine.length === 0 && (
          <button
            type="button"
            onClick={() => onPick(today)}
            className="gm-plate w-full bg-ink-950 p-5 text-center text-sm text-ink-400 transition-colors [--cut:10px] hover:text-ink-100"
          >
            You have no upcoming games. Pick a day to set one up.
          </button>
        )}
        {mine.map(({ slot, state }) => {
          const date = dateInZone(slot.game_timestamp * 1000, timeZone);
          const addOn = addOnLabel(slot);
          return (
            <button
              key={slot.slot_id}
              type="button"
              onClick={() => onPick(date)}
              className="gm-plate grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 bg-ink-950 px-3 py-2.5 text-left transition-colors [--cut:10px] hover:[--line:var(--color-ink-600)]"
            >
              <span className="gm-cut flex h-10 w-10 items-center justify-center bg-ink-800 text-ink-100">
                <ModeIcon mode={slot.mode} className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink-100">{modeLabel(slot.mode)}</span>
                <span className="block truncate text-[12.5px] text-ink-400">
                  {formatInZone(slot.game_timestamp * 1000, timeZone)}
                  {addOn ? `, ${addOn}` : ""}
                </span>
              </span>
              <span data-game-state={state} className="gm-tag gm-tag-dot gm-state-tag">
                {gameStateLabel(state)}
              </span>
            </button>
          );
        })}
      </div>

      {failed.length > 0 && (
        <div className="mt-5 space-y-2">
          <h3 className="text-xs font-semibold text-rose-300">Didn&apos;t go through</h3>
          {failed.map((request) => (
            <div key={request.request_id} className="gm-cut bg-rose-500/10 p-3 text-xs text-rose-100 [--cut:10px]">
              <p className="font-semibold">
                {REQUEST_LABELS[request.action]}
                {request.preview && `: ${modeLabel(request.preview.mode)}, ${formatInZone(request.preview.game_timestamp * 1000, timeZone)}`}
                {request.day_preview && `: ${request.day_preview.day} (week of ${request.day_preview.week})`}
              </p>
              <p className="mt-1 text-rose-200/80">{request.error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
