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
import type { GGViewerInfo } from "./useGreatGame";

/**
 * The four randomizers (steps 1 to 4), over the map. The server picks the
 * result first and stamps it with a time; every page plays the same
 * animation from that time, so all ~40 viewers see the ball caught, the reel
 * land and the card turn together, and a page opened mid-spin joins it.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

export const ANIM_MS: Record<string, number> = { drum: DRUM_MS, wheel: REEL_MS, vice: 2200, recruit: 1300 };
/** When the result shows beside the machine (share of the animation): the ball is in the tube, the reel has stopped. */
const SHOW_AT: Record<string, number> = { wheel: 3700 / REEL_MS };

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

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
}: {
  /** No team drawer beside it (the drum and the reel): the stage can use more of the screen. */
  wide?: boolean;
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
          <GGStageScene anchorRef={anchorRef} />
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
      <div className="mx-auto w-full" style={{ maxWidth: "calc((100vh - var(--gg-stage-room)) * 1000 / 620)" }}>
        <GGAirLottery state={state} clock={clock} avatars={avatars} onLanded={onLanded} />
        {/* Pinned to the stage's right edge (the content area), clear of the machine. */}
        <div className="absolute right-7 z-[2] top-[46%] -translate-y-1/2">
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
function SpinCard({ state, team, mode, major, spin }: { state: GGState; team: GGTeam; mode: "next" | "spinning" | "landed"; major: string | null; spin: number }) {
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
      <div className="gg-spincard-foot">
        Spin {spin} of {state.teams.length}
      </div>
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
  // Still on the reel: untaken majors, and during a spin its own result until it lands.
  const onReel = majors.filter((tag) => !owner(tag) || (p !== null && !landed && draw?.value === tag));
  // The card on the left: the spin playing out (and its result for a moment after), else who spins next.
  const card =
    p !== null && resultTeam && draw
      ? { team: resultTeam, mode: landed ? ("landed" as const) : ("spinning" as const), major: draw.value, spin: rolled }
      : spinning
        ? { team: spinning, mode: "next" as const, major: null, spin: rolled + 1 }
        : null;
  return (
    <Shell
      wide
      step="Step 2 · Majors"
      title={p !== null && resultTeam && draw ? (landed ? `${resultTeam.name} get ${nationName(state, draw.value)}` : `Spinning for ${resultTeam.name}`) : spinning ? `${spinning.name} spins next` : "Every major is drawn"}
      progress={`${rolled - (p !== null && !landed ? 1 : 0)} / ${state.teams.length}`}
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
      <div className="relative mx-auto w-full" style={{ maxWidth: "calc((100vh - var(--gg-stage-room)) * 1000 / 620)", aspectRatio: "1000 / 620" }}>
        <div className="absolute left-1/2 top-0 h-[70%] -translate-x-1/2" style={{ aspectRatio: "520 / 440" }}>
          <GGMajorReel state={state} clock={clock} />
        </div>
      </div>
      {card && (
        <div className="absolute left-7 z-[2] top-[46%] -translate-y-1/2">
          <SpinCard key={`${card.team.id}:${card.mode}`} state={state} team={card.team} mode={card.mode} major={card.major} spin={card.spin} />
        </div>
      )}
      <div className="absolute right-7 z-[2] top-[46%] -translate-y-1/2">
        <TeamBox
          label="Majors"
          rows={state.order
            .map((id) => teamById(state, id))
            .filter((team): team is GGTeam => Boolean(team))
            .map((team, i) => {
              const rolling = p !== null && !landed && draw?.team === team.id;
              const major = rolling ? null : team.major;
              const fresh = landed && p !== null && draw?.team === team.id;
              return {
                team,
                place: i + 1,
                side: major ? (
                  <span key={fresh ? "fresh" : "flag"} className={fresh ? "gg-flag-in" : undefined}>
                    <Flag tag={major} w={30} h={19} title={nationName(state, major)} />
                  </span>
                ) : rolling ? (
                  "Spinning…"
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
    </Shell>
  );
}

/* ---------- Steps 3 and 4: cards ---------- */
function drawsOf(state: GGState, kind: "vice.draw" | "recruit.draw") {
  // Results in the order they were drawn (fixes that cleared a slot drop out).
  const placed = new Set(state.teams.flatMap((team) => (kind === "vice.draw" ? [team.vice] : team.recruits)).filter(Boolean));
  const undone = new Set(state.log.filter((a) => a.kind === "undo").map((a) => Number(a.payload.seq)));
  return state.log
    .filter((a) => a.kind === kind && !undone.has(a.seq) && placed.has(String(a.payload.person)))
    .map((a) => ({ seq: a.seq, at: a.at, team: String(a.payload.team), person: String(a.payload.person) }));
}

function Cards({ state, viewer, act, now, kind }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number; kind: "vice" | "recruit" }) {
  const total = kind === "vice" ? state.teams.length : state.teams.length * 2;
  const draws = drawsOf(state, kind === "vice" ? "vice.draw" : "recruit.draw");
  const p = progressOf(state, kind, now);
  const turn = teamById(state, state.turn.team);
  const can = Boolean(turn) && (viewer.organizer || viewer.captainOf === turn?.id) && p === null;
  const title = kind === "vice" ? "Vice-captains" : "Recruits";
  const cardW = kind === "vice" ? 104 : 92;
  const cardH = kind === "vice" ? 150 : 124;
  return (
    <Shell
      step={kind === "vice" ? "Step 3 · Vice-captains" : "Step 4 · Recruits"}
      title={kind === "vice" ? "One content creator per team" : "Two recruits per team, one per round"}
      progress={`${draws.length} / ${total}`}
      name={title.toLowerCase()}
      action={
        <ActButton
          label={kind === "vice" ? `Scratch for ${turn?.name ?? ""}` : `Flip for ${turn?.name ?? ""}`}
          can={can}
          act={act}
          body={{ kind: kind === "vice" ? "vice.draw" : "recruit.draw" }}
          waiting={p !== null ? "Revealing…" : turn ? `${turn.name}'s captain ${kind === "vice" ? "scratches" : "flips"} next.` : "Every card is revealed."}
        />
      }
    >
      <div className="flex flex-wrap justify-center gap-3 py-4">
        {Array.from({ length: total }, (_, i) => {
          const draw = draws[i];
          const style = { width: cardW, height: cardH };
          if (!draw) {
            const next = i === draws.length && turn;
            return kind === "vice" ? (
              <div
                key={i}
                className={`gg-disp flex items-center justify-center rounded-[10px] text-lg font-black tracking-widest ${next ? "gg-pulse" : ""}`}
                style={{ ...style, background: "repeating-linear-gradient(135deg,#d9d5e6 0 6px,#b9b4c9 6px 12px)", color: "#5d5873" }}
              >
                Scratch
              </div>
            ) : (
              <div
                key={i}
                className={`rounded-[10px] ${next ? "gg-pulse" : ""}`}
                style={{
                  ...style,
                  background: "radial-gradient(circle at 50% 46%,#ffb347 0 18px,#ff5e7e 18px 22px,transparent 22px),linear-gradient(180deg,#2a0f45,#120a24)",
                  border: "2px solid #ff2bd6",
                  boxShadow: "inset 0 0 0 4px #120a24",
                }}
              />
            );
          }
          const team = teamById(state, draw.team) as GGTeam;
          const who = person(state, draw.person);
          const isNewest = i === draws.length - 1 && p !== null;
          const reveal = isNewest ? ease(p!) : 1;
          return (
            <div key={i} className="relative overflow-hidden rounded-[10px]" style={{ ...style, perspective: 600 }}>
              <div
                className="flex h-full flex-col items-center justify-center gap-1.5 rounded-[10px] text-center"
                style={{
                  background: "linear-gradient(160deg,#2a1d4d,#160d2e)",
                  border: `2px solid ${team.color}`,
                  transform: kind === "recruit" && isNewest ? `rotateY(${(1 - reveal) * 180}deg)` : undefined,
                }}
              >
                <Avatar id={who?.id} name={who?.name ?? "?"} color={team.color} size={40} />
                <div className="px-1 text-[12.5px] font-bold leading-tight">{who?.name ?? "?"}</div>
                <div className="text-[10.5px] font-bold" style={{ color: team.color }}>
                  {team.name}
                </div>
                {who?.filler && <div className="text-[10px]" style={{ color: "var(--gg-pending)" }}>to be named</div>}
              </div>
              {kind === "vice" && isNewest && (
                <div
                  className="absolute inset-0"
                  style={{
                    background: "repeating-linear-gradient(135deg,#d9d5e6 0 6px,#b9b4c9 6px 12px)",
                    clipPath: `inset(${reveal * 100}% 0 0 0)`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

export default function GGRandomizers({ state, viewer, act, now, clock, avatars }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number; clock: Clock; avatars: Avatars }) {
  switch (state.phase) {
    case "drum":
      return <Drum state={state} viewer={viewer} act={act} now={now} clock={clock} avatars={avatars} />;
    case "wheel":
      return <Majors state={state} viewer={viewer} act={act} now={now} clock={clock} />;
    case "vice":
      return <Cards key="vice" state={state} viewer={viewer} act={act} now={now} kind="vice" />;
    case "recruits":
      return <Cards key="recruits" state={state} viewer={viewer} act={act} now={now} kind="recruit" />;
    default:
      return null;
  }
}

export { strengthOrder };
