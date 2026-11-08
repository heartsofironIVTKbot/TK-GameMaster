"use client";

import { Check, Copy, Spade } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/schedule/ui";
import type { FortunesDrawRow, FortunesScript } from "@/lib/fortunesScript";
import type { GameControl } from "@/lib/gameControlTypes";
import { CardTitle } from "./labels";

/**
 * Fortunes of War on the Games page (docs/casino-integration.md, step 7):
 * every player's card, and the on_startup script to paste into the submod
 * before the game (it used to be a pinned Discord message).
 */

const STATE_TEXT: Record<FortunesDrawRow["state"], string> = {
  new: "Hasn't opened the cards",
  dealt: "Choosing a card",
  pending: "Deciding: keep or redraw",
  locked: "Locked in",
};

export default function FortunesCard({ game }: { game: GameControl }) {
  const [data, setData] = useState<({ draws: FortunesDrawRow[] } & FortunesScript) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/control/games/${encodeURIComponent(game.id)}/fortunes`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as ({ draws: FortunesDrawRow[]; error?: string } & FortunesScript) | null;
    if (response?.ok && body) {
      setData(body);
      setError(null);
    } else {
      setError(body?.error ?? "Couldn't load the cards.");
    }
  }, [game.id]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const copy = async () => {
    if (!data?.script) return;
    try {
      await navigator.clipboard.writeText(data.script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy: select the script and copy it yourself.");
    }
  };

  const onBoard = data?.draws.filter((row) => row.nation) ?? [];
  const locked = onBoard.filter((row) => row.state === "locked").length;

  return (
    <section data-tour="games.fortunes" className="gm-plate space-y-3 p-4 sm:p-[18px]">
      <CardTitle icon={Spade} title="Fortunes of War" />
      {!data && !error && (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <Spinner className="h-3.5 w-3.5" /> Loading the cards…
        </p>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {data && (
        <>
          <p className="text-xs text-ink-400">
            {onBoard.length === 0
              ? "Nobody has a nation yet. Players draw their card after reserving (the map's “Draw your Fortunes card”)."
              : `${locked} of ${onBoard.length} player${onBoard.length === 1 ? "" : "s"} locked in. Hosts can give a redraw or reset a card from the map's Host Tool.`}
          </p>
          {data.draws.length > 0 && (
            <ul className="divide-y divide-ink-800 border border-ink-800">
              {data.draws.map((row) => (
                <li key={row.user_id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-xs ${row.nation ? "" : "opacity-60"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-ink-100">{row.name}</span>{" "}
                    <span className="text-ink-400">{row.nation ? `· ${row.nation}` : "· not on the board"}</span>
                  </span>
                  <span className="text-ink-200">{row.card_name ?? "No card yet"}</span>
                  <span className="w-full text-[11px] text-ink-500 sm:w-auto">
                    {STATE_TEXT[row.state]} · redraws {row.redraws_used}/{row.max_redraws}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink-300">Script for the submod&apos;s on_startup</p>
              <button type="button" disabled={!data.script} onClick={() => void copy()} className="gm-btn gm-btn-primary h-8 px-3 text-xs [--cut:6px] disabled:opacity-50">
                {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy script"}
              </button>
            </div>
            {data.script ? (
              <pre className="max-h-64 overflow-auto bg-ink-900 p-3 font-mono text-[11.5px] leading-relaxed text-ink-200">{data.script}</pre>
            ) : (
              <p className="text-xs text-ink-500">No cards drawn yet.</p>
            )}
            {data.skipped.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-yellow-300/90">
                {data.skipped.map((line) => (
                  <li key={line}>Left out: {line}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
