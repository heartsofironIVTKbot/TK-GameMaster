"use client";

import { ScrollText, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PHASE_LABEL, PHASES, type GGState } from "@/lib/greatGame/model";
import { clock, Flag, hexA, nationName, secondsLeft, Sun, teamById } from "./ggUi";

/**
 * The top bar (concept 01 with banner A): a riveted steel band, the event's
 * wordmark on the left, the step rail on the right, and in the middle a notch
 * holding the striped sun (the turn clock drains it) with a pennant hanging
 * over it in the colours of the team that acts now.
 */

interface Banner {
  color: string | null;
  title: string;
  sub: string;
  flag: string | null;
  timer: string | null;
  frac: number;
  late: boolean;
}

const BAND_H = 83.25;
const NOTCH_W = 340;
const NOTCH_H = 128;
const NOTCH_SLOPE = 46;

/** The neon edge as one path: along the band, down and around the notch, on to the right edge. */
function neonPath(width: number): string {
  const left = width / 2 - NOTCH_W / 2;
  const right = width / 2 + NOTCH_W / 2;
  return `M0 ${BAND_H} H${left} L${left + NOTCH_SLOPE} ${NOTCH_H} H${right - NOTCH_SLOPE} L${right} ${BAND_H} H${width}`;
}

/**
 * Light snakes running left to right along the whole edge. Each snake is a few
 * stacked dashes that end at the same point (the head): a long faint tail, a
 * brighter body and a white-hot head. Lengths are in pathLength units (the
 * whole edge is 1000), so they look the same on any screen.
 */
const SNAKES = 3;
const SNAKE_PERIOD = 1000 / SNAKES;
const SNAKE_LAYERS = [
  { len: 130, width: 10, color: "#ff5ce4", opacity: 0.3 },
  { len: 90, width: 3.2, color: "#ffc8f7", opacity: 1 },
  { len: 32, width: 10, color: "#22e5ff", opacity: 0.5 },
  { len: 26, width: 3.2, color: "#f2fdff", opacity: 1 },
];

export function bannerFor(state: GGState, now: number): Banner {
  const team = teamById(state, state.turn.team);
  const left = secondsLeft(state, now);
  const timer = left === null ? null : clock(left);
  const frac = left === null || !state.turn.seconds ? 1 : Math.max(0, left / state.turn.seconds);
  const late = left !== null && left <= 0;
  const pausedSub = (sub: string) => (state.paused ? "PAUSED" : sub);
  const neutral = (title: string, sub: string, extra: Partial<Banner> = {}): Banner => ({
    color: null,
    title,
    sub: pausedSub(sub),
    flag: null,
    timer: null,
    frac: 1,
    late: false,
    ...extra,
  });
  const teamBanner = (sub: string): Banner =>
    team
      ? { color: team.color, title: team.name, sub: pausedSub(sub), flag: team.major, timer, frac, late }
      : neutral(PHASE_LABEL[state.phase], state.phase_done ? "STEP COMPLETE" : "WAITING");
  switch (state.phase) {
    case "teams":
      return neutral("Team setup", `${state.teams.filter((t) => t.approved).length} OF ${state.teams.length} TEAMS APPROVED`);
    case "drum":
      return neutral("Lottery drum", state.phase_done ? "CAPTAIN ORDER DRAWN" : `BALL ${state.order.length + 1} OF ${state.teams.length}`);
    case "wheel":
      return team ? { ...teamBanner(`SPIN ${state.teams.filter((t) => t.major).length + 1} OF 7 · MAJOR`), flag: null } : neutral("Major wheel", "ALL MAJORS ROLLED");
    case "vice":
      return team ? teamBanner("SCRATCHING · VICE-CAPTAIN") : neutral("Vice-captains", "ALL REVEALED");
    case "recruits":
      return team ? teamBanner(`FLIPPING · RECRUIT · ROUND ${state.turn.slot ?? 1}`) : neutral("Recruits", "ALL FLIPPED");
    case "bans":
      return team ? teamBanner(`BANNING · ${state.teams.filter((t) => t.ban !== null).length + 1} OF 7`) : neutral("Bans", "ALL BANS IN");
    case "draft":
      return team ? teamBanner(`PICK ${state.turn.pick} OF 21 · ROUND ${state.turn.round}`) : neutral("Minor draft", "ALL 21 PICKED");
    case "assign": {
      const done = state.teams.filter((t) => [t.captain, t.vice, ...t.recruits].every((id) => id && t.assign[id])).length;
      return neutral("Assign players", `${done} OF 7 TEAMS DONE`, { timer, frac, late });
    }
    case "locked":
      return neutral("Teams locked", state.fairness.seed ? "FAIRNESS CODE REVEALED" : "FINAL LOBBY");
  }
}

