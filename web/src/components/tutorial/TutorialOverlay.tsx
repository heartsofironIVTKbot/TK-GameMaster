"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { bringIntoView, sameBox, unionBox, visibleTargets, type Box } from "./dom";
import type { Placement, Tour, TutorialFacts } from "./types";

/**
 * One step of a running tour: the page dimmed, the step's control lit, and
 * the card beside it. Mounted fresh for every step (keyed by the provider).
 */

const MARGIN = 12;
const GAP = 14;
/** Below this width the card is a sheet at the bottom of the screen. */
const SHEET_BELOW = 640;
/** How long to look for a control before treating it as not on the page. */
const FIND_MS = 1500;
/** A control that was found and then vanished (a drawer closed). */
const LOST_MS = 1200;

type WaitState = "none" | "waiting" | "done";

/** "**bold**", line breaks and blank-line paragraphs. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((paragraph, index) => (
        <p key={index} className={index > 0 ? "mt-2" : undefined}>
          {paragraph.split("\n").map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 && <br />}
              {line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={partIndex} className="font-bold text-white">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={partIndex}>{part}</span>
                ),
              )}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

/**
 * Steps after `index` that will show: they apply to this viewer, and their
 * control is on the page (or they don't need one). Once a try-it step still
 * to do is passed, everything after it counts: doing it may bring their
 * controls up. Try-it steps already done are passed, so they don't count.
 */
function stepsAhead(tour: Tour, index: number, facts: TutorialFacts): number {
  const current = tour.steps[index]?.waitFor;
  let waiting = current !== undefined && !waitDone(current, facts);
  let count = 0;
  for (const candidate of tour.steps.slice(index + 1)) {
    if (candidate.when && !candidate.when(facts)) continue;
    const wait = candidate.waitFor;
    if (wait && !waiting) {
      if (waitDone(wait, facts)) continue;
      waiting = true;
      count += 1;
      continue;
    }
    if (!candidate.target || candidate.missing === "center" || waiting || visibleTargets(candidate.target).length > 0) count += 1;
  }
  return count;
}

