"use client";

import { ScrollText, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
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
  const step = PHASES.indexOf(state.phase);
  const colored = Boolean(banner.color);
  const ink = colored ? "#120a24" : "#fff";
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[1100]" style={{ height: 230 }}>
      <div className="gg-steel pointer-events-auto absolute inset-x-0 top-0" style={{ height: 84 }} />

      {/* Left: the wordmark. */}
      <div className="pointer-events-auto absolute left-5 top-3 hidden md:block">
        <div className="gg-brush" style={{ fontSize: 34, lineHeight: 1 }}>
          The Great Game
        </div>
        <div className="gg-chrome" style={{ fontWeight: 900, fontSize: 15, letterSpacing: ".3em", marginTop: 2 }}>
          2026 · Road to 56
        </div>
      </div>

      {/* Middle: the notch, the sun clock and the pennant. */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{ width: 340, height: 118, background: "linear-gradient(180deg,#2b2542,#1a1630)", clipPath: "polygon(0 0,100% 0,100% 56%,86% 100%,14% 100%,0 56%)" }}
      />
      <svg className="absolute left-1/2 top-0 -translate-x-1/2" width="340" height="120" aria-hidden>
        <polyline points="0,84 0,66 47.6,118 292.4,118 340,66 340,84" fill="none" stroke="#ff2bd6" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 6px #ff2bd6)" }} />
      </svg>
      <div className="absolute left-1/2 top-[2px] -translate-x-1/2">
        <Sun size={96} frac={banner.frac} id="gg-top-sun" />
      </div>
      <div
        className="absolute left-1/2 top-[64px] -translate-x-1/2"
        style={{
          width: 240,
          height: 96 + (banner.flag ? 30 : 0) + (banner.timer ? 29 : 0),
          background: colored ? `linear-gradient(180deg,${banner.color},${hexA(banner.color!, 0.86)})` : "linear-gradient(180deg,#ff2bd6,#8a2be2)",
          clipPath: "polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)",
          filter: `drop-shadow(0 0 14px ${hexA(banner.color ?? "#ff2bd6", 0.7)})`,
        }}
      />
      <div className="absolute left-1/2 top-[64px] h-[6px] w-[240px] -translate-x-1/2" style={{ background: "linear-gradient(90deg,#8f88aa,#efeaf8,#8f88aa)" }} />
      <div className="absolute left-1/2 top-[76px] w-[240px] -translate-x-1/2 text-center" style={{ color: ink }} aria-live="polite">
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
      <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
        <div className="hidden items-center gap-1 lg:flex" aria-label={`Step ${step} of ${PHASES.length - 1}`}>
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
        <span className="gg-disp mx-2 hidden xl:inline" style={{ fontWeight: 800, fontSize: 18, color: "var(--gg-cyan)" }}>
          Step {step} · {PHASE_LABEL[state.phase]}
        </span>
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
    </header>
  );
}
