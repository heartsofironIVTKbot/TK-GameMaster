"use client";

/* eslint-disable @next/next/no-img-element -- static WebP screenshots, already sized; the optimizer would only re-encode them. */

import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  History,
  Layers,
  Maximize2,
  Pause,
  Play,
  ServerCog,
  Ticket,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useInView } from "./fx";
import { TOURS, type TourFrame, type TourStep } from "./tourFrames";

/**
 * "The rest of the job, handled.": one slide per feature, gliding sideways
 * with the neighbours peeking in (IronLegion's "What it keeps out" pattern).
 * Each slide plays its real page: the site's own screens one after another,
 * a cursor clicking through them (a click cuts, a new page fades; a scroll
 * or typing is a quick run of in-between screens, like a recording), step
 * by step. The steps are listed beside the screen; the one
 * playing opens with its caption and a progress line. When a slide's last
 * step ends, the next slide comes in. Feature tabs on top, arrows, pause,
 * swipe and arrow keys; it only plays on screen; the screen opens full size.
 */

const AIM_MS = 520;
const PRESS_MS = 170;
const FADE_MS = 280;
/** A screen inside a step, and a step's last screen, unless the tour says otherwise. */
const HOLD_MS = 1100;
const STEP_END_MS = 2400;
/** Extra time on every screen and at the end of each step, so the captions can be read. */
const READ_MS = 400;
const STEP_READ_MS = 1000;

interface Slide {
  tour: string;
  icon: LucideIcon;
  name: string;
  title: string;
  text: string;
  path: string;
}

const SLIDES: Slide[] = [
  {
    tour: "calendar",
    icon: CalendarDays,
    name: "Calendar",
    title: "Plan every game on one calendar.",
    text: "Hosts book games on the website, on one calendar the whole staff shares. GameMaster announces each one in Discord at the time you pick, with the mods and rules alongside, and everyone sees the same month in their own time zone.",
    path: "/schedule",
  },
  {
    tour: "records",
    icon: Database,
    name: "Player records",
    title: "Know who you're letting in.",
    text: "One page per player with everything your server knows about them: games played and missed, standing in each mode, roles and rewards. Every commend, warning and ban is logged with who gave it and why.",
    path: "/database",
  },
  {
    tour: "presets",
    icon: Layers,
    name: "Presets",
    title: "Set a mode up once.",
    text: "Playable nations, nation groups, locks, rules and mods, saved once as a preset. Pick it in a click every time you set up a game, share it with other servers, or start from one of theirs.",
    path: "/presets",
  },
  {
    tour: "archive",
    icon: Archive,
    name: "Archive",
    title: "Every game, kept.",
    text: "A public record of every game on every server: who played which nation, who came and who didn't, what they got for it, and how the players rated the game afterwards.",
    path: "/archive",
  },
  {
    tour: "attendance",
    icon: ClipboardCheck,
    name: "Live attendance",
    title: "Roll call, automatic.",
    text: "Once a game starts, GameMaster checks the voice channel on its own and works out who really played. Nobody has to take a roll call, and no-shows get their warning when attendance is finalized.",
    path: "/attendance",
  },
  {
    tour: "tickets",
    icon: Ticket,
    name: "Tickets",
    title: "Every ticket, kept.",
    text: "Reports, appeals, host applications and verifications are opened from a panel in Discord, each in its own private channel. Once closed, the whole conversation is saved on the website.",
    path: "/tickets",
  },
  {
    tour: "audit",
    icon: History,
    name: "Audit log",
    title: "Every change, on record.",
    text: "Who reserved, who moved whom, who gave a warning and why: everything that happens on your server, from the website and the bot, in one log you can search, filter and export.",
    path: "/audit",
  },
  {
    tour: "settings",
    icon: ServerCog,
    name: "Server settings",
    title: "Each server is in charge.",
    text: "Your staff, host ranks, player roles, channels, game modes and rules, all set on the website with a check at every step. GameMaster runs the way your community does, not the other way round.",
    path: "/servers",
  },
];

type Phase = "hold" | "aim" | "press";
type Arrival = TourFrame["how"];

/** One screen in a slide's run: which step it's in, how long it stays, and when it starts. */
interface Beat {
  step: number;
  frame: TourFrame;
  hold: number;
  /** Hold, plus the cursor's trip to the next screen's click. */
  length: number;
  at: number;
}

