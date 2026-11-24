"use client";

/* eslint-disable @next/next/no-img-element */
import { turnDeadline } from "@/lib/greatGame/engine";
import type { GGPerson, GGState, GGTeam } from "@/lib/greatGame/model";

/** Small shared pieces of the Great Game page. */

export function teamById(state: GGState, id: string | null | undefined): GGTeam | null {
  return id ? (state.teams.find((team) => team.id === id) ?? null) : null;
}

export function person(state: GGState, id: string | null | undefined): GGPerson | null {
  return id ? (state.config.people.find((entry) => entry.id === id) ?? null) : null;
}

export function nationName(state: GGState, tag: string | null | undefined): string {
  return tag ? (state.config.names[tag] ?? tag) : "";
}

/** Seconds left on the turn clock (negative when over), or null when untimed. */
export function secondsLeft(state: GGState, now: number): number | null {
  const deadline = turnDeadline(state);
  if (deadline === null) return null;
  const at = state.turn.paused_at ?? now;
  return Math.ceil((deadline - at) / 1000);
}

export function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Flag({ tag, w = 30, h = 19, title }: { tag: string | null | undefined; w?: number; h?: number; title?: string }) {
  if (!tag) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-[3px] text-[10px]"
        style={{ width: w, height: h, border: "1.5px dashed var(--gg-line-2)", color: "var(--gg-fg-3)" }}
      >
        ?
      </span>
    );
  }
  return (
    <img
      src={`/assets_rt56/flags/${tag}.png`}
      alt={title ?? `${tag} flag`}
      width={w}
      height={h}
      className="shrink-0 rounded-[2px] object-cover"
      style={{ width: w, height: h, boxShadow: "0 0 0 1px rgba(0,0,0,.6)" }}
    />
  );
}

export function EmptySlot({ w = 24, h = 16, pulse = false, label }: { w?: number; h?: number; pulse?: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] text-[10px] ${pulse ? "gg-pulse" : ""}`}
      style={{
        width: w,
        height: h,
        border: `1.5px dashed ${pulse ? "var(--gg-pending)" : "var(--gg-line-2)"}`,
        color: pulse ? "var(--gg-pending)" : "var(--gg-fg-3)",
      }}
    >
      {label}
    </span>
  );
}

export function Avatar({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: color, color: "#120a24", fontSize: Math.round(size * 0.45) }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The poster's striped sun. Gaps in its lower half drift down and widen, the
 * way a synthwave sun does, and it glows softly. `frac` of it is lit (the turn
 * clock drains it from the top); the rest stays as a faint outline.
 */
export function Sun({ size, frac, id }: { size: number; frac: number; id: string }) {
  const top = 100 - Math.max(0, Math.min(1, frac)) * 100;
  const gaps = [0, 1, 2, 3, 4].map((i) => (
    <rect key={i} className="gg-sun-gap" x="-5" y="49" width="110" height="5" fill="#000" style={{ animationDelay: `${-i * 0.9}s` }} />
  ));
  const disc = <rect x="0" y="0" width="100" height="100" fill={`url(#${id}s)`} />;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="gg-sun">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd36e" />
          <stop offset=".45" stopColor="#ff8a4c" />
          <stop offset=".7" stopColor="#ff4f8b" />
          <stop offset="1" stopColor="#c53bff" />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <circle cx="50" cy="50" r="48" fill="#fff" />
          {gaps}
        </mask>
        <clipPath id={`${id}f`}>
          <rect x="0" y={top} width="100" height={100 - top} />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#1a0f33" stroke="#ff2bd6" strokeOpacity=".45" />
      <g mask={`url(#${id}m)`} opacity=".22">
        {disc}
      </g>
      <g mask={`url(#${id}m)`} clipPath={`url(#${id}f)`}>
        {disc}
      </g>
    </svg>
  );
}

/** "Captain", "Vice-captain", "Recruit" for a team's four slots. */
export const SLOT_ROLE = ["Captain", "Vice-captain", "Recruit", "Recruit"];

export function teamMembers(team: GGTeam): (string | null)[] {
  return [team.captain, team.vice, team.recruits[0], team.recruits[1]];
}
