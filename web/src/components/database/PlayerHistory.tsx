"use client";

import AuditList, { useAuditFeed } from "@/components/audit/AuditList";
import { GLASS } from "@/components/schedule/ui";

/** A player's History on the Database page: audit rows done by or to them (staff only). */
export default function PlayerHistory({ playerId }: { playerId: string }) {
  const { feed, loading, loadingMore, loadMore } = useAuditFeed(`player=${playerId}&limit=20`, 30_000);
  return (
    <section className={`min-w-0 space-y-3 rounded-3xl p-4 sm:p-5 ${GLASS}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">📜 History</h2>
        <a href={`/audit?player=${playerId}`} className="text-[11px] font-bold text-amber-300 hover:underline">
          Open in the Audit log →
        </a>
      </div>
      <AuditList
        feed={feed}
        loading={loading}
        loadingMore={loadingMore}
        loadMore={loadMore}
        empty="Nothing recorded for this player yet."
      />
    </section>
  );
}
