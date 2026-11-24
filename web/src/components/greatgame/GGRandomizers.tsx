"use client";

import { useState } from "react";
import { strengthOrder } from "@/lib/greatGame/engine";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import { Avatar, Flag, hexA, nationName, person, teamById } from "./ggUi";
import type { GGViewerInfo } from "./useGreatGame";

/**
 * The four randomizers (steps 1 to 4), over the map. The server picks the
 * result first and stamps it with a time; every page plays the same
 * animation from that time, so all ~40 viewers see the drum drop, the wheel
 * land and the card turn together, and a page opened mid-spin joins it.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

export const ANIM_MS: Record<string, number> = { drum: 2600, wheel: 4200, vice: 2200, recruit: 1300 };

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** 0..1 of the latest draw's animation for `kind`, or null when nothing is playing. */
function progressOf(state: GGState, kind: string, now: number): number | null {
  const draw = state.last_draw;
  if (!draw || draw.kind !== kind) return null;
  const t = (now - draw.at) / ANIM_MS[kind];
  return t >= 0 && t < 1 ? t : null;
}

function Shell({ title, sub, children, footer }: { title: string; sub: string; children: React.ReactNode; footer: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) {
    return (
      <button type="button" className="gg-btn gg-btn-primary absolute bottom-6 left-1/2 z-[1050] -translate-x-1/2" onClick={() => setHidden(false)}>
        Show the {title.toLowerCase()}
      </button>
    );
  }
  return (
    <div className="absolute inset-0 z-[1050]" style={{ top: 84 }}>
      <div className="gg-overlay-dim" />
      <div className="gg-panel absolute left-1/2 top-[160px] w-[min(900px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-2xl lg:left-[calc(50%+170px)] lg:w-[min(900px,calc(100%-380px))]">
        <div className="flex items-baseline justify-between gap-3 px-6 pt-4">
          <span className="gg-chrome text-[32px] font-black tracking-wider">{title}</span>
          <span className="text-[13px]" style={{ color: "var(--gg-fg-2)" }}>
            {sub}
          </span>
        </div>
        <div className="px-6 pb-4 pt-2">{children}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3" style={{ borderColor: "var(--gg-line)" }}>
          {footer}
          <button type="button" className="gg-btn" onClick={() => setHidden(true)}>
            Hide to see the map
          </button>
        </div>
      </div>
    </div>
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

/* ---------- Step 1: the lottery drum ---------- */
function Drum({ state, viewer, act, now }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number }) {
  const p = progressOf(state, "drum", now);
  const playing = p !== null;
  // While the newest ball rolls, it still shows as "in the drum".
  const shownOrder = playing ? state.order.slice(0, -1) : state.order;
  const inDrum = state.teams.filter((team) => !shownOrder.includes(team.id));
  const newest = teamById(state, state.order.at(-1));
  const spin = playing ? ease(Math.min(1, p / 0.75)) * 720 : 0;
  const ballOut = playing ? p > 0.7 : Boolean(newest);
  const spots = [
    [-50, 30],
    [30, 55],
    [60, -10],
    [-20, -40],
    [10, 5],
    [-70, -10],
    [45, 25],
  ];
  return (
    <Shell
      title="Captain order"
      sub="Who rolls their major first"
      footer={
        <ActButton
          label={state.order.length === 0 ? "Draw the first ball" : "Draw the next ball"}
          can={viewer.organizer && !state.phase_done && !playing}
          act={act}
          body={{ kind: "drum.draw" }}
          waiting={state.phase_done ? "Every ball is drawn." : playing ? "Drawing…" : "Tommy draws the next ball."}
        />
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-6">
        <svg width="360" height="320" viewBox="-180 -165 360 330" aria-hidden>
          <defs>
            <radialGradient id="gg-ball" cx=".35" cy=".3" r=".8">
              <stop offset="0" stopColor="#fff" stopOpacity=".7" />
              <stop offset=".4" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity=".35" />
            </radialGradient>
          </defs>
          <rect x="-18" y="120" width="36" height="34" fill="#5d5873" />
          <rect x="-100" y="150" width="200" height="12" rx="4" fill="#8f88aa" />
          <circle r="135" fill="#1a0f33" fillOpacity=".6" stroke="#d9d5e6" strokeWidth="5" />
          <g transform={`rotate(${spin})`}>
            {[0, 30, 60, 90, 120, 150].map((a) => (
              <ellipse key={a} rx={135 * Math.abs(Math.cos((a * Math.PI) / 180)) + 1} ry="135" fill="none" stroke="#9d97b2" strokeWidth="2" opacity=".8" />
            ))}
            <line x1="-135" y1="0" x2="135" y2="0" stroke="#9d97b2" strokeWidth="2" />
            {inDrum.map((team, i) => {
              const [x, y] = spots[i % spots.length];
              const jitter = playing ? Math.sin(p * 30 + i) * 8 : 0;
              return (
                <g key={team.id} transform={`translate(${x + jitter},${y - jitter})`}>
                  <circle r="24" fill={team.color} />
                  <circle r="24" fill="url(#gg-ball)" />
                </g>
              );
            })}
          </g>
          <circle r="135" fill="none" stroke="#ff2bd6" strokeWidth="2" opacity=".6" style={{ filter: "drop-shadow(0 0 8px #ff2bd6)" }} />
          <path d="M110 80 L175 130" stroke="#d9d5e6" strokeWidth="16" strokeLinecap="round" />
          <path d="M110 80 L175 130" stroke="#2b2542" strokeWidth="10" strokeLinecap="round" />
        </svg>
        <div className="w-[230px] text-center">
          {newest && ballOut ? (
            <div key={state.order.length} className="gg-pop">
              <div className="gg-label">Ball {state.order.length}</div>
              <div
                className="mx-auto my-3 flex h-[110px] w-[110px] items-center justify-center rounded-full"
                style={{ background: newest.color, boxShadow: `0 0 30px ${hexA(newest.color, 0.8)}` }}
              >
                <span className="gg-disp flex h-16 w-16 items-center justify-center rounded-full text-4xl font-black" style={{ background: "#120a24", color: newest.color }}>
                  {(person(state, newest.captain)?.name ?? "?").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="gg-disp text-3xl font-black">{newest.name}</div>
              <div style={{ color: "var(--gg-fg-2)" }}>
                Captain {person(state, newest.captain)?.name} rolls {ordinal(state.order.length)}
              </div>
            </div>
          ) : (
            <div className="gg-label">{playing ? "Drawing…" : "Waiting for the first ball"}</div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {state.teams.map((_, i) => {
          const team = teamById(state, shownOrder[i]) ?? (ballOut && i === state.order.length - 1 ? newest : null);
          return (
            <div key={i} className="w-[104px] text-center">
              <span className="gg-digit text-xs" style={{ color: "var(--gg-fg-3)" }}>
                {i + 1}
              </span>
              <div
                className="gg-disp mt-1 flex h-10 items-center justify-center rounded-full px-2 text-sm font-black"
                style={team ? { background: team.color, color: "#120a24" } : { border: "1.5px dashed var(--gg-line-2)", color: "var(--gg-fg-3)" }}
              >
                <span className="truncate">{team ? team.name : "?"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---------- Step 2: the major wheel ---------- */
function Wheel({ state, viewer, act, now }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number }) {
  const majors = state.config.majors;
  const owner = (tag: string) => state.teams.find((team) => team.major === tag) ?? null;
  const p = progressOf(state, "wheel", now);
  const draw = state.last_draw?.kind === "wheel" ? state.last_draw : null;
  const seg = 360 / majors.length;
  // Land the pointer (top, -90°) on the result: turn the wheel so that segment's middle sits there.
  const target = draw ? majors.indexOf(draw.value) : 0;
  const rest = -90 - (target * seg + seg / 2);
  const angle = p !== null ? rest - 360 * 5 * (1 - ease(p)) : draw ? rest : 0;
  const landed = p === null && draw;
  const resultTeam = draw ? teamById(state, draw.team) : null;
  const spinning = teamById(state, state.turn.team);
  return (
    <Shell
      title="Major wheel"
      sub={spinning ? `Spin ${state.teams.filter((t) => t.major).length + 1} of 7 · ${spinning.name}` : "Every major is rolled"}
      footer={
        <ActButton
          label={`Spin for ${spinning?.name ?? ""}`}
          can={viewer.organizer && Boolean(spinning) && p === null}
          act={act}
          body={{ kind: "wheel.spin" }}
          waiting={p !== null ? "Spinning…" : spinning ? `Tommy spins for ${spinning.name}.` : "All seven majors are taken."}
        />
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-8">
        <svg width="380" height="380" viewBox="-200 -205 400 410" aria-hidden>
          <circle r="186" fill="#120a24" stroke="#d9d5e6" strokeWidth="6" />
          <g transform={`rotate(${angle})`}>
            {majors.map((tag, i) => {
              const a0 = (i * seg * Math.PI) / 180;
              const a1 = ((i + 1) * seg * Math.PI) / 180;
              const am = (a0 + a1) / 2;
              const r = 170;
              // Taken before this spin: grey. The spin's own result stays lit while it plays.
              const t = owner(tag);
              const taken = t && !(p !== null && draw?.value === tag);
              const pt = (a: number, rr: number) => `${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`;
              return (
                <g key={tag}>
                  <path d={`M0,0 L${pt(a0, r)} A${r} ${r} 0 0 1 ${pt(a1, r)} Z`} fill={taken ? "#2a2340" : i % 2 ? "#3a1a5e" : "#2a1250"} stroke="#ff2bd6" strokeWidth="1.5" />
                  <g transform={`translate(${(110 * Math.cos(am)).toFixed(1)},${(110 * Math.sin(am)).toFixed(1)}) rotate(${(am * 180) / Math.PI + 90})`} opacity={taken ? 0.35 : 1}>
                    <image href={`/assets_rt56/flags/${tag}.png`} x="-21" y="-20" width="42" height="27" />
                    <text y="24" textAnchor="middle" fontFamily="var(--gg-display)" fontWeight="800" fontSize="14" fill="#fff">
                      {nationName(state, tag)}
                    </text>
                  </g>
                  {taken && <circle cx={(150 * Math.cos(am)).toFixed(1)} cy={(150 * Math.sin(am)).toFixed(1)} r="8" fill={t!.color} />}
                </g>
              );
            })}
          </g>
          <circle r="34" fill="#ff2bd6" stroke="#ffb347" strokeWidth="3" />
          <text y="6" textAnchor="middle" fontFamily="var(--gg-display)" fontWeight="900" fontSize="18" fill="#120a24">
            SPIN
          </text>
          <path d="M0,-180 L-16,-204 L16,-204 Z" fill="#22e5ff" style={{ filter: "drop-shadow(0 0 6px #22e5ff)" }} />
        </svg>
        <div className="w-[260px]">
          <div className="gg-label">{landed ? "Result" : p !== null ? "Spinning…" : "Waiting for the first spin"}</div>
          {landed && resultTeam && (
            <div key={draw!.seq} className="gg-pop mt-2 rounded-xl p-4" style={{ background: hexA(resultTeam.color, 0.12), border: `1px solid ${hexA(resultTeam.color, 0.6)}` }}>
              <Flag tag={draw!.value} w={72} h={46} />
              <div className="gg-disp mt-2 text-3xl font-black">{nationName(state, draw!.value)}</div>
              <div className="font-bold" style={{ color: resultTeam.color }}>
                {resultTeam.name}
              </div>
            </div>
          )}
          <div className="gg-label mt-4">Still on the wheel</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {majors.filter((tag) => !owner(tag)).map((tag) => (
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
      title={title}
      sub={kind === "vice" ? "One content creator per team" : `Two rounds · one card per team per round`}
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
                <Avatar name={who?.name ?? "?"} color={team.color} size={40} />
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

export default function GGRandomizers({ state, viewer, act, now }: { state: GGState; viewer: GGViewerInfo; act: Act; now: number }) {
  switch (state.phase) {
    case "drum":
      return <Drum state={state} viewer={viewer} act={act} now={now} />;
    case "wheel":
      return <Wheel state={state} viewer={viewer} act={act} now={now} />;
    case "vice":
      return <Cards key="vice" state={state} viewer={viewer} act={act} now={now} kind="vice" />;
    case "recruits":
      return <Cards key="recruits" state={state} viewer={viewer} act={act} now={now} kind="recruit" />;
    default:
      return null;
  }
}

export { strengthOrder };
