"use client";

import SiteHeader from "@/components/site/SiteHeader";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useState } from "react";
import type { GameControlSummary, GamePhase } from "@/lib/gameControlTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { useNow, useRefreshTick } from "@/components/attendance/labels";
import { RefreshCw } from "lucide-react";
import ModeIcon from "@/components/schedule/ModeIcon";
import { Spinner } from "@/components/schedule/ui";
import GameControlPanel from "./GameControlPanel";
import { ACTION_LABEL, PHASE, PhaseBadge, gameTitle } from "./labels";

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


const GROUPS: { title: string; phases: GamePhase[] }[] = [
  { title: "Running", phases: ["starting", "live", "ending"] },
  { title: "Announced", phases: ["announced"] },
  { title: "Finished, last 2 days", phases: ["ended", "cancelled"] },
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

  const serverName = host.servers.find((server) => server.id === host.guild_id)?.name;

  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page="games" title="Games" subtitle={serverName}>
        {host.demo && <span className="gm-tag bg-fuchsia-500/15 text-fuchsia-200">Preview: sample data</span>}
        <ServerSwitcher host={host} />
      </SiteHeader>

      <div className="mx-auto grid max-w-[1700px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside
          data-tour="games.list"
          className={`gm-plate flex min-w-0 flex-col p-3 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-92px)] ${picked ? "hidden lg:flex" : ""}`}
        >
          <div className="flex items-center gap-2 border-b border-ink-800 px-0.5 pb-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-300">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(event) => setMineOnly(event.target.checked)}
                className="h-4 w-4 accent-brand-400"
              />
              Only my games
            </label>
            <button
              type="button"
              onClick={refresh}
              className="gm-btn gm-btn-quiet ml-auto h-7 w-7 p-0"
              aria-label="Refresh the game list"
              title="Refresh"
            >
              {list?.key !== key ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw aria-hidden />}
            </button>
          </div>
          <div className="roster-scroll -mx-1 mt-1 min-h-[160px] flex-1 overflow-y-auto px-1">
            {list?.error && <p className="gm-cut mt-2 bg-rose-950 px-3 py-2 text-xs text-rose-200 [--cut:8px]">{list.error}</p>}
            {!list && (
              <div className="flex items-center gap-2 px-2 py-6 text-xs text-ink-400">
                <Spinner className="h-3.5 w-3.5 text-brand-300" /> Loading…
              </div>
            )}
            {games && shown.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-ink-500">
                {mineOnly ? "You have no announced or running games." : "No announced or running games."} Games show up here once
                the calendar announces them.
              </p>
            )}
            {GROUPS.map((group) => {
              const items = shown.filter((game) => group.phases.includes(game.phase));
              if (items.length === 0) return null;
              return (
                <div key={group.title}>
                  <p className="px-1 pb-1.5 pt-3 text-xs font-semibold text-ink-500">{group.title}</p>
                  <ul className="space-y-[5px]">
                    {items.map((game) => (
                      <GameRow key={game.id} game={game} active={game.id === activeId} now={now} onOpen={() => openGame(game.id)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        <main data-tour="games.panel" className="min-w-0">
          {activeId ? (
            <GameControlPanel key={activeId} gameId={activeId} host={host} onBack={picked ? closeGame : null} onChanged={onChanged} />
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
        data-game-state={PHASE[game.phase].state}
        className={`gm-game gm-cut grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5 py-2 pl-2 pr-2.5 text-left [--cut:9px] ${
          game.mine ? "gm-mine" : ""
        } ${active ? "[--tint:color-mix(in_oklab,var(--s)_34%,var(--color-ink-800))]" : "[--tint:color-mix(in_oklab,var(--s)_10%,var(--color-ink-900))] hover:[--tint:color-mix(in_oklab,var(--s)_18%,var(--color-ink-800))]"}`}
      >
        <span className="gm-cut flex h-[34px] w-[34px] items-center justify-center bg-ink-800 text-ink-100 [--cut:7px]">
          <ModeIcon mode={game.mode} className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-100">{gameTitle(game.name)}</span>
            <PhaseBadge phase={game.phase} />
          </span>
          <span className="block truncate text-xs text-ink-400">
            {[game.mode, game.host_name ?? "unknown host", when, `${game.players} players`].filter(Boolean).join(", ")}
          </span>
          {game.in_flight && (
            <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink-100">
              <Spinner className="h-3 w-3" /> {ACTION_LABEL[game.in_flight].running}…
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
