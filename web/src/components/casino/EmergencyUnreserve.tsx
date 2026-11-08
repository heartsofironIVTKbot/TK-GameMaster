"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayerRequest } from "@/components/usePlayerRequest";
import { UNRESERVE_REASON_MAX, UNRESERVE_REASON_MIN } from "@/lib/casinoSettings";

/**
 * Casino games: the player leaves for good (docs/casino-integration.md,
 * step 6). A red pop-up in the middle of the screen says what it means and
 * asks for a reason; the bot deletes the nation and the Casino run, blocks
 * them from rolling again and DMs the host and co-hosts the reason. Only a
 * host can add them back.
 */
export default function EmergencyUnreserveDialog({
  threadId,
  nationName,
  onChanged,
  onClose,
}: {
  threadId: string;
  nationName: string;
  /** The board changed (they're off it now). */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [left, setLeft] = useState<string | null>(null);
  const request = usePlayerRequest(`/api/casino/${encodeURIComponent(threadId)}/unreserve`, (result) => {
    if (result?.unreserved) {
      setLeft(result.unreserved);
      onChanged();
    }
  });
  const titleId = useId();
  const reasonId = useId();
  const trimmed = reason.replace(/\s+/g, " ").trim();
  const ready = trimmed.length >= UNRESERVE_REASON_MIN && !request.busy;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !request.busy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    onClose();
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !request.busy) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="gm-cut w-full max-w-md border-2 border-rose-500 bg-rose-950 p-5 text-rose-50 shadow-[0_0_60px_rgba(244,63,94,0.45)] [--cut:14px]"
      >
        {left ? (
          <>
            <h2 id={titleId} className="font-display text-2xl font-extrabold uppercase tracking-wide text-rose-200">
              You&apos;ve left the game
            </h2>
            <p className="mt-3 text-sm text-rose-100">
              <b>{left}</b> is free again and your Casino receipt is gone. The host has your reason.
            </p>
            <button type="button" autoFocus onClick={close} className="gm-btn gm-btn-secondary mt-5 h-10 w-full">
              Close
            </button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) void request.submit("POST", { reason: trimmed });
            }}
          >
            <h2 id={titleId} className="font-display text-2xl font-extrabold uppercase tracking-wide text-rose-200">
              🚨 Emergency Unreserve
            </h2>
            <p className="mt-3 text-sm text-rose-100">Only use this if you can&apos;t play. There&apos;s no second chance:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-100">
              <li>
                You lose <b>{nationName}</b> and your Casino receipt.
              </li>
              <li>You can&apos;t roll again in this game.</li>
              <li>Only the host can add you back.</li>
            </ul>
            <label htmlFor={reasonId} className="mt-4 block text-xs font-bold uppercase tracking-wider text-rose-200">
              Why are you leaving? (the host sees this)
            </label>
            <textarea
              id={reasonId}
              autoFocus
              required
              rows={3}
              maxLength={UNRESERVE_REASON_MAX}
              value={reason}
              disabled={request.busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Something came up and I can't make it…"
              className="gm-input mt-1.5 w-full resize-none border-rose-500/60 bg-rose-950/60 text-sm text-rose-50 placeholder:text-rose-300/50"
            />
            <p className="mt-1 text-right text-[11px] text-rose-300/80">
              {trimmed.length}/{UNRESERVE_REASON_MAX}
            </p>
            {request.state.phase === "error" && (
              <p role="alert" className="mt-2 text-sm font-semibold text-amber-200">
                {request.state.message}
              </p>
            )}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" disabled={request.busy} onClick={close} className="gm-btn gm-btn-secondary h-11 flex-1">
                Keep my nation
              </button>
              <button type="submit" disabled={!ready} className="gm-btn gm-btn-danger h-11 flex-1 font-bold disabled:opacity-50">
                {request.busy ? "Unreserving…" : "Unreserve for good"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}