export default function GGTopBar({
  state,
  now,
  right,
  onOpenLog,
  onOpenControls,
}: {
  state: GGState;
  now: number;
  right?: ReactNode;
  onOpenLog: () => void;
  onOpenControls: (() => void) | null;
}) {
  const banner = bannerFor(state, now);
  const header = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const element = header.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const path = neonPath(width);
  const step = PHASES.indexOf(state.phase);
  const colored = Boolean(banner.color);
  const ink = colored ? "#120a24" : "#fff";
  return (
    <header ref={header} className="pointer-events-none absolute inset-x-0 top-0 z-[1100]" style={{ height: 230 }}>
      {/* The band: brushed steel, a row of neon LEDs along the top with a light chasing across them. */}
      <div className="gg-steel pointer-events-auto absolute inset-x-0 top-0" style={{ height: 84 }} />
      <div className="gg-leds absolute inset-x-0 top-[5px]" aria-hidden>
        <div className="gg-leds-win">
          <div className="gg-leds-lit" />
        </div>
      </div>

      {/* Left: the wordmark. */}
      <div className="pointer-events-auto absolute left-5 top-[16px] hidden md:block">
        <div className="gg-brush" style={{ fontSize: 34, lineHeight: 1 }}>
          The Great Game
        </div>
        <div className="mt-[5px] flex items-center gap-2.5 pl-1">
          <span className="gg-year">2026</span>
          <span className="gg-road">Road to 56</span>
        </div>
      </div>

      {/* Middle: the notch (its slopes start right at the band's edge), the sun clock and the pennant. */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{
          width: NOTCH_W,
          height: NOTCH_H,
          background: "linear-gradient(180deg,#2b2542,#1a1630)",
          clipPath: `polygon(0 0,100% 0,100% ${BAND_H}px,${NOTCH_W - NOTCH_SLOPE}px 100%,${NOTCH_SLOPE}px 100%,0 ${BAND_H}px)`,
        }}
      />

      {/* The neon edge: one line along the band and around the notch, glowing, with light snakes running along it. */}
      {width > 0 && (
        <>
          <svg className="gg-neon-base absolute left-0 top-0 overflow-visible" width={width} height={NOTCH_H + 8} aria-hidden>
            <path d={path} fill="none" stroke="#ff2bd6" strokeOpacity=".12" strokeWidth="12" strokeLinejoin="round" />
            <path d={path} fill="none" stroke="#ff2bd6" strokeOpacity=".3" strokeWidth="6" strokeLinejoin="round" />
            <path d={path} fill="none" stroke="#ff4fe0" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          <svg className="absolute left-0 top-0 overflow-visible" width={width} height={NOTCH_H + 8} aria-hidden>
            {SNAKE_LAYERS.map((layer) => (
              <path
                key={layer.len}
                className="gg-snake"
                d={path}
                pathLength={1000}
                fill="none"
                stroke={layer.color}
                strokeOpacity={layer.opacity}
                strokeWidth={layer.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${layer.len} ${SNAKE_PERIOD - layer.len}`}
                style={{ ["--from" as string]: layer.len, ["--to" as string]: layer.len - SNAKE_PERIOD }}
              />
            ))}
          </svg>
        </>
      )}

      <div className="absolute left-1/2 top-[3px] -translate-x-1/2">
        <div className="gg-sun-halo" aria-hidden />
        <Sun size={78} frac={banner.frac} id="gg-top-sun" />
      </div>
      <div
        className="absolute left-1/2 top-[84px] -translate-x-1/2"
        style={{
          width: 240,
          height: 86 + (banner.flag ? 30 : 0) + (banner.timer ? 29 : 0),
          background: colored ? `linear-gradient(180deg,${banner.color},${hexA(banner.color!, 0.86)})` : "linear-gradient(180deg,#ff2bd6,#8a2be2)",
          clipPath: "polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)",
          filter: `drop-shadow(0 0 14px ${hexA(banner.color ?? "#ff2bd6", 0.7)})`,
        }}
      />
      <div className="absolute left-1/2 top-[82px] h-[6px] w-[248px] -translate-x-1/2 rounded-sm" style={{ background: "linear-gradient(90deg,#8f88aa,#efeaf8,#8f88aa)" }} />
      <div className="absolute left-1/2 top-[96px] w-[240px] -translate-x-1/2 text-center" style={{ color: ink }} aria-live="polite">
        {banner.flag && (
          <div className="flex justify-center">
            <Flag tag={banner.flag} w={40} h={26} title={nationName(state, banner.flag)} />
          </div>
        )}
        <div className="gg-disp truncate px-3" style={{ fontWeight: 900, fontSize: 26, lineHeight: 1.05, marginTop: banner.flag ? 4 : 0 }}>
          {banner.title}
        </div>
        {banner.timer && (
          <div className="gg-digit" style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.2, color: banner.late ? (colored ? "#7a0010" : "#ffd23f") : ink }}>
            {banner.late ? "0:00" : banner.timer}
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em" }}>{banner.sub}</div>
      </div>

      {/* Right: the step rail and buttons. */}
      {/* Right: only the space right of the notch. The step (dots over its name) shows when there's room. */}
      <div className="@container pointer-events-none absolute right-4 top-[18px] flex justify-end" style={{ left: `calc(50% + ${NOTCH_W / 2 + 18}px)` }}>
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <div className="mr-2 hidden flex-col items-end gap-1.5 @min-[520px]:flex">
            <div className="flex items-center gap-1" aria-label={`Step ${step} of ${PHASES.length - 1}`}>
          {PHASES.map((phase, index) => (
            <span
              key={phase}
              title={PHASE_LABEL[phase]}
              style={{
                width: index === step ? 26 : 12,
                height: 8,
                borderRadius: 4,
                background: index < step ? "#ff2bd6" : index === step ? "var(--gg-cyan)" : "#3a3155",
                boxShadow: index === step ? "0 0 10px var(--gg-cyan)" : "none",
              }}
            />
          ))}
        </div>
            <span className="gg-disp whitespace-nowrap" style={{ fontWeight: 800, fontSize: 15, lineHeight: 1, color: "var(--gg-cyan)", textShadow: "0 0 10px rgba(34,229,255,.55)" }}>
              Step {step} · {PHASE_LABEL[state.phase]}
            </span>
          </div>
        <button type="button" className="gg-btn" onClick={onOpenLog} title="Everything that happened, in order">
          <ScrollText size={16} aria-hidden /> <span className="hidden sm:inline">Log</span>
        </button>
        {onOpenControls && (
          <button type="button" className="gg-btn gg-btn-primary" onClick={onOpenControls} title="Organizer controls">
            <SlidersHorizontal size={16} aria-hidden /> <span className="hidden sm:inline">Controls</span>
          </button>
        )}
        {right}
        </div>
      </div>
    </header>
  );
}
