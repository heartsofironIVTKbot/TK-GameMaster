"use client";

import { Check, Coins, FlagTriangleRight, GripVertical, Hand, Info, Play, Puzzle, Swords, X } from "lucide-react";
import { useState } from "react";
import { isPlayerDrag, readDragPlayer, writeDragPlayer, type HostPlayer } from "@/components/live/hostTypes";
import { draftTeamOf, type DraftPoolEntry, type DraftViewer, type LobbyDraft } from "@/lib/draft";
import type { LobbyReservation } from "@/lib/types";
import PreferenceBadge from "./PreferenceBadge";
import type { DraftRequestState } from "./useDraft";

/** The draft's phase, in the calendar's status colours: open green, running blue, done grey. */
const PHASE_LABEL = {
  ENLISTING: { text: "Sign-ups open", tone: "bg-emerald-950 text-emerald-300" },
  DRAFTING: { text: "Drafting", tone: "bg-sky-950 text-sky-300" },
  COMPLETE: { text: "Complete", tone: "bg-ink-800 text-ink-400" },
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
    <section data-tour="map.draftPanel" className="gm-plate mx-2.5 mb-3 mt-2 p-3 [--cut:12px]">
      <div className="flex items-center gap-2">
        <span className="gm-title flex items-center gap-1.5 text-xl">
          <Swords aria-hidden className="h-[17px] w-[17px] text-brand-400" strokeWidth={1.75} />
          Draft
        </span>
        <span className={`gm-tag gm-tag-dot ${phase.tone}`}>{phase.text}</span>
        <span className="ml-auto text-xs text-ink-400">
          {draft.pool.length}
          {draft.pool_cap ? `/${draft.pool_cap}` : ""} in pool
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1.5">
        {draft.teams.map((team, index) => {
          const onClock = draft.phase === "DRAFTING" && team.key === draft.current_turn;
          return (
            <div key={team.key} className="contents">
              {index > 0 && <span className="self-center font-display text-sm font-extrabold uppercase text-ink-500">vs</span>}
              <div
                className={`gm-cut min-w-0 px-2.5 py-2 [--cut:9px] ${
                  onClock ? "bg-[oklch(21%_0.03_146)] shadow-[inset_0_2px_0_var(--color-brand-400)]" : "bg-ink-900"
                }`}
              >
                <p className="truncate text-[13.5px] font-semibold text-ink-100">{team.name}</p>
                <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-400">
                  <span className="truncate">{team.captain_name ?? "Captain to be named"}</span>
                  {viewer?.captain_of === team.key && (
                    <span className="gm-tag h-[18px] bg-brand-950 px-2 text-[10.5px] text-brand-400">You</span>
                  )}
                </p>
                <p className="text-[11.5px] text-ink-500">{placedCount(team.key)} placed</p>
              </div>
            </div>
          );
        })}
      </div>

      {draft.phase === "DRAFTING" && turnTeam && (
        <p
          className={`gm-cut mt-2 flex items-center gap-2 px-2.5 py-2 text-[12.5px] font-semibold [--cut:8px] ${
            myTurn ? "bg-brand-400 text-brand-950" : "bg-ink-900 text-ink-300"
          }`}
        >
          <Hand aria-hidden className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
          {myTurn
            ? `Your turn: pick ${draft.picks_remaining} player${draft.picks_remaining === 1 ? "" : "s"} from the pool`
            : `${turnTeam.name}'s turn (${turnTeam.captain_name ?? "captain"}), ${draft.picks_remaining} pick${draft.picks_remaining === 1 ? "" : "s"} left`}
        </p>
      )}
      {draft.coin_winner && draft.phase !== "ENLISTING" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
          <Coins aria-hidden className="h-[13px] w-[13px]" />
          {draft.teams.find((team) => team.key === draft.coin_winner)?.name} won the coin toss.
        </p>
      )}
      {draft.phase === "ENLISTING" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
          <Info aria-hidden className="h-[13px] w-[13px] shrink-0" />
          The captains start picking once the host starts the draft.
        </p>
      )}
      {draft.phase === "COMPLETE" && (
        <p className="gm-cut mt-2 flex items-center gap-1.5 bg-emerald-950 px-2.5 py-2 text-xs text-emerald-300 [--cut:8px]">
          <Check aria-hidden className="h-[13px] w-[13px]" strokeWidth={2.5} />
          Everyone is placed. See the nations below.
        </p>
      )}

      {draft.phase === "ENLISTING" && !placed && (
        <button
          type="button"
          onClick={onJoin}
          className={`gm-btn mt-2.5 h-[42px] w-full [--cut:9px] ${
            mine ? "gm-btn-secondary text-[13px]" : "gm-btn-primary font-display text-lg font-extrabold uppercase tracking-[0.02em]"
          }`}
        >
          {mine ? `You're in as ${mine.preference}: change or leave` : "Join the draft"}
        </button>
      )}

      {canManage && draft.phase !== "COMPLETE" && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {draft.phase === "ENLISTING" && (
            <button
              type="button"
              onClick={onStart}
              disabled={request.busy || draft.pool.length === 0}
              className="gm-btn gm-btn-secondary h-8 text-[12.5px]"
              title={draft.pool.length === 0 ? "Nobody is in the pool yet" : "Close sign-ups, toss the coin and let the captains pick"}
            >
              <Play aria-hidden />
              Start draft
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
            className={`gm-btn h-8 text-[12.5px] ${draft.phase === "ENLISTING" ? "" : "col-span-2"} ${
              confirmFinish ? "bg-rose-500 text-white hover:bg-rose-400" : "gm-btn-danger"
            }`}
            title="Clear whoever is left in the pool and mark the draft complete"
          >
            <FlagTriangleRight aria-hidden />
            {confirmFinish ? "Click again to clear the pool" : "Finish draft"}
          </button>
        </div>
      )}

      {state.phase !== "idle" && (
        <p
          className={`gm-cut mt-2 px-2.5 py-2 text-xs [--cut:8px] ${
            state.phase === "error"
              ? "bg-rose-950 text-rose-200"
              : state.phase === "done"
                ? "bg-emerald-950 text-emerald-200"
                : "bg-ink-900 text-ink-300"
          }`}
        >
          {state.phase === "sending" && "Sending…"}
          {state.phase === "waiting" && "The bot is applying it…"}
          {state.phase === "error" && state.message}
          {state.phase === "done" && (
            <>
              <b>{state.title}</b>: {state.summary}
            </>
          )}
        </p>
      )}

      {draft.phase !== "COMPLETE" && (
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between px-0.5">
            <p className="text-xs font-semibold text-ink-500">Pool ({draft.pool.length})</p>
            {notes && <p className="text-[11px] text-ink-500">Notes: hosts and captains only</p>}
          </div>
          {canDrag && draft.pool.length > 0 && (
            <p className="mb-1.5 px-0.5 text-[11.5px] leading-snug text-ink-400">
              Drag a player onto a nation on the map or in the list (onto a taken Major to make them its co-op), or onto Filler.
            </p>
          )}
          {draft.pool.length === 0 ? (
            <p className="gm-cut bg-ink-900 px-3 py-3 text-center text-xs text-ink-400 [--cut:8px]">
              {draft.phase === "ENLISTING" ? "Nobody yet. Be the first to join." : "The pool is empty."}
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
                    className={`gm-cut py-1.5 pl-1 pr-1.5 [--cut:7px] ${self ? "bg-[oklch(21%_0.03_146)]" : "bg-ink-900"} ${
                      canDrag ? "cursor-grab hover:bg-ink-800 active:cursor-grabbing" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {canDrag ? <GripVertical aria-hidden className="h-3 w-3 shrink-0 text-ink-600" /> : <span className="w-1" />}
                      {entry.avatar_url ? (
                        // Discord CDN avatar (plain <img>, like the roster).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.avatar_url} alt="" draggable={false} className="h-[26px] w-[26px] shrink-0 rounded-full" />
                      ) : (
                        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-bold text-ink-100">
                          {entry.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-100">
                        {entry.name}
                        {self && <span className="ml-1 text-[11px] font-medium text-brand-400">(you)</span>}
                      </span>
                      <PreferenceBadge preference={entry.preference} size="xs" />
                      {canPlace && (
                        <button
                          type="button"
                          onClick={() => onPlace(entry)}
                          disabled={request.busy}
                          className="gm-btn gm-btn-primary h-7 px-2.5 text-xs [--cut:6px]"
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
                          className="gm-btn gm-btn-quiet h-6 w-6 p-0 text-ink-500 [--cut:5px] hover:text-rose-300"
                          aria-label={`Remove ${entry.name} from the pool`}
                          title="Remove from the pool"
                        >
                          <X aria-hidden className="!h-3.5 !w-3.5" />
                        </button>
                      )}
                    </div>
                    {note && <p className="mt-0.5 pl-[42px] text-[11.5px] italic leading-snug text-ink-400">“{note}”</p>}
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
              className={`gm-cut gm-hatch-faint mt-1.5 flex h-10 items-center justify-center gap-2 text-xs font-semibold transition-colors [--cut:8px] ${
                fillerOver ? "bg-sky-950 text-sky-200" : "bg-ink-900 text-ink-300"
              }`}
            >
              <Puzzle aria-hidden className="h-[15px] w-[15px] text-sky-300" />
              Drop a player here to make them a filler
            </div>
          )}
        </div>
      )}
    </section>
  );
}
