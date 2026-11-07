"use client";

import SiteHeader from "@/components/site/SiteHeader";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActivityItem,
  DatabasePlayer,
  ModerationOptions,
  PlayerFilter,
  PlayerSearchResult,
  PlayerSort,
} from "@/lib/moderationTypes";
import { PORTFOLIO_MODES } from "@/lib/moderationTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import {
  Ban,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Medal,
  RefreshCw,
  Recycle,
  Scale,
  Search,
  ShieldCheck,
  Star,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Spinner } from "@/components/schedule/ui";
import { CardTitle } from "@/components/games/labels";
import { ACTION_ICON, ActionIcon, type Tone } from "./actionIcons";
import Avatar from "./Avatar";
import PlayerRecord from "./PlayerRecord";
import RoleCheckCard from "./RoleCheckCard";

/**
 * /database — the hosts' user records (replaces Discord's /give, /take and
 * /sentence). Left: every user with any history (played, or has stats /
 * moderation records), with search, filters and sort — a search also finds
 * members with no history yet. Right: the selected user's full record with
 * the action panel, or the server-wide moderation feed when nobody is
 * selected. ?player=<id> links to a record.
 */

const FILTERS: { value: PlayerFilter; label: string; icon: LucideIcon | null }[] = [
  { value: "all", label: "All", icon: null },
  { value: "warned", label: "Warned", icon: TriangleAlert },
  { value: "banned", label: "Banned", icon: Ban },
  { value: "dishonored", label: "Dishonored", icon: Scale },
  { value: "trusted", label: "Trusted", icon: ShieldCheck },
  { value: "valor", label: "Valor", icon: Medal },
];

const SORTS: { value: PlayerSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "warnings", label: "Most warnings" },
  { value: "commends", label: "Most commends" },
  { value: "games", label: "Most games" },
  { value: "recent", label: "Recently moderated" },
];


