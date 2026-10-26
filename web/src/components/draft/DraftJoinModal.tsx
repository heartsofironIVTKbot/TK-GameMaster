"use client";

import { useState } from "react";
import {
  DRAFT_CHOICES,
  DRAFT_NOTE_MAX,
  draftChoiceOf,
  type DraftChoice,
  type DraftPoolEntry,
  type LobbyDraft,
} from "@/lib/draft";
import { useEscape, type DraftRequestState } from "./useDraft";

/**
 * The pop-up a player gets when they open a draft game's map link: join the
 * shared pool as a Major, a Minor, a Major Co-op or a Filler, with an
 * optional note for the host and the captains ("Allies please, a major —
 * France or the U.K."). Shown again to change the entry or leave the pool.
 */
export default function DraftJoinModal({
  draft,
  lobbyName,
  loggedIn,
  loginHref,
  myEntry,
  myNote,
  mySlot,
  request,
  onSubmit,
  onLeave,
  onClose,
}: {
  draft: LobbyDraft;
  lobbyName: string;
  loggedIn: boolean;
  loginHref: string;
  myEntry: DraftPoolEntry | null;
  myNote: string | null;
  /** The slot the viewer already holds in this game (drafted / placed). */
  mySlot: string | null;
  request: { state: DraftRequestState; busy: boolean };
  onSubmit: (choice: DraftChoice, note: string) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<DraftChoice | null>(myEntry ? draftChoiceOf(myEntry.preference) : null);
  const [note, setNote] = useState(myNote ?? "");
  useEscape(onClose, request.busy);
  const open = draft.phase === "ENLISTING";
  const poolFull = !myEntry && draft.pool_cap > 0 && draft.pool.length >= draft.pool_cap;
  const state = request.state;

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-join-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !request.busy) onClose();
      }}
    >
      <div className="gm-fade-up w-full max-w-lg overflow-hidden rounded-3xl border border-amber-300/25 bg-slate-900/95 shadow-2xl shadow-black/60">
        <div className="relative border-b border-white/10 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent px-6 pb-4 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={request.busy}
            className="absolute right-4 top-4 rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">Draft game</p>
          <h2 id="draft-join-title" className="mt-1 pr-8 text-xl font-black text-white">
            {myEntry ? "Your draft entry" : "Join the draft"}
          </h2>
          <p className="mt-0.5 truncate text-xs text-slate-400">{lobbyName}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {draft.teams.map((team, index) => (
              <span key={team.key} className="flex items-center gap-2">
                {index > 0 && <span className="font-black text-slate-500">vs</span>}
                <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-semibold text-slate-100">
                  🚩 {team.name}
                  <span className="ml-1 font-normal text-slate-400">· captain {team.captain_name ?? "TBA"}</span>
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {mySlot ? (
            <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              ✅ You&apos;re already on <b>{mySlot}</b> in this game.
            </p>
          ) : !open ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              {draft.phase === "DRAFTING"
                ? "Sign-ups are closed — the captains are drafting now. Ask the host if you still want in."
                : "The draft is complete."}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-300">
                Pick what you&apos;d like to play. Everyone who joins goes into one shared pool, and the two captains take
                turns placing players on their team&apos;s nations.
              </p>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="What you'd like to play">
                {DRAFT_CHOICES.map((option) => {
                  const active = choice === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!loggedIn || request.busy}
                      onClick={() => setChoice(option.value)}
                      className={`rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? "border-amber-300 bg-amber-400/15 shadow-[0_0_24px_rgba(251,191,36,0.2)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/30"
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className={`mt-1 block text-base font-black ${active ? "text-amber-100" : "text-white"}`}>{option.title}</span>
                      <span className="block text-xs leading-snug text-slate-400">{option.text}</span>
                    </button>
                  );
                })}
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Note for the host and captains (optional)</span>
                <textarea
                  value={note}
                  maxLength={DRAFT_NOTE_MAX}
                  disabled={!loggedIn || request.busy}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="e.g. I'd like to be on the Allies, a major — maybe France or the U.K."
                  className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-300/50 focus:outline-none disabled:opacity-50"
                />
                <span className="mt-0.5 block text-right text-[10px] text-slate-500">
                  {note.length}/{DRAFT_NOTE_MAX} · only the host and the captains see it
                </span>
              </label>
              <p className="text-[11px] text-slate-500">
                {draft.pool.length}
                {draft.pool_cap ? `/${draft.pool_cap}` : ""} in the pool so far.
                {poolFull && " The pool is full."}
              </p>
            </>
          )}

          {state.phase === "sending" || state.phase === "waiting" ? (
            <p className="text-xs text-slate-400">{state.phase === "sending" ? "Sending…" : "The bot is adding it…"}</p>
          ) : state.phase === "error" ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{state.message}</p>
          ) : state.phase === "done" ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              <b>{state.title}</b> — {state.summary}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-slate-950/40 px-6 py-4">
          {myEntry && open && !mySlot && (
            <button
              type="button"
              onClick={onLeave}
              disabled={request.busy}
              className="rounded-xl px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
            >
              Leave the pool
            </button>
          )}
          <span className="flex-1" />
          {!loggedIn ? (
            <a
              href={loginHref}
              className="reserve-cta-glow rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-400"
            >
              Log in with Discord to join
            </a>
          ) : open && !mySlot ? (
            <button
              type="button"
              onClick={() => choice && onSubmit(choice, note)}
              disabled={!choice || request.busy || poolFull}
              className="reserve-cta-glow rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-black uppercase tracking-wide text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {request.busy ? "Working…" : myEntry ? "Update my entry" : "Join the pool"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-bold text-slate-200 hover:border-white/30"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
