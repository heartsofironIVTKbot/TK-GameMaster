"use client";

import { UserPlus } from "lucide-react";
import Avatar from "@/components/database/Avatar";
import { Spinner } from "@/components/schedule/ui";
import type { GameControl } from "@/lib/gameControlTypes";
import { HOTJOIN_STATUS_TEXT, type HotJoinRequestView } from "@/lib/hotJoinTypes";
import { BotText, dateTime, CardTitle } from "./labels";
import { useBotRequest } from "./useBotRequest";

/**
 * Hot-join requests from the map (formerly the reservation thread's Hot-Join
 * panel). Approving runs the late join: the nation, the Gamer Pass, a voice
 * channel and a DM; declining DMs the player too.
 */

/** "_FILL_Filler_1" → "Filler 1", "Italy_coop" → "Italy (Co-op)". */
function prettySlotName(slot: string): string {
  if (slot.startsWith("_FILL_")) return slot.slice(6).replace(/_/g, " ");
  if (slot.includes("_coop")) return `${slot.split("_coop")[0]} (Co-op)`;
  return slot;
}

function RequestRow({ game, entry, onChanged }: { game: GameControl; entry: HotJoinRequestView; onChanged: () => void }) {
  const request = useBotRequest(onChanged);
  const decide = (approve: boolean, force = false) =>
    void request.submit({ action: "hotjoin_decide", payload: { thread_id: game.id, user_id: entry.user_id, approve, force } });
  const pending = entry.status === "pending";
  return (
    <li className="bg-ink-950/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Avatar url={entry.avatar_url} name={entry.name} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-ink-100">
            {entry.name} <span className="font-normal text-ink-400">→ {entry.nation}</span>
          </span>
          <span className="block text-[11px] text-ink-500">
            Asked {dateTime(entry.ts)}
            {entry.current ? ` · on the list as ${prettySlotName(entry.current)} now` : " · not on the list yet"}
            {!pending && entry.decided_by_name ? ` · ${HOTJOIN_STATUS_TEXT[entry.status].toLowerCase()} by ${entry.decided_by_name}` : ""}
          </span>
        </span>
        {pending && game.can_manage ? (
          <span className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={request.busy}
              onClick={() => decide(true)}
              className="gm-btn gm-btn-primary h-7 px-2.5 text-xs [--cut:6px]"
            >
              {request.busy && <Spinner className="h-3 w-3" />}Approve
            </button>
            <button
              type="button"
              disabled={request.busy}
              onClick={() => decide(false)}
              className="gm-cut [--cut:7px] border border-ink-700 bg-ink-800 px-2.5 py-1 text-[11px] font-bold text-ink-200 hover:border-rose-300/50 hover:text-ink-100 disabled:opacity-40"
            >
              Decline
            </button>
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
              entry.status === "approved"
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                : pending
                  ? "border-brand-400/40 bg-brand-500/15 text-brand-100"
                  : "border-ink-800 bg-ink-800 text-ink-300"
            }`}
          >
            {HOTJOIN_STATUS_TEXT[entry.status]}
          </span>
        )}
      </div>
      {request.state.phase === "confirm" && (
        <div className="mt-2 gm-cut [--cut:9px] border border-brand-400/40 bg-brand-500/10 px-3 py-2 text-xs text-brand-50">
          <p className="font-bold">The bot found something to check first:</p>
          <ul className="mt-1 space-y-0.5">
            {(request.state.status.result?.warnings ?? []).map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => decide(true, true)} className="gm-cut [--cut:5px] bg-brand-400 px-3 py-1 font-bold text-ink-950 hover:bg-brand-300">
              Approve anyway
            </button>
            <button type="button" onClick={request.reset} className="gm-cut [--cut:5px] border border-white/20 px-3 py-1 font-bold text-ink-100 hover:bg-ink-800">
              Cancel
            </button>
          </div>
        </div>
      )}
      {request.state.phase === "error" && (
        <p className="mt-2 gm-cut [--cut:7px] border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100">
          <BotText text={request.state.message} />
        </p>
      )}
    </li>
  );
}

export default function HotJoinCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const waiting = game.hotjoin.filter((entry) => entry.status === "pending").length;
  return (
    <section data-tour="games.hotjoin" className="gm-plate p-4 sm:p-[18px]">
      <CardTitle icon={UserPlus} title="Hot-join requests">
        {waiting > 0 && (
          <span className="gm-tag gm-tag-dot bg-yellow-950 text-yellow-300">{waiting} waiting</span>
        )}
      </CardTitle>
      <p className="text-[13px] text-ink-400">
        Players ask on the map to join this running game as a free nation. You get a Discord DM for each request. Approving gives
        them the nation, the Gamer Pass and a voice channel.
      </p>
      {game.hotjoin.length === 0 ? (
        <p className="mt-3 text-xs text-ink-500">No requests yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-800 overflow-hidden gm-cut [--cut:9px] border border-ink-800">
          {game.hotjoin.map((entry) => (
            <RequestRow key={`${entry.user_id}-${entry.ts}`} game={game} entry={entry} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