function readPlayerParam(): string | null {
  const id = new URLSearchParams(window.location.search).get("player");
  return id && /^\d{15,25}$/.test(id) ? id : null;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Re-renders every `everyMs` so relative times ("3 min ago") stay current. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

export default function DatabaseApp({ host }: { host: HostProfile }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PlayerFilter>("all");
  const [sort, setSort] = useState<PlayerSort>("name");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<{ id: string; row: DatabasePlayer | null } | null>(() => {
    const id = readPlayerParam();
    return id ? { id, row: null } : null;
  });
  const [listNonce, setListNonce] = useState(0);
  const [activityNonce, setActivityNonce] = useState(0);
  const [options, setOptions] = useState<ModerationOptions | null>(null);
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const freshNext = useRef(false);
  const debouncedQuery = useDebounced(query.trim(), 220);

  // Search results — `loading` is derived: the result belongs to another query.
  const queryKey = `${debouncedQuery}|${filter}|${sort}|${page}|${listNonce}`;
  const [result, setResult] = useState<{ key: string; data: PlayerSearchResult | null; error: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: debouncedQuery, filter, sort, page: String(page) });
    if (freshNext.current) {
      params.set("fresh", "1");
      freshNext.current = false;
    }
    fetch(`/api/database/players?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (PlayerSearchResult & { error?: string }) | null;
        if (!response.ok || !body?.players) {
          setResult({ key: queryKey, data: null, error: body?.error ?? "Couldn't load players." });
        } else {
          setResult({ key: queryKey, data: body, error: null });
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") {
          setResult({ key: queryKey, data: null, error: "Network error — retrying when you search again." });
        }
      });
    return () => controller.abort();
    // queryKey covers every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);
  const loading = result?.key !== queryKey;
  const data = result?.data ?? null;

  // The bot's Dishonored nation lists (once).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/database/options")
      .then((response) => response.json() as Promise<{ options?: ModerationOptions | null }>)
      .then((body) => {
        if (!cancelled) setOptions(body.options ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Back / forward between records.
  useEffect(() => {
    const onPop = () => {
      const id = readPlayerParam();
      setSelected(id ? { id, row: null } : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // "/" jumps to the search box (like most admin tools).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openPlayer = useCallback((id: string, row: DatabasePlayer | null) => {
    setSelected({ id, row });
    window.history.pushState(null, "", `/database?player=${id}`);
  }, []);
  const closePlayer = useCallback(() => {
    setSelected(null);
    window.history.pushState(null, "", "/database");
  }, []);

  const onApplied = useCallback(() => {
    freshNext.current = true;
    setListNonce((value) => value + 1);
    setActivityNonce((value) => value + 1);
  }, []);

  const players = data?.players ?? [];
  const activeCursor = Math.min(cursor, Math.max(0, players.length - 1));
  const resetPaging = () => {
    setPage(0);
    setCursor(0);
  };

  const serverName = host.servers.find((server) => server.id === host.guild_id)?.name;

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="database" title="Database" subtitle={serverName}>
        {host.demo && <span className="gm-tag bg-fuchsia-500/15 text-fuchsia-200">Preview: sample data</span>}
        <ServerSwitcher host={host} />
      </SiteHeader>

      <div className="mx-auto grid max-w-[1700px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Search + results */}
        <aside
          data-tour="database.list"
          className={`gm-plate flex flex-col p-3 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-92px)] ${selected ? "hidden lg:flex" : ""}`}
        >
          <label data-tour="database.search" className="gm-field">
            <Search aria-hidden className="h-4 w-4 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value.slice(0, 64));
                resetPaging();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCursor(Math.min(players.length - 1, activeCursor + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCursor(Math.max(0, activeCursor - 1));
                } else if (event.key === "Enter" && players[activeCursor]) {
                  openPlayer(players[activeCursor].discord_id, players[activeCursor]);
                } else if (event.key === "Escape") {
                  setQuery("");
                }
              }}
              placeholder="Search name, @handle or Discord ID"
              aria-label="Search users"
            />
            <kbd className="gm-cut grid h-5 w-5 shrink-0 place-items-center bg-ink-800 text-[11px] font-semibold text-ink-400 [--cut:4px]">/</kbd>
          </label>

          <div className="mt-2.5 flex flex-wrap gap-[5px]">
            {FILTERS.map((option) => {
              const active = option.value === filter;
              const count = data?.counts?.[option.value];
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setFilter(option.value);
                    resetPaging();
                  }}
                  aria-pressed={active}
                  className={`gm-cut flex h-[26px] items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors [--cut:6px] ${
                    active
                      ? "bg-brand-400 text-brand-950"
                      : "bg-ink-950 text-ink-300 shadow-[inset_0_0_0_1px_var(--color-ink-800)] hover:text-ink-100"
                  }`}
                >
                  {Icon && <Icon aria-hidden className="h-[13px] w-[13px]" />}
                  {option.label}
                  {count !== undefined && <span className={active ? "opacity-70" : "font-medium text-ink-500"}>{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5 text-xs text-ink-400">
            <span className="flex items-center gap-1.5">
              {loading && <Spinner className="h-3 w-3 text-brand-300" />}
              {data
                ? `${data.total} user${data.total === 1 ? "" : "s"}${debouncedQuery ? " found" : " with history"}`
                : "Loading…"}
            </span>
            <label className="flex items-center gap-1.5">
              Sort
              <span className="gm-field h-7 px-2 text-xs [--cut:6px]">
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as PlayerSort);
                    resetPaging();
                  }}
                  className="appearance-none pr-1 [color-scheme:dark]"
                >
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" />
              </span>
            </label>
          </div>

          <div className="roster-scroll -mx-1 mt-2 min-h-[200px] flex-1 overflow-y-auto px-1">
            {result?.error && !loading && (
              <p className="gm-cut bg-rose-950 px-3 py-2 text-xs text-rose-200 [--cut:8px]">{result.error}</p>
            )}
            {data && players.length === 0 && !loading && <p className="px-2 py-8 text-center text-xs text-ink-500">No users match.</p>}
            <ul className={`space-y-[3px] transition-opacity ${loading && data ? "opacity-60" : ""}`}>
              {players.map((player, index) => (
                <PlayerRow
                  key={player.discord_id}
                  player={player}
                  active={selected?.id === player.discord_id}
                  focused={index === activeCursor && query.trim().length > 0}
                  onOpen={() => openPlayer(player.discord_id, player)}
                />
              ))}
            </ul>
          </div>

          {data && data.total > data.page_size && (
            <div className="mt-2 flex items-center justify-between border-t border-ink-800 pt-2 text-xs text-ink-400">
              <button type="button" disabled={data.page === 0} onClick={() => setPage(data.page - 1)} className="gm-btn gm-btn-quiet h-7 px-2 text-xs">
                <ChevronLeft aria-hidden />
                Previous
              </button>
              <span>
                {data.page * data.page_size + 1}–{Math.min(data.total, (data.page + 1) * data.page_size)} of {data.total}
              </span>
              <button
                type="button"
                disabled={(data.page + 1) * data.page_size >= data.total}
                onClick={() => setPage(data.page + 1)}
                className="gm-btn gm-btn-quiet h-7 px-2 text-xs"
              >
                Next
                <ChevronRight aria-hidden />
              </button>
            </div>
          )}
        </aside>

        {/* Record or activity feed */}
        <main className="min-w-0">
          {selected ? (
            <PlayerRecord
              key={selected.id}
              playerId={selected.id}
              row={selected.row}
              host={host}
              options={options}
              onClose={closePlayer}
              onApplied={onApplied}
            />
          ) : (
            <div className="space-y-4">
              <RoleCheckCard onOpen={(id) => openPlayer(id, null)} />
              <ActivityFeed nonce={activityNonce} onOpen={(id) => openPlayer(id, null)} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  active,
  focused,
  onOpen,
}: {
  player: DatabasePlayer;
  active: boolean;
  focused: boolean;
  onOpen: () => void;
}) {
  const banned = PORTFOLIO_MODES.filter((mode) => player.modes[mode].banned);
  const mark = "h-[13px] w-[13px] shrink-0";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${player.name}'s record`}
        aria-current={active ? "true" : undefined}
        className={`gm-cut grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-[7px] text-left transition-colors [--cut:8px] ${
          active
            ? "bg-[oklch(21%_0.03_146)] shadow-[inset_3px_0_0_var(--color-brand-400)]"
            : focused
              ? "bg-ink-800"
              : "hover:bg-ink-800/70"
        }`}
      >
        <Avatar url={player.avatar_url} name={player.name} size={36} dim={!player.in_server} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-ink-100">{player.name}</span>
            {player.trusted.length > 0 && (
              <ShieldCheck aria-label={`Trusted: ${player.trusted.join(", ")}`} className={`${mark} text-sky-300`} />
            )}
            {player.valor && <Medal aria-label="Hearts of Valor" className={`${mark} text-yellow-300`} />}
            {player.dishonored.length > 0 && (
              <Scale aria-label={`Dishonored: ${player.dishonored.join(", ")}`} className={`${mark} text-violet-300`} />
            )}
            {banned.length > 0 && <Ban aria-label={`Game banned: ${banned.join(", ")}`} className={`${mark} text-rose-300`} />}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
            {player.username && <span className="truncate">@{player.username}</span>}
            {!player.in_server && <span className="text-ink-500">left the server</span>}
            {!player.has_history && <span className="text-ink-500">no history yet</span>}
          </span>
        </span>
        <span className="shrink-0 text-right text-[11px] leading-tight text-ink-500">
          <span className="block font-display text-lg font-extrabold leading-none text-ink-300">{player.total_games}</span>
          games
        </span>
      </button>
    </li>
  );
}

