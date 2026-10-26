"use client";

import { useState } from "react";
import { isPlayerDrag, readDragPlayer, writeDragPlayer, type HostPlayer } from "@/components/live/hostTypes";
import { draftTeamOf, type DraftPoolEntry, type DraftViewer, type LobbyDraft } from "@/lib/draft";
import type { LobbyReservation } from "@/lib/types";
import PreferenceBadge from "./PreferenceBadge";
import type { DraftRequestState } from "./useDraft";

const PHASE_LABEL = {
  ENLISTING: { text: "Sign-ups open", tone: "border-sky-400/40 bg-sky-500/15 text-sky-100" },
  DRAFTING: { text: "Drafting", tone: "border-amber-300/50 bg-amber-400/15 text-amber-100" },
  COMPLETE: { text: "Complete", tone: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" },
} as const;

/**
 * The draft at the top of the map's left drawer: the two teams and their
 * captains, whose turn it is, and the shared pool (Major / Minor / Major
 * Co-op / Filler, plus the notes for the host and captains). The captain on
 * the clock and the host place pool players from here — with one button, or
 * by dragging them onto a nation (map or list) or the filler zone.
 */
export default function DraftPanel({
  draft,
  viewer,
  myUserId,
  reservations,
  request,
  canDrag,
  onJoin,
  onPlace,
  onDropFiller,
  onRemove,
  onStart,
  onFinish,
}: {
  draft: LobbyDraft;
  viewer: DraftViewer | null;
  myUserId: string | null;
  reservations: LobbyReservation[];
  request: { state: DraftRequestState; busy: boolean };
  /** The viewer may drag pool players (the captain on the clock or the host). */
  canDrag: boolean;
  onJoin: () => void;
  /** Open the placement dialog for a pool player. */
  onPlace: (entry: DraftPoolEntry) => void;
  onDropFiller: (player: HostPlayer) => void;
  onRemove: (entry: DraftPoolEntry) => void;
  onStart: () => void;
  onFinish: () => void;
}) {
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [fillerOver, setFillerOver] = useState(false);
  const turnTeam = draft.teams.find((team) => team.key === draft.current_turn) ?? null;
  const myTurn = Boolean(turnTeam && viewer?.captain_of === turnTeam.key && draft.phase === "DRAFTING");
  const canManage = Boolean(viewer?.can_manage);
  const notes = viewer?.notes ?? null;
  const mine = myUserId ? draft.pool.find((entry) => entry.user_id === myUserId) ?? null : null;
  const placed = myUserId ? reservations.some((reservation) => String(reservation.user_id) === myUserId) : false;
  const placedCount = (teamKey: string) =>
    reservations.filter((reservation) => draftTeamOf(draft, reservation.slot_key)?.key === teamKey).length;
  const phase = PHASE_LABEL[draft.phase];
  const state = request.state;
  const canPlace = myTurn || canManage;

  return (
    <section className="mx-3 mb-3 mt-1 rounded-2xl border border-amber-300/20 bg-gradient-to-b from-amber-500/[0.08] to-slate-950/40 p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">🎯 Draft</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${phase.tone}`}>{phase.text}</span>
        <span className="ml-auto text-[10px] font-semibold text-slate-400">
          {draft.pool.length}
          {draft.pool_cap ? `/${draft.pool_cap}` : ""} in pool
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {draft.teams.map((team) => {
          const onClock = draft.phase === "DRAFTING" && team.key === draft.current_turn;
          return (
            <div
              key={team.key}
              className={`rounded-xl border px-2.5 py-1.5 ${
                onClock ? "border-amber-300/70 bg-amber-400/10 shadow-[0_0_14px_rgba(251,191,36,0.25)]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <p className="truncate text-xs font-black text-white">🚩 {team.name}</p>
              <p className="truncate text-[10px] text-slate-400">
                {team.captain_name ?? "Captain TBA"}
                {viewer?.captain_of === team.key && <span className="ml-1 rounded bg-amber-400/25 px-1 font-bold text-amber-100">You</span>}
              </p>
              <p className="text-[10px] text-slate-500">{placedCount(team.key)} placed</p>
            </div>
          );
        })}
      </div>

      {draft.phase === "DRAFTING" && turnTeam && (
        <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${myTurn ? "bg-amber-400 text-slate-950" : "bg-white/5 text-slate-200"}`}>
          {myTurn
            ? `👉 Your turn — pick ${draft.picks_remaining} player${draft.picks_remaining === 1 ? "" : "s"} from the pool below.`
            : `👉 ${turnTeam.name}'s turn (${turnTeam.captain_name ?? "captain"}) · ${draft.picks_remaining} pick(s) left`}
        </p>
      )}
      {draft.coin_winner && draft.phase !== "ENLISTING" && (
        <p className="mt-1 text-[10px] text-slate-500">
          🪙 {draft.teams.find((team) => team.key === draft.coin_winner)?.name} won the coin toss.
        </p>
      )}
      {draft.phase === "ENLISTING" && (
        <p className="mt-2 text-[11px] text-slate-400">The captains pick once the host starts the draft.</p>
      )}
      {draft.phase === "COMPLETE" && (
        <p className="mt-2 text-[11px] text-emerald-200">Everyone is placed — see the nations below.</p>
      )}

      {draft.phase === "ENLISTING" && !placed && (
        <button
          type="button"
          onClick={onJoin}
          className={`mt-2 w-full rounded-xl px-3 py-2 text-xs font-black transition ${
            mine ? "border border-white/10 bg-white/5 text-slate-200 hover:border-white/30" : "reserve-cta-glow bg-amber-400 text-slate-950 hover:bg-amber-300"
          }`}
        >
          {mine ? `Your entry: ${mine.preference} · change or leave` : "🎯 Join the draft"}
        </button>
      )}

      {canManage && draft.phase !== "COMPLETE" && (
        <div className="mt-2 flex gap-1.5">
          {draft.phase === "ENLISTING" && (
            <button
              type="button"
              onClick={onStart}
              disabled={request.busy || draft.pool.length === 0}
              className="flex-1 rounded-lg bg-sky-500/25 px-2 py-1.5 text-[11px] font-black text-sky-100 hover:bg-sky-500/35 disabled:opacity-40"
              title={draft.pool.length === 0 ? "Nobody is in the pool yet" : "Close sign-ups, toss the coin and let the captains pick"}
            >
              🚨 Start draft
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirmFinish) {
                setConfirmFinish(false);
                onFinish();
              } else {
                setConfirmFinish(true);
              }
            }}
            onBlur={() => setConfirmFinish(false)}
            disabled={request.busy}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black disabled:opacity-40 ${
              confirmFinish ? "bg-rose-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
            title="Clear whoever is left in the pool and mark the draft complete"
          >
            {confirmFinish ? "Click again — clear the pool" : "🏁 Finish draft"}
          </button>
        </div>
      )}

      {state.phase !== "idle" && (
        <p
          className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] ${
            state.phase === "error"
              ? "border border-rose-400/30 bg-rose-500/10 text-rose-100"
              : state.phase === "done"
                ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "bg-white/5 text-slate-300"
          }`}
        >
          {state.phase === "sending" && "Sending…"}
          {state.phase === "waiting" && "The bot is applying it…"}
          {state.phase === "error" && state.message}
          {state.phase === "done" && (
            <>
              <b>{state.title}</b> — {state.summary}
            </>
          )}
        </p>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          Pool{notes ? " · notes visible to hosts & captains" : ""}
        </p>
        {canDrag && draft.pool.length > 0 && (
          <p className="mb-1.5 text-[10px] leading-snug text-slate-400">
            ⠿ Drag a player onto a nation on the map or in the list below — onto a taken Major to add them as its co-op — or
            onto 🧩 Filler.
          </p>
        )}
        {draft.pool.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-[11px] text-slate-500">
            {draft.phase === "ENLISTING" ? "Nobody yet — be the first to join." : "The pool is empty."}
          </p>
        ) : (
          <ul className="space-y-1">
            {draft.pool.map((entry) => {
              const note = notes?.[entry.user_id] ?? null;
              const self = entry.user_id === myUserId;
              const player: HostPlayer = { user_id: entry.user_id, name: entry.name, avatar_url: entry.avatar_url, from_slot: null };
              return (
                <li
                  key={entry.user_id}
                  draggable={canDrag}
                  onDragStart={canDrag ? (event) => writeDragPlayer(event, player) : undefined}
                  title={canDrag ? "Drag onto a nation, a taken Major (co-op) or Filler" : undefined}
                  className={`rounded-xl border px-2.5 py-1.5 ${self ? "border-amber-300/40 bg-amber-400/[0.06]" : "border-white/5 bg-white/[0.02]"} ${
                    canDrag ? "cursor-grab hover:border-amber-300/40 active:cursor-grabbing" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {canDrag && <span className="-ml-1 text-[11px] text-slate-500" aria-hidden>⠿</span>}
                    {entry.avatar_url ? (
                      // Discord CDN avatar (plain <img>, like the roster).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.avatar_url} alt="" draggable={false} className="h-6 w-6 shrink-0 rounded-full" />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-black text-slate-200">
                        {entry.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">
                      {entry.name}
                      {self && <span className="ml-1 text-[10px] font-bold text-amber-200">(you)</span>}
                    </span>
                    <PreferenceBadge preference={entry.preference} size="xs" />
                    {canPlace && (
                      <button
                        type="button"
                        onClick={() => onPlace(entry)}
                        disabled={request.busy}
                        className="shrink-0 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40"
                        title={
                          myTurn
                            ? canManage
                              ? "Pick for your team, or place them anywhere as the host"
                              : "Pick for your team"
                            : "Place them yourself (doesn't use a captain's turn)"
                        }
                      >
                        {myTurn ? "Pick" : "Place"}
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onRemove(entry)}
                        disabled={request.busy}
                        className="shrink-0 rounded-md px-1 text-[11px] text-slate-500 hover:text-rose-300 disabled:opacity-40"
                        aria-label={`Remove ${entry.name} from the pool`}
                        title="Remove from the pool"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {note && <p className="mt-1 pl-8 text-[11px] italic leading-snug text-slate-300">“{note}”</p>}
                </li>
              );
            })}
          </ul>
        )}
        {canDrag && draft.pool.length > 0 && (
          <div
            onDragOver={(event) => {
              if (!isPlayerDrag(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setFillerOver(true);
            }}
            onDragLeave={() => setFillerOver(false)}
            onDrop={(event) => {
              setFillerOver(false);
              const player = readDragPlayer(event);
              if (!player) return;
              event.preventDefault();
              onDropFiller(player);
            }}
            className={`mt-1.5 flex items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-[11px] font-bold transition ${
              fillerOver ? "border-emerald-300 bg-emerald-500/20 text-emerald-50" : "border-emerald-400/30 text-emerald-200/80"
            }`}
          >
            🧩 Drop here — Filler (no map nation, still plays and gets the game details)
          </div>
        )}
      </div>
    </section>
  );
}
