"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";

/**
 * Host Tool on, a nation selected: where Reserve would be, a big grey Lock
 * (or Unlock) for that nation, before or during the game. A lock is either
 * for everyone or lets VIPs still reserve (game_data.vip_open_regions). The
 * bot applies it (the Games page's nation locks); the Host Tool's list shows
 * the request and the map updates when it's done.
 */

const BIG =
  "gm-btn h-[58px] w-full gap-2 bg-ink-800 px-0 font-display text-[26px] font-extrabold uppercase tracking-[0.03em] text-ink-100 hover:bg-ink-700 disabled:cursor-wait disabled:opacity-60 sm:h-[70px] sm:w-auto sm:px-[52px] sm:text-[32px]";

export default function NationLockPanel({
  name,
  locked,
  vipOpen,
  notPlayable,
  busy,
  onLock,
}: {
  name: string;
  locked: boolean;
  vipOpen: boolean;
  notPlayable: boolean;
  /** A lock / unlock for this nation is still with the bot (an error gives the buttons back). */
  busy: boolean;
  onLock: (lock: boolean, vipExempt: boolean) => void;
}) {
  const [vipExempt, setVipExempt] = useState(false);
  const pending = busy;
  const send = (lock: boolean, exempt: boolean) => onLock(lock, exempt);

  const status = notPlayable
    ? "Not playable in this game (its preset leaves it out)"
    : locked
      ? vipOpen
        ? "Locked · VIPs can still reserve it"
        : "Locked for everyone"
      : "Open to reserve";

  return (
    <div
      data-tour="map.nationLock"
      className="absolute inset-x-4 bottom-5 z-[1010] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-7 sm:left-1/2 sm:-translate-x-1/2"
    >
      <p className="gm-plate bg-ink-950 px-3 py-1.5 text-center text-xs text-ink-300">
        <span className="font-bold text-ink-100">Host Tool</span> · {name}: {status}
      </p>
      {notPlayable ? (
        <button type="button" disabled className={`${BIG} cursor-not-allowed text-ink-500`}>
          <Lock aria-hidden className="h-6 w-6" />
          Locked
        </button>
      ) : locked ? (
        <>
          <button type="button" disabled={pending} onClick={() => send(false, false)} className={BIG}>
            <LockOpen aria-hidden className="h-6 w-6" />
            {pending ? "Working…" : "Unlock"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => send(true, !vipOpen)}
            className="gm-plate bg-ink-950 px-3 py-1.5 text-xs font-bold text-ink-300 hover:text-ink-100 disabled:opacity-50"
          >
            {vipOpen ? "Lock it for VIPs too" : "Let VIPs still reserve it"}
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={() => send(true, vipExempt)} className={BIG}>
            <Lock aria-hidden className="h-6 w-6" />
            {pending ? "Locking…" : "Lock"}
          </button>
          <label className="gm-plate flex cursor-pointer items-center gap-2 bg-ink-950 px-3 py-1.5 text-xs font-semibold text-ink-200">
            <input
              type="checkbox"
              checked={vipExempt}
              onChange={(event) => setVipExempt(event.target.checked)}
              className="h-3.5 w-3.5 accent-brand-400"
            />
            VIPs can still reserve it
          </label>
        </>
      )}
    </div>
  );
}
