"use client";

import Link from "next/link";
import { formatInZone } from "@/lib/timeEngine";
import { GLASS, Spinner } from "../ui";
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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className={`gm-fade-up w-full max-w-md rounded-3xl p-6 ${GLASS}`}>
        {state === "done" ? (
          <div className="text-center">
            <div className="text-5xl">{editing ? "✅" : "🎉"}</div>
            <h2 className="mt-3 text-2xl font-black text-white">{editing ? "Changes saved!" : "Game scheduled!"}</h2>
            <p className="mt-1 text-sm text-slate-300">
              {modeLabel} · {formatInZone(gameSec * 1000, timeZone)}
            </p>
            <p className="mt-3 text-xs text-slate-400">
              {demo
                ? "Preview mode — nothing was sent to Discord."
                : editing
                  ? "The calendar is updated."
                  : "It's on the calendar now. Check your DMs for your host key and panel link."}
              {notified > 0 && ` ${notified} reserved player${notified === 1 ? " was" : "s were"} notified by DM.`}
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-black text-white">
              {state === "error"
                ? editing ? "Not saved" : "Not scheduled"
                : editing ? "Saving your changes…" : "Scheduling your game…"}
            </h2>
            <ol className="mt-4 space-y-3">
              {steps.map((step) => (
                <li key={step.label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
                      step.state === "done"
                        ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                        : step.state === "active"
                          ? "border-amber-300/60 bg-amber-400/15 text-amber-200"
                          : step.state === "error"
                            ? "border-rose-400/60 bg-rose-500/20 text-rose-200"
                            : "border-white/10 text-slate-600"
                    }`}
                  >
                    {step.state === "done" ? "✓" : step.state === "active" ? <Spinner className="h-3.5 w-3.5" /> : step.state === "error" ? "✕" : "·"}
                  </span>
                  <span className={step.state === "todo" ? "text-slate-500" : "text-slate-100"}>{step.label}</span>
                </li>
              ))}
            </ol>
            {state === "error" && (
              <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {status?.error ?? "The bot could not schedule this game."}
              </p>
            )}
            {state === "pending" && waitedSec >= 25 && (
              <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                The bot normally answers within a few seconds — it may be restarting. Your request is saved and will be
                processed as soon as it&apos;s back; you can leave this page and check the calendar later.
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
              className="rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-black text-slate-950 hover:bg-amber-300"
            >
              ⚙️ Open Host Scheduling Panel
            </a>
          )}
          {state === "error" ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300"
            >
              Fix and try again
            </button>
          ) : (
            <Link
              href="/schedule"
              className={`rounded-xl px-4 py-3 text-center text-sm font-bold ${
                state === "done" && !panelUrl
                  ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                  : "border border-white/10 bg-white/5 text-slate-200 hover:border-white/25"
              }`}
            >
              Back to the calendar
            </Link>
          )}
          {state === "done" && !editing && (
            <button
              type="button"
              onClick={onScheduleAnother}
              className="text-xs font-semibold text-slate-400 hover:text-amber-200"
            >
              Schedule another game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
