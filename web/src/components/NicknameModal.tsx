"use client";

import { useState } from "react";

/**
 * Nickname onboarding modal: shown after Discord OAuth login when the user
 * profile has no ``ingame_nickname`` yet. Asks for their primary HOI4
 * in-game name (e.g. Discord: Nikoloza200 -> In-Game: Nikoloza), which is
 * then displayed on every claim in the lobby roster.
 */

interface NicknameModalProps {
  open: boolean;
  /** Saving state (POST /api/auth/nickname in flight). */
  busy: boolean;
  /** Server-side save error message, if any. */
  error: string | null;
  onSave: (nickname: string) => void;
  /** "Later" — dismiss for this session; the modal returns on next load. */
  onDismiss: () => void;
}

const NICKNAME_MAX = 32;

export default function NicknameModal({
  open,
  busy,
  error,
  onSave,
  onDismiss,
}: NicknameModalProps) {
  const [value, setValue] = useState("");
  // Reset the draft whenever the modal (re)opens — render-phase state
  // adjustment avoids an effect and the cascading render it would cause.
  const [wasOpen, setWasOpen] = useState(open);
  if (open && !wasOpen) {
    setWasOpen(true);
    setValue("");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  if (!open) return null;

  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NICKNAME_MAX;

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Set your HOI4 in-game nickname"
    >
      <div className="w-[26rem] max-w-[92vw] rounded-2xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl">
        <h2 className="text-lg font-black uppercase tracking-wide text-slate-100">
          One last thing
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          What&apos;s your primary <span className="text-amber-400 font-semibold">HOI4 in-game name</span>?
          It&apos;s shown on all your claims in the lobby roster.
        </p>

        {/* Discord -> In-Game hint */}
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
          <p className="text-xs text-slate-500">
            Discord: <span className="font-semibold text-slate-300">YourUsername200</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            In-Game: <span className="font-semibold text-amber-300">YourUsername</span>
          </p>
        </div>

        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && valid && !busy) onSave(trimmed);
          }}
          maxLength={NICKNAME_MAX}
          placeholder="In-game nickname"
          aria-label="HOI4 in-game nickname"
          className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-amber-400/70"
        />

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-50"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => valid && onSave(trimmed)}
            disabled={!valid || busy}
            className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
