"use client";

import { Expand, Maximize2, Minus, Shrink, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { strengthOrder } from "@/lib/greatGame/engine";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import GGAirLottery, { DRUM_MS } from "./GGAirLottery";
import { useSoundSwitch, useSoundVolume } from "./ggSound";
import GGMajorReel, { REEL_MS } from "./GGMajorReel";
import GGStageScene, { StageAnchorContext, type StageAnchor } from "./GGStageScene";
import { Avatar, Flag, nationName, person, teamById } from "./ggUi";
import GGPatternScene from "./GGPatternScene";
import GGRecruitTable, { FLIGHT, flightMs, LAST_FLIGHT, RECRUIT_MS } from "./GGRecruitTable";
import GGTableScene from "./GGTableScene";
import GGScratchTicket, { type TicketState } from "./GGScratchTicket";
import { scratchHeld } from "./ggScratch";
import type { GGScratch, GGViewerInfo } from "./useGreatGame";

/**
 * The four randomizers (steps 1 to 4), over the map. The server picks the
 * result first and stamps it with a time; every page plays the same
 * animation from that time, so all ~40 viewers see the ball caught, the reel
 * land and the card turn together, and a page opened mid-spin joins it.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

export const ANIM_MS: Record<string, number> = { drum: DRUM_MS, wheel: REEL_MS, vice: 2200, recruit: RECRUIT_MS };
/** When the result shows beside the machine (share of the animation): the ball is in the tube, the reel has stopped. */
const SHOW_AT: Record<string, number> = { wheel: 3700 / REEL_MS };

/** 0..1 of the latest draw's animation for `kind`, or null when nothing is playing. */
function progressOf(state: GGState, kind: string, now: number): number | null {
  const draw = state.last_draw;
  if (!draw || draw.kind !== kind) return null;
  const t = (now - draw.at) / ANIM_MS[kind];
  return t >= 0 && t < 1 ? t : null;
}

/**
 * The stage each randomizer stands on: centred on the screen under the sun, a
 * neon-framed outrun scene with the step, one line saying what's being
 * decided, the progress, sound, full screen and minimise at the top, and the
 * one action (Draw, Spin…) centred at the bottom. Sized from the screen, so it
 * fits 1080p, 1440p and 4K. Full screen and minimise animate smoothly.
 */
function Shell({
  step,
  title,
  progress,
  name,
  children,
  action,
  wide = false,
  scene = "outrun",
}: {
  /** No team drawer beside it (the drum and the reel): the stage can use more of the screen. */
  wide?: boolean;
  /** The backdrop: the outrun road (steps 1 and 2), the retro pattern (step 3) or the card table (step 4). */
  scene?: "outrun" | "pattern" | "table";
  step: string;
  title: string;
  progress?: string;
  /** What "Show the …" brings back after minimising. */
  name: string;
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [full, setFull] = useState(false);
  const anchorRef = useRef<StageAnchor | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const restoring = useRef(false);
  const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Coming back from minimised: grow up from where the "Show" button was.
  useLayoutEffect(() => {
    if (hidden || !restoring.current) return;
    restoring.current = false;
    if (calm()) return;
    stageRef.current?.animate(
      [
        { opacity: 0, transform: "translateY(40%) scale(0.5)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    dimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320 });
  }, [hidden]);

  // Full screen and back: the stage glides from its old box to its new one.
  const toggleFull = () => {
    const stage = stageRef.current;
    if (!stage || calm()) {
      setFull((value) => !value);
      return;
    }
    const before = stage.getBoundingClientRect();
    flushSync(() => setFull((value) => !value));
    const after = stage.getBoundingClientRect();
    stage.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  };

  // Minimise: shrink away towards the "Show" button at the bottom.
  const minimise = () => {
    const stage = stageRef.current;
    if (!stage || calm()) {
      setHidden(true);
      return;
    }
    dimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" });
    const shrink = stage.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(40%) scale(0.5)" },
      ],
      { duration: 260, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" },
    );
    void shrink.finished.then(() => setHidden(true), () => setHidden(true));
  };

  if (hidden) {
    return (
      <button
        type="button"
        className="gg-btn gg-btn-primary gg-pop absolute bottom-6 left-1/2 z-[1050] -translate-x-1/2 gap-2"
        onClick={() => {
          restoring.current = true;
          setHidden(false);
        }}
      >
        <Maximize2 size={16} aria-hidden /> Show the {name}
      </button>
    );
  }
  return (
    <div className={`absolute inset-0 ${full ? "z-[1080]" : "z-[1050]"}`} style={{ top: 84 }}>
      <div ref={dimRef} className="gg-overlay-dim" style={full ? { background: "rgba(8,4,18,.85)" } : undefined} />
      <section ref={stageRef} className={`gg-stage absolute ${full ? "gg-stage-full" : `gg-stage-normal ${wide ? "gg-stage-wide" : ""}`}`}>
        <div className="gg-stage-inner flex flex-col">
          {scene === "pattern" ? <GGPatternScene /> : scene === "table" ? <GGTableScene /> : <GGStageScene anchorRef={anchorRef} />}
          {/* Above the scene's front layer (z-[1]). */}
          <div className="relative z-[2] flex items-start justify-between gap-4 px-7 pt-5">
            <div className="min-w-0">
              <div className="gg-eyebrow">{step}</div>
              <h2 className="gg-stage-title">{title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <SoundControl />
              {progress && (
                <div className="gg-progress" aria-label={`Progress ${progress}`}>
                  {progress}
                </div>
              )}
              <button
                type="button"
                className="gg-btn h-9 min-h-0 px-2.5"
                onClick={toggleFull}
                aria-pressed={full}
                aria-label={full ? "Leave full screen" : "Full screen"}
                title={full ? "Leave full screen" : "Full screen"}
              >
                {full ? <Shrink size={16} aria-hidden /> : <Expand size={16} aria-hidden />}
              </button>
              <button type="button" className="gg-btn h-9 min-h-0 px-2.5" onClick={minimise} aria-label="Minimise to see the map" title="Minimise to see the map">
                <Minus size={16} aria-hidden />
              </button>
            </div>
          </div>
          <StageAnchorContext.Provider value={anchorRef}>
            <div className="relative flex flex-1 flex-col justify-center px-7 pb-4 pt-1">{children}</div>
          </StageAnchorContext.Provider>
          {/* The one action, centred over the road at the bottom of the stage. */}
          <div className="absolute bottom-5 left-1/2 z-[2] flex -translate-x-1/2 justify-center">{action}</div>
        </div>
      </section>
    </div>
  );
}

/**
 * The team box on the stage's right (in place of the left drawer during the
 * drum and the reel): every team with its captain's picture, in order, the
 * newest result lit up in the team's colour.
 */
interface TeamRow {
  team: GGTeam;
  place: number | null;
  side: React.ReactNode;
  sub?: string;
  lit: boolean;
  dim: boolean;
  next?: boolean;
}

function TeamBox({ label, rows, state, footer }: { label: string; rows: TeamRow[]; state: GGState; footer?: React.ReactNode }) {
  return (
    <div className="gg-teambox">
      <div className="gg-teambox-label">{label}</div>
      <div className="grid gap-1">
        {rows.map((row) => {
          const captain = person(state, row.team.captain);
          return (
            <div
              key={`${row.team.id}:${row.lit ? "lit" : ""}`}
              className={`gg-teambox-row ${row.lit ? "is-lit gg-pop" : ""} ${row.dim ? "is-dim" : ""} ${row.next ? "is-next" : ""}`}
              style={{ ["--team" as string]: row.team.color }}
            >
              <span className="gg-teambox-place">{row.place ?? "·"}</span>
              <Avatar id={row.team.captain} name={captain?.name ?? row.team.name} color={row.team.color} size={30} />
              <span className="min-w-0 flex-1">
                <span className="gg-teambox-name">{row.team.name}</span>
                <span className="gg-teambox-sub">{row.sub ?? `Captain ${captain?.name ?? "?"}`}</span>
              </span>
              <span className="gg-teambox-side">{row.side}</span>
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

/**
 * Mute and volume for the effects, beside the machine: a streamer can turn
 * them down without losing them. The same switch as the top bar's speaker.
 */
function SoundControl() {
  const [on, setOn] = useSoundSwitch();
  const [volume, setVolume] = useSoundVolume();
  const Icon = !on || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="gg-btn h-9 min-h-0 px-2.5"
        onClick={() => setOn(!on)}
        aria-pressed={!on}
        aria-label={on ? "Mute sound effects" : "Turn sound effects on"}
        title={on ? "Mute sound effects" : "Turn sound effects on"}
      >
        <Icon size={16} aria-hidden />
      </button>
      <input
        id="gg-sound-volume"
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(volume * 100)}
        disabled={!on}
        onChange={(event) => setVolume(Number(event.target.value) / 100)}
        aria-label="Sound effects volume"
        className="w-20 accent-[#ff2bd6] disabled:opacity-40"
      />
      <span className="gg-digit ml-1 w-11 shrink-0 text-right text-xs" style={{ color: "var(--gg-fg-2)" }}>
        {on ? `${Math.round(volume * 100)}%` : "off"}
      </span>
    </span>
  );
}

function ActButton({ label, can, act, body, waiting }: { label: string; can: boolean; act: Act; body: Record<string, unknown>; waiting: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!can) {
    return (
      <span className="gg-waiting" role="status">
        {waiting}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-center gap-2">
      <button
        type="button"
        className="gg-act"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await act(body));
          setBusy(false);
        }}
      >
        {label}
      </button>
      {error && (
        <span role="alert" className="gg-waiting" style={{ color: "#ff9b9b" }}>
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * The machine's frame on steps 1 and 2: the stage's full width, the drum's
 * shape (1000 x 620) but no taller than the screen allows, so both steps
 * have the same stage size; the side boxes are placed inside it.
 */
const MACHINE_FRAME: React.CSSProperties = { aspectRatio: "1000 / 620", maxHeight: "calc(100vh - var(--gg-stage-room))" };

/* ---------- Step 1: the air lottery ---------- */
type Clock = () => number;

type Avatars = Record<string, string>;

function Drum({ state, viewer, act, now, clock, avatars }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number; clock: Clock; avatars: Avatars }) {
  const p = progressOf(state, "drum", now);
  const playing = p !== null;
  // The result shows once this page's ball has rolled into its slot.
  const [landedSeq, setLandedSeq] = useState<number | null>(null);
  const onLanded = useCallback((seq: number) => setLandedSeq(seq), []);
  const ballOut = playing ? landedSeq === state.last_draw?.seq : state.order.length > 0;
  const shown = playing && !ballOut ? state.order.length - 1 : state.order.length;
  return (
    <Shell
      wide
      step="Step 1 · Captain order"
      title={state.phase_done && ballOut ? "The order is set" : "Who rolls their major first?"}
      progress={`${shown} / ${state.teams.length}`}
      name="drum"
      action={
        <ActButton
          label={state.order.length === 0 ? "Draw the first ball" : "Draw the next ball"}
          can={viewer.organizer && !state.phase_done && !playing}
          act={act}
          body={{ kind: "drum.draw" }}
          waiting={state.phase_done && (ballOut || !playing) ? "Every ball is drawn." : playing ? (ballOut ? "Ball in. The next draw is ready in a moment." : "Drawing…") : "Tommy draws the next ball."}
        />
      }
    >
      <div className="relative w-full" style={MACHINE_FRAME}>
        <div className="absolute left-1/2 top-0 h-full -translate-x-1/2" style={{ aspectRatio: "1000 / 620" }}>
          <GGAirLottery state={state} clock={clock} avatars={avatars} onLanded={onLanded} />
        </div>
        {/* On the stage's right edge, level with the moon's centre. */}
        <div className="absolute right-0 z-[2] -translate-y-1/2" style={{ top: `${(250 / 620) * 100}%` }}>
          <TeamBox
            label={playing && !ballOut ? "Drawing…" : state.phase_done ? "The order" : "Roll order"}
            rows={[
              ...state.order.slice(0, shown).map((id, i) => {
                const team = teamById(state, id)!;
                return { team, place: i + 1, side: ordinal(i + 1), lit: ballOut && i === shown - 1, dim: false };
              }),
              ...state.teams
                .filter((team) => !state.order.slice(0, shown).includes(team.id))
                .map((team) => ({ team, place: null, side: "In the moon", lit: false, dim: true })),
            ]}
            state={state}
          />
        </div>
      </div>
    </Shell>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---------- Step 2: the major reel ---------- */
/**
 * The left of the stage during step 2: whose spin it is (or is next), the
 * slot their major lands in, then the major itself, locked in with a flash.
 */
function SpinCard({
  state,
  team,
  mode,
  major,
  spin,
  last,
}: {
  state: GGState;
  team: GGTeam;
  mode: "next" | "spinning" | "landed";
  major: string | null;
  spin: number;
  /** The last team, and the last major they take without a spin. */
  last?: { team: GGTeam; major: string } | null;
}) {
  const captain = person(state, team.captain);
  return (
    <div className={`gg-teambox gg-spincard ${mode === "spinning" ? "is-spinning" : ""} ${mode === "landed" ? "is-landed" : ""}`} style={{ ["--team" as string]: team.color }}>
      <div className="gg-teambox-label">{mode === "spinning" ? "Now spinning" : mode === "landed" ? "Locked in" : "Spins next"}</div>
      <div className="flex items-center gap-3 px-1">
        <Avatar id={team.captain} name={captain?.name ?? team.name} color={team.color} size={54} />
        <span className="min-w-0">
          <span className="gg-spincard-team">{team.name}</span>
          <span className="gg-teambox-sub">Captain {captain?.name ?? "?"}</span>
        </span>
      </div>
      <div className="gg-spincard-slot">
        {mode === "landed" && major ? (
          <span key={major} className="gg-spincard-result">
            <Flag tag={major} w={78} h={50} title={nationName(state, major)} />
            {nationName(state, major)}
          </span>
        ) : (
          <span className="gg-spincard-q" aria-hidden>
            ?
          </span>
        )}
      </div>
      {mode === "landed" && last?.major ? (
        <div className="gg-spincard-last" style={{ ["--team" as string]: last.team.color }}>
          <Flag tag={last.major} w={30} h={19} title={nationName(state, last.major)} />
          <span>
            <b>{last.team.name}</b> take {nationName(state, last.major)}, the last one
          </span>
        </div>
      ) : (
        <div className="gg-spincard-foot">
          {last ? "Last spin · the final major goes to " + last.team.name : `Spin ${spin} of ${state.teams.length}`}
        </div>
      )}
    </div>
  );
}

function Majors({ state, viewer, act, now, clock }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number; clock: Clock }) {
  const majors = state.config.majors;
  const owner = (tag: string) => state.teams.find((team) => team.major === tag) ?? null;
  const p = progressOf(state, "wheel", now);
  const draw = state.last_draw?.kind === "wheel" ? state.last_draw : null;
  const landed = Boolean(draw) && (p === null || p >= SHOW_AT.wheel);
  const resultTeam = draw ? teamById(state, draw.team) : null;
  const spinning = teamById(state, state.turn.team);
  const rolled = state.teams.filter((t) => t.major).length;
  const rollingNow = p !== null && !landed;
  // The last major, handed to the last team by this spin.
  const handOver = draw?.then ? { team: teamById(state, draw.then.team), major: draw.then.value } : null;
  const last = handOver?.team ? { team: handOver.team, major: handOver.major } : null;
  // Before the second-to-last spin, who will be left with the last major.
  const waiting = state.teams.filter((t) => !t.major);
  const lastBefore = spinning && waiting.length === 2 ? waiting.find((t) => t.id !== spinning.id) ?? null : null;
  // Still on the reel: untaken majors, and during a spin its results until it lands.
  const onReel = majors.filter((tag) => !owner(tag) || (rollingNow && (draw?.value === tag || handOver?.major === tag)));
  // The card on the left: the spin playing out (and its result for a moment after), else who spins next.
  const card =
    // The final spin (with the last major handed over) stays up once everything is drawn.
    (p !== null || (!spinning && draw?.then)) && resultTeam && draw
      ? { team: resultTeam, mode: landed ? ("landed" as const) : ("spinning" as const), major: draw.value, spin: rolled - (last ? 1 : 0), last }
      : spinning
        ? { team: spinning, mode: "next" as const, major: null, spin: rolled + 1, last: lastBefore ? { team: lastBefore, major: "" } : null }
        : null;
  return (
    <Shell
      wide
      step="Step 2 · Majors"
      title={p !== null && resultTeam && draw ? (landed ? `${resultTeam.name} get ${nationName(state, draw.value)}` : `Spinning for ${resultTeam.name}`) : spinning ? `${spinning.name} spins next` : "Every major is drawn"}
      progress={`${rolled - (rollingNow ? (handOver ? 2 : 1) : 0)} / ${state.teams.length}`}
      name="reel"
      action={
        <ActButton
          label={`Spin for ${spinning?.name ?? ""}`}
          can={viewer.organizer && Boolean(spinning) && p === null}
          act={act}
          body={{ kind: "wheel.spin" }}
          waiting={p !== null ? (landed ? (spinning ? `Next up: ${spinning.name}.` : "All seven majors are taken.") : "Spinning…") : spinning ? `Tommy spins for ${spinning.name}.` : "All seven majors are taken."}
        />
      }
    >
      {/* The same frame as the drum: the reel stands at the road's end, where the moon is on step 1. */}
      <div className="relative w-full" style={MACHINE_FRAME}>
        <div className="absolute left-1/2 top-0 h-[70%] -translate-x-1/2" style={{ aspectRatio: "520 / 440" }}>
          <GGMajorReel state={state} clock={clock} />
        </div>
      {/* Both boxes level with the cabinet's centre. */}
      {card && (
        <div className="absolute left-0 z-[2] top-[35%] -translate-y-1/2">
          <SpinCard key={`${card.team.id}:${card.mode}`} state={state} team={card.team} mode={card.mode} major={card.major} spin={card.spin} last={card.last} />
        </div>
      )}
      <div className="absolute right-0 z-[2] top-[35%] -translate-y-1/2">
        <TeamBox
          label="Majors"
          rows={state.order
            .map((id) => teamById(state, id))
            .filter((team): team is GGTeam => Boolean(team))
            .map((team, i) => {
              const handed = handOver?.team?.id === team.id;
              const rolling = rollingNow && (draw?.team === team.id || handed);
              const major = rolling ? null : team.major;
              const fresh = landed && p !== null && (draw?.team === team.id || handed);
              return {
                team,
                place: i + 1,
                side: major ? (
                  <span key={fresh ? "fresh" : "flag"} className={fresh ? `gg-flag-in ${handed ? "gg-flag-in-late" : ""}` : undefined}>
                    <Flag tag={major} w={30} h={19} title={nationName(state, major)} />
                  </span>
                ) : rolling ? (
                  handed ? "Last one" : "Spinning…"
                ) : lastBefore?.id === team.id ? (
                  "Last one"
                ) : spinning?.id === team.id ? (
                  "Spins next"
                ) : (
                  ""
                ),
                sub: major ? nationName(state, major) : undefined,
                lit: fresh,
                dim: !major && !rolling && spinning?.id !== team.id,
                next: spinning?.id === team.id && p === null,
              };
            })}
          state={state}
          footer={
            onReel.length > 0 && (
              <>
                <div className="gg-label mb-1.5 mt-3">Still on the reel</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {onReel.map((tag) => (
                    <span key={tag} className="gg-onreel">
                      <Flag tag={tag} w={26} h={17} title={nationName(state, tag)} />
                      <span className="truncate">{nationName(state, tag)}</span>
                    </span>
                  ))}
                </div>
              </>
            )
          }
        />
      </div>
      </div>
    </Shell>
  );
}

/* ---------- Step 3: hand-scratched vice-captain tickets ---------- */
const EMPTY_LINES: number[][] = [];

function Vice({
  state,
  viewer,
  act,
  now,
  scratch,
  sendScratch,
}: {
  state: GGState;
  viewer: GGViewerInfo;
  act: Act;
  now: number;
  scratch: GGScratch | null;
  sendScratch: (seq: number, line: number[] | null, done?: boolean) => void;
}) {
  const order = strengthOrder(state.teams, state.config.majors);
  const draw = state.last_draw?.kind === "vice" ? state.last_draw : null;
  // Scratched clear on this page (before the echo comes back).
  const [doneHere, setDoneHere] = useState<number | null>(null);
  const held = scratchHeld(state, scratch, now, draw !== null && doneHere === draw.seq);
  const turn = held ? null : teamById(state, state.turn.team);
  const shownVice = (team: GGTeam) => (held && held.team === team.id ? null : team.vice);
  const revealedCount = state.teams.filter((team) => shownVice(team)).length;
  const canFor = (team: GGTeam) => viewer.organizer || viewer.captainOf === team.id;
  const drawing = useRef<string | null>(null);
  // The creators not on a team yet (the one being scratched stays in until it's clear).
  const placed = new Set(state.teams.map((team) => shownVice(team)).filter(Boolean));
  const pool = state.config.people.filter((entry) => entry.role === "vice" && !placed.has(entry.id));
  const heldTeam = held ? teamById(state, held.team) : null;
  const ticketOf = (team: GGTeam): TicketState =>
    shownVice(team) ? "revealed" : held?.team === team.id ? "scratching" : turn?.id === team.id ? "ready" : "waiting";
  const onLine = useCallback((seq: number, line: number[]) => sendScratch(seq, line), [sendScratch]);
  const onDone = useCallback(
    (seq: number) => {
      setDoneHere(seq);
      sendScratch(seq, null, true);
    },
    [sendScratch],
  );
  const ticket = (team: GGTeam, i: number) => {
    const mode = ticketOf(team);
    const captain = person(state, team.captain);
    const who = mode === "revealed" ? person(state, team.vice) : mode === "scratching" && held ? person(state, held.value) : null;
    return (
      <GGScratchTicket
        key={team.id}
        team={team}
        captain={captain?.name ?? "The captain"}
        index={i}
        total={order.length}
        person={who}
        state={mode}
        canScratch={(mode === "ready" || mode === "scratching") && canFor(team)}
        lines={mode === "scratching" && held && scratch?.seq === held.seq ? scratch.lines : EMPTY_LINES}
        seq={mode === "scratching" && held ? held.seq : null}
        onFirstTouch={() => {
          if (drawing.current === team.id) return;
          drawing.current = team.id;
          void act({ kind: "vice.draw" }).then((error) => {
            if (error) drawing.current = null;
          });
        }}
        onLine={onLine}
        onDone={onDone}
      />
    );
  };
  const nextCaptain = turn ? (person(state, turn.captain)?.name ?? "The captain") : null;
  const heldCaptain = heldTeam ? (person(state, heldTeam.captain)?.name ?? "The captain") : null;
  return (
    <Shell
      wide
      scene="pattern"
      step="Step 3 · Vice-captains"
      title={heldTeam ? `Scratching for ${heldTeam.name}` : turn ? `${turn.name} scratch next` : "Every ticket is scratched"}
      progress={`${revealedCount} / ${state.teams.length}`}
      name="tickets"
      action={
        <span className="gg-waiting" role="status">
          {heldTeam
            ? canFor(heldTeam)
              ? "Keep scratching, or double-click to shred it"
              : `${heldCaptain} is scratching…`
            : turn
              ? canFor(turn)
                ? "Scratch your ticket with the mouse"
                : `${nextCaptain} scratches next`
              : "Every vice-captain is revealed."}
        </span>
      }
    >
      <div className="relative w-full" style={MACHINE_FRAME}>
        {/* The seven tickets as a pyramid, in scratch order: three over four. */}
        <div className="absolute left-1/2 top-[1%] flex h-[86%] -translate-x-1/2 flex-col items-center justify-center gap-4">
          <div className="flex h-[calc(50%-8px)] justify-center gap-4">{order.slice(0, 3).map((team, i) => ticket(team, i))}</div>
          <div className="flex h-[calc(50%-8px)] justify-center gap-4">{order.slice(3).map((team, i) => ticket(team, i + 3))}</div>
        </div>
        {/* Left: who is still in the pool. */}
        <div className="absolute left-0 z-[2] top-[43%] -translate-y-1/2">
          <div className="gg-teambox" style={{ width: "clamp(210px, 16vw, 270px)" }}>
            <div className="gg-teambox-label">Still in the pool</div>
            <div className="grid gap-1">
              {pool.map((entry) => (
                <div key={entry.id} className="gg-pool-row">
                  <Avatar id={entry.id} name={entry.name} color="#b46bff" size={26} />
                  <span className="truncate">{entry.name}</span>
                </div>
              ))}
              {pool.length === 0 && <div className="gg-teambox-sub px-2">Nobody left.</div>}
            </div>
          </div>
        </div>
        {/* Right: every team's vice-captain, in scratch order. */}
        <div className="absolute right-0 z-[2] top-[43%] -translate-y-1/2">
          <TeamBox
            label="Vice-captains"
            rows={order.map((team, i) => {
              const vice = person(state, shownVice(team));
              const mode = ticketOf(team);
              return {
                team,
                place: i + 1,
                side: mode === "scratching" ? "Scratching…" : mode === "ready" ? "Scratches next" : "",
                sub: vice ? `Vice: ${vice.name}` : undefined,
                lit: Boolean(vice) && draw?.team === team.id && doneHere === draw.seq,
                dim: mode === "waiting",
                next: mode === "ready",
              };
            })}
            state={state}
          />
        </div>
      </div>
    </Shell>
  );
}

/* ---------- Step 4: pick a card, it turns over ---------- */
function Recruits({
  state,
  viewer,
  act,
  now,
  hover,
  sendHover,
}: {
  state: GGState;
  viewer: GGViewerInfo;
  act: Act;
  now: number;
  hover: { team: string; card: number } | null;
  sendHover: (card: number | null) => void;
}) {
  const order = strengthOrder(state.teams, state.config.majors);
  const draw = state.last_draw?.kind === "recruit" ? state.last_draw : null;
  const elapsed = draw ? now - draw.at : Infinity;
  const flying = draw !== null && elapsed < flightMs(draw);
  // Who is still a secret (not turned over yet) and who hasn't landed in a slot yet.
  const secret = new Set<string>();
  const hidden = new Set<string>();
  if (draw) {
    if (elapsed < FLIGHT.shown) secret.add(draw.value);
    if (elapsed < FLIGHT.landed) hidden.add(draw.value);
    if (draw.then) {
      if (elapsed < LAST_FLIGHT.shown) secret.add(draw.then.value);
      if (elapsed < LAST_FLIGHT.landed) hidden.add(draw.then.value);
    }
  }
  const placed = new Set(state.teams.flatMap((team) => team.recruits).filter((id): id is string => Boolean(id)));
  const recruits = state.config.people.filter((entry) => entry.role === "recruit");
  const pool = recruits.filter((entry) => !placed.has(entry.id) || secret.has(entry.id));
  const fanCount = recruits.filter((entry) => !placed.has(entry.id) || hidden.has(entry.id)).length;
  const turn = flying ? null : teamById(state, state.turn.team);
  const canPick = Boolean(turn) && (viewer.organizer || viewer.captainOf === turn?.id) && !flying;
  const flipTeam = draw && elapsed < FLIGHT.shown ? teamById(state, draw.team) : null;
  const landedTeam = draw && flying && elapsed >= FLIGHT.shown ? teamById(state, draw.team) : null;
  const shownCount = [...placed].filter((id) => !secret.has(id)).length;
  const picking = useRef(false);
  const captainName = (team: GGTeam | null) => (team ? (person(state, team.captain)?.name ?? "The captain") : "");
  return (
    <Shell
      wide
      scene="table"
      step="Step 4 · Recruits"
      title={
        draw?.then && flying && elapsed >= LAST_FLIGHT.start
          ? elapsed >= LAST_FLIGHT.shown
            ? `${teamById(state, draw.then.team)?.name ?? "The last team"} take ${person(state, draw.then.value)?.name ?? "?"}, the last one`
            : `The last card goes to ${teamById(state, draw.then.team)?.name ?? "the last team"}`
          : flipTeam
          ? `Turning a card for ${flipTeam.name}`
          : landedTeam && draw
            ? `${landedTeam.name} get ${person(state, draw.value)?.name ?? "?"}`
            : turn
              ? `${turn.name} pick a card`
              : "Every recruit is drawn"
      }
      progress={`${shownCount} / ${state.teams.length * 2}`}
      name="card table"
      action={
        <span className="gg-waiting" role="status">
          {flying ? "Turning it over…" : turn ? (canPick ? "Pick any card from the deck" : `${captainName(turn)} is picking a card…`) : "Every recruit has a team."}
        </span>
      }
    >
      <div className="relative w-full" style={MACHINE_FRAME}>
        <GGRecruitTable
          state={state}
          order={order}
          now={now}
          hidden={hidden}
          fanCount={fanCount}
          pickedCard={draw && flying ? Math.min(Math.max(0, draw.card ?? Math.floor(fanCount / 2)), Math.max(0, fanCount - 1)) : null}
          canPick={canPick}
          hover={hover && turn && hover.team === turn.id ? hover.card : null}
          onHover={sendHover}
          onPick={(card) => {
            if (picking.current) return;
            picking.current = true;
            void act({ kind: "recruit.draw", card }).finally(() => {
              picking.current = false;
            });
          }}
        />
        {/* Left: who is still in the deck. */}
        <div className="absolute left-0 z-[2] top-[40%] -translate-y-1/2">
          <div className="gg-teambox" style={{ width: "clamp(250px, 19vw, 330px)" }}>
            <div className="gg-teambox-label">Still in the deck · {pool.length}</div>
            <div className="grid grid-cols-2 gap-1">
              {pool.map((entry) => (
                <div key={entry.id} className="gg-pool-row is-small">
                  <Avatar id={entry.id} name={entry.name} color="#22e5ff" size={20} />
                  <span className="truncate">{entry.name}</span>
                </div>
              ))}
              {pool.length === 0 && <div className="gg-teambox-sub px-2">The deck is empty.</div>}
            </div>
          </div>
        </div>
        {/* Right: every team's recruits so far. */}
        <div className="absolute right-0 z-[2] top-[40%] -translate-y-1/2">
          <TeamBox
            label="Recruits"
            rows={order.map((team, i) => {
              const names = team.recruits.map((id) => (id && !secret.has(id) ? person(state, id)?.name : null)).filter(Boolean);
              const flippingHere = Boolean(flipTeam && flipTeam.id === team.id) || Boolean(draw?.then && draw.then.team === team.id && flying && elapsed < LAST_FLIGHT.shown);
              return {
                team,
                place: i + 1,
                side: flippingHere ? "Turning…" : turn?.id === team.id ? "Picks next" : `${names.length}/2`,
                sub: names.length ? names.join(" · ") : undefined,
                lit: Boolean(landedTeam && landedTeam.id === team.id),
                dim: Boolean(turn) && !flippingHere && turn?.id !== team.id && names.length === 2,
                next: turn?.id === team.id,
              };
            })}
            state={state}
          />
        </div>
      </div>
    </Shell>
  );
}

export default function GGRandomizers({
  state,
  viewer,
  act,
  now,
  clock,
  avatars,
  scratch,
  sendScratch,
  hover,
  sendHover,
}: {
  state: GGState;
  viewer: GGViewerInfo;
  act: Act;
  now: number;
  clock: Clock;
  avatars: Avatars;
  scratch: GGScratch | null;
  sendScratch: (seq: number, line: number[] | null, done?: boolean) => void;
  hover: { team: string; card: number } | null;
  sendHover: (card: number | null) => void;
}) {
  switch (state.phase) {
    case "drum":
      return <Drum state={state} viewer={viewer} act={act} now={now} clock={clock} avatars={avatars} />;
    case "wheel":
      return <Majors state={state} viewer={viewer} act={act} now={now} clock={clock} />;
    case "vice":
      return <Vice state={state} viewer={viewer} act={act} now={now} scratch={scratch} sendScratch={sendScratch} />;
    case "recruits":
      return <Recruits state={state} viewer={viewer} act={act} now={now} hover={hover} sendHover={sendHover} />;
    default:
      return null;
  }
}

export { strengthOrder };
