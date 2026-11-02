"use client";

import { useEffect, useRef, useState } from "react";
import { anchorOf, targetVisible } from "./dom";
import { hasSeen } from "./progress";
import { useTutorialActions, useTutorialState } from "./TutorialProvider";

/**
 * The Help button on every page: replay this page's tours, switch automatic
 * tours on or off, or reset them all. It sits bottom right, where page
 * content scrolls away from under it. Pages can move it with facts:
 * `helpLeft` (left side), `helpTop` (just under an 80px top bar; the menu
 * opens downwards) and `helpBesideLeftPanel` (right of the map's 400px roster).
 * The map uses the top: its bottom edge is for reserving.
 */
export default function HelpButton() {
  const state = useTutorialState();
  const actions = useTutorialActions();
  const [open, setOpen] = useState(false);
  /** Tours whose controls were on screen when the menu opened (one page can hold several views). */
  const [shownIds, setShownIds] = useState<string[]>([]);
  const [resetArmed, setResetArmed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!state || !actions || !state.progress) return null;
  const { progress, activeTourId, facts } = state;
  const pageTours = state.pageTours.filter((tour) => shownIds.includes(tour.id));
  const besidePanel = Boolean(facts.helpBesideLeftPanel);
  const right = !besidePanel && !facts.helpLeft;
  const top = Boolean(facts.helpTop);

  return (
    <div
      ref={rootRef}
      data-tour="help.button"
      className={`fixed z-[5900] transition-[left] ${top ? "top-24" : "bottom-4"} ${right ? "right-4" : "left-4"} ${activeTourId ? "pointer-events-none" : ""}`}
      // In development, Next.js puts its own badge in the bottom-right corner.
      style={besidePanel ? { left: 416 } : right && process.env.NODE_ENV === "development" ? { right: 68 } : undefined}
    >
      {open && (
        <div
          className={`gm-tour-card absolute ${top ? "top-14" : "bottom-14"} w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-slate-300 shadow-2xl shadow-black/60 backdrop-blur-xl ${
            right ? "right-0" : "left-0"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300/90">🎓 Tutorials</p>

          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={progress.autoStart}
              onClick={() => actions.setAutoStart(!progress.autoStart)}
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
                progress.autoStart ? "bg-amber-400" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
                  progress.autoStart ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
            <span className="text-sm leading-snug">
              <span className="font-bold text-white">Show tutorials automatically</span>
              <span className="block text-xs text-slate-400">
                {progress.autoStart
                  ? "A tour starts the first time you open a page."
                  : "Off. You can still start any tour below."}
              </span>
            </span>
          </label>

          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">On this page</p>
            {pageTours.length === 0 && <p className="text-xs text-slate-500">No tour for this page.</p>}
            {pageTours.map((tour) => {
              const seen = hasSeen(progress, tour);
              return (
                <button
                  key={tour.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    actions.start(tour.id);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left transition hover:border-amber-300/40 hover:bg-amber-400/5"
                >
                  <span className={`mt-0.5 text-sm ${seen ? "text-emerald-400" : "text-amber-300"}`} aria-hidden>
                    {seen ? "✓" : "▶"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">{tour.title}</span>
                    <span className="block text-xs leading-snug text-slate-400">{tour.summary}</span>
                  </span>
                  <span className="ml-auto shrink-0 self-center text-[11px] font-bold text-amber-300">
                    {seen ? "Replay" : "Start"}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              if (!resetArmed) {
                setResetArmed(true);
                return;
              }
              actions.resetAll();
              setResetArmed(false);
              setOpen(false);
            }}
            onBlur={() => setResetArmed(false)}
            className="mt-4 w-full rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold text-slate-500 transition hover:text-slate-200"
          >
            {resetArmed ? "Click again: every tour shows again" : "Reset all tutorials"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (!open) setShownIds(state.pageTours.filter((tour) => targetVisible(anchorOf(tour))).map((tour) => tour.id));
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label="Tutorials and help"
        title="Tutorials and help"
        className={`flex h-11 items-center gap-2 rounded-full border pl-1.5 pr-4 text-sm font-black shadow-xl shadow-black/40 backdrop-blur-md transition hover:scale-105 ${
          open
            ? "border-amber-300 bg-amber-400 text-slate-950"
            : "border-white/15 bg-slate-900/85 text-slate-100 hover:border-amber-300/60"
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-base ${
            open ? "bg-slate-950/15" : "bg-amber-400 text-slate-950"
          }`}
          aria-hidden
        >
          ?
        </span>
        Help
      </button>
    </div>
  );
}
