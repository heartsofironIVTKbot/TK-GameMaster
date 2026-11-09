"use client";

import { ArrowLeftRight, Bell, BellOff, Handshake, Puzzle, RotateCcw, UserMinus } from "lucide-react";
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
      /** Target nation slot name + display name, and its map tag. */
      slot: string;
      tag: string;
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
    "gm-cut flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[13px] font-semibold text-ink-100 transition-colors [--cut:7px] hover:bg-ink-900";
  const icon = "h-4 w-4 shrink-0 text-ink-400";
  const Dm = notify ? Bell : BellOff;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Player action"
      style={{ left, top, width }}
      className="gm-plate gm-fade-up fixed z-[1600] bg-ink-950 p-1.5 [--cut:12px]"
    >
      {request.type === "occupied" && (
        <>
          <p className="px-2 pb-2 pt-1 text-[12.5px] text-ink-400">
            <b className="font-semibold text-ink-100">{request.nationName}</b> is held by{" "}
            <b className="font-semibold text-ink-100">{request.occupant.name}</b>.
          </p>
          {request.player.from_slot && (
            <button type="button" className={button} onClick={() => onChoose({ kind: "swap" })}>
              <ArrowLeftRight aria-hidden className={icon} />
              <span className="min-w-0">
                Swap
                <span className="block text-[11.5px] font-medium text-ink-500">
                  {request.occupant.name} gets {slotLabel(request.player.from_slot)}
                </span>
              </span>
            </button>
          )}
          <button type="button" className={button} onClick={() => onChoose({ kind: "replace" })}>
            <RotateCcw aria-hidden className={icon} />
            <span className="min-w-0">
              Replace
              <span className="block text-[11.5px] font-medium text-ink-500">{request.occupant.name} leaves the game</span>
            </span>
          </button>
          {request.allowCoop && (
            <button type="button" className={button} onClick={() => onChoose({ kind: "coop" })}>
              <Handshake aria-hidden className={icon} />
              Add {request.player.name} as co-op
            </button>
          )}
          <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11.5px] text-ink-500">
            <Dm aria-hidden className="h-3.5 w-3.5" />
            {notify ? "Both players get a DM." : "Notify players is off: nobody gets a DM."}
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
          <p className="px-1 text-[12.5px] text-ink-400">
            Add <b className="font-semibold text-ink-100">{request.player.name}</b> as a filler named:
          </p>
          <label className="gm-field">
            <Puzzle aria-hidden className="h-4 w-4 shrink-0" />
            <input
              autoFocus
              value={fillerName}
              maxLength={40}
              onChange={(event) => setFillerName(event.target.value)}
              aria-label="Filler name"
            />
          </label>
          <button type="submit" className="gm-btn gm-btn-primary h-9 w-full">
            Add filler
          </button>
        </form>
      )}

      {request.type === "remove" && (
        <div className="space-y-2 p-1">
          <p className="px-1 text-[12.5px] text-ink-400">
            Remove <b className="font-semibold text-ink-100">{request.player.name}</b> from{" "}
            <b className="font-semibold text-ink-100">
              {request.player.from_slot ? slotLabel(request.player.from_slot) : "the game"}
            </b>
            ?{notify ? " They get a DM." : " Notify players is off, so they won't be told."}
          </p>
          <button type="button" className="gm-btn h-9 w-full bg-rose-500 text-white hover:bg-rose-400" onClick={() => onChoose({ kind: "remove" })}>
            <UserMinus aria-hidden />
            Remove player
          </button>
        </div>
      )}

      <button
        type="button"
        className="mt-1 h-8 w-full border-t border-ink-800 text-[12.5px] text-ink-400 transition-colors hover:text-ink-100"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
