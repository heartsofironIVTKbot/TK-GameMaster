"use client";

import { History } from "lucide-react";
import { CardTitle } from "@/components/games/labels";
import AuditList, { useAuditFeed } from "@/components/audit/AuditList";

/** A player's History on the Database page: audit rows done by or to them (staff only). */
export default function PlayerHistory({ playerId }: { playerId: string }) {
  const { feed, loading, loadingMore, loadMore } = useAuditFeed(`player=${playerId}&limit=20`, 30_000);
  return (
    <section data-tour="database.history" className="gm-plate min-w-0 space-y-3 p-4 sm:p-[18px]">
      <CardTitle icon={History} title="History">
        <a href={`/audit?player=${playerId}`} className="text-xs font-semibold text-brand-400 hover:underline">
          Open in the Audit log
        </a>
      </CardTitle>
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
