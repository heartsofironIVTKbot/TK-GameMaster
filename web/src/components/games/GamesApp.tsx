"use client";

import Link from "next/link";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useState } from "react";
import type { GameControlSummary, GamePhase } from "@/lib/gameControlTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { useNow, useRefreshTick } from "@/components/attendance/labels";
import { GLASS, HostAvatar, Spinner } from "@/components/schedule/ui";
import GameControlPanel from "./GameControlPanel";
import { ACTION_LABEL, PhaseBadge } from "./labels";

/**
 * /games — start, end and cancel games from the web (replaces Discord's
 * /game_start, /game_end, /game_cancel; /announce_game is gone — every game
 * announces itself from the calendar). Left: announced and running games,
 * then the last two days of finished ones. Right: the selected game.
 * ?game=<game id> links to a game (the calendar and the bot's DMs use it;
 * the id is the announcement post's, or an older game's reservation thread).
 */

function readGameParam(): string | null {
  const id = new URLSearchParams(window.location.search).get("game");
  return id && /^\d{5,25}$/.test(id) ? id : null;
}

const NAV_LINK =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white";

const GROUPS: { title: string; phases: GamePhase[] }[] = [
  { title: "Running", phases: ["starting", "live", "ending"] },
  { title: "Announced", phases: ["announced"] },
  { title: "Finished · last 2 days", phases: ["ended", "cancelled"] },
];

export default function GamesApp({ host }: { host: HostProfile }) {
  const [picked, setPicked] = useState<string | null>(() => readGameParam());
  const [mineOnly, setMineOnly] = useState(false);
  const [tick, refresh] = useRefreshTick(20_000);
  const [nonce, setNonce] = useState(0);
  const [list, setList] = useState<{ key: string; games: GameControlSummary[] | null; error: string | null } | null>(null);
  const now = useNow(30_000);
  const key = `${tick}|${nonce}`;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/control/games", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { games?: GameControlSummary[]; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.games) setList({ key, games: null, error: body?.error ?? "Couldn't load the games." });
        else setList({ key, games: body.games, error: null });
      })
      .catch(() => {
        if (!cancelled) setList((previous) => ({ key, games: previous?.games ?? null, error: "Network error — retrying." }));
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
  const shown = (games ?? []).filter((game) => !mineOnly || game.mine);
  // Nothing picked: your next running / announced game, else the first one.
  const activeId =
    picked ??
    (games ?? []).find((game) => game.mine && game.phase !== "ended" && game.phase !== "cancelled")?.id ??
    games?.[0]?.id ??
    null;

  const openGame = useCallback((id: string) => {
    setPicked(id);
    window.history.pushState(null, "", `/games?game=${id}`);
  }, []);
  const closeGame = useCallback(() => {
    setPicked(null);
    window.history.pushState(null, "", "/games");
  }, []);
  const onChanged = useCallback(() => setNonce((value) => value + 1), []);

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-300 to-red-600 text-lg shadow-lg shadow-rose-500/30">
              🎮
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Games</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · Start, end &amp; cancel</span>
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
            <Link href="/presets" className={NAV_LINK}>
              🧩 Presets
            </Link>
            <Link href="/attendance" className={NAV_LINK}>
              🎯 Attendance
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

      <div className="mx-auto grid max-w-[1700px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className={`flex flex-col rounded-3xl p-3 sm:p-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-96px)] ${GLASS} ${
            picked ? "hidden lg:flex" : ""
          }`}
        >
          <div className="flex items-center gap-2 px-1">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-300">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(event) => setMineOnly(event.target.checked)}
                className="h-3.5 w-3.5 accent-amber-400"
              />
              Only my games
            </label>
            <button
              type="button"
              onClick={refresh}
              className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-white/5 hover:text-white"
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
                <Spinner className="h-3.5 w-3.5 text-amber-300" /> Loading…
              </div>
            )}
            {games && shown.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-slate-500">
                {mineOnly ? "You have no announced or running games." : "No announced or running games."} Games show up here once
                the calendar announces them.
              </p>
            )}
            {GROUPS.map((group) => {
              const items = shown.filter((game) => group.phases.includes(game.phase));
              if (items.length === 0) return null;
              return (
                <div key={group.title} className="mb-3">
                  <p className="px-1 pb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{group.title}</p>
                  <ul className="space-y-1.5">
                    {items.map((game) => (
                      <GameRow key={game.id} game={game} active={game.id === activeId} now={now} onOpen={() => openGame(game.id)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0">
          {activeId ? (
            <GameControlPanel key={activeId} gameId={activeId} host={host} onBack={picked ? closeGame : null} onChanged={onChanged} />
          ) : (
            <section className={`rounded-3xl p-6 text-sm text-slate-400 ${GLASS}`}>
              {games ? "Pick a game on the left." : <Spinner className="h-4 w-4 text-amber-300" />}
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
  game: GameControlSummary;
  active: boolean;
  now: number;
  onOpen: () => void;
}) {
  const when =
    game.phase === "announced"
      ? game.scheduled_at
        ? `starts ${formatRelative(game.scheduled_at * 1000, now)}`
        : "not scheduled"
      : game.started_at
        ? `started ${formatRelative(Math.min(game.started_at * 1000, now), now)}`
        : game.scheduled_at
          ? formatRelative(game.scheduled_at * 1000, now)
          : "";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
          active ? "border-amber-300/60 bg-amber-400/10" : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{game.name}</span>
          <PhaseBadge phase={game.phase} />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-400">
          {game.mine && <span className="rounded bg-amber-400/20 px-1 font-bold text-amber-200">You</span>}
          <span className="truncate">
            {game.mode} · {game.host_name ?? "unknown host"} · {when} · {game.players} players
          </span>
        </span>
        {game.in_flight && (
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
            <Spinner className="h-3 w-3" /> {ACTION_LABEL[game.in_flight].running}…
          </span>
        )}
      </button>
    </li>
  );
}
