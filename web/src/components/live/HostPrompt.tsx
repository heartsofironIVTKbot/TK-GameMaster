"use client";

import { useEffect, useRef, useState } from "react";
import type { DropPoint, HostPlayer } from "./hostTypes";

/**
 * Small menu that opens where a player was dropped when the drop needs a
 * decision: a taken nation (swap / replace / co-op), a filler name, or a
 * removal to confirm.
 */
export type HostPromptRequest =
  | {
      type: "occupied";
      point: DropPoint;
      player: HostPlayer;
      occupant: HostPlayer;
      /** Target nation slot name + display name. */
      slot: string;
      nationName: string;
      /** Majors can take co-op players. */
      allowCoop: boolean;
    }
  | { type: "filler"; point: DropPoint; player: HostPlayer }
  | { type: "remove"; point: DropPoint; player: HostPlayer };

export type HostPromptChoice =
  | { kind: "swap" }
  | { kind: "replace" }
  | { kind: "coop" }
  | { kind: "filler"; name: string }
  | { kind: "remove" };

export default function HostPrompt({
  request,
  slotLabel,
  notify,
  onChoose,
  onCancel,
}: {
  request: HostPromptRequest;
  /** Board name for a reservation slot key. */
  slotLabel: (slot: string) => string;
  /** Host Tool → Notify players: whether the players affected get a DM. */
  notify: boolean;
  onChoose: (choice: HostPromptChoice) => void;
  onCancel: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fillerName, setFillerName] = useState("Filler");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onCancel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onCancel]);

  const width = 280;
  const left = Math.max(8, Math.min(request.point.x + 8, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(request.point.y + 8, window.innerHeight - 240));

  const button =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-100 transition hover:bg-white/10";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Player action"
      style={{ left, top, width }}
      className="gm-fade-up fixed z-[1600] rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl"
    >
      {request.type === "occupied" && (
        <>
          <p className="px-3 pb-1.5 pt-1 text-[11px] text-slate-400">
            <b className="text-slate-200">{request.nationName}</b> is held by{" "}
            <b className="text-slate-200">{request.occupant.name}</b>.
          </p>
          {request.player.from_slot && (
            <button type="button" className={button} onClick={() => onChoose({ kind: "swap" })}>
              ⇄ Swap — {request.occupant.name} takes {slotLabel(request.player.from_slot)}
            </button>
          )}
          <button type="button" className={button} onClick={() => onChoose({ kind: "replace" })}>
            ↺ Replace — remove {request.occupant.name} from the game
          </button>
          {request.allowCoop && (
            <button type="button" className={button} onClick={() => onChoose({ kind: "coop" })}>
              🤝 Add {request.player.name} as co-op
            </button>
          )}
          <p className="px-3 pb-1 pt-1.5 text-[10px] text-slate-500">
            {notify ? "🔔 Both players get a DM." : "🔕 Notify players is off: nobody gets a DM."}
          </p>
        </>
      )}

      {request.type === "filler" && (
        <form
          className="space-y-2 p-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (fillerName.trim()) onChoose({ kind: "filler", name: fillerName.trim() });
          }}
        >
          <p className="px-2 text-[11px] text-slate-400">
            Add <b className="text-slate-200">{request.player.name}</b> as a filler named:
          </p>
          <input
            autoFocus
            value={fillerName}
            maxLength={40}
            onChange={(event) => setFillerName(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-amber-300/50 focus:outline-none"
          />
          <button type="submit" className="w-full rounded-lg bg-sky-500 px-3 py-2 text-xs font-black text-white hover:bg-sky-400">
            Add filler
          </button>
        </form>
      )}

      {request.type === "remove" && (
        <>
          <p className="px-3 pb-1.5 pt-1 text-[11px] text-slate-400">
            Remove <b className="text-slate-200">{request.player.name}</b> from{" "}
            <b className="text-slate-200">{request.player.from_slot ? slotLabel(request.player.from_slot) : "the game"}</b>?
            {notify ? " They get a DM." : " Notify players is off, so they won't be told."}
          </p>
          <button
            type="button"
            className="w-full rounded-lg bg-rose-500 px-3 py-2 text-xs font-black text-white hover:bg-rose-400"
            onClick={() => onChoose({ kind: "remove" })}
          >
            Remove player
          </button>
        </>
      )}

      <button type="button" className={`${button} mt-1 justify-center text-slate-400`} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
