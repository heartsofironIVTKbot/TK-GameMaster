"use client";

import { Dices } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/schedule/ui";
import type { GameControl } from "@/lib/gameControlTypes";
import { CardTitle } from "./labels";
import { useBotRequest } from "./useBotRequest";

/**
 * Casino and Fortunes of War games, before they start (docs/casino-integration.md,
 * step 8): is tkcasino.online answering, and, for the game's host or Host
 * Management, the way out if it stays down: switch the game to normal
 * reserving on the map. Nations already picked stay.
 */
export default function CasinoFallbackCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const [up, setUp] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const request = useBotRequest(onChanged);
  const label = game.add_on === "fortunes" ? "Fortunes of War" : "Casino";

  const check = useCallback(async () => {
    const response = await fetch("/api/casino/status", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { up?: boolean } | null;
    setUp(response?.ok ? body?.up === true : false);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void check(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void check();
    }, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [check]);

  const done = request.state.phase === "done" ? request.state.status.result?.access : null;

  return (
    <section data-tour="games.casino" className="gm-plate space-y-3 p-4 sm:p-[18px]">
      <CardTitle icon={Dices} title={label}>
        {up === null ? (
          <span className="gm-tag bg-ink-800 text-ink-300">
            <Spinner className="h-3 w-3" /> Checking
          </span>
        ) : up ? (
          <span className="gm-tag gm-tag-dot bg-emerald-950 text-emerald-300">tkcasino.online is up</span>
        ) : (
          <span className="gm-tag gm-tag-dot bg-rose-950 text-rose-300">tkcasino.online is down</span>
        )}
      </CardTitle>
      <p className="text-xs text-ink-400">
        {game.add_on === "fortunes"
          ? "Players reserve on the map, then draw their card on tkcasino.online."
          : "Players roll their nation on tkcasino.online; each pick shows on the map at once."}{" "}
        {up === false && "Players who open it now are told it's down and to try again soon."}
      </p>
      {done ? (
        <p className="text-xs text-emerald-300">
          <b>{done.title}.</b> {done.summary}
        </p>
      ) : (
        game.can_manage && (
          <div className="space-y-2">
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`gm-btn h-8 px-3 text-xs [--cut:6px] ${up === false ? "gm-btn-primary" : "gm-btn-secondary"}`}
              >
                Switch to normal reserving
              </button>
            ) : (
              <div className="space-y-2 border border-rose-400/40 bg-rose-950/30 p-3 text-xs text-rose-100">
                <p>
                  This turns the game into a normal map game for good: no more {label}. Nations already picked stay, everyone else reserves on the
                  map, and the announcement&apos;s link changes to the map.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={request.busy}
                    onClick={() => void request.submit({ action: "casino_fallback", payload: { thread_id: game.id } })}
                    className="gm-btn gm-btn-danger h-8 px-3 text-xs [--cut:6px]"
                  >
                    {request.busy && <Spinner className="h-3 w-3" />}Switch it
                  </button>
                  <button type="button" disabled={request.busy} onClick={() => setConfirming(false)} className="gm-btn gm-btn-secondary h-8 px-3 text-xs [--cut:6px]">
                    Keep the {label}
                  </button>
                </div>
              </div>
            )}
            {request.state.phase === "error" && <p className="text-xs text-rose-300">{request.state.message.replace(/^❌\s*/, "")}</p>}
          </div>
        )
      )}
    </section>
  );
}
