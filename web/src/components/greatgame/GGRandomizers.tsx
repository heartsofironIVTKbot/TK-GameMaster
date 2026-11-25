"use client";

import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useState } from "react";
import { strengthOrder } from "@/lib/greatGame/engine";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import GGAirLottery, { DRUM_MS } from "./GGAirLottery";
import { useSoundSwitch, useSoundVolume } from "./ggSound";
import GGMajorReel, { REEL_MS } from "./GGMajorReel";
import GGStageScene from "./GGStageScene";
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
 * The stage each randomizer stands on: a neon-framed panel over the map with
 * the step, one line saying what's being decided, and a progress counter.
 */
function Shell({
  step,
  title,
  progress,
  name,
  children,
  footer,
}: {
  step: string;
  title: string;
  progress?: string;
  /** What "Show the …" brings back after hiding. */
  name: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) {
    return (
      <button type="button" className="gg-btn gg-btn-primary absolute bottom-6 left-1/2 z-[1050] -translate-x-1/2" onClick={() => setHidden(false)}>
        Show the {name}
      </button>
    );
  }
  return (
    <div className="absolute inset-0 z-[1050]" style={{ top: 84 }}>
      <div className="gg-overlay-dim" />
      <section className="gg-stage absolute left-1/2 top-[150px] w-[min(960px,calc(100%-32px))] -translate-x-1/2 lg:left-[calc(50%+170px)] lg:w-[min(960px,calc(100%-380px))]">
        <div className="gg-stage-inner">
          <GGStageScene />
          <div className="relative flex items-end justify-between gap-4 px-7 pt-5">
            <div className="min-w-0">
              <div className="gg-eyebrow">{step}</div>
              <h2 className="gg-stage-title">{title}</h2>
            </div>
            {progress && (
              <div className="gg-progress" aria-label={`Progress ${progress}`}>
                {progress}
              </div>
            )}
          </div>
          <div className="relative px-7 pb-3 pt-2">{children}</div>
          <div className="gg-stage-foot relative flex flex-wrap items-center justify-between gap-3 px-7 py-3.5">
            {footer}
            <span className="flex flex-wrap items-center gap-3">
              <SoundControl />
              <button type="button" className="gg-btn" onClick={() => setHidden(true)}>
                Hide to see the map
              </button>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

/** The result beside a machine: a card glowing in the team's colour. */
function ResultCard({ color, kicker, title, sub, media }: { color: string; kicker: string; title: string; sub: React.ReactNode; media: React.ReactNode }) {
  return (
    <div className="gg-result gg-pop" style={{ ["--team" as string]: color }}>
      <div className="gg-result-kicker">{kicker}</div>
      <div className="my-3 flex justify-center">{media}</div>
      <div className="gg-result-title">{title}</div>
      <div className="gg-result-sub">{sub}</div>
    </div>
  );
}

function ResultWaiting({ children }: { children: React.ReactNode }) {
  return <div className="gg-result gg-result-waiting">{children}</div>;
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
        className="w-24 accent-[#ff2bd6] disabled:opacity-40"
      />
      <span className="gg-digit w-9 text-right text-xs" style={{ color: "var(--gg-fg-2)" }}>
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
      <span className="text-[13px]" style={{ color: "var(--gg-fg-2)" }}>
        {waiting}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        className="gg-btn gg-btn-primary gg-btn-big px-6"
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
        <span role="alert" className="text-xs" style={{ color: "#ff9b9b" }}>
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
  const newest = teamById(state, state.order.at(-1));
  const captain = newest ? person(state, newest.captain) : null;
  return (
    <Shell
      step="Step 1 · Captain order"
      title={state.phase_done && ballOut ? "The order is set" : "Who rolls their major first?"}
      progress={`${shown} / ${state.teams.length}`}
      name="drum"
      footer={
        <ActButton
          label={state.order.length === 0 ? "Draw the first ball" : "Draw the next ball"}
          can={viewer.organizer && !state.phase_done && !playing}
          act={act}
          body={{ kind: "drum.draw" }}
          waiting={state.phase_done && (ballOut || !playing) ? "Every ball is drawn." : playing ? (ballOut ? "Ball in. The next draw is ready in a moment." : "Drawing…") : "Tommy draws the next ball."}
        />
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-5">
        <div className="min-w-0 max-w-[640px] flex-[1_1_500px]">
          <GGAirLottery state={state} clock={clock} avatars={avatars} onLanded={onLanded} />
        </div>
        <div className="w-[230px]">
          {newest && ballOut ? (
            <ResultCard
              key={state.order.length}
              color={newest.color}
              kicker={`${ordinal(state.order.length)} to roll`}
              title={newest.name}
              sub={`Captain ${captain?.name ?? "?"}`}
              media={<Avatar id={newest.captain} name={captain?.name ?? newest.name} color={newest.color} size={104} />}
            />
          ) : (
            <ResultWaiting>
              {playing ? (
                <>
                  <span className="gg-result-kicker" style={{ color: "var(--gg-cyan)" }}>
                    Drawing
                  </span>
                  <span>The air is up. One ball is about to be caught.</span>
                </>
              ) : (
                <>
                  <span className="gg-result-kicker">Ball 1</span>
                  <span>The first ball caught rolls their major first.</span>
                </>
              )}
            </ResultWaiting>
          )}
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
function Majors({ state, viewer, act, now, clock }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number; clock: Clock }) {
  const majors = state.config.majors;
  const owner = (tag: string) => state.teams.find((team) => team.major === tag) ?? null;
  const p = progressOf(state, "wheel", now);
  const draw = state.last_draw?.kind === "wheel" ? state.last_draw : null;
  const landed = Boolean(draw) && (p === null || p >= SHOW_AT.wheel);
  const resultTeam = draw ? teamById(state, draw.team) : null;
  const spinning = teamById(state, state.turn.team);
  // Still on the reel: untaken majors, and during a spin its own result until it lands.
  const onReel = majors.filter((tag) => !owner(tag) || (p !== null && !landed && draw?.value === tag));
  return (
    <Shell
      step="Step 2 · Majors"
      title={p !== null && resultTeam && draw ? (landed ? `${resultTeam.name} get ${nationName(state, draw.value)}` : `Spinning for ${resultTeam.name}`) : spinning ? `${spinning.name} spins next` : "Every major is drawn"}
      progress={`${state.teams.filter((t) => t.major).length - (p !== null && !landed ? 1 : 0)} / ${state.teams.length}`}
      name="reel"
      footer={
        <ActButton
          label={`Spin for ${spinning?.name ?? ""}`}
          can={viewer.organizer && Boolean(spinning) && p === null}
          act={act}
          body={{ kind: "wheel.spin" }}
          waiting={p !== null ? (landed ? (spinning ? `Next up: ${spinning.name}.` : "All seven majors are taken.") : "Spinning…") : spinning ? `Tommy spins for ${spinning.name}.` : "All seven majors are taken."}
        />
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-8">
        <div className="min-w-0 flex-[1_1_380px]">
          <GGMajorReel state={state} clock={clock} />
        </div>
        <div className="w-[250px]">
          {landed && resultTeam && draw ? (
            <ResultCard
              key={draw.seq}
              color={resultTeam.color}
              kicker={`${resultTeam.name} plays`}
              title={nationName(state, draw.value)}
              sub={`${ordinal(state.config.majors.indexOf(draw.value) + 1)} strongest of ${state.config.majors.length}`}
              media={<Flag tag={draw.value} w={112} h={72} />}
            />
          ) : (
            <ResultWaiting>
              <span className="gg-result-kicker" style={p !== null ? { color: "var(--gg-cyan)" } : undefined}>
                {p !== null ? "Spinning" : "Next spin"}
              </span>
              <span>{p !== null ? "Watch the window." : spinning ? `${spinning.name}'s major is drawn next.` : "Every team has its major."}</span>
            </ResultWaiting>
          )}
          <div className="gg-label mt-4">Still on the reel</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {onReel.map((tag) => (
              <Flag key={tag} tag={tag} w={40} h={26} title={nationName(state, tag)} />
            ))}
          </div>
        </div>
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
      footer={
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
