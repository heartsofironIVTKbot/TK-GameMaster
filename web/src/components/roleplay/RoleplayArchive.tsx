"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/database/Avatar";
import { ArrowRight, Award, PenLine, ScrollText, Search, Users } from "lucide-react";
import { Spinner } from "@/components/schedule/ui";
import { modeOption } from "@/lib/scheduleOptions";
import type { RpGameCard, RpListResponse } from "@/lib/rpArchiveTypes";
import { Flag, ModeBadge, RpHeader, ServerChip, VerdictBadge, playedOn, words } from "./shared";

/**
 * /roleplay — the public roleplay archive: every game the AI graded, on every
 * server, searchable by player, nation, game, story and quotes. No login.
 */

type Sort = "newest" | "oldest" | "most_rp";

interface Loaded {
  key: string;
  data: RpListResponse | null;
  error: string | null;
}

function queryKey(q: string, server: string, mode: string, rewarded: boolean, sort: Sort): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (server) params.set("server", server);
  if (mode) params.set("mode", mode);
  if (rewarded) params.set("rewarded", "1");
  if (sort !== "newest") params.set("sort", sort);
  return params.toString();
}

export default function RoleplayArchive() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [server, setServer] = useState(params.get("server") ?? "");
  const [mode, setMode] = useState(params.get("mode") ?? "");
  const [rewarded, setRewarded] = useState(params.get("rewarded") === "1");
  const [sort, setSort] = useState<Sort>(() => {
    const value = params.get("sort");
    return value === "oldest" || value === "most_rp" ? value : "newest";
  });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const key = queryKey(debounced, server, mode, rewarded, sort);

  // Keep the address in step, so a search can be shared.
  useEffect(() => {
    router.replace(key ? `/roleplay?${key}` : "/roleplay", { scroll: false });
  }, [key, router]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/roleplay${key ? `?${key}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (RpListResponse & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !body) setLoaded({ key, data: null, error: body?.error ?? "The archive is unavailable right now." });
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
  const games: RpGameCard[] = data?.games ?? [];
  const offset = data?.next ?? null;

  // The next page goes on the end of the same list.
  const loadMore = async () => {
    if (offset === null) return;
    setLoadingMore(true);
    const response = await fetch(`/api/roleplay?${key}${key ? "&" : ""}offset=${offset}`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as RpListResponse | null;
    setLoadingMore(false);
    if (!body) return;
    setLoaded((current) =>
      current?.key === key && current.data
        ? { ...current, data: { ...current.data, games: [...current.data.games, ...body.games], next: body.next } }
        : current,
    );
  };

  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <RpHeader />

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <section className="gm-plate gm-plate-rp p-5 sm:px-8 sm:py-7">
          <h1 className="gm-title max-w-3xl text-[36px] sm:text-[54px]">Every game&apos;s story, and its best roleplay</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
            Read what happened in every graded game: who allied, who betrayed, and the lines that made it. The AI reads each
            game&apos;s chat log and scores the roleplay; hosts give the rewards.
          </p>
          <label className="relative mt-5 block max-w-[680px]" data-tour="rp.search">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-500" strokeWidth={1.75} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value.slice(0, 120))}
              placeholder="Search a player, nation, game or line…"
              aria-label="Search the roleplay archive"
              className="gm-input h-12 w-full pl-11 text-[15px] [--cut:10px] focus:shadow-[inset_0_0_0_1px_var(--color-violet-400)]"
            />
          </label>
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-2" data-tour="rp.filters">
          <FilterChip active={!mode} onClick={() => setMode("")} label="All modes" />
          {(data?.modes ?? []).map((value) => (
            <FilterChip key={value} active={mode === value} onClick={() => setMode(mode === value ? "" : value)} label={modeOption(value)?.label ?? value} />
          ))}
          <span className="mx-1 hidden h-5 w-px bg-ink-800 sm:block" aria-hidden />
          <label className="gm-cut flex h-[30px] cursor-pointer items-center gap-2 bg-ink-900 px-3 text-[12.5px] font-semibold text-ink-300 [--cut:7px]">
            <input type="checkbox" checked={rewarded} onChange={(event) => setRewarded(event.target.checked)} className="h-3.5 w-3.5 accent-violet-400" />
            Rewarded roleplay only
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {(data?.servers.length ?? 0) > 1 && (
              <select
                value={server}
                onChange={(event) => setServer(event.target.value)}
                aria-label="Server"
                className="gm-input h-[30px] min-h-0 text-[12.5px]"
              >
                <option value="">All servers</option>
                {data?.servers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              aria-label="Sort"
              className="gm-input h-[30px] min-h-0 text-[12.5px]"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most_rp">Most roleplay</option>
            </select>
          </div>
        </div>

        <p className="mt-4 flex items-center gap-2 px-1 text-xs text-ink-400" aria-live="polite">
          {loading ? (
            <>
              <Spinner className="h-3.5 w-3.5 text-violet-300" /> Looking…
            </>
          ) : data ? (
            `${data.total.toLocaleString()} game${data.total === 1 ? "" : "s"}${debounced.trim() ? ` matching “${debounced.trim()}”` : ""}`
          ) : null}
        </p>

        {loaded?.error && !loading && (
          <p className="gm-cut mt-3 bg-rose-950 px-4 py-3 text-sm text-rose-200 [--cut:9px]">{loaded.error}</p>
        )}

        {!loading && data && games.length === 0 && (
          <div className="gm-plate mt-4 flex flex-col items-center p-10 text-center">
            <ScrollText aria-hidden className="h-9 w-9 text-violet-300" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold text-ink-100">
              {debounced.trim() || mode || rewarded || server ? "Nothing matches that." : "No graded games yet."}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {debounced.trim() || mode || rewarded || server
                ? "Try fewer words, or another mode."
                : "Games show up here once their host uploads the chat log and runs the AI analysis."}
            </p>
          </div>
        )}

        <div className={`mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3 ${loading ? "opacity-60" : ""}`} data-tour="rp.list">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>

        {offset !== null && !loading && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="gm-btn gm-btn-secondary"
            >
              {loadingMore && <Spinner className="h-4 w-4" />} Show more games
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`gm-cut h-[30px] px-3 text-[12.5px] font-semibold transition-colors [--cut:7px] ${
        active ? "bg-violet-400 text-ink-950" : "bg-ink-900 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
      }`}
    >
      {label}
    </button>
  );
}

function GameCard({ game }: { game: RpGameCard }) {
  return (
    <Link
      href={`/roleplay/${game.id}`}
      className="gm-plate group flex flex-col p-4 transition-colors hover:[--line:color-mix(in_oklab,var(--color-violet-400)_45%,var(--color-ink-800))] sm:p-[18px]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ModeBadge mode={game.mode} />
        <span className="ml-auto text-xs text-ink-500">{playedOn(game.ts)}</span>
      </div>
      <h2 className="gm-title mt-2.5 text-[24px] group-hover:text-violet-100">{game.name}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ServerChip name={game.server_name} icon={game.server_icon_url} />
        {game.host_name && <span className="text-xs text-ink-500">hosted by {game.host_name}</span>}
      </div>
      {game.summary ? (
        <p className="mt-3 line-clamp-3 text-[13px] italic leading-relaxed text-ink-300">“{game.summary}”</p>
      ) : (
        <p className="mt-3 text-sm text-ink-500">No story recap for this game.</p>
      )}
      {game.top.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {game.top.slice(0, 3).map((player, index) => (
            <li key={`${player.tag}-${index}`} className="flex items-center gap-2">
              <Avatar url={player.avatar_url} name={player.name} size={22} />
              <Flag tag={player.tag} className="h-3.5 w-5" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-300">{player.name}</span>
              <VerdictBadge verdict={player.verdict} small />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-4">
        <div className="flex w-full flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-ink-800 pt-2.5 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
            {game.players} players
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PenLine aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
            {words(game.ic_words)} RP words
          </span>
          {game.rewarded > 0 && (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <Award aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
              {game.rewarded} rewarded
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-violet-300 opacity-0 transition-opacity group-hover:opacity-100">
            Read
            <ArrowRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        </div>
      </div>
    </Link>
  );
}
