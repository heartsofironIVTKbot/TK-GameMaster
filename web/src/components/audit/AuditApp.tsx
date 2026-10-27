"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ServerSwitcher from "@/components/ServerSwitcher";
import { GLASS, HostAvatar, Spinner } from "@/components/schedule/ui";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS } from "@/lib/auditTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import AuditList, { CATEGORY_ICON, useAuditFeed } from "./AuditList";

/**
 * /audit — every recorded action on this server (reservations, roster moves,
 * moderation, game start/end, settings, …), newest first. Host Management
 * and admins only; read-only. ?player=<id> / ?game=<id> pre-filter it.
 */

const NAV_LINK =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white";
const INPUT =
  "rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none";

interface Filters {
  category: string;
  q: string;
  player: string;
  game: string;
  from: string;
  to: string;
}

function initialFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const id = (key: string) => {
    const value = params.get(key) ?? "";
    return /^\d{5,25}$/.test(value) ? value : "";
  };
  return { category: "", q: "", player: id("player"), game: id("game"), from: "", to: "" };
}

/** Local calendar day → unix seconds at its start (or its end). */
function dayToUnix(day: string, end: boolean): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const at = end ? new Date(year, month - 1, date, 23, 59, 59) : new Date(year, month - 1, date, 0, 0, 0);
  return Math.floor(at.getTime() / 1000);
}

function queryOf(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.player) params.set("player", filters.player);
  if (filters.game) params.set("game", filters.game);
  const from = dayToUnix(filters.from, false);
  const to = dayToUnix(filters.to, true);
  if (from) params.set("from", String(from));
  if (to) params.set("to", String(to));
  return params.toString();
}

export default function AuditApp({ host }: { host: HostProfile }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [search, setSearch] = useState("");
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  // Search as you type, without a request per key press.
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search })), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => queryOf(filters), [filters]);
  const { feed, counts, loading, loadingMore, loadMore, refresh } = useAuditFeed(query);
  const filtered = Boolean(filters.category || filters.q || filters.player || filters.game || filters.from || filters.to);

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-600 text-lg shadow-lg shadow-amber-500/30">
              📜
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Audit log</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · Who did what, and when</span>
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
            <Link href="/games" className={NAV_LINK}>
              🎮 Games
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

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        <section className={`space-y-3 rounded-3xl p-4 sm:p-5 ${GLASS}`}>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => set({ category: "" })}
              className={chip(!filters.category)}
            >
              All
            </button>
            {AUDIT_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => set({ category: filters.category === category ? "" : category })}
                className={chip(filters.category === category)}
                title={`${AUDIT_CATEGORY_LABELS[category]} — ${counts[category] ?? 0} in the last 7 days`}
              >
                {CATEGORY_ICON[category]} {AUDIT_CATEGORY_LABELS[category]}
                <span className="ml-1 text-[10px] font-semibold opacity-70">{counts[category] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the text (a name, a nation, a reason…)"
              className={`${INPUT} min-w-[240px] flex-1`}
              aria-label="Search the audit log"
            />
            <input
              value={filters.player}
              onChange={(event) => set({ player: event.target.value.replace(/\D/g, "").slice(0, 25) })}
              placeholder="Player's Discord ID"
              className={`${INPUT} w-[170px] font-mono`}
              aria-label="Only actions by or on this player"
            />
            <input
              value={filters.game}
              onChange={(event) => set({ game: event.target.value.replace(/\D/g, "").slice(0, 25) })}
              placeholder="Game ID"
              className={`${INPUT} w-[170px] font-mono`}
              aria-label="Only actions in this game"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              From
              <input type="date" value={filters.from} onChange={(event) => set({ from: event.target.value })} className={INPUT} />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              To
              <input type="date" value={filters.to} onChange={(event) => set({ to: event.target.value })} className={INPUT} />
            </label>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilters({ category: "", q: "", player: "", game: "", from: "", to: "" });
                }}
                className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-400 hover:bg-white/5 hover:text-white"
              >
                Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="Refresh"
              >
                {loading && <Spinner className="h-3 w-3" />}↻ Refresh
              </button>
              <a
                href={`/api/audit/export${query ? `?${query}` : ""}`}
                className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold text-amber-200 hover:bg-amber-400/20"
                title="Download what's shown (with these filters) as a spreadsheet file — up to 10,000 rows"
              >
                ⬇ Export CSV
              </a>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Updates every 15 seconds. Click a row for the details. Rows can&apos;t be edited or deleted; they&apos;re kept for 400 days.
          </p>
        </section>

        <section className={`rounded-3xl p-3 sm:p-4 ${GLASS}`}>
          <AuditList
            feed={feed}
            loading={loading}
            loadingMore={loadingMore}
            loadMore={loadMore}
            onPerson={(id) => set({ player: id })}
            empty={filtered ? "Nothing matches these filters." : undefined}
          />
        </section>
      </main>
    </div>
  );
}

function chip(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-bold transition ${
    active
      ? "border-amber-300 bg-amber-400 text-slate-950"
      : "border-white/10 bg-white/5 text-slate-300 hover:border-amber-300/40 hover:text-white"
  }`;
}
