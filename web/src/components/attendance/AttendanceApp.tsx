"use client";

import Link from "next/link";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useState } from "react";
import type { AttendanceGameSummary } from "@/lib/attendanceTypes";
import { ATTENDANCE_SAMPLE_COUNT } from "@/lib/attendanceTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { GLASS, HostAvatar, Spinner } from "@/components/schedule/ui";
import GameAttendance from "./GameAttendance";
import { PHASE, useNow, useRefreshTick } from "./labels";

/**
 * /attendance — the web home of game attendance (replaces the Discord
 * participation tracker, multi-snapshot embeds and Mark Present / Absent
 * buttons). Left: started games, live ones first. Right: the selected game's
 * live dashboard. The bot still does the Discord work (voice scans, DMs,
 * warnings, roles) — the page asks it through web_schedule_requests.
 * ?game=<lobby thread id> links to a game (the bot's thread links use it).
 */

function readGameParam(): string | null {
  const id = new URLSearchParams(window.location.search).get("game");
  return id && /^\d{5,25}$/.test(id) ? id : null;
}

const NAV_LINK =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white";

export default function AttendanceApp({ host }: { host: HostProfile }) {
  const [picked, setPicked] = useState<string | null>(() => readGameParam());
  const [tick, refresh] = useRefreshTick(30_000);
  const [nonce, setNonce] = useState(0);
  const [list, setList] = useState<{ key: string; games: AttendanceGameSummary[] | null; error: string | null } | null>(null);
  const now = useNow(30_000);
  const key = `${tick}|${nonce}`;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/attendance/games", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { games?: AttendanceGameSummary[]; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.games) setList({ key, games: null, error: body?.error ?? "Couldn't load the games." });
        else setList({ key, games: body.games, error: null });
      })
      .catch(() => {
        if (!cancelled) setList({ key, games: null, error: "Network error." });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Back / forward between games.
  useEffect(() => {
    const onPop = () => setPicked(readGameParam());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const games = list?.games ?? null;
  // Nothing picked: open the newest live game (or the newest game).
  const activeId = picked ?? games?.[0]?.id ?? null;

  const openGame = useCallback((id: string) => {
    setPicked(id);
    window.history.pushState(null, "", `/attendance?game=${id}`);
  }, []);
  const closeGame = useCallback(() => {
    setPicked(null);
    window.history.pushState(null, "", "/attendance");
  }, []);
  const onChanged = useCallback(() => setNonce((value) => value + 1), []);

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-600 text-lg shadow-lg shadow-emerald-500/30">
              🎯
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Attendance</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · Live game attendance</span>
            </span>
          </Link>
          {host.demo && (
            <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-bold text-fuchsia-200">
              PREVIEW MODE · sample data
            </span>
          )}
          <ServerSwitcher host={host} />
          <nav className="ml-auto flex flex-wrap items-center gap-2">
            <Link href="/" className={NAV_LINK}>
              🗺️ Map
            </Link>
            <Link href="/schedule" className={NAV_LINK}>
              🗓️ Calendar
            </Link>
            <Link href="/games" className={NAV_LINK}>
              🎮 Games
            </Link>
            <Link href="/presets" className={NAV_LINK}>
              🧩 Presets
            </Link>
            <Link href="/database" className={NAV_LINK}>
              🗂️ Database
            </Link>
            <div className="hidden items-center gap-2 pl-1 sm:flex">
              <HostAvatar host={host} />
              <span className="text-xs font-semibold text-slate-300">{host.display_name || host.username}</span>
            </div>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1700px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside
          className={`flex flex-col rounded-3xl p-3 sm:p-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-96px)] ${GLASS} ${
            picked ? "hidden lg:flex" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Started games</p>
            <button
              type="button"
              onClick={refresh}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-white/5 hover:text-white"
              aria-label="Refresh the game list"
            >
              {list?.key !== key && <Spinner className="h-3 w-3" />}↻
            </button>
          </div>
          <div className="roster-scroll -mx-1 mt-2 min-h-[160px] flex-1 overflow-y-auto px-1">
            {list?.error && (
              <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{list.error}</p>
            )}
            {!list && (
              <div className="flex items-center gap-2 px-2 py-6 text-xs text-slate-400">
                <Spinner className="h-3.5 w-3.5 text-emerald-300" /> Loading…
              </div>
            )}
            {games && games.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-slate-500">
                No started games yet. A game shows up here as soon as its host starts it on the Games page.
              </p>
            )}
            <ul className="space-y-1.5">
              {games?.map((game) => (
                <GameRow key={game.id} game={game} active={game.id === activeId} now={now} onOpen={() => openGame(game.id)} />
              ))}
            </ul>
          </div>
        </aside>

        <main className="min-w-0">
          {activeId ? (
            <GameAttendance key={activeId} gameId={activeId} host={host} onBack={picked ? closeGame : null} onChanged={onChanged} />
          ) : (
            <section className={`rounded-3xl p-6 text-sm text-slate-400 ${GLASS}`}>
              {games ? "Pick a game on the left." : <Spinner className="h-4 w-4 text-emerald-300" />}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function GameRow({
  game,
  active,
  now,
  onOpen,
}: {
  game: AttendanceGameSummary;
  active: boolean;
  now: number;
  onOpen: () => void;
}) {
  const phase = PHASE[game.phase];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
          active ? "border-emerald-300/60 bg-emerald-400/10" : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{game.name}</span>
          <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${phase.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${phase.dot}`} />
            {phase.label}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
          {game.mode} · {game.host_name ?? "Unknown host"}
          {game.started_at ? ` · ${formatRelative(game.started_at * 1000, now)}` : ""}
        </span>
        <span className="mt-2 flex items-center gap-2">
          <span className="flex flex-1 gap-0.5" aria-label={`${game.samples_done} of ${ATTENDANCE_SAMPLE_COUNT} samples`}>
            {Array.from({ length: ATTENDANCE_SAMPLE_COUNT }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full ${index < game.samples_done ? "bg-emerald-400" : "bg-white/10"}`}
              />
            ))}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-slate-300">
            {game.present}/{game.players}
          </span>
          {game.needs_review > 0 && (
            <span
              className="shrink-0 rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-slate-950"
              title={`${game.needs_review} player(s) to look at`}
            >
              {game.needs_review}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
