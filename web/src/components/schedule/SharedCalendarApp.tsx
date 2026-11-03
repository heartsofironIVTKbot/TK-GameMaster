"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Settings, Share2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ServerSwitcher from "@/components/ServerSwitcher";
import SiteHeader from "@/components/site/SiteHeader";
import {
  addOnOption,
  categoryOfMode,
  gameState,
  gameStateLabel,
  modeOption,
  type GameState,
  type ScheduleCategory,
} from "@/lib/scheduleOptions";
import type { HostProfile, SharedCalendarResponse, SharedGame, SharedServer } from "@/lib/scheduleTypes";
import {
  addDays,
  dateInZone,
  formatDateLong,
  hhmmToMinutes,
  mondayOf,
  timeInZone,
  todayInZone,
} from "@/lib/timeEngine";
import { CalendarTabs, LiveTag, StateLegend } from "./calendarParts";
import ModeIcon from "./ModeIcon";
import TimeZonePicker, { useHostTimeZone } from "./TimeZonePicker";
import { Spinner } from "./ui";

/**
 * The Shared Calendar: one week of every sharing server's games, laid out by
 * hour so games at the same time sit side by side (lib/sharedCalendar.ts).
 * It points out where one of yours is close to another server's game of the
 * same kind. Phones get a day-by-day list. Design: docs/design/calendar.html.
 */

const POLL_MS = 60_000;
/** Same kind of game on two servers closer than this: a possible clash. */
const CLASH_SEC = 2 * 3600;
/** Games starting closer than this overlap on the week grid. */
const OVERLAP_MIN = 45;
const HOUR_PX = 56;
const BLOCK_PX = 40;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type ModeFilter = "all" | ScheduleCategory;

interface PlacedGame extends SharedGame {
  state: GameState;
  date: string;
  time: string;
  minutes: number;
  server: SharedServer;
  clash: boolean;
}

interface Clash {
  date: string;
  category: ScheduleCategory;
  yours: PlacedGame;
  theirs: PlacedGame;
}

