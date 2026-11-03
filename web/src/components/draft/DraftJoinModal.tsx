"use client";

import { Check, Flag, X } from "lucide-react";
import { useState } from "react";
import {
  DRAFT_CHOICES,
  DRAFT_NOTE_MAX,
  draftChoiceOf,
  type DraftChoice,
  type DraftPoolEntry,
  type LobbyDraft,
} from "@/lib/draft";
import { DRAFT_ICONS } from "./PreferenceBadge";
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
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-ink-950/75 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-join-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !request.busy) onClose();
      }}
    >
      <div className="gm-plate gm-fade-up max-h-[calc(100vh-24px)] w-full max-w-[540px] overflow-y-auto bg-ink-950 [--cut:16px]">
        <div className="relative border-b border-ink-800 px-5 pb-3.5 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={request.busy}
            className="gm-btn gm-btn-quiet absolute right-3 top-3 h-8 w-8 p-0"
            aria-label="Close"
          >
            <X aria-hidden />
          </button>
          <p className="truncate pr-10 text-xs text-ink-400">{lobbyName}</p>
          <h2 id="draft-join-title" className="gm-title mt-0.5 pr-10 text-[30px]">
            {myEntry ? "Your draft entry" : "Join the draft"}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            {draft.teams.map((team, index) => (
              <span key={team.key} className="flex items-center gap-2">
                {index > 0 && <span>vs</span>}
                <span className="gm-tag h-6 bg-ink-800 text-ink-300">
                  <Flag aria-hidden className="h-3 w-3" />
                  {team.name}: {team.captain_name ?? "captain to be named"}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          {mySlot ? (
            <p className="gm-cut flex items-center gap-2 bg-emerald-950 px-3.5 py-3 text-sm text-emerald-200 [--cut:10px]">
              <Check aria-hidden className="h-4 w-4" strokeWidth={2.5} />
              <span>
                You&apos;re already on <b>{mySlot}</b> in this game.
              </span>
            </p>
          ) : !open ? (
            <p className="gm-cut bg-ink-900 px-3.5 py-3 text-sm text-ink-300 [--cut:10px]">
              {draft.phase === "DRAFTING"
                ? "Sign-ups are closed: the captains are drafting now. Ask the host if you still want in."
                : "The draft is complete."}
            </p>
          ) : (
            <>
              <p className="text-[13.5px] text-ink-300">
                Pick what you&apos;d like to play. Everyone who joins goes into one pool, and the two captains take turns
                placing players on their team&apos;s nations.
              </p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What you'd like to play">
                {DRAFT_CHOICES.map((option) => {
                  const active = choice === option.value;
                  const Icon = DRAFT_ICONS[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!loggedIn || request.busy}
                      onClick={() => setChoice(option.value)}
                      className={`gm-plate grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5 p-3 text-left transition-colors [--cut:11px] disabled:cursor-not-allowed disabled:opacity-50 ${
                        active ? "bg-[oklch(20%_0.035_146)] [--line:var(--color-brand-400)]" : "hover:[--line:var(--color-ink-600)]"
                      }`}
                    >
                      <span
                        className={`gm-cut flex h-[34px] w-[34px] items-center justify-center [--cut:7px] ${
                          active ? "bg-brand-400 text-brand-950" : "bg-ink-800 text-ink-100"
                        }`}
                      >
                        <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink-100">{option.title}</span>
                        <span className="block text-xs leading-snug text-ink-400">{option.text}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-ink-500">Note for the host and captains (optional)</span>
                <span className="gm-field mt-1.5 h-auto items-stretch p-0 [--cut:8px]">
                  <textarea
                    value={note}
                    maxLength={DRAFT_NOTE_MAX}
                    disabled={!loggedIn || request.busy}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="e.g. I'd like to be on the Allies, a Major: maybe France or the UK."
                    className="w-full resize-none bg-transparent px-3 py-2 text-[13px] text-ink-100 outline-none placeholder:text-ink-600 disabled:opacity-50"
                  />
                </span>
                <span className="mt-1 block text-right text-[11px] text-ink-500">
                  {note.length}/{DRAFT_NOTE_MAX}. Only the host and the captains see it.
                </span>
              </label>
              <p className="text-xs text-ink-500">
                {draft.pool.length}
                {draft.pool_cap ? `/${draft.pool_cap}` : ""} in the pool so far.
                {poolFull && " The pool is full."}
              </p>
            </>
          )}

          {state.phase === "sending" || state.phase === "waiting" ? (
            <p className="text-xs text-ink-400">{state.phase === "sending" ? "Sending…" : "The bot is adding it…"}</p>
          ) : state.phase === "error" ? (
            <p className="gm-cut bg-rose-950 px-3 py-2 text-xs text-rose-200 [--cut:8px]">{state.message}</p>
          ) : state.phase === "done" ? (
            <p className="gm-cut bg-emerald-950 px-3 py-2 text-xs text-emerald-200 [--cut:8px]">
              <b>{state.title}</b>: {state.summary}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 px-5 py-3.5">
          {myEntry && open && !mySlot && (
            <button type="button" onClick={onLeave} disabled={request.busy} className="gm-btn gm-btn-danger h-9 px-3 text-[13px]">
              Leave the pool
            </button>
          )}
          <span className="flex-1" />
          {!loggedIn ? (
            <a href={loginHref} className="gm-btn h-10 bg-[#5865F2] px-4 text-white hover:bg-[#4752c4]">
              Log in with Discord to join
            </a>
          ) : open && !mySlot ? (
            <>
              <button type="button" onClick={onClose} disabled={request.busy} className="gm-btn gm-btn-quiet h-10">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => choice && onSubmit(choice, note)}
                disabled={!choice || request.busy || poolFull}
                className="gm-btn gm-btn-primary h-[42px] px-6 font-display text-lg font-extrabold uppercase tracking-[0.02em] [--cut:9px]"
              >
                {request.busy ? "Working…" : myEntry ? "Update my entry" : "Join"}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="gm-btn gm-btn-secondary h-10">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
