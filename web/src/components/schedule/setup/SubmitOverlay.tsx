"use client";

import { CalendarCheck, Check, Settings, X } from "lucide-react";
import Link from "next/link";
import { formatInZone } from "@/lib/timeEngine";
import { Spinner } from "../ui";
import { useRequestPoller } from "../useRequestPoller";

/**
 * Progress of a submitted game: queued → bot validating → on the board.
 * The bot drains the queue every few seconds.
 */
export default function SubmitOverlay({
  requestId,
  modeLabel,
  gameSec,
  timeZone,
  demo,
  editing,
  onClose,
  onScheduleAnother,
}: {
  requestId: string;
  modeLabel: string;
  gameSec: number;
  timeZone: string;
  demo: boolean;
  /** Saving changes to an existing game (not scheduling a new one). */
  editing: boolean;
  onClose: () => void;
  onScheduleAnother: () => void;
}) {
  const { status, waitedSec } = useRequestPoller(requestId);
  const state = status?.status ?? "pending";
  const panelUrl = status?.result?.panel_url;
  const notified = status?.result?.notified ?? 0;

  const steps: { label: string; state: "done" | "active" | "error" | "todo" }[] = [
    { label: "Request saved", state: "done" },
    {
      label: state === "error" ? "The bot rejected it" : "GameMaster bot checks it",
      state: state === "pending" ? "active" : state === "error" ? "error" : "done",
    },
    {
      label: editing ? "Calendar updated" : "Added to the calendar",
      state: state === "done" ? "done" : "todo",
    },
  ];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-950/75 p-4">
      <div role="dialog" aria-modal="true" className="gm-plate gm-fade-up w-full max-w-md bg-ink-950 p-6 [--cut:16px]">
        {state === "done" ? (
          <div className="flex flex-col items-center text-center">
            <span className="gm-cut grid h-12 w-12 place-items-center bg-brand-400 text-brand-950 [--cut:10px]">
              <CalendarCheck aria-hidden className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h2 className="gm-title mt-3 text-[32px]">{editing ? "Changes saved" : "Game scheduled"}</h2>
            <p className="mt-1 text-sm text-ink-300">
              {modeLabel}, {formatInZone(gameSec * 1000, timeZone)}
            </p>
            <p className="mt-3 text-xs text-ink-400">
              {demo
                ? "Preview mode: nothing was sent to Discord."
                : editing
                  ? "The calendar is updated."
                  : "It's on the calendar now. Check your DMs for your host key and panel link."}
              {notified > 0 && ` ${notified} reserved player${notified === 1 ? " was" : "s were"} notified by DM.`}
            </p>
          </div>
        ) : (
          <>
            <h2 className="gm-title text-[26px]">
              {state === "error"
                ? editing ? "Not saved" : "Not scheduled"
                : editing ? "Saving your changes…" : "Scheduling your game…"}
            </h2>
            <ol className="mt-4 space-y-3">
              {steps.map((step) => (
                <li key={step.label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`gm-cut grid h-7 w-7 place-items-center text-xs font-semibold [--cut:6px] ${
                      step.state === "done"
                        ? "bg-emerald-950 text-emerald-300"
                        : step.state === "active"
                          ? "bg-brand-950 text-brand-300"
                          : step.state === "error"
                            ? "bg-rose-950 text-rose-300"
                            : "bg-ink-900 text-ink-600"
                    }`}
                  >
                    {step.state === "done" ? (
                      <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                    ) : step.state === "active" ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : step.state === "error" ? (
                      <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                    ) : (
                      "·"
                    )}
                  </span>
                  <span className={step.state === "todo" ? "text-ink-500" : "text-ink-100"}>{step.label}</span>
                </li>
              ))}
            </ol>
            {state === "error" && (
              <p className="gm-cut mt-4 bg-rose-950/60 px-3 py-2 text-sm text-rose-100 [--cut:8px]">
                {status?.error ?? "The bot could not schedule this game."}
              </p>
            )}
            {state === "pending" && waitedSec >= 25 && (
              <p className="gm-cut mt-4 bg-ink-900 px-3 py-2 text-xs text-ink-300 [--cut:8px]">
                The bot normally answers within a few seconds, so it may be restarting. Your request is saved and runs as
                soon as it&apos;s back: you can leave this page and check the calendar later.
              </p>
            )}
          </>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {state === "done" && panelUrl && (
            <a
              href={panelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gm-btn gm-btn-primary h-11"
            >
              <Settings aria-hidden strokeWidth={1.75} /> Open the Host Scheduling Panel
            </a>
          )}
          {state === "error" ? (
            <button
              type="button"
              onClick={onClose}
              className="gm-btn gm-btn-primary h-11"
            >
              Fix and try again
            </button>
          ) : (
            <Link
              href="/schedule"
              className={`gm-btn h-11 ${state === "done" && !panelUrl ? "gm-btn-primary" : "gm-btn-secondary"}`}
            >
              Back to the calendar
            </Link>
          )}
          {state === "done" && !editing && (
            <button
              type="button"
              onClick={onScheduleAnother}
              className="gm-btn gm-btn-quiet"
            >
              Schedule another game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
