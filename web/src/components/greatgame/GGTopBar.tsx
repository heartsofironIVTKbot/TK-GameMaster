"use client";

import { BookOpen, Puzzle, ScrollText, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { draftOrder, strengthOrder } from "@/lib/greatGame/engine";
import { PHASE_LABEL, PHASES, type GGState, type GGTeam } from "@/lib/greatGame/model";
import { clock, Flag, hexA, nationName, secondsLeft, Sun, teamById } from "./ggUi";
import { DRUM_MS } from "./GGAirLottery";
import { LAND_END } from "./GGMajorReel";
import { FLIGHT } from "./GGRecruitTable";
import GGHud, { type HudCell } from "./GGHud";
import * as sound from "./ggSound";
import { useSoundSwitch } from "./ggSound";

/**
 * The top bar: a riveted steel band with the event's wordmark on the left and
 * the buttons on the right. In the middle, a notch holds the striped sun with
 * a countdown ring around it, two HUD readouts beside it (the step, and how
 * far along it is) and a broadcast monitor hanging under it that names the
 * team acting now, in its colours.
 */

interface Banner {
  color: string | null;
  title: string;
  sub: string;
  flag: string | null;
  timer: string | null;
  frac: number;
  late: boolean;
  /** Seconds left on the turn clock (null: untimed). */
  left?: number | null;
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

export function bannerFor(state: GGState, now: number, scratchTeam: string | null = null): Banner {
  // While a ball is being drawn or the reel is spinning, the banner keeps to
  // the moment before the result, so it never gives it away early.
  const draw = state.last_draw;
  const since = draw ? now - draw.at : Infinity;
  const drawing = state.phase === "drum" && draw?.kind === "drum" && since >= 0 && since < DRUM_MS;
  const reeling = state.phase === "wheel" && draw?.kind === "wheel" && since >= 0 && since < LAND_END;
  const turning = state.phase === "recruits" && draw?.kind === "recruit" && since >= 0 && since < FLIGHT.shown;
  // A vice-captain ticket still being scratched keeps its team on the banner.
  const team = teamById(state, reeling || turning ? draw!.team : scratchTeam && state.phase === "vice" ? scratchTeam : state.turn.team);
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
      ? { color: team.color, title: team.name, sub: pausedSub(sub), flag: team.major, timer, frac, late, left }
      : neutral(PHASE_LABEL[state.phase], state.phase_done ? "STEP COMPLETE" : "WAITING");
  switch (state.phase) {
    case "teams":
      return neutral("Team setup", `${state.teams.filter((t) => t.approved).length} OF ${state.teams.length} TEAMS APPROVED`);
    case "drum":
      if (drawing) return neutral("Lottery drum", `DRAWING · BALL ${state.order.length} OF ${state.teams.length}`);
      return neutral("Lottery drum", state.phase_done ? "CAPTAIN ORDER DRAWN" : `BALL ${state.order.length + 1} OF ${state.teams.length}`);
    case "wheel":
      if (reeling && team) return { ...teamBanner(`SPINNING · MAJOR ${state.teams.filter((t) => t.major).length - (draw.then ? 1 : 0)} OF 7`), flag: null, timer: null, frac: 1, late: false };
      return team ? { ...teamBanner(`SPIN ${state.teams.filter((t) => t.major).length + 1} OF 7 · MAJOR`), flag: null } : neutral("Major reel", "ALL MAJORS DRAWN");
    case "vice":
      if (scratchTeam && team) return teamBanner("SCRATCHING · VICE-CAPTAIN");
      return team ? teamBanner("SCRATCHES NEXT · VICE-CAPTAIN") : neutral("Vice-captains", "ALL REVEALED");
    case "recruits":
      if (turning && team) return teamBanner(`TURNING A CARD · RECRUIT · ROUND ${draw?.slot ?? 1}`);
      return team ? teamBanner(`PICKS A CARD · RECRUIT · ROUND ${state.turn.slot ?? 1}`) : neutral("Recruits", "ALL DRAWN");
    case "bans":
      return team ? teamBanner(`BANNING · ${state.teams.filter((t) => t.ban !== null).length + 1} OF 7`) : neutral("Bans", "ALL BANS IN");
    case "draft":
      return team ? teamBanner(`PICK ${state.turn.pick} OF 21 · ROUND ${state.turn.round}`) : neutral("Minor draft", "ALL 21 PICKED");
    case "assign": {
      const done = state.teams.filter((t) => [t.captain, t.vice, ...t.recruits].every((id) => id && t.assign[id])).length;
      return neutral("Assign players", `${done} OF 7 TEAMS DONE`, { timer, frac, late, left });
    }
    case "locked":
      return neutral("Teams locked", state.fairness.seed ? "FAIRNESS CODE REVEALED" : "FINAL LOBBY");
  }
}

const STEP_WORD: Record<GGState["phase"], string> = {
  teams: "Teams",
  drum: "Drum",
  wheel: "Majors",
  vice: "Vices",
  recruits: "Recruits",
  bans: "Bans",
  draft: "Draft",
  assign: "Assign",
  locked: "Locked",
};

interface Readout {
  label: string;
  value: string;
  cells: HudCell[];
}

/** The two readouts beside the sun: which step this is, and how far along it is. */
export function readoutsFor(state: GGState, now: number, scratchTeam: string | null = null): { step: Readout; progress: Readout } {
  const index = PHASES.indexOf(state.phase);
  const step: Readout = {
    label: `Step ${String(index).padStart(2, "0")}`,
    value: STEP_WORD[state.phase],
    // Steps 1-8 (team setup is step 0): done ones lit, the current one pulsing.
    cells: PHASES.slice(1).map((_, k) => ({ color: "#22e5ff", on: k + 1 < index || (k + 1 === index && state.phase_done), now: k + 1 === index && !state.phase_done })),
  };

  // Results still being animated (a ball in the drum, a spinning reel, a card in flight,
  // a ticket being scratched) are left out, so the count never runs ahead of the show.
  const draw = state.last_draw;
  const since = draw ? now - draw.at : Infinity;
  const showing =
    (state.phase === "drum" && draw?.kind === "drum" && since >= 0 && since < DRUM_MS) ||
    (state.phase === "wheel" && draw?.kind === "wheel" && since >= 0 && since < LAND_END) ||
    (state.phase === "recruits" && draw?.kind === "recruit" && since >= 0 && since < FLIGHT.shown);
  const hidden = new Set<string>();
  if (showing && draw) {
    hidden.add(draw.team);
    if (draw.then) hidden.add(draw.then.team);
  }
  if (state.phase === "vice" && scratchTeam) hidden.add(scratchTeam);

  const n = state.teams.length;
  const ordered = state.order.length === n ? state.order.map((id) => teamById(state, id)!).filter(Boolean) : state.teams;
  // Cells run in the order teams act in this step (drum order where there is no turn order).
  const cellsBy = (on: (team: GGTeam) => boolean, live = true, teams: GGTeam[] = ordered): HudCell[] =>
    teams.map((team) => ({
      color: team.color,
      on: on(team) && !hidden.has(team.id),
      now: live && !state.phase_done && team.id === state.turn.team && !(on(team) && !hidden.has(team.id)),
    }));
  const count = (cells: HudCell[]) => cells.filter((cell) => cell.on).length;
  const ratio = (label: string, cells: HudCell[], of = n) => ({ label, value: `${count(cells)}/${of}`, cells });

  let progress: Readout;
  switch (state.phase) {
    case "teams":
      progress = ratio("Approved", cellsBy((team) => team.approved, false));
      break;
    case "drum": {
      const drawn = state.order.filter((id) => !hidden.has(id));
      const cells = Array.from({ length: n }, (_, k): HudCell => {
        const team = teamById(state, drawn[k] ?? null);
        return { color: team?.color ?? "#22e5ff", on: Boolean(team), now: !team && k === drawn.length && !state.phase_done };
      });
      progress = ratio("Balls out", cells);
      break;
    }
    case "wheel":
      progress = ratio("Majors", cellsBy((team) => Boolean(team.major)));
      break;
    case "vice":
      progress = ratio("Vices", cellsBy((team) => Boolean(team.vice)));
      break;
    case "recruits": {
      // A team's cell lights once both its recruits are in.
      const cells = cellsBy((team) => team.recruits.every(Boolean));
      // The card in flight (and the last one it hands over with it) isn't counted yet.
      const inFlight = showing ? 1 + (draw?.then ? 1 : 0) : 0;
      const drawn = state.teams.reduce((sum, team) => sum + team.recruits.filter(Boolean).length, 0) - inFlight;
      progress = { label: "Recruits", value: `${Math.max(0, drawn)}/${n * 2}`, cells };
      break;
    }
    case "bans":
      progress = ratio("Bans in", cellsBy((team) => team.ban !== null, true, strengthOrder(state.teams, state.config.majors)));
      break;
    case "draft": {
      const round = state.phase_done ? 3 : (state.turn.round ?? 1);
      const picked = state.teams.reduce((sum, team) => sum + team.picks.filter((tag) => tag !== null).length, 0);
      progress = {
        label: `Pick · Rd ${round}`,
        value: `${state.phase_done ? n * 3 : (state.turn.pick ?? Math.min(n * 3, picked + 1))}/${n * 3}`,
        cells: cellsBy(
          (team) => team.picks[round - 1] !== null,
          true,
          draftOrder(state.teams, state.config.majors)
            .filter((slot) => slot.round === round)
            .map((slot) => teamById(state, slot.team)!)
            .filter(Boolean),
        ),
      };
      break;
    }
    case "assign":
      progress = ratio("Placed", cellsBy((team) => [team.captain, team.vice, ...team.recruits].every((id) => id && team.assign[id]), false));
      break;
    case "locked":
      progress = ratio("Locked in", cellsBy(() => true, false));
      break;
  }
  return { step, progress };
}

export default function GGTopBar({
  state,
  now,
  right,
  onOpenLog,
  onOpenRules,
  onOpenMods,
  onOpenControls,
  scratchTeam = null,
  mode = "live",
  music,
}: {
  state: GGState;
  now: number;
  right?: ReactNode;
  onOpenLog: () => void;
  onOpenRules: () => void;
  onOpenMods: () => void;
  onOpenControls: (() => void) | null;
  /** The team whose vice-captain ticket is still being scratched. */
  scratchTeam?: string | null;
  /** "replay": the monitor says REPLAY instead of LIVE. */
  mode?: "live" | "replay";
  /** The music button (live room only). */
  music?: ReactNode;
}) {
  const banner = bannerFor(state, now, scratchTeam);
  const readouts = readoutsFor(state, now, scratchTeam);
  const [soundOn, setSoundOn] = useSoundSwitch();
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

  const accent = banner.color ?? "#ff2bd6";
  // On the map steps the monitor is short, so the map under it stays in view.
  const slim = state.phase === "bans" || state.phase === "draft" || state.phase === "assign";
  // The last ten seconds: the clock goes red and pulses, with a tick each second.
  const urgent = banner.left !== null && banner.left !== undefined && banner.left > 0 && banner.left <= 10 && !state.paused;
  const second = urgent ? Math.ceil(banner.left!) : null;
  useEffect(() => {
    if (second !== null) sound.tick(second <= 3 ? 1 : 0.6);
  }, [second]);
  // The countdown ring: the team's colour, amber in the last third, red in the last ten seconds.
  const timed = banner.timer !== null;
  const ringColor = !timed ? accent : banner.late || urgent ? "#ff3b5c" : banner.frac <= 1 / 3 ? "#ffb347" : accent;
  const clockColor = banner.late ? "#ffd23f" : urgent ? "#ff5a6e" : "#fff";
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
        <div className="gg-brush gg-brush-live" style={{ fontSize: 34, lineHeight: 1 }}>
          The Great Game
        </div>
        <div className="mt-[5px] flex items-center gap-2.5 pl-1">
          <span className="gg-year">2026</span>
          <span className="gg-road">Road to 56</span>
        </div>
      </div>

      {/* Middle: the notch (its slopes start right at the band's edge). */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{
          width: NOTCH_W,
          height: NOTCH_H,
          background: "linear-gradient(180deg,#2b2542,#1a1630)",
          clipPath: `polygon(0 0,100% 0,100% ${BAND_H}px,${NOTCH_W - NOTCH_SLOPE}px 100%,${NOTCH_SLOPE}px 100%,0 ${BAND_H}px)`,
        }}
      />

      {/* The neon edge: one glowing line along the band and around the notch. */}
      {width > 0 && (
        <>
          <svg className="gg-neon-glow absolute left-0 top-0 overflow-visible" width={width} height={NOTCH_H + 8} aria-hidden>
            <path d={path} fill="none" stroke="#ff2bd6" strokeOpacity=".7" strokeWidth="7" strokeLinejoin="round" />
          </svg>
          <svg className="absolute left-0 top-0 overflow-visible" width={width} height={NOTCH_H + 8} aria-hidden>
            <path d={path} fill="none" stroke="#ff2bd6" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        </>
      )}

      {/* Beside the sun: the step on the left, its progress on the right. */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: NOTCH_W, height: BAND_H }}>
        <GGHud
          side="left"
          tone="cyan"
          label={readouts.step.label}
          value={readouts.step.value}
          cells={readouts.step.cells}
          title={`Step ${PHASES.indexOf(state.phase)} of ${PHASES.length - 1}: ${PHASE_LABEL[state.phase]}`}
        />
        <GGHud side="right" tone="pink" label={readouts.progress.label} value={readouts.progress.value} cells={readouts.progress.cells} />
      </div>

      {/* The sun, with the countdown ring around it. */}
      <div className="absolute left-1/2 top-[7px] -translate-x-1/2" style={{ width: 72, height: 72 }}>
        <div className="gg-sun-halo" aria-hidden />
        <Sun size={72} frac={1} />
      </div>
      <svg
        className={`gg-ring absolute left-1/2 top-[1px] -translate-x-1/2 overflow-visible ${timed ? "" : "is-idle"} ${urgent ? "is-urgent" : ""}`}
        width={84}
        height={84}
        viewBox="0 0 84 84"
        aria-hidden
      >
        <circle cx="42" cy="42" r="39" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
        <circle
          className="gg-ring-arc"
          cx="42"
          cy="42"
          r="39"
          fill="none"
          stroke={ringColor}
          strokeWidth="5"
          strokeLinecap="round"
          transform="rotate(-90 42 42)"
          pathLength={100}
          strokeDasharray={timed ? "100 100" : "14 86"}
          strokeDashoffset={timed ? 100 * (1 - Math.max(0, Math.min(1, banner.frac))) : 0}
          style={{ filter: `drop-shadow(0 0 5px ${ringColor})` }}
        />
      </svg>

      {/* The broadcast monitor hanging under the sun: who acts now, the clock, what they're doing. */}
      <div
        className={`gg-crt absolute left-1/2 top-[84px] -translate-x-1/2 ${slim ? "is-slim" : ""}`}
        style={{ boxShadow: `0 0 22px ${hexA(accent, 0.45)}, inset 0 0 30px ${hexA(accent, 0.22)}`, borderColor: hexA(accent, 0.55) }}
        aria-live="polite"
      >
        <span className={`gg-crt-live ${state.paused ? "is-paused" : ""} ${mode === "replay" ? "is-replay" : ""}`}>{state.paused ? "PAUSED" : mode === "replay" ? "REPLAY" : "LIVE"}</span>
        {slim ? (
          <>
            <div className="flex items-center justify-center gap-2 px-3">
              {banner.flag && <Flag tag={banner.flag} w={26} h={17} title={nationName(state, banner.flag)} />}
              <span className="gg-crt-name truncate" style={{ color: banner.color ?? "#fff", fontSize: 22 }}>
                {banner.title}
              </span>
            </div>
            <div className="gg-crt-sub mt-0.5 flex items-center justify-center gap-1.5">
              {banner.timer && (
                <span className={`gg-digit ${urgent ? "gg-clock-urgent" : ""}`} style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0, color: clockColor }}>
                  {banner.late ? "0:00" : banner.timer}
                </span>
              )}
              <span className="truncate">{banner.sub}</span>
            </div>
          </>
        ) : (
          <>
            {banner.flag && (
              <div className="mt-1 flex justify-center">
                <Flag tag={banner.flag} w={40} h={26} title={nationName(state, banner.flag)} />
              </div>
            )}
            <div className="gg-crt-name truncate px-3" style={{ color: banner.color ?? "#fff", fontSize: 27, marginTop: banner.flag ? 4 : 6 }}>
              {banner.title}
            </div>
            {banner.timer && (
              <div className={`gg-digit ${urgent ? "gg-clock-urgent" : ""}`} style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.2, color: clockColor }}>
                {banner.late ? "0:00" : banner.timer}
              </div>
            )}
            <div className="gg-crt-sub">{banner.sub}</div>
          </>
        )}
      </div>

      {/* Right: only the space right of the notch. */}
      <div className="@container pointer-events-none absolute right-4 top-[18px] flex justify-end" style={{ left: `calc(50% + ${NOTCH_W / 2 + 18}px)` }}>
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="gg-btn px-2.5"
            onClick={() => setSoundOn(!soundOn)}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Sound on" : "Sound off"}
            title={soundOn ? "Sound is on (click to mute)" : "Sound is off (click to turn on)"}
          >
            {soundOn ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
          </button>
          {music}
          <button type="button" className="gg-btn" onClick={onOpenRules} title="How the draft works" aria-label="Rules">
            <BookOpen size={16} aria-hidden /> <span className="hidden @min-[560px]:inline">Rules</span>
          </button>
          <button type="button" className="gg-btn" onClick={onOpenMods} title="The mods for the event" aria-label="Mods">
            <Puzzle size={16} aria-hidden /> <span className="hidden @min-[560px]:inline">Mods</span>
          </button>
          <button type="button" className="gg-btn" onClick={onOpenLog} title="Everything that happened, in order" aria-label="Log">
            <ScrollText size={16} aria-hidden /> <span className="hidden @min-[460px]:inline">Log</span>
          </button>
          {onOpenControls && (
            <button type="button" className="gg-btn gg-btn-primary" onClick={onOpenControls} title="Organizer controls" aria-label="Controls">
              <SlidersHorizontal size={16} aria-hidden /> <span className="hidden @min-[400px]:inline">Controls</span>
            </button>
          )}
          {right}
        </div>
      </div>
    </header>
  );
}