function timeline(steps: TourStep[]): { beats: Beat[]; total: number; stepStart: number[]; stepLength: number[] } {
  const beats: Beat[] = [];
  steps.forEach((step, s) =>
    step.frames.forEach((frame, f) => {
      const last = f === step.frames.length - 1;
      const hold = frame.burst ? (frame.ms ?? 40) : (frame.ms ?? (last ? STEP_END_MS : HOLD_MS)) + (last ? STEP_READ_MS : READ_MS);
      beats.push({ step: s, frame, hold, length: hold, at: 0 });
    }),
  );
  let at = 0;
  beats.forEach((beat, i) => {
    if (beats[i + 1]?.frame.cursor) beat.length += AIM_MS + PRESS_MS;
    beat.at = at;
    at += beat.length;
  });
  const stepStart = steps.map((_, s) => beats.find((beat) => beat.step === s)?.at ?? 0);
  const stepLength = steps.map((_, s) => beats.filter((beat) => beat.step === s).reduce((sum, beat) => sum + beat.length, 0));
  return { beats, total: at, stepStart, stepLength };
}

interface Play {
  slide: number;
  beat: number;
  /** The screen before this one, kept right under it. */
  from: number;
  arrival: Arrival;
  phase: Phase;
}

const START = (slide: number): Play => ({ slide, beat: 0, from: 0, arrival: "fade", phase: "hold" });