function ActivityFeed({ nonce, onOpen }: { nonce: number; onOpen: (id: string) => void }) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ key: string; items: ActivityItem[] | null; error: string | null } | null>(null);
  const now = useNow(30_000);
  const key = `${nonce}|${tick}`;

  // Refresh every 30 s while the tab is visible.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((value) => value + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/database/activity", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { activity?: ActivityItem[]; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.activity) setState({ key, items: null, error: body?.error ?? "Couldn't load the activity." });
        else setState({ key, items: body.activity, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ key, items: null, error: "Network error." });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const items = state?.items ?? null;
  return (
    <section data-tour="database.activity" className="gm-plate p-4 sm:p-[18px]">
      <CardTitle icon={History} title="Recent actions">
        <button
          type="button"
          onClick={() => setTick((value) => value + 1)}
          className="gm-btn gm-btn-quiet h-8 w-8 p-0"
          aria-label="Refresh"
          title="Refresh"
        >
          {state?.key !== key ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw aria-hidden />}
        </button>
      </CardTitle>
      <p className="max-w-3xl text-[13px] text-ink-400">
        Every commend, Merit, warning, ban and Dishonored from the website and the bot, newest first. Pick a player on the left to
        open their record and moderate them.
      </p>

      <RuleCards />

      {state?.error && <p className="gm-cut mt-4 bg-rose-950 px-3 py-2 text-sm text-rose-200 [--cut:8px]">{state.error}</p>}
      {!items && !state?.error && (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-400">
          <Spinner className="h-4 w-4 text-brand-300" /> Loading…
        </div>
      )}
      {items && items.length === 0 && (
        <p className="mt-6 text-sm text-ink-500">
          No actions logged yet. They appear here once the bot records them (run /backfill_portfolios once for older history).
        </p>
      )}
      {items && items.length > 0 && (
        <ol className="mt-3">
          {items.map((item, index) => {
            const [Icon, tone] = ACTION_ICON[item.action] ?? [History, "ink" as Tone];
            return (
              <li
                key={`${item.created_at}-${item.target_id}-${item.action}-${index}`}
                className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-ink-800 py-2.5"
              >
                <ActionIcon icon={Icon} tone={tone} />
                <div className="min-w-0 text-[13.5px]">
                  <p className="text-ink-300">
                    <button
                      type="button"
                      onClick={() => onOpen(item.target_id)}
                      className="font-semibold text-ink-100 underline-offset-2 hover:text-brand-400 hover:underline"
                    >
                      {item.target_name}
                    </button>{" "}
                    {item.label}
                    {item.amount !== null && item.amount > 1 && <span className="text-ink-400"> ×{item.amount}</span>}
                    {item.mode && <span className="text-ink-400">, {item.mode}</span>}
                  </p>
                  {item.reason && <p className="mt-0.5 line-clamp-2 text-[12.5px] italic text-ink-400">“{item.reason}”</p>}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                    <span>{item.automatic ? "Automatic" : item.issued_by ? `by ${item.issued_by}` : "by staff"}</span>
                    <span title={new Date(item.created_at * 1000).toLocaleString()}>{formatRelative(item.created_at * 1000, now)}</span>
                    {item.log_url && (
                      <a href={item.log_url} target="_blank" rel="noreferrer" className="font-semibold text-sky-300 hover:underline">
                        Log
                      </a>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The rules every action follows, in one glance. */
function RuleCards() {
  const cards: { icon: LucideIcon; tone: Tone; title: string; text: string }[] = [
    { icon: Star, tone: "good", title: "Commends", text: "5 in a mode and Verified earn that mode's Trusted. They never cancel warnings by themselves." },
    { icon: TriangleAlert, tone: "warn", title: "Warnings", text: "3 in a mode is an automatic game ban. Take one away for free if it was unjustified." },
    { icon: Recycle, tone: "good", title: "Redeem", text: "Spend commends to clear the same number of warnings. The host decides, never automatic." },
    { icon: Medal, tone: "good", title: "Hearts of Valor", text: "25 Merit and 50 attended games, no current warning. Early game notice and a host-approved Trusted role." },
    { icon: Ban, tone: "bad", title: "Game ban", text: "Resets that mode's commends and all Merit to 0, removes Trusted and Hearts of Valor." },
    { icon: Scale, tone: "bad", title: "Dishonor", text: "A time-out: blocks chosen nations, usually 1 week to 3 months. Stats and roles stay." },
  ];
  return (
    <div className="mt-3.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="gm-cut bg-ink-950 p-3 [--cut:10px]">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-100">
            <ActionIcon icon={card.icon} tone={card.tone} size={24} />
            {card.title}
          </p>
          <p className="mt-1.5 text-xs leading-snug text-ink-400">{card.text}</p>
        </div>
      ))}
    </div>
  );
}