function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const month = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1];
  const day = (date: string) => Number(date.slice(8));
  return month(start) === month(end)
    ? `${day(start)} – ${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

function modeLabel(mode: string): string {
  return modeOption(mode)?.label ?? mode;
}

/** Still happening or yet to happen: what a clash is about. */
function active(state: GameState): boolean {
  return state !== "ended" && state !== "cancelled";
}

export default function SharedCalendarApp({ host }: { host: HostProfile }) {
  const [timeZone, setTimeZone] = useHostTimeZone();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const today = todayInZone(timeZone, nowMs);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [filter, setFilter] = useState<ModeFilter>("all");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [data, setData] = useState<SharedCalendarResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The week in UTC, a day wider on each side for time zones.
    const from = Math.floor(Date.parse(`${weekStart}T00:00:00Z`) / 1000) - 86_400;
    const to = Math.floor(Date.parse(`${addDays(weekStart, 6)}T23:59:59Z`) / 1000) + 86_400;
    const load = async () => {
      try {
        const response = await fetch(`/api/schedule/shared?from=${from}&to=${to}`, { cache: "no-store" });
        const result = (await response.json().catch(() => null)) as
          (SharedCalendarResponse & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !result) {
          setLoadError(result?.error ?? `Could not load the Shared Calendar (HTTP ${response.status})`);
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
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [weekStart]);

  const nowSec = Math.floor(nowMs / 1000);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  // Every game of the week, placed in the viewer's time zone, with its clashes.
  const { games, clashes } = useMemo(() => {
    const servers = new Map((data?.servers ?? []).map((server) => [server.id, server]));
    const placed: PlacedGame[] = [];
    for (const game of data?.games ?? []) {
      const server = servers.get(game.guild_id);
      const date = dateInZone(game.game_timestamp * 1000, timeZone);
      if (!server || date < weekStart || date > addDays(weekStart, 6)) continue;
      const time = timeInZone(game.game_timestamp * 1000, timeZone);
      placed.push({
        ...game,
        state: gameState(game, nowSec),
        date,
        time,
        minutes: hhmmToMinutes(time),
        server,
        clash: false,
      });
    }
    const found: Clash[] = [];
    for (const yours of placed) {
      if (!yours.server.is_yours || !active(yours.state)) continue;
      for (const theirs of placed) {
        if (theirs.server.is_yours || !active(theirs.state)) continue;
        if (categoryOfMode(theirs.mode) !== categoryOfMode(yours.mode)) continue;
        if (Math.abs(theirs.game_timestamp - yours.game_timestamp) >= CLASH_SEC) continue;
        yours.clash = true;
        theirs.clash = true;
        found.push({
          date: yours.date,
          category: categoryOfMode(yours.mode),
          yours,
          theirs,
        });
      }
    }
    found.sort((a, b) => a.yours.game_timestamp - b.yours.game_timestamp);
    return {
      games: placed.sort((a, b) => a.game_timestamp - b.game_timestamp),
      clashes: found,
    };
  }, [data, timeZone, weekStart, nowSec]);

  const shown = games.filter(
    (game) => !hidden.has(game.guild_id) && (filter === "all" || categoryOfMode(game.mode) === filter),
  );
  const syncAge = lastSync ? Math.max(0, Math.round((nowMs - lastSync) / 1000)) : null;
  const serverName = host.servers.find((server) => server.id === host.guild_id)?.name;

  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page="calendar" title="Calendar" subtitle={serverName}>
        <CalendarTabs current="shared" />
        <LiveTag syncAge={syncAge} />
        {host.demo && <span className="gm-tag bg-fuchsia-500/15 text-fuchsia-200">Preview: sample data</span>}
        <ServerSwitcher host={host} />
        <TimeZonePicker value={timeZone} onChange={setTimeZone} />
      </SiteHeader>

      {data && !data.sharing ? (
        <NotSharing host={host} canEnable={data.can_enable} />
      ) : (
        <div className="mx-auto grid max-w-[1700px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="gm-plate flex min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-3 py-2.5 sm:px-3.5 sm:py-3">
              <button
                type="button"
                onClick={() => setWeekStart((start) => addDays(start, -7))}
                className="gm-btn gm-btn-secondary h-8 w-8 p-0"
                aria-label="Previous week"
              >
                <ChevronLeft aria-hidden />
              </button>
              <h1 className="gm-title min-w-0 px-1 text-[22px] sm:text-[28px]">{weekLabel(weekStart)}</h1>
              <button
                type="button"
                onClick={() => setWeekStart((start) => addDays(start, 7))}
                className="gm-btn gm-btn-secondary h-8 w-8 p-0"
                aria-label="Next week"
              >
                <ChevronRight aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(mondayOf(today))}
                className="gm-btn gm-btn-secondary h-8 px-3 text-[13px]"
              >
                This week
              </button>
              <ModeFilterButtons value={filter} onChange={setFilter} />
            </div>

            {loadError && (
              <div className="border-b border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                {loadError}
              </div>
            )}

            {!data ? (
              <div className="flex h-60 items-center justify-center text-ink-400">
                <Spinner className="h-5 w-5" />
              </div>
            ) : (
              <>
                <WeekGrid days={days} today={today} games={shown} timeZone={timeZone} nowMs={nowMs} />
                <Agenda days={days} today={today} games={shown} />
              </>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-800 px-3.5 py-2.5">
              <div className="hidden md:block">
                <StateLegend shared />
              </div>
              <p className="text-xs text-ink-500 md:ml-auto">Times in {timeZone.replace(/_/g, " ")}</p>
            </div>
          </section>

          <aside className="min-w-0 lg:sticky lg:top-[72px] lg:self-start">
            <div className="gm-plate p-4 sm:p-[18px]">
              <p className="text-xs text-ink-400">This week</p>
              <h2 className="gm-title mt-0.5 text-[22px] sm:text-[26px]">Possible clashes</h2>
              <p className="mt-1 text-[13px] text-ink-400">
                The same kind of game as one of yours, on another server, less than two hours apart.
              </p>
              <div className="mt-3 space-y-2">
                {data && clashes.length === 0 && (
                  <p className="gm-cut bg-ink-950 px-3 py-2.5 text-[13px] text-ink-400 [--cut:10px]">None this week.</p>
                )}
                {clashes.map((clash) => (
                  <div
                    key={`${clash.yours.id}-${clash.theirs.id}`}
                    className="gm-plate grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 bg-ink-950 px-3 py-2.5 text-[12.5px] text-ink-400 [--cut:10px]"
                  >
                    <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 text-ink-100" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <strong className="block text-[13px] font-semibold text-ink-100">
                        {formatDateLong(clash.date).replace(/ \d{4}$/, "")}, {clash.category}
                      </strong>
                      Yours at {clash.yours.time}, {clash.theirs.server.name}
                      &apos;s at {clash.theirs.time}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="mb-1 mt-5 text-xs font-semibold text-ink-500">
                Servers sharing their calendar
                {data ? ` (${data.servers.length})` : ""}
              </h3>
              <ul>
                {(data?.servers ?? []).map((server) => {
                  const count = games.filter((game) => game.guild_id === server.id).length;
                  const on = !hidden.has(server.id);
                  return (
                    <li key={server.id} className="border-t border-ink-800 first:border-t-0">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() =>
                          setHidden((current) => {
                            const next = new Set(current);
                            if (next.has(server.id)) next.delete(server.id);
                            else next.add(server.id);
                            return next;
                          })
                        }
                        className="grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-left"
                      >
                        <ServerBadge server={server} size={30} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-ink-100">{server.name}</span>
                          <span className="block text-xs text-ink-500">
                            {count} {count === 1 ? "game" : "games"} this week
                            {server.is_yours ? ", your server" : ""}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={`gm-cut flex h-[18px] w-[18px] items-center justify-center [--cut:4px] ${
                            on ? "bg-brand-400 text-brand-950" : "shadow-[inset_0_0_0_1px_var(--color-ink-600)]"
                          }`}
                        >
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-ink-500">
                Only servers that turn on sharing in their setup are listed, and only their hosts can see this page.
                Nobody sees hosts, players or nations.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function ModeFilterButtons({ value, onChange }: { value: ModeFilter; onChange: (value: ModeFilter) => void }) {
  const options: { value: ModeFilter; label: string; mode: string | null }[] = [
    { value: "all", label: "All modes", mode: null },
    { value: "Roleplay", label: "Roleplay", mode: "Roleplay" },
    { value: "Historical", label: "Historical", mode: "Historical (Vanilla)" },
  ];
  return (
    <div role="radiogroup" aria-label="Modes" className="flex w-full sm:ml-auto sm:w-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex h-[30px] flex-1 items-center justify-center gap-1.5 border border-ink-700 px-3 text-[12.5px] font-semibold transition-colors sm:flex-none [&+&]:border-l-0 ${
            value === option.value ? "bg-ink-800 text-ink-100" : "text-ink-400 hover:text-ink-100"
          }`}
        >
          {option.mode && <ModeIcon mode={option.mode} className="h-3.5 w-3.5" />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ServerBadge({ server, size = 18 }: { server: SharedServer; size?: number }) {
  const cut = size > 20 ? 7 : 4;
  return server.icon_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={server.icon_url}
      alt=""
      width={size}
      height={size}
      className="gm-cut shrink-0"
      style={{ ["--cut" as string]: `${cut}px`, width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={`gm-cut flex shrink-0 items-center justify-center font-extrabold leading-none ${
        server.is_yours ? "bg-brand-400 text-brand-950" : "bg-ink-700 text-ink-100"
      }`}
      style={{
        ["--cut" as string]: `${cut}px`,
        width: size,
        height: size,
        fontSize: size > 20 ? 12 : 10,
      }}
    >
      {initials(server.name)}
    </span>
  );
}

function gameTitle(game: PlacedGame): string {
  const addOn = game.add_on ? addOnOption(game.add_on).label : null;
  return [game.server.name, modeLabel(game.mode), gameStateLabel(game.state), addOn].filter(Boolean).join(", ");
}

/** Desktop: the week by hour. Games that start close together cascade. */
function WeekGrid({
  days,
  today,
  games,
  timeZone,
  nowMs,
}: {
  days: string[];
  today: string;
  games: PlacedGame[];
  timeZone: string;
  nowMs: number;
}) {
  // The whole day scrolls; it opens on the evening, or on the week's earliest daytime game.
  const height = 24 * HOUR_PX;
  const top = (minutes: number) => (minutes / 60) * HOUR_PX;
  const nowMinutes = hhmmToMinutes(timeInZone(nowMs, timeZone));
  const daytime = games.map((game) => game.minutes).filter((minutes) => minutes >= 6 * 60);
  const openAt = Math.min(14 * 60, ...daytime) - 30;
  const scroller = useRef<HTMLDivElement>(null);
  const weekKey = days[0];
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = top(openAt);
    // Only when the week changes: polling must not yank the view back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  return (
    <div className="hidden overflow-x-auto bg-ink-950 lg:block">
      <div className="grid min-w-[760px] grid-cols-[54px_repeat(7,minmax(0,1fr))] border-b border-ink-800">
        <div />
        {days.map((date, index) => (
          <div
            key={date}
            className="flex items-baseline gap-1.5 border-l border-ink-800 px-2.5 py-2 text-xs font-semibold text-ink-500"
          >
            <b
              className={`font-display text-[17px] font-semibold leading-none ${date === today ? "text-brand-400" : "text-ink-300"}`}
            >
              {Number(date.slice(8))}
            </b>
            {WEEKDAYS[index]}
          </div>
        ))}
      </div>
      <div ref={scroller} className="max-h-[max(420px,calc(100vh-260px))] min-w-[760px] overflow-y-auto">
        <div className="grid grid-cols-[54px_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height }}>
            {Array.from({ length: 23 }, (_, index) => (
              <span
                key={index}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-ink-500"
                style={{ top: (index + 1) * HOUR_PX }}
              >
                {String(index + 1).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((date) => {
            const dayGames = games.filter((game) => game.date === date);
            // A game starting while the one before it still shows cascades over it.
            let previous = -Infinity;
            let depth = 0;
            return (
              <div
                key={date}
                className={`relative border-l border-ink-800 ${date < today ? "bg-black/20" : date === today ? "bg-brand-400/[0.035]" : ""}`}
                style={{
                  height,
                  backgroundImage: "linear-gradient(var(--color-ink-800) 1px, transparent 1px)",
                  backgroundSize: `100% ${HOUR_PX}px`,
                }}
              >
                {dayGames.map((game) => {
                  depth = game.minutes - previous < OVERLAP_MIN ? depth + 1 : 0;
                  previous = game.minutes;
                  const over = !active(game.state);
                  return (
                    <div
                      key={game.id}
                      data-game-state={game.state}
                      title={gameTitle(game)}
                      className={`gm-game gm-cut absolute overflow-hidden py-1 pl-2 pr-1.5 text-[11.5px] leading-tight shadow-[0_0_0_1px_var(--color-ink-950)] ${
                        game.add_on ? "gm-addon" : ""
                      } ${game.server.is_yours ? "gm-mine" : ""}`}
                      style={{
                        top: top(game.minutes) + 1,
                        height: BLOCK_PX,
                        left: 3 + depth * 16,
                        right: 3,
                        zIndex: depth + 1,
                      }}
                    >
                      <span className={`flex items-center gap-1.5 font-bold ${over ? "text-ink-400" : "text-ink-100"}`}>
                        <ServerBadge server={game.server} />
                        <span className={`tabular-nums ${game.state === "cancelled" ? "line-through" : ""}`}>
                          {game.time}
                        </span>
                        {game.clash && (
                          <TriangleAlert
                            aria-label="Possible clash"
                            className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-100"
                          />
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-ink-400">
                        <ModeIcon mode={game.mode} className="h-3 w-3 shrink-0 text-ink-300" />
                        <span className="truncate">{modeLabel(game.mode)}</span>
                      </span>
                    </div>
                  );
                })}
                {date === today && (
                  <div
                    aria-hidden
                    className="absolute left-0 right-0 z-20 h-0.5 bg-brand-400 before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:bg-brand-400 before:[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]"
                    style={{ top: top(nowMinutes) }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Phones and narrow screens: the week as a list, day by day. */
function Agenda({ days, today, games }: { days: string[]; today: string; games: PlacedGame[] }) {
  const withGames = days.filter((date) => games.some((game) => game.date === date));
  return (
    <div className="space-y-4 p-3 lg:hidden">
      {withGames.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No shared games this week.</p>}
      {withGames.map((date) => (
        <div key={date}>
          <h4 className="mb-1.5 text-xs font-semibold text-ink-500">
            {formatDateLong(date).replace(/ \d{4}$/, "")}
            {date === today ? " (today)" : ""}
          </h4>
          <div className="space-y-1.5">
            {games
              .filter((game) => game.date === date)
              .map((game) => (
                <div
                  key={game.id}
                  data-game-state={game.state}
                  title={gameTitle(game)}
                  className={`gm-game gm-cut grid grid-cols-[44px_18px_minmax(0,1fr)_auto] items-center gap-2.5 py-2 pl-2.5 pr-2.5 text-[12.5px] [--cut:8px] ${
                    game.add_on ? "gm-addon" : ""
                  } ${game.server.is_yours ? "gm-mine" : ""}`}
                >
                  <span
                    className={`font-display text-base font-bold leading-none text-ink-100 ${game.state === "cancelled" ? "line-through" : ""}`}
                  >
                    {game.time}
                  </span>
                  <ServerBadge server={game.server} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-100">{game.server.name}</span>
                    <span className="flex items-center gap-1.5 text-ink-400">
                      <ModeIcon mode={game.mode} className="h-3 w-3 shrink-0" />
                      <span className="truncate">{modeLabel(game.mode)}</span>
                    </span>
                  </span>
                  {game.clash ? (
                    <span className="gm-tag h-[19px] bg-ink-800 px-2.5 text-[11px] text-ink-100">
                      <TriangleAlert aria-hidden className="h-3 w-3" />
                      Clash
                    </span>
                  ) : (
                    <span data-game-state={game.state} className="gm-tag gm-state-tag h-[19px] px-2.5 text-[11px]">
                      {gameStateLabel(game.state)}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The viewer's server doesn't share: what sharing does, and where to turn it on. */
function NotSharing({ host, canEnable }: { host: HostProfile; canEnable: boolean }) {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-10">
      <div className="gm-plate p-6">
        <span className="gm-cut flex h-11 w-11 items-center justify-center bg-ink-800 text-brand-400">
          <Share2 aria-hidden className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <h1 className="gm-title mt-4 text-[28px]">Your server doesn&apos;t share its calendar</h1>
        <p className="mt-2 text-sm text-ink-300">
          The Shared Calendar shows the games of every GameMaster server that shares its calendar, so hosts don&apos;t
          run the same kind of game at the same hour as another community. Servers that share can see each other&apos;s
          games: the day, time, mode and status, never hosts, players or nations.
        </p>
        {canEnable ? (
          <Link href={`/servers?guild=${host.guild_id}&step=features`} className="gm-btn gm-btn-primary mt-5 h-10">
            <Settings aria-hidden />
            Turn it on in server setup
          </Link>
        ) : (
          <p className="mt-5 text-sm text-ink-400">Host Management can turn it on in server setup, under Features.</p>
        )}
      </div>
    </div>
  );
}
