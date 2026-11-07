"use client";

import SiteHeader from "@/components/site/SiteHeader";
import { useEffect, useMemo, useState } from "react";
import ServerSwitcher from "@/components/ServerSwitcher";
import { Download, List, RefreshCw, Search, X } from "lucide-react";
import { Spinner } from "@/components/schedule/ui";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS } from "@/lib/auditTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import AuditList, { CATEGORY_ICON, useAuditFeed } from "./AuditList";

/**
 * /audit — every recorded action on this server (reservations, roster moves,
 * moderation, game start/end, settings, …), newest first. Host Management
 * and admins only; read-only. ?player=<id> / ?game=<id> pre-filter it.
 */

const INPUT = "gm-input h-[34px] min-h-0 text-[13px]";

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
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="audit" title="Audit log" subtitle="Who did what, and when">
          {host.demo && (
            <span className="gm-tag bg-violet-950 text-violet-300">Preview: sample data</span>
          )}
          <ServerSwitcher host={host} />
      </SiteHeader>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        <section className="gm-plate space-y-3 p-3.5 sm:p-4">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => set({ category: "" })}
              className={chip(!filters.category)}
            >
              <List aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
              All
            </button>
            {AUDIT_CATEGORIES.map((category) => {
              const { icon: Icon, tone } = CATEGORY_ICON[category];
              const on = filters.category === category;
              return (
              <button
                key={category}
                type="button"
                onClick={() => set({ category: filters.category === category ? "" : category })}
                className={chip(filters.category === category)}
                title={`${AUDIT_CATEGORY_LABELS[category]}: ${counts[category] ?? 0} in the last 7 days`}
              >
                <Icon aria-hidden className={`h-3.5 w-3.5 ${on ? "" : tone}`} strokeWidth={1.75} />
                {AUDIT_CATEGORY_LABELS[category]}
                <span className="text-[11px] opacity-65">{counts[category] ?? 0}</span>
              </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[240px] flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-500" strokeWidth={1.75} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the text (a name, a nation, a reason)"
                className={`${INPUT} w-full pl-8`}
                aria-label="Search the audit log"
              />
            </label>
            <input
              value={filters.player}
              onChange={(event) => set({ player: event.target.value.replace(/\D/g, "").slice(0, 25) })}
              placeholder="Player's Discord ID"
              className={`${INPUT} w-[170px]`}
              aria-label="Only actions by or on this player"
            />
            <input
              value={filters.game}
              onChange={(event) => set({ game: event.target.value.replace(/\D/g, "").slice(0, 25) })}
              placeholder="Game ID"
              className={`${INPUT} w-[150px]`}
              aria-label="Only actions in this game"
            />
            <label className="flex items-center gap-1.5 text-xs text-ink-400">
              From
              <input type="date" value={filters.from} onChange={(event) => set({ from: event.target.value })} className={INPUT} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-400">
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
                className="gm-btn gm-btn-quiet h-[30px] px-2.5 text-[12.5px] [--cut:7px]"
              >
                <X aria-hidden strokeWidth={1.75} />
                Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                className="gm-btn gm-btn-quiet h-[30px] px-2.5 text-[12.5px] [--cut:7px]"
                aria-label="Refresh"
              >
                {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw aria-hidden strokeWidth={1.75} />}
                Refresh
              </button>
              <a
                href={`/api/audit/export${query ? `?${query}` : ""}`}
                className="gm-btn gm-btn-secondary h-[30px] px-3 text-[12.5px] [--cut:7px]"
                title="Download what's shown (with these filters) as a spreadsheet file, up to 10,000 rows"
              >
                <Download aria-hidden strokeWidth={1.75} />
                Export CSV
              </a>
            </div>
          </div>
          <p className="text-xs text-ink-500">
            Updates every 15 seconds. Click a row for the details. Rows can&apos;t be changed or deleted and are kept for 400 days.
          </p>
        </section>

        <section>
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
  return `gm-cut inline-flex h-[30px] items-center gap-1.5 px-3 text-[12.5px] font-semibold transition-colors [--cut:7px] ${
    active ? "bg-brand-400 text-brand-950" : "bg-ink-950 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
  }`;
}
