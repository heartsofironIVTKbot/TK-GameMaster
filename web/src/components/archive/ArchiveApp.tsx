"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Drama, Search } from "lucide-react";
import { useEffect, useState } from "react";
import ModeIcon, { TankIcon } from "@/components/schedule/ModeIcon";
import { Spinner } from "@/components/schedule/ui";
import SiteHeader from "@/components/site/SiteHeader";
import type { ArchiveGameCard, ArchiveListResponse, ArchiveSort, ArchiveTab } from "@/lib/archiveTypes";
import { modeOption } from "@/lib/scheduleOptions";
import { ArchiveLegend, IconCounts, RatingInline, StatusTag, markItems, presenceItems, when } from "./parts";

/**
 * /archive: every started game on every server, public. Tabs for Roleplay
 * and Historical, search by player, nation, game, host or server. The
 * roleplay archive lives here too: graded games carry a mark and link to
 * their story (docs/game-archive.md).
 */

interface Loaded {
  key: string;
  data: ArchiveListResponse | null;
  error: string | null;
}

const TABS: { id: ArchiveTab; label: string }[] = [
  { id: "all", label: "All games" },
  { id: "roleplay", label: "Roleplay" },
  { id: "historical", label: "Historical" },
];

function queryKey(q: string, tab: ArchiveTab, server: string, mode: string, graded: boolean, sort: ArchiveSort): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (tab !== "all") params.set("tab", tab);
  if (server) params.set("server", server);
  if (mode) params.set("mode", mode);
  if (graded) params.set("graded", "1");
  if (sort !== "newest") params.set("sort", sort);
  return params.toString();
}

