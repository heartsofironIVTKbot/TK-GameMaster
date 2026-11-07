"use client";

import SiteHeader from "@/components/site/SiteHeader";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useState } from "react";
import type { AttendanceGameSummary } from "@/lib/attendanceTypes";
import { ATTENDANCE_SAMPLE_COUNT } from "@/lib/attendanceTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { RefreshCw } from "lucide-react";
import { Spinner } from "@/components/schedule/ui";
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

  const serverName = host.servers.find((server) => server.id === host.guild_id)?.name;

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="attendance" title="Attendance" subtitle={serverName}>
        {host.demo && <span className="gm-tag bg-fuchsia-500/15 text-fuchsia-200">Preview: sample data</span>}
        <ServerSwitcher host={host} />
      </SiteHeader>

      <div className="mx-auto grid max-w-[1700px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside
          data-tour="attendance.list"
          className={`gm-plate flex flex-col p-3 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-92px)] ${picked ? "hidden lg:flex" : ""}`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-0.5 pb-2.5">
            <p className="text-xs font-semibold text-ink-500">Started games</p>
            <button type="button" onClick={refresh} className="gm-btn gm-btn-quiet h-7 w-7 p-0" aria-label="Refresh the game list" title="Refresh">
              {list?.key !== key ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw aria-hidden />}
            </button>
          </div>
          <div className="roster-scroll -mx-1 mt-2 min-h-[160px] flex-1 overflow-y-auto px-1">
            {list?.error && <p className="gm-cut bg-rose-950 px-3 py-2 text-xs text-rose-200 [--cut:8px]">{list.error}</p>}
            {!list && (
              <div className="flex items-center gap-2 px-2 py-6 text-xs text-ink-400">
                <Spinner className="h-3.5 w-3.5 text-brand-300" /> Loading…
              </div>
            )}
            {games && games.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-ink-500">
                No started games yet. A game shows up here as soon as its host starts it on the Games page.
              </p>
            )}
            <ul className="space-y-[5px]">
              {games?.map((game) => (
                <GameRow key={game.id} game={game} active={game.id === activeId} now={now} onOpen={() => openGame(game.id)} />
              ))}
            </ul>
          </div>
        </aside>

        <main data-tour="attendance.panel" className="min-w-0">
          {activeId ? (
            <GameAttendance key={activeId} gameId={activeId} host={host} onBack={picked ? closeGame : null} onChanged={onChanged} />
          ) : (
            <section className="gm-plate p-6 text-sm text-ink-400">
              {games ? "Pick a game on the left." : <Spinner className="h-4 w-4 text-brand-300" />}
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
        data-game-state={phase.state}
        className={`gm-game gm-cut block w-full px-2.5 py-2.5 text-left [--cut:9px] ${
          active ? "[--tint:color-mix(in_oklab,var(--s)_22%,var(--color-ink-800))]" : "[--tint:color-mix(in_oklab,var(--s)_10%,var(--color-ink-900))]"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-100">{game.name}</span>
          <span data-game-state={phase.state} className="gm-tag gm-tag-dot gm-state-tag h-[19px] shrink-0 px-2 text-[10.5px]">
            {phase.label}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-400">
          {[game.mode, game.host_name ?? "Unknown host", game.started_at ? formatRelative(game.started_at * 1000, now) : null]
            .filter(Boolean)
            .join(", ")}
        </span>
        <span className="mt-2 flex items-center gap-2">
          <span className="flex flex-1 gap-[3px]" aria-label={`${game.samples_done} of ${ATTENDANCE_SAMPLE_COUNT} samples`}>
            {Array.from({ length: ATTENDANCE_SAMPLE_COUNT }, (_, index) => (
              <span key={index} className={`h-[5px] flex-1 ${index < game.samples_done ? "bg-emerald-300" : "bg-ink-800"}`} />
            ))}
          </span>
          <span className="shrink-0 text-xs font-semibold text-ink-300">
            {game.present}/{game.players}
          </span>
          {game.needs_review > 0 && (
            <span
              className="gm-cut grid h-[18px] min-w-[18px] shrink-0 place-items-center bg-yellow-300 px-1 text-[11px] font-bold text-ink-950 [--cut:4px]"
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
