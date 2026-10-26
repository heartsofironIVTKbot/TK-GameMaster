"use client";

import Link from "next/link";
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
import { GLASS, HostAvatar, Spinner } from "@/components/schedule/ui";
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

const FILTERS: { value: PlayerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "warned", label: "⚠️ Warned" },
  { value: "banned", label: "🔴 Banned" },
  { value: "dishonored", label: "⚖️ Dishonored" },
  { value: "trusted", label: "🛡️ Trusted" },
  { value: "valor", label: "🎖️ Valor" },
];

const SORTS: { value: PlayerSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "warnings", label: "Most warnings" },
  { value: "commends", label: "Most commends" },
  { value: "games", label: "Most games" },
  { value: "recent", label: "Recently moderated" },
];


const ACTION_ICON: Record<string, string> = {
  commend: "⭐",
  commend_removed: "➖",
  merit: "🎖️",
  merit_removed: "➖",
  warn: "⚠️",
  warn_removed: "✅",
  redeem: "♻️",
  ban: "🔴",
  unban: "🟢",
  appeal: "📨",
  valor_trusted: "🛡️",
  host_acclamation: "⭐",
  host_violation: "⚠️",
  host_acclamation_removed: "➖",
  host_violation_removed: "✅",
  dishonored_give: "⚖️",
  dishonored_take: "🕊️",
  valor_earned: "🎖️",
  verified_granted: "🪪",
  verified_removed: "➖",
  vip_granted: "🌟",
  vip_removed: "🚫",
  vip_declined: "✖️",
};

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

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-600 text-lg shadow-lg shadow-amber-500/30">
              🗂️
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Database</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · User records</span>
            </span>
          </Link>
          {host.demo && (
            <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-bold text-fuchsia-200">
              PREVIEW MODE · sample data
            </span>
          )}
          <ServerSwitcher host={host} />
          <nav className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
            >
              🗺️ Map
            </Link>
            <Link
              href="/schedule"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
            >
              🗓️ Calendar
            </Link>
            <Link
              href="/games"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
            >
              🎮 Games
            </Link>
            <Link
              href="/presets"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
            >
              🧩 Presets
            </Link>
            <Link
              href="/attendance"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
            >
              🎯 Attendance
            </Link>
            <div className="hidden items-center gap-2 pl-1 sm:flex">
              <HostAvatar host={host} />
              <span className="text-xs font-semibold text-slate-300">{host.display_name || host.username}</span>
            </div>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1700px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[370px_minmax(0,1fr)]">
        {/* Search + results */}
        <aside
          className={`flex flex-col rounded-3xl p-3 sm:p-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-96px)] ${GLASS} ${
            selected ? "hidden lg:flex" : ""
          }`}
        >
          <div className="relative">
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
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-2.5 pl-9 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-amber-300/60 focus:outline-none"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">🔎</span>
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/15 px-1.5 text-[10px] font-bold text-slate-500">
              /
            </kbd>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {FILTERS.map((option) => {
              const active = option.value === filter;
              const count = data?.counts?.[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setFilter(option.value);
                    resetPaging();
                  }}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                    active
                      ? "border-amber-300 bg-amber-400 text-slate-950"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {option.label}
                  {count !== undefined && <span className={active ? "ml-1 opacity-70" : "ml-1 text-slate-500"}>{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              {loading && <Spinner className="h-3 w-3 text-amber-300" />}
              {data
                ? `${data.total} user${data.total === 1 ? "" : "s"}${debouncedQuery ? " found" : " with history"}`
                : "Loading…"}
            </span>
            <label className="flex items-center gap-1.5">
              Sort
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as PlayerSort);
                  resetPaging();
                }}
                className="rounded-md border border-white/10 bg-slate-900/80 px-1.5 py-1 text-[11px] font-semibold text-slate-200 [color-scheme:dark] focus:outline-none"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="roster-scroll -mx-1 mt-2 min-h-[200px] flex-1 overflow-y-auto px-1">
            {result?.error && !loading && (
              <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{result.error}</p>
            )}
            {data && players.length === 0 && !loading && (
              <p className="px-2 py-8 text-center text-xs text-slate-500">No users match.</p>
            )}
            <ul className={`space-y-1 transition-opacity ${loading && data ? "opacity-60" : ""}`}>
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
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-slate-400">
              <button
                type="button"
                disabled={data.page === 0}
                onClick={() => setPage(data.page - 1)}
                className="rounded-md px-2 py-1 font-bold hover:bg-white/5 disabled:opacity-30"
              >
                ‹ Prev
              </button>
              <span>
                {data.page * data.page_size + 1}–{Math.min(data.total, (data.page + 1) * data.page_size)} of {data.total}
              </span>
              <button
                type="button"
                disabled={(data.page + 1) * data.page_size >= data.total}
                onClick={() => setPage(data.page + 1)}
                className="rounded-md px-2 py-1 font-bold hover:bg-white/5 disabled:opacity-30"
              >
                Next ›
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
            <>
              <RoleCheckCard onOpen={(id) => openPlayer(id, null)} />
              <ActivityFeed nonce={activityNonce} onOpen={(id) => openPlayer(id, null)} />
            </>
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
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${player.name}'s record`}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
          active
            ? "border-amber-300/70 bg-amber-400/10"
            : focused
              ? "border-white/25 bg-white/[0.06]"
              : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
        }`}
      >
        <Avatar url={player.avatar_url} name={player.name} size={36} dim={!player.in_server} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-white">{player.name}</span>
            {player.trusted.length > 0 && <span title={`Trusted: ${player.trusted.join(", ")}`}>🛡️</span>}
            {player.valor && <span title="Hearts of Valor">🎖️</span>}
            {player.dishonored.length > 0 && <span title={`Dishonored: ${player.dishonored.join(", ")}`}>⚖️</span>}
            {banned.length > 0 && <span title={`Game banned: ${banned.join(", ")}`}>🔴</span>}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
            {player.username && <span className="truncate">@{player.username}</span>}
            {!player.in_server && <span className="text-slate-500">left the server</span>}
            {!player.has_history && <span className="text-slate-500">no history yet</span>}
          </span>
        </span>
        <span className="shrink-0 text-right text-[10px] leading-tight text-slate-500">
          <span className="block text-xs font-black text-slate-300">{player.total_games}</span>
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
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">📜 Moderation activity</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Recent actions</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Every commend, Merit, warning, ban and Dishonored from the web and the bot — newest first. Pick a user on the
            left to open their record and moderate them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTick((value) => value + 1)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
        >
          {state?.key !== key && <Spinner className="h-3 w-3" />}↻ Refresh
        </button>
      </div>

      <RuleCards />

      {state?.error && (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{state.error}</p>
      )}
      {!items && !state?.error && (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <Spinner className="h-4 w-4 text-amber-300" /> Loading…
        </div>
      )}
      {items && items.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          No actions logged yet. They appear here once the bot records them (run /backfill_portfolios once for older history).
        </p>
      )}
      {items && items.length > 0 && (
        <ol className="mt-5 divide-y divide-white/5">
          {items.map((item, index) => (
            <li key={`${item.created_at}-${item.target_id}-${item.action}-${index}`} className="flex gap-3 py-2.5">
              <span className="mt-0.5 w-6 shrink-0 text-center text-base">{ACTION_ICON[item.action] ?? "•"}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-slate-200">
                  <button
                    type="button"
                    onClick={() => onOpen(item.target_id)}
                    className="font-bold text-white underline-offset-2 hover:text-amber-200 hover:underline"
                  >
                    {item.target_name}
                  </button>{" "}
                  <span className="text-slate-400">—</span> {item.label}
                  {item.amount !== null && item.amount > 1 && <span className="text-slate-400"> ×{item.amount}</span>}
                  {item.mode && <span className="text-slate-400"> · {item.mode}</span>}
                </p>
                {item.reason && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">“{item.reason}”</p>}
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.automatic ? "🤖 Automatic" : item.issued_by ? `by ${item.issued_by}` : "by staff"} ·{" "}
                  <span title={new Date(item.created_at * 1000).toLocaleString()}>{formatRelative(item.created_at * 1000, now)}</span>
                  {item.log_url && (
                    <>
                      {" · "}
                      <a href={item.log_url} target="_blank" rel="noreferrer" className="font-semibold text-sky-300 hover:underline">
                        log ↗
                      </a>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The rules every action follows, in one glance. */
function RuleCards() {
  const cards = [
    { icon: "⭐", title: "Commends", text: "5 in a mode + Verified → that mode's Trusted. They never cancel warnings by themselves." },
    { icon: "⚠️", title: "Warnings", text: "3 in a mode → automatic game ban. Take one away for free if it was unjustified." },
    { icon: "♻️", title: "Redeem", text: "Spend commends to clear the same number of warnings — the host decides, never automatic." },
    { icon: "🎖️", title: "Hearts of Valor", text: "25 Merit + 50 attended games, no current warning. Perks: early game notice + a host-approved Trusted role." },
    { icon: "🔴", title: "Game ban", text: "Resets that mode's commends and all Merit to 0, removes Trusted and Hearts of Valor." },
    { icon: "⚖️", title: "Dishonor", text: "A time-out: blocks chosen nations (usually 1 week – 3 months). Stats and roles stay." },
  ];
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-sm font-black text-white">
            {card.icon} {card.title}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">{card.text}</p>
        </div>
      ))}
    </div>
  );
}