export default function ArchiveApp() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [tab, setTab] = useState<ArchiveTab>(() => {
    const value = params.get("tab");
    return value === "roleplay" || value === "historical" ? value : "all";
  });
  const [server, setServer] = useState(params.get("server") ?? "");
  const [mode, setMode] = useState(params.get("mode") ?? "");
  const [graded, setGraded] = useState(params.get("graded") === "1");
  const [sort, setSort] = useState<ArchiveSort>(() => {
    const value = params.get("sort");
    return value === "oldest" || value === "rating" ? value : "newest";
  });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const key = queryKey(debounced, tab, server, mode, graded, sort);

  // Keep the address in step, so a search can be shared.
  useEffect(() => {
    router.replace(key ? `/archive?${key}` : "/archive", { scroll: false });
  }, [key, router]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/archive${key ? `?${key}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (ArchiveListResponse & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !body?.games) setLoaded({ key, data: null, error: body?.error ?? "The archive is unavailable right now." });
        else setLoaded({ key, data: body, error: null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, data: null, error: "Can't reach the server. Check your connection." });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const loading = loaded?.key !== key;
  const data = loaded?.data ?? null;
  const games = data?.games ?? [];
  const offset = data?.next ?? null;
  const filtered = Boolean(debounced.trim() || mode || graded || server);

  const loadMore = async () => {
    if (offset === null) return;
    setLoadingMore(true);
    const response = await fetch(`/api/archive?${key}${key ? "&" : ""}offset=${offset}`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as ArchiveListResponse | null;
    setLoadingMore(false);
    if (!body?.games) return;
    setLoaded((current) =>
      current?.key === key && current.data
        ? { ...current, data: { ...current.data, games: [...current.data.games, ...body.games], next: body.next } }
        : current,
    );
  };

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="archive" title="Archive" subtitle="Every game, on every server" />

      <main className="mx-auto max-w-[1240px] space-y-3 px-4 py-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <Archive aria-hidden className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
            <h1 className="gm-title text-[30px]">Archive</h1>
          </div>
          <p className="mt-1 text-[13px] text-ink-400">
            Every game: who played which nation, who came, what they got, and how the players rated it.
          </p>
        </div>

        <div data-tour="archive.tabs" className="flex gap-0.5 overflow-x-auto border-b border-ink-800" role="tablist" aria-label="Game type">
          {TABS.map((entry) => {
            const on = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(entry.id);
                  setMode("");
                }}
                className={`flex h-10 shrink-0 items-center gap-2 px-3.5 text-[13px] font-semibold transition-colors ${
                  on ? "text-ink-100 shadow-[inset_0_-2px_0_var(--color-brand-400)]" : "text-ink-400 hover:text-ink-100"
                }`}
              >
                {entry.id === "historical" ? (
                  <TankIcon aria-hidden className={`h-4 w-4 ${on ? "text-brand-400" : ""}`} strokeWidth={1.75} />
                ) : entry.id === "roleplay" ? (
                  <Drama aria-hidden className={`h-4 w-4 ${on ? "text-brand-400" : ""}`} strokeWidth={1.75} />
                ) : (
                  <Archive aria-hidden className={`h-4 w-4 ${on ? "text-brand-400" : ""}`} strokeWidth={1.75} />
                )}
                {entry.label}
                {data && <span className="text-[11.5px] font-normal text-ink-500">{data.tabs[entry.id].toLocaleString()}</span>}
              </button>
            );
          })}
        </div>

        <div data-tour="archive.search" className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-500" strokeWidth={1.75} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value.slice(0, 120))}
              placeholder="Search a player, nation or game"
              aria-label="Search the archive"
              className="gm-input h-[34px] min-h-0 w-full pl-8 text-[13px]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip on={!mode} onClick={() => setMode("")}>
              All
            </Chip>
            {(data?.modes ?? []).map((value) => (
              <Chip key={value} on={mode === value} onClick={() => setMode(mode === value ? "" : value)}>
                {modeOption(value)?.label ?? value}
              </Chip>
            ))}
            <Chip on={graded} onClick={() => setGraded((value) => !value)}>
              <Drama aria-hidden className={`h-3.5 w-3.5 ${graded ? "" : "text-violet-300"}`} strokeWidth={1.75} />
              Roleplay graded
            </Chip>
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ArchiveSort)}
            aria-label="Sort"
            className="gm-input h-[30px] min-h-0 text-[12.5px]"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="rating">Best rated</option>
          </select>
          {(data?.servers.length ?? 0) > 1 && (
            <select value={server} onChange={(event) => setServer(event.target.value)} aria-label="Server" className="gm-input h-[30px] min-h-0 text-[12.5px]">
              <option value="">All servers</option>
              {data?.servers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <p className="flex items-center gap-2 px-1 text-xs text-ink-400" aria-live="polite">
          {loading ? (
            <>
              <Spinner className="h-3.5 w-3.5 text-brand-300" /> Looking…
            </>
          ) : data ? (
            `${data.total.toLocaleString()} game${data.total === 1 ? "" : "s"}${debounced.trim() ? ` matching “${debounced.trim()}”` : ""}`
          ) : null}
        </p>

        {loaded?.error && !loading && <p className="gm-cut bg-rose-950 px-4 py-3 text-sm text-rose-200 [--cut:9px]">{loaded.error}</p>}

        {!loading && data && games.length === 0 && (
          <div className="gm-plate flex flex-col items-center p-10 text-center">
            <Archive aria-hidden className="h-9 w-9 text-brand-400" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold text-ink-100">{filtered ? "Nothing matches that." : "No games yet."}</p>
            <p className="mt-1 text-xs text-ink-500">
              {filtered ? "Try fewer words, or another mode." : "Games show up here the moment a host starts one."}
            </p>
          </div>
        )}

        {games.length > 0 && (
          <div data-tour="archive.list" className={`space-y-1 ${loading ? "opacity-60" : ""}`}>
            <div className="hidden grid-cols-[40px_minmax(0,1.5fr)_130px_150px_210px_190px] gap-3.5 px-3.5 pb-0.5 text-xs text-ink-500 lg:grid">
              <span />
              <span>Game</span>
              <span>Mode</span>
              <span>Rating</span>
              <span>Players</span>
              <span>Given out</span>
            </div>
            {games.map((game) => (
              <GameRow key={game.id} game={game} />
            ))}
          </div>
        )}

        {games.length > 0 && <ArchiveLegend />}

        {offset !== null && !loading && (
          <div className="flex justify-center pt-2">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="gm-btn gm-btn-secondary">
              {loadingMore && <Spinner className="h-4 w-4" />} Show more games
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`gm-cut inline-flex h-[30px] items-center gap-1.5 px-3 text-[12.5px] font-semibold transition-colors [--cut:7px] ${
        on ? "bg-brand-400 text-brand-950" : "bg-ink-900 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}

function GameRow({ game }: { game: ArchiveGameCard }) {
  const running = game.status === "ongoing" || game.status === "starting";
  return (
    <Link
      href={`/archive/${game.id}`}
      className="gm-cut grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 bg-ink-900 px-3 py-2.5 transition-colors [--cut:9px] hover:bg-ink-800 lg:grid-cols-[40px_minmax(0,1.5fr)_130px_150px_210px_190px] lg:gap-x-3.5 lg:px-3.5"
    >
      <span className="gm-cut row-span-2 grid h-9 w-9 place-items-center bg-ink-800 text-brand-400 [--cut:8px] lg:row-span-1">
        <ModeIcon mode={game.mode} className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <b className="truncate text-sm font-semibold text-ink-100">{game.name}</b>
          {game.status !== "ended" && <StatusTag status={game.status} />}
        </span>
        <span className="block truncate text-xs text-ink-500">
          {game.server_name}, {when(game.ts)}
          {game.host_name ? `, hosted by ${game.host_name}` : ""}
        </span>
      </span>
      <span className="hidden text-xs text-ink-400 lg:block">
        {modeOption(game.mode)?.label ?? game.mode}
        {game.graded && (
          <span className="mt-0.5 flex items-center gap-1 font-semibold text-violet-300">
            <Drama aria-hidden className="h-3 w-3" strokeWidth={1.75} />
            Roleplay graded
          </span>
        )}
      </span>
      <span className="col-start-3 row-start-1 justify-self-end lg:col-auto lg:row-auto lg:justify-self-start">
        {game.status === "ended" || game.rating.count > 0 ? <RatingInline rating={game.rating} /> : null}
      </span>
      <span className="col-span-2 col-start-2 lg:col-span-1 lg:col-auto">
        {game.status === "cancelled" ? (
          <span className="text-xs text-ink-500">{game.counts.reserved} reserved</span>
        ) : (
          <IconCounts items={presenceItems(game.counts, running)} />
        )}
      </span>
      <span className="hidden lg:block">
        <IconCounts items={markItems(game.counts)} />
      </span>
    </Link>
  );
}
