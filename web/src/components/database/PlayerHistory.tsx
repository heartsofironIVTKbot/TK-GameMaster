"use client";

import { History, List, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CardTitle } from "@/components/games/labels";
import AuditList, { auditChip, categoryIcon, useAuditFeed } from "@/components/audit/AuditList";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS } from "@/lib/auditTypes";

/**
 * A player's History on the Database page: audit rows done by or to them
 * (staff only). Chips filter by kind of action (only the kinds this player
 * has, with their counts) and a box searches the text.
 */
export default function PlayerHistory({ playerId }: { playerId: string }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Search as you type, without a request per key press.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ player: playerId, limit: "20", player_counts: "1" });
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    return params.toString();
  }, [playerId, category, q]);
  const { feed, counts, loading, loadingMore, loadMore } = useAuditFeed(query, 30_000);

  const kinds = AUDIT_CATEGORIES.filter((key) => (counts[key] ?? 0) > 0 || key === category);
  const total = kinds.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const filtering = Boolean(category || q);

  return (
    <section data-tour="database.history" className="gm-plate min-w-0 space-y-3 p-4 sm:p-[18px]">
      <CardTitle icon={History} title="History">
        <a href={`/audit?player=${playerId}`} className="text-xs font-semibold text-brand-400 hover:underline">
          Open in the Audit log
        </a>
      </CardTitle>
      {(total > 0 || filtering || search) && (
        <div className="space-y-2">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter the history by kind of action">
            <button type="button" onClick={() => setCategory("")} className={auditChip(!category)} aria-pressed={!category}>
              <List aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
              All
              <span className="text-[11px] opacity-65">{total}</span>
            </button>
            {kinds.map((key) => {
              const { icon: Icon, tone } = categoryIcon(key);
              const on = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(on ? "" : key)}
                  className={auditChip(on)}
                  aria-pressed={on}
                >
                  <Icon aria-hidden className={`h-3.5 w-3.5 ${on ? "" : tone}`} strokeWidth={1.75} />
                  {AUDIT_CATEGORY_LABELS[key]}
                  <span className="text-[11px] opacity-65">{counts[key] ?? 0}</span>
                </button>
              );
            })}
          </div>
          <label className="relative block">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-500" strokeWidth={1.75} />
            <input
              type="search"
              maxLength={100}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this history (a nation, a game, a reason)"
              className="gm-input h-[34px] min-h-0 w-full pl-8 text-[13px]"
              aria-label="Search this player's history"
            />
          </label>
        </div>
      )}
      <AuditList
        feed={feed}
        loading={loading}
        loadingMore={loadingMore}
        loadMore={loadMore}
        empty={filtering ? "Nothing matches these filters." : "Nothing recorded for this player yet."}
      />
    </section>
  );
}
