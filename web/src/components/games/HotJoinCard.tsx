"use client";

import Avatar from "@/components/database/Avatar";
import { GLASS, Spinner } from "@/components/schedule/ui";
import type { GameControl } from "@/lib/gameControlTypes";
import { HOTJOIN_STATUS_TEXT, type HotJoinRequestView } from "@/lib/hotJoinTypes";
import { BotText, dateTime } from "./labels";
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
    <li className="bg-slate-950/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Avatar url={entry.avatar_url} name={entry.name} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-slate-100">
            {entry.name} <span className="font-normal text-slate-400">→ {entry.nation}</span>
          </span>
          <span className="block text-[11px] text-slate-500">
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
              className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-2.5 py-1 text-[11px] font-black text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
            >
              {request.busy && <Spinner className="h-3 w-3" />}✅ Approve
            </button>
            <button
              type="button"
              disabled={request.busy}
              onClick={() => decide(false)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:border-rose-300/50 hover:text-white disabled:opacity-40"
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
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                  : "border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            {HOTJOIN_STATUS_TEXT[entry.status]}
          </span>
        )}
      </div>
      {request.state.phase === "confirm" && (
        <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-50">
          <p className="font-black">The bot found something to check first:</p>
          <ul className="mt-1 space-y-0.5">
            {(request.state.status.result?.warnings ?? []).map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => decide(true, true)} className="rounded-md bg-amber-400 px-3 py-1 font-black text-slate-950 hover:bg-amber-300">
              Approve anyway
            </button>
            <button type="button" onClick={request.reset} className="rounded-md border border-white/20 px-3 py-1 font-bold text-white hover:bg-white/10">
              Cancel
            </button>
          </div>
        </div>
      )}
      {request.state.phase === "error" && (
        <p className="mt-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100">
          <BotText text={request.state.message} />
        </p>
      )}
    </li>
  );
}

export default function HotJoinCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const waiting = game.hotjoin.filter((entry) => entry.status === "pending").length;
  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-300">
        Hot-join requests{waiting ? ` · ${waiting} waiting` : ""}
      </p>
      <p className="mt-1 text-sm text-slate-400">
        Players ask on the map to join this running game as a free nation. You get a Discord DM for each request. Approving gives
        them the nation, the Gamer Pass and a voice channel.
      </p>
      {game.hotjoin.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No requests yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {game.hotjoin.map((entry) => (
            <RequestRow key={`${entry.user_id}-${entry.ts}`} game={game} entry={entry} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