export default function FeatureShow({ number }: { number: number }) {
  const root = useRef<HTMLElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const near = useInView(root, { margin: "800px 0px 800px 0px" });
  const onScreen = useInView(root, { once: false, threshold: 0.25, margin: "0px" });
  const [stopped, setStopped] = useState(false);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [play, setPlay] = useState<Play>(START(0));
  const runs = useMemo(() => SLIDES.map((slide) => timeline(TOURS[slide.tour] ?? [])), []);

  const count = SLIDES.length;
  const { slide, beat, phase } = play;
  const run = runs[slide];
  const playing = onScreen && !stopped && zoomed === null;

  const goSlide = useCallback((to: number) => setPlay(START((to + count) % count)), [count]);
  const goStep = useCallback(
    (step: number) =>
      setPlay((current) => {
        const target = runs[current.slide].beats.findIndex((item) => item.step === step);
        return { ...current, beat: Math.max(0, target), from: current.beat, arrival: "fade", phase: "hold" };
      }),
    [runs],
  );

  // The clock: hold a screen; if the next one comes from a click, aim and press; then the next screen, or slide.
  useEffect(() => {
    if (!playing) return undefined;
    const current = run.beats[beat];
    const next = run.beats[beat + 1];
    if (!current) return undefined;
    const wait = phase === "hold" ? current.hold : phase === "aim" ? AIM_MS : PRESS_MS;
    const timer = window.setTimeout(() => {
      if (phase === "hold" && next?.frame.cursor) setPlay((p) => ({ ...p, phase: "aim" }));
      else if (phase === "aim") setPlay((p) => ({ ...p, phase: "press" }));
      else if (next) setPlay((p) => ({ ...p, beat: p.beat + 1, from: p.beat, arrival: next.frame.how, phase: "hold" }));
      else setPlay(START((slide + 1) % count));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [playing, run, beat, phase, slide, count]);

  // Keep the playing feature's tab in view on narrow screens (sideways only).
  useEffect(() => {
    const row = tabs.current;
    const tab = row?.children[slide] as HTMLElement | undefined;
    if (!row || !tab) return;
    row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.clientWidth) / 2, behavior: "smooth" });
  }, [slide]);

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  return (
    <section ref={root} aria-labelledby="feature-show-title" aria-roledescription="carousel" className="fx-show py-20 sm:py-28">
      <div className="fx-show-head">
        <div>
          <p className="fx-kicker">{`${String(number).padStart(2, "0")} // Everything else`}</p>
          <h2 id="feature-show-title" className="gm-title mt-3 text-[40px] sm:text-[60px]">
            The rest of the job, <span className="text-brand-400">handled.</span>
          </h2>
        </div>
        <div className="flex gap-2">
          <button type="button" className="fx-show-btn" onClick={() => goSlide(slide - 1)} aria-label="Previous feature">
            <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={2} />
          </button>
          <button
            type="button"
            className="fx-show-btn"
            data-on={stopped || undefined}
            onClick={() => setStopped((value) => !value)}
            aria-label={stopped ? "Play the slideshow" : "Pause the slideshow"}
            aria-pressed={stopped}
          >
            {stopped ? <Play aria-hidden className="h-4 w-4" strokeWidth={2.25} /> : <Pause aria-hidden className="h-4 w-4" strokeWidth={2.25} />}
          </button>
          <button type="button" className="fx-show-btn" onClick={() => goSlide(slide + 1)} aria-label="Next feature">
            <ChevronRight aria-hidden className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* One tab per feature; the playing one's line fills as it goes. */}
      <div ref={tabs} className="fx-show-tabs" role="tablist" aria-label="Features">
        {SLIDES.map((item, i) => {
          const Icon = item.icon;
          const on = i === slide;
          const current = runs[i].beats[on ? beat : 0];
          return (
            <button
              key={item.tour}
              type="button"
              role="tab"
              aria-selected={on}
              className="fx-show-tab"
              data-on={on || undefined}
              onClick={() => goSlide(i)}
            >
              <span className="fx-show-line">
                {on && current ? (
                  <i
                    key={`${slide}-${beat}`}
                    style={
                      {
                        "--a": `${(current.at / run.total) * 100}%`,
                        "--b": `${((current.at + current.length) / run.total) * 100}%`,
                        animation: `fx-span ${current.length}ms linear both`,
                        animationPlayState: playing ? "running" : "paused",
                      } as CSSProperties
                    }
                  />
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-ink-500">{String(i + 1).padStart(2, "0")}</span>
                <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{item.name}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="fx-show-view"
        tabIndex={0}
        aria-label="Features"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") goSlide(slide + 1);
          if (event.key === "ArrowLeft") goSlide(slide - 1);
        }}
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
          swiped.current = false;
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - start.y)) {
            swiped.current = true;
            goSlide(slide + (dx < 0 ? 1 : -1));
          }
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="fx-show-track" style={{ "--idx": slide } as CSSProperties}>
          {SLIDES.map((item, i) => {
            const on = i === slide;
            const steps = TOURS[item.tour] ?? [];
            const slideRun = runs[i];
            // Only the playing slide's screens near the current one are kept in the
            // page, and the first screen of the slides either side: a whole slide's
            // screenshots at once (up to 110) took hundreds of MB and crashed phones.
            const apart = Math.min(Math.abs(i - slide), count - Math.abs(i - slide));
            const load: Load = !near || apart > 1 ? "none" : on ? "run" : "first";
            return (
              <article key={item.tour} className="fx-show-slide" data-on={on || undefined} aria-hidden={!on} aria-roledescription="slide">
                <div className="fx-show-body" inert={!on}>
                  <Screen
                    path={item.path}
                    label={`${item.name} page`}
                    beats={slideRun.beats}
                    play={on ? play : START(i)}
                    load={load}
                    onOpen={() => {
                      if (!swiped.current) setZoomed(beat);
                      swiped.current = false;
                    }}
                  />
                  <div className="fx-show-copy">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">
                      <item.icon aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                      <span className="font-mono text-ink-500">{String(i + 1).padStart(2, "0")}</span>
                      {item.name}
                    </p>
                    <h3 className="gm-title mt-2 text-[30px] leading-[0.95] sm:text-[38px]">{item.title}</h3>
                    <p className="mt-3 text-[14.5px] leading-relaxed text-ink-300">{item.text}</p>
                    <ol className="mt-5 space-y-1.5">
                      {steps.map((step, s) => {
                        const current = on ? slideRun.beats[beat] : null;
                        const active = on && current?.step === s;
                        const start = slideRun.stepStart[s];
                        const length = slideRun.stepLength[s] || 1;
                        return (
                          <li key={step.name}>
                            <button
                              type="button"
                              className="fx-show-step"
                              data-on={active || undefined}
                              data-seen={(on && current && current.step > s) || undefined}
                              onClick={() => goStep(s)}
                              aria-current={active ? "step" : undefined}
                            >
                              <span className="font-mono text-[11px] text-ink-500">{String(s + 1).padStart(2, "0")}</span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <b className="font-semibold">{step.name}</b>
                                  {step.badge ? <span className="fx-show-badge">{step.badge}</span> : null}
                                </span>
                                {active ? (
                                  <span key={`${slide}-${s}`} className="fx-fade-in mt-1 block text-[13px] font-normal leading-snug text-ink-300">
                                    {step.caption}
                                  </span>
                                ) : null}
                              </span>
                              <span className="fx-show-steptrack" aria-hidden>
                                {active && current ? (
                                  <i
                                    key={`${slide}-${beat}`}
                                    style={
                                      {
                                        "--a": `${((current.at - start) / length) * 100}%`,
                                        "--b": `${((current.at + current.length - start) / length) * 100}%`,
                                        animation: `fx-span ${current.length}ms linear both`,
                                        animationPlayState: playing ? "running" : "paused",
                                      } as CSSProperties
                                    }
                                  />
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
                {on ? null : (
                  <button type="button" className="absolute inset-0 z-10 cursor-pointer" onClick={() => goSlide(i)} aria-label={`Show ${item.name}`} tabIndex={-1} />
                )}
              </article>
            );
          })}
        </div>
      </div>

      {zoomed !== null ? (
        <TourZoom
          frames={run.beats
            .filter((item) => !item.frame.burst)
            .map((item) => ({ src: item.frame.src, caption: (TOURS[SLIDES[slide].tour] ?? [])[item.step]?.caption ?? "" }))}
          label={`${SLIDES[slide].name} page`}
          start={Math.max(0, run.beats.slice(0, zoomed + 1).filter((item) => !item.frame.burst).length - 1)}
          onClose={() => setZoomed(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * One slide's screen: its screenshots stacked, the one on showing; the cursor
 * on top, outside the screens, so it keeps its size.
 */
function Screen({
  path,
  label,
  beats,
  play,
  load,
  onOpen,
}: {
  path: string;
  label: string;
  beats: Beat[];
  play: Play;
  load: Load;
  onOpen: () => void;
}) {
  const { beat, from, arrival, phase } = play;
  const aiming = phase !== "hold";
  const inDiscord = beats[beat]?.frame.app === "discord";
  const clock = beats[beat]?.frame.overlay === "clock";
  const next = beats[beat + 1];
  const point = aiming && next?.frame.cursor ? next.frame.cursor : lastClick(beats, beat);
  const cursorShown = aiming || (arrival === "cut" && beats[beat]?.frame.cursor !== null && beats[beat]?.frame.cursor !== undefined);

  return (
    <div className="fx-show-screen">
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3">
        <span className="flex gap-1.5" aria-hidden>
          <i className="h-2 w-2 rounded-full bg-ink-700" />
          <i className="h-2 w-2 rounded-full bg-ink-700" />
          <i className="h-2 w-2 rounded-full bg-ink-700" />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-400">
          {inDiscord ? (
            <span className="text-[#949cf7]">discord</span>
          ) : (
            <>
              gamemaster<span className="text-ink-600">/</span>
              <span className="text-ink-200">{path.replace(/^\//, "")}</span>
            </>
          )}
        </span>
        <span className="gm-tag shrink-0 bg-ink-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Sample data</span>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label}: open this screen full size`}
        className="group relative block aspect-[16/10] w-full cursor-zoom-in overflow-hidden bg-ink-950"
      >
        {load !== "none"
          ? beats.map((item, i) =>
              !kept(beats, i, beat, from, load) ? null : (
              <img
                key={item.frame.src}
                src={item.frame.src}
                alt=""
                width={1440}
                height={900}
                draggable={false}
                decoding="async"
                className="fx-tour-shot"
                style={shotStyle(i, beat, from, arrival)}
              />
              ),
            )
          : null}
        <span
          aria-hidden
          className="fx-tour-cursor"
          data-shown={cursorShown || undefined}
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, transitionDuration: aiming ? `${AIM_MS}ms` : "250ms" }}
        >
          {phase === "press" ? <span key={beat} className="fx-tour-click" /> : null}
          <svg
            viewBox="0 0 20 24"
            className={`block h-[20px] w-[16px] origin-[10%_6%] transition-transform duration-100 ${phase === "press" ? "scale-[0.82]" : ""}`}
          >
            <path d="M2 1.5v18.2l4.6-4.4 3.1 7.1 3.2-1.4-3.1-6.9h6.6z" fill="white" stroke="black" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
        {clock ? (
          // Time passing: the voice checks come on their own.
          <span aria-hidden className="fx-clock">
            <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0">
              <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2" />
              {[0, 90, 180, 270].map((angle) => (
                <line key={angle} x1="20" y1="5.5" x2="20" y2="8.5" stroke="currentColor" strokeWidth="2" transform={`rotate(${angle} 20 20)`} />
              ))}
              <line className="fx-clock-hour" x1="20" y1="20" x2="20" y2="12.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
              <line className="fx-clock-minute" x1="20" y1="20" x2="20" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="20" cy="20" r="2" fill="currentColor" />
            </svg>
            <span className="text-left leading-tight">
              <b className="block text-[13px] font-semibold text-ink-50">Automatic voice check</b>
              <span className="text-[11px] text-ink-400">every 20 minutes</span>
            </span>
          </span>
        ) : null}
        <span className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 bg-ink-950/85 px-2 py-1 text-[11px] font-medium text-ink-200 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
          Full size
        </span>
      </button>
    </div>
  );
}

type Load = "none" | "first" | "run";

/** How far ahead screens load before they're due, so each is decoded in time. */
const AHEAD_MS = 1500;
const AHEAD_MAX = 16;

/**
 * Whether screen i is in the page: the one showing, the one under it, and the
 * next ones due within AHEAD_MS (at least two). A slide that isn't playing
 * keeps just its first screen.
 */
function kept(beats: Beat[], i: number, beat: number, from: number, load: Load): boolean {
  if (load === "first") return i === 0;
  if (i === beat || i === from) return true;
  if (i < beat || i - beat > AHEAD_MAX) return false;
  let due = 0;
  for (let k = beat; k < i; k += 1) due += beats[k].length;
  return i - beat <= 2 || due - beats[beat].length < AHEAD_MS;
}

/** Where the cursor last clicked, at or before this screen. */
function lastClick(beats: Beat[], index: number): { x: number; y: number } {
  for (let i = index; i >= 0; i -= 1) {
    const cursor = beats[i]?.frame.cursor;
    if (cursor) return cursor;
  }
  return { x: 0.62, y: 0.78 };
}

/**
 * One screenshot's place in the stack. The one on shows; the one before it
 * stays right under it, so a screen that's still decoding never leaves a gap
 * (that read as a blink); a fade brings the new one in over it. The rest wait,
 * hidden.
 */
function shotStyle(i: number, index: number, from: number, arrival: Arrival): CSSProperties {
  if (i === index) return { zIndex: 2, opacity: 1, transition: arrival === "fade" ? `opacity ${FADE_MS}ms ease-out` : "none" };
  if (i === from) return { zIndex: 1, opacity: 1, transition: "none" };
  return { zIndex: 0, opacity: 0, transition: "none" };
}

/** One screen at full size, with the others either side. */
function TourZoom({
  frames,
  label,
  start,
  onClose,
}: {
  frames: { src: string; caption: string }[];
  label: string;
  start: number;
  onClose: () => void;
}) {
  const [at, setAt] = useState(start);
  const count = frames.length;
  const go = useCallback((by: number) => setAt((value) => (value + by + count) % count), [count]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${label}, full size`} className="fixed inset-0 z-[2000] flex flex-col bg-black/90 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 pb-3 text-sm text-ink-200" onClick={(event) => event.stopPropagation()}>
        <span className="font-mono text-xs text-brand-400">
          {String(at + 1).padStart(2, "0")}
          <span className="text-ink-600">/{String(count).padStart(2, "0")}</span>
        </span>
        <p className="min-w-0 flex-1">{frames[at].caption}</p>
        <button type="button" className="fx-show-btn" onClick={() => go(-1)} aria-label="Previous screen">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className="fx-show-btn" onClick={() => go(1)} aria-label="Next screen">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" className="fx-show-btn" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <img
          src={frames[at].src}
          alt={`${label}: ${frames[at].caption}`}
          width={1440}
          height={900}
          className="max-h-full max-w-full border border-ink-700 object-contain shadow-2xl"
          onClick={(event) => {
            event.stopPropagation();
            go(1);
          }}
        />
      </div>
      <p className="pt-3 text-center text-xs text-ink-500">Sample data. Click the screen for the next one, Esc to close.</p>
    </div>,
    document.body,
  );
}
