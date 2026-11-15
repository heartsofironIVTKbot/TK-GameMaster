"use client";

import { Dices, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/schedule/ui";
import type { CasinoRollRow, CasinoRolls } from "@/lib/casinoEntry";
import type { GameControl } from "@/lib/gameControlTypes";
import { CardTitle } from "./labels";

/**
 * Casino games, before they start (2026-11-15): everyone's rolls — who has
 * finished, who stopped where — with their receipts, for the host, co-hosts
 * and Host Management. In place of the old Casino's host page.
 */
export default function CasinoRollsCard({ game }: { game: GameControl }) {
  const [rolls, setRolls] = useState<CasinoRolls | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const key = game.storage_key || game.id;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/casino/${encodeURIComponent(key)}/rolls`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as CasinoRolls | null;
    setRolls(body ?? { status: "denied", message: "GameMaster didn't answer. Try again in a moment." });
    setLoading(false);
  }, [key]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const openReceipt = async (row: CasinoRollRow) => {
    setOpening(row.user_id);
    setReceiptError(null);
    const response = await fetch(`/api/casino/${encodeURIComponent(key)}/receipt/${row.user_id}`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { status: string; url?: string; message?: string } | null;
    setOpening(null);
    if (body?.status === "ok" && body.url) window.open(body.url, "_blank", "noopener");
    else setReceiptError(body?.message ?? "Couldn't open that receipt.");
  };

  const rows = rolls?.status === "ok" ? rolls.rows : [];
  const unfinished = rows.filter((row) => row.state !== "finished").length;

  return (
    <section className="gm-plate space-y-3 p-4 sm:p-[18px]">
      <CardTitle icon={Dices} title="Casino rolls">
        {rolls?.status === "ok" &&
          (unfinished ? (
            <span className="gm-tag gm-tag-dot bg-yellow-950 text-yellow-200">{unfinished} not finished</span>
          ) : rows.length ? (
            <span className="gm-tag gm-tag-dot bg-emerald-950 text-emerald-300">Everyone finished</span>
          ) : null)}
        <button type="button" onClick={() => void load()} disabled={loading} className="gm-btn gm-btn-secondary h-7 px-2 text-xs" aria-label="Refresh">
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw aria-hidden className="h-3.5 w-3.5" />}
        </button>
      </CardTitle>
      {rolls === null ? (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <Spinner className="h-3.5 w-3.5" /> Loading the rolls…
        </p>
      ) : rolls.status === "denied" ? (
        <p className="text-xs text-ink-400">{rolls.message}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-ink-400">Nobody holds a nation yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-ink-800">
            {rows.map((row) => (
              <li key={row.user_id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-100">{row.name}</span>
                  <span className="block truncate text-xs text-ink-400">{row.nation}</span>
                </span>
                {row.state === "finished" ? (
                  <span className="gm-tag gm-tag-dot shrink-0 bg-emerald-950 text-emerald-300">Finished</span>
                ) : row.state === "rolling" ? (
                  <span className="gm-tag gm-tag-dot shrink-0 bg-yellow-950 text-yellow-200">Stopped at {row.where ?? "a room"}</span>
                ) : (
                  <span className="gm-tag gm-tag-dot shrink-0 bg-rose-950 text-rose-300">Not started</span>
                )}
                <button
                  type="button"
                  onClick={() => void openReceipt(row)}
                  disabled={opening === row.user_id}
                  className="gm-btn gm-btn-secondary h-7 shrink-0 px-2 text-xs"
                  title={row.state === "finished" ? "Their receipt" : "Their receipt so far"}
                >
                  {opening === row.user_id ? <Spinner className="h-3.5 w-3.5" /> : <ExternalLink aria-hidden className="h-3.5 w-3.5" />}
                  Receipt
                </button>
              </li>
            ))}
          </ul>
          {receiptError && <p className="text-xs text-rose-300">{receiptError}</p>}
          {rolls.rooms_on && (
            <p className="text-xs text-ink-400">
              Players who haven&apos;t finished get reminders by DM, and you get the list an hour before the start. If they
              still haven&apos;t finished{" "}
              {rolls.removal_at
                ? `by ${new Date(rolls.removal_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "30 minutes before the start"}
              , they&apos;re taken off their nation (you can add them back).
            </p>
          )}
        </>
      )}
    </section>
  );
}
