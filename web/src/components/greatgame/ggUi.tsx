"use client";

/* eslint-disable @next/next/no-img-element */
import { createContext, useContext, useEffect, useRef } from "react";
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

/** Discord profile pictures by person id (from the event's GET); empty when unknown. */
export const AvatarsContext = createContext<Record<string, string>>({});

/** A person's round picture with a ring in `color`, or their initial when GameMaster has no picture. */
export function Avatar({ name, color, size = 22, id }: { name: string; color: string; size?: number; id?: string | null }) {
  const src = useContext(AvatarsContext)[id ?? ""];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: `0 0 0 ${size >= 36 ? 3 : 2}px ${color}` }}
      />
    );
  }
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
 * The poster's striped sun, drawn on a small canvas: stripes appear at the
 * horizon (the middle) and drift down, widening as they go. `frac` of it is
 * lit (the turn clock drains it from the top); the rest stays faint. (An SVG
 * mask with animated stripes didn't repaint reliably in Chrome: the stripes
 * stuttered and jumped.) Its glow is a separate halo, .gg-sun-halo.
 */
const SUN_STOPS: [number, string][] = [
  [0, "#ffd36e"],
  [0.45, "#ff8a4c"],
  [0.7, "#ff4f8b"],
  [1, "#c53bff"],
];
const SUN_DARK = "#1a0f33";
const SUN_STRIPES = 5;
const SUN_STRIPE_MS = 4500;

export function Sun({ size, frac }: { size: number; frac: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fracRef = useRef(frac);
  useEffect(() => {
    fracRef.current = frac;
  }, [frac]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gradient = ctx.createLinearGradient(0, 0, 0, 100);
    for (const [at, color] of SUN_STOPS) gradient.addColorStop(at, color);
    const disc = () => {
      ctx.beginPath();
      ctx.arc(50, 50, 48, 0, Math.PI * 2);
    };
    let frame = 0;
    const draw = (time: number) => {
      // Work in a 100 x 100 box.
      ctx.setTransform((canvas.width / 100), 0, 0, canvas.height / 100, 0, 0);
      ctx.clearRect(0, 0, 100, 100);
      disc();
      ctx.fillStyle = SUN_DARK;
      ctx.fill();
      ctx.save();
      disc();
      ctx.clip();
      const top = 100 - Math.max(0, Math.min(1, fracRef.current)) * 100;
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(0, 0, 100, top);
      ctx.globalAlpha = 1;
      ctx.fillRect(0, top, 100, 100 - top);
      // Stripes: each starts as nothing at the horizon and leaves below the disc.
      ctx.fillStyle = SUN_DARK;
      const phase = still ? 0.5 : (time % SUN_STRIPE_MS) / SUN_STRIPE_MS;
      for (let i = 0; i < SUN_STRIPES; i++) {
        const p = (phase + i / SUN_STRIPES) % 1;
        const height = 8.5 * p;
        const middle = 51.5 + 48 * p;
        ctx.fillRect(0, middle - height / 2, 100, height);
      }
      ctx.restore();
      disc();
      ctx.strokeStyle = "rgba(255,43,214,.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  return <canvas ref={canvasRef} aria-hidden className="relative block" style={{ width: size, height: size }} />;
}

/** "Captain", "Vice-captain", "Recruit" for a team's four slots. */
export const SLOT_ROLE = ["Captain", "Vice-captain", "Recruit", "Recruit"];

export function teamMembers(team: GGTeam): (string | null)[] {
  return [team.captain, team.vice, team.recruits[0], team.recruits[1]];
}