function waitDone(wait: NonNullable<Tour["steps"][number]["waitFor"]>, facts: TutorialFacts): boolean {
  if ("fact" in wait) return Boolean(facts[wait.fact]);
  if ("selector" in wait) return document.querySelector(wait.selector) !== null;
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** Where the card goes: beside the lit box if there's room, else at the bottom. */
function placeCard(
  hole: Box | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  preferred: Placement | undefined,
): { top: number; left: number } {
  const { width: vw, height: vh } = viewport;
  const centered = { top: (vh - card.height) / 2, left: (vw - card.width) / 2 };
  if (!hole) return centered;
  const cx = hole.left + hole.width / 2;
  const cy = hole.top + hole.height / 2;
  const options: Record<Placement, { top: number; left: number; fits: boolean }> = {
    bottom: {
      top: hole.top + hole.height + GAP,
      left: clamp(cx - card.width / 2, MARGIN, vw - card.width - MARGIN),
      fits: hole.top + hole.height + GAP + card.height <= vh - MARGIN,
    },
    top: {
      top: hole.top - GAP - card.height,
      left: clamp(cx - card.width / 2, MARGIN, vw - card.width - MARGIN),
      fits: hole.top - GAP - card.height >= MARGIN,
    },
    right: {
      top: clamp(cy - card.height / 2, MARGIN, vh - card.height - MARGIN),
      left: hole.left + hole.width + GAP,
      fits: hole.left + hole.width + GAP + card.width <= vw - MARGIN,
    },
    left: {
      top: clamp(cy - card.height / 2, MARGIN, vh - card.height - MARGIN),
      left: hole.left - GAP - card.width,
      fits: hole.left - GAP - card.width >= MARGIN,
    },
  };
  const order: Placement[] = [preferred ?? "bottom", "bottom", "top", "right", "left"];
  for (const side of order) {
    if (options[side].fits) return { top: options[side].top, left: options[side].left };
  }
  // The lit box fills the screen (the map): the card sits low and centred, over it.
  return { top: vh - card.height - 28, left: (vw - card.width) / 2 };
}

export default function TutorialOverlay({
  tour,
  index,
  dir,
  seenBefore,
  facts,
  onGo,
  onShown,
  onClose,
  onTurnOff,
}: {
  tour: Tour;
  index: number;
  dir: 1 | -1;
  /** How many earlier steps of this run were shown (the step counter). */
  seenBefore: number;
  facts: TutorialFacts;
  onGo: (index: number, dir: 1 | -1) => void;
  onShown: (index: number) => void;
  onClose: () => void;
  onTurnOff: () => void;
}) {
  const step = tour.steps[index];
  const shows = step.when ? step.when(facts) : true;
  const next = () => onGo(index + 1, 1);
  const back = () => onGo(index - 1, -1);

  // Step counter: the steps shown so far, plus the ones still ahead that will
  // show. Re-counted while the step is open, as pages fill in.
  const [ahead, setAhead] = useState(() => stepsAhead(tour, index, facts));
  const factsRef = useRef(facts);
  useEffect(() => {
    factsRef.current = facts;
  });
  useEffect(() => {
    const timer = window.setInterval(() => setAhead(stepsAhead(tour, index, factsRef.current)), 500);
    return () => window.clearInterval(timer);
  }, [tour, index]);

  // Steps that don't apply here are passed in the direction of travel.
  useEffect(() => {
    if (!shows) onGo(index + dir, dir);
  }, [shows, index, dir, onGo]);

  // ---- The lit control -------------------------------------------------
  const [box, setBox] = useState<Box | null>(null);
  const [lost, setLost] = useState(false);
  const [found, setFound] = useState(false);
  useEffect(() => {
    if (!step.target || !shows) return undefined;
    const name = step.target;
    const startedAt = performance.now();
    let lastSeen = startedAt;
    let current: Box | null = null;
    let seen = false;
    let gone = false;
    let frame = 0;
    const tick = () => {
      const elements = visibleTargets(name);
      const now = performance.now();
      if (elements.length > 0) {
        if (!seen) {
          seen = true;
          setFound(true);
          bringIntoView(elements[0]);
        }
        lastSeen = now;
        const next = unionBox(elements);
        if (!sameBox(current, next)) {
          current = next;
          setBox(next);
        }
        if (gone) {
          gone = false;
          setLost(false);
        }
      } else if (!gone && now - lastSeen > (seen ? LOST_MS : FIND_MS)) {
        gone = true;
        current = null;
        setBox(null);
        setLost(true);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step.target, shows]);

  // Never found: skip it, or show it in the middle with its own wording.
  const skipMissing = Boolean(step.target) && lost && !found && step.missing !== "center";
  useEffect(() => {
    if (skipMissing) onGo(index + dir, dir);
  }, [skipMissing, index, dir, onGo]);
  const centred = !step.target || lost;
  const body = lost && step.missingBody ? step.missingBody : step.body;

  // ---- Try-it steps ----------------------------------------------------
  // A step mounts fresh, so "already done when it opened" is read once here.
  // Moving forward, an already-done step is passed ("click a game" when one
  // is open); stepping back to it shows it as done instead of jumping ahead.
  const wait = step.waitFor;
  const factName = wait && "fact" in wait ? wait.fact : null;
  const factValue = factName ? Boolean(facts[factName]) : false;
  const waitSelector = wait && "selector" in wait ? wait.selector : null;
  const waitClick = Boolean(wait && "click" in wait) && step.target ? step.target : null;
  const [doneAtStart] = useState(() =>
    factName ? factValue : waitSelector ? document.querySelector(waitSelector) !== null : false,
  );
  const passDone = doneAtStart && dir === 1;
  useEffect(() => {
    if (passDone) onGo(index + 1, 1);
  }, [passDone, index, onGo]);
  const [doneNow, setDoneNow] = useState(false);
  const done = doneAtStart || doneNow || (factName !== null && factValue);
  const waitState: WaitState = !wait ? "none" : done ? "done" : "waiting";
  const advanceRef = useRef(next);
  useEffect(() => {
    advanceRef.current = next;
  });

  useEffect(() => {
    if (!factName || doneAtStart || !factValue) return undefined;
    const timer = window.setTimeout(() => advanceRef.current(), 450);
    return () => window.clearTimeout(timer);
  }, [factName, factValue, doneAtStart]);

  useEffect(() => {
    if (!waitSelector || doneAtStart) return undefined;
    let timer = 0;
    const interval = window.setInterval(() => {
      if (document.querySelector(waitSelector)) {
        window.clearInterval(interval);
        setDoneNow(true);
        timer = window.setTimeout(() => advanceRef.current(), 450);
      }
    }, 200);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [waitSelector, doneAtStart]);

  useEffect(() => {
    if (!waitClick) return undefined;
    let timer = 0;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(`[data-tour~="${waitClick}"]`)) {
        setDoneNow(true);
        timer = window.setTimeout(() => advanceRef.current(), 350);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timer);
    };
  }, [waitClick]);

  const passThrough = Boolean(wait) || Boolean(step.interactive);

  // ---- Keys ------------------------------------------------------------
  const keysRef = useRef({ next, back, onClose });
  useEffect(() => {
    keysRef.current = { next, back, onClose };
  });
  // Capture phase: the map pans on arrow keys and swallows them otherwise.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as Element | null)?.closest("input, textarea, select, [contenteditable='true']");
      // Some keyboards and automation send only the code, not the key name.
      const key = event.key && event.key !== "Unidentified" ? event.key : event.code;
      const action =
        key === "Escape" || event.keyCode === 27
          ? keysRef.current.onClose
          : typing
            ? null
            : key === "ArrowRight" || event.keyCode === 39
              ? keysRef.current.next
              : key === "ArrowLeft" || event.keyCode === 37
                ? keysRef.current.back
                : null;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ---- Card size and place ---------------------------------------------
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 360, height: 240 });
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return undefined;
    const measure = () => setCardSize({ width: element.offsetWidth, height: element.offsetHeight });
    const viewportSize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    viewportSize();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", viewportSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", viewportSize);
    };
  }, []);

  // Still looking for the control: dim only, no card yet.
  const searching = Boolean(step.target) && !box && !lost;
  const visible = shows && !skipMissing && !passDone && !searching;
  useEffect(() => {
    if (visible) onShown(index);
  }, [visible, index, onShown]);

  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (visible) nextButton.current?.focus({ preventScroll: true });
  }, [visible]);

  if (!shows || skipMissing || passDone) return null;

  const pad = step.padding ?? 8;
  const hole =
    box && !centred
      ? {
          top: box.top - pad,
          left: box.left - pad,
          width: box.width + pad * 2,
          height: box.height + pad * 2,
        }
      : null;
  const sheet = viewport.width < SHEET_BELOW;
  const position = placeCard(hole, cardSize, viewport, step.placement);

  const number = seenBefore + 1;
  const total = number + ahead;
  const last = ahead === 0;
  const first = number <= 1;

  // Clicks outside the lit box stop here; inside it they reach the page on try-it steps.
  const blockers: ReactNode = hole ? (
    <>
      <div className="pointer-events-auto fixed left-0 right-0 top-0" style={{ height: Math.max(0, hole.top) }} />
      <div className="pointer-events-auto fixed bottom-0 left-0 right-0" style={{ top: hole.top + hole.height }} />
      <div
        className="pointer-events-auto fixed left-0"
        style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }}
      />
      <div
        className="pointer-events-auto fixed right-0"
        style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }}
      />
      {!passThrough && <div className="pointer-events-auto fixed" style={hole} />}
    </>
  ) : (
    <div className="pointer-events-auto fixed inset-0" />
  );

  return (
    <div data-tutorial-root className="pointer-events-none fixed inset-0 z-[6000]">
      {blockers}
      {hole ? (
        <div className="gm-tour-spot pointer-events-none fixed rounded-2xl" style={hole} aria-hidden />
      ) : (
        <div className="gm-tour-dim pointer-events-none fixed inset-0" aria-hidden />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="gm-tour-title"
        aria-describedby="gm-tour-body"
        className={`gm-tour-card pointer-events-auto fixed rounded-2xl border border-amber-300/25 bg-slate-900/95 p-4 text-slate-300 shadow-2xl shadow-black/60 backdrop-blur-xl ${
          sheet ? "bottom-3 left-3 right-3" : "w-[360px]"
        } ${searching ? "invisible" : ""}`}
        style={sheet ? undefined : { top: position.top, left: position.left }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300/90">🎓 {tour.title}</span>
          <span className="ml-auto text-[11px] font-semibold tabular-nums text-slate-500">
            {number} / {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-md px-1.5 py-0.5 text-sm text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Close the tour"
            title="Close the tour (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden>
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-300"
            style={{ width: `${(number / Math.max(1, total)) * 100}%` }}
          />
        </div>

        <h2 id="gm-tour-title" className="mt-3 text-base font-black tracking-tight text-white">
          {step.title}
        </h2>
        <div id="gm-tour-body" className="mt-1.5 text-sm leading-relaxed">
          <Rich text={body} />
        </div>

        {waitState !== "none" && !centred && (
          <p
            className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
              waitState === "done"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-300/30 bg-amber-400/10 text-amber-100"
            }`}
            aria-live="polite"
          >
            {waitState === "done" ? "✓ Nice, that's it." : "👉 Your turn: try it. The tour carries on when you do."}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-200"
            >
              Skip tour
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!first && (
              <button
                type="button"
                onClick={back}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-white/20"
              >
                ← Back
              </button>
            )}
            <button
              ref={nextButton}
              type="button"
              onClick={next}
              className="rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300"
            >
              {last ? (tour.next ? `${tour.next.label} →` : "Finish ✓") : waitState === "waiting" ? "Skip this →" : "Next →"}
            </button>
          </div>
        </div>
        {first && (
          <button
            type="button"
            onClick={onTurnOff}
            className="mt-3 w-full text-center text-[11px] font-semibold text-slate-500 underline-offset-2 transition hover:text-slate-300 hover:underline"
          >
            I know my way around: turn tutorials off
          </button>
        )}
      </div>
    </div>
  );
}
