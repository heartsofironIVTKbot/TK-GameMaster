"use client";

import { useEffect, useRef } from "react";
import type { GGState } from "@/lib/greatGame/model";
import * as sound from "./ggSound";

/**
 * Step 2's slot-machine reel of major cards (it replaced the wheel). Between
 * spins it ticks forward a card at a time; a spin speeds up, then slows card by card until the
 * drawn major stops in the neon window. Everything is worked out from the
 * server's spin time and result, so every page shows the same reel at the
 * same moment, and a page opened mid-spin joins it.
 */

export const REEL_MS = 4400;
const ACCEL_END = 450;
const LAND_END = 3700;
const IDLE_SPEED = 0.3; // rad/s, roughly where a spin starts from
const TOP_SPEED = 17; // rad/s

const W = 520;
const H = 440;
const CX = W / 2;
const CY = H / 2;
const R = 170;
const CARD_W = 330;
const MIN_FACES = 12;
const TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

/** The reel's faces: the majors still on it, repeated so the drum is full. */
function facesOf(majors: string[]): string[] {
  if (!majors.length) return [];
  const faces: string[] = [];
  while (faces.length < MIN_FACES) faces.push(...majors);
  return faces;
}

/**
 * Between spins the reel ticks one card forward every few seconds and always
 * rests squarely on a card. Worked out from the server time, so it's the same
 * on every page (a spin starts from it).
 */
const IDLE_TICK_MS = 2600;
const IDLE_ROLL = 0.25; // share of each tick spent rolling to the next card
function idleAngle(ms: number, faces: number): number {
  if (!faces) return 0;
  const ticks = ms / IDLE_TICK_MS;
  const whole = Math.floor(ticks);
  const part = ticks - whole;
  const roll = part < 1 - IDLE_ROLL ? 0 : easeInOut((part - (1 - IDLE_ROLL)) / IDLE_ROLL);
  return ((whole % faces) + roll) * (TAU / faces);
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The spin's angle `ms` after it started from `r0`: up to top speed, then an
 * ease-out that stops exactly with `face` in the window.
 */
function spinPlan(r0: number, faces: string[], target: string) {
  const step = TAU / faces.length;
  const accelDist = ((IDLE_SPEED + TOP_SPEED) / 2) * (ACCEL_END / 1000);
  const ra = r0 + accelDist;
  const decel = (LAND_END - ACCEL_END) / 1000;
  const want = ra + (TOP_SPEED * decel) / 3; // a cubic ease-out starts at 3 x distance / time
  let best = Infinity;
  faces.forEach((tag, i) => {
    if (tag !== target) return;
    // Face i is in the window when i * step + angle is a whole number of turns.
    const base = -i * step;
    const r1 = base + Math.round((want - base) / TAU) * TAU;
    if (Math.abs(r1 - want) < Math.abs(best - want)) best = r1;
  });
  const r1 = Number.isFinite(best) ? best : want;
  return (ms: number) => {
    if (ms <= 0) return r0;
    if (ms < ACCEL_END) {
      const t = ms / 1000;
      const a = (TOP_SPEED - IDLE_SPEED) / (ACCEL_END / 1000);
      return r0 + IDLE_SPEED * t + (a * t * t) / 2;
    }
    const k = seg(ms, ACCEL_END, LAND_END);
    return ra + (r1 - ra) * (1 - Math.pow(1 - k, 3));
  };
}

export default function GGMajorReel({ state, clock }: { state: GGState; clock: () => number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || W;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(((width * H) / W) * ratio);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const flags = new Map<string, HTMLImageElement>();
    const flag = (tag: string) => {
      let image = flags.get(tag);
      if (!image) {
        image = new Image();
        image.src = `/assets_rt56/flags/${tag}.png`;
        flags.set(tag, image);
      }
      return image;
    };
    let plan: { seq: number; at: (ms: number) => number } | null = null;
    let lastCard: number | null = null;
    let rang = -1;
    let frame = 0;

    const loop = () => {
      const current = stateRef.current;
      const now = clock();
      const draw = current.last_draw?.kind === "wheel" ? current.last_draw : null;
      const ms = draw ? now - draw.at : Infinity;
      const spinning = draw !== null && ms < REEL_MS;
      const taken = new Set(current.teams.map((team) => team.major).filter((tag): tag is string => Boolean(tag)));
      // During a spin its own result is still on the reel.
      if (spinning) taken.delete(draw.value);
      const faces = facesOf(current.config.majors.filter((tag) => !taken.has(tag)));
      let angle = idleAngle(now, faces.length);
      if (spinning) {
        if (!plan || plan.seq !== draw.seq) plan = { seq: draw.seq, at: spinPlan(idleAngle(draw.at, faces.length), faces, draw.value) };
        angle = plan.at(ms);
      }
      const landed = spinning && ms >= LAND_END;
      // A tick each time a card passes the window; a bell when a spin lands.
      if (faces.length) {
        const card = Math.round(angle / (TAU / faces.length));
        if (lastCard !== null && card !== lastCard) sound.tick(spinning ? 1 : 0.45);
        lastCard = card;
      }
      if (landed && draw && rang !== draw.seq) {
        if (ms < LAND_END + 400) sound.bell();
        rang = draw.seq;
      }
      const team = spinning ? current.teams.find((entry) => entry.id === draw.team) : null;
      const speed = spinning ? (ms < ACCEL_END ? TOP_SPEED * (ms / ACCEL_END) : TOP_SPEED * Math.pow(1 - seg(ms, ACCEL_END, LAND_END), 2)) : IDLE_SPEED;

      const k = canvas.width / W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Cabinet.
      const cab = ctx.createLinearGradient(CX - 220, 0, CX + 220, 0);
      cab.addColorStop(0, "#f4f1fb");
      cab.addColorStop(0.35, "#b9b4c9");
      cab.addColorStop(0.5, "#5d5873");
      cab.addColorStop(0.68, "#e6e1f2");
      cab.addColorStop(1, "#8f88aa");
      ctx.fillStyle = cab;
      ctx.beginPath();
      ctx.roundRect(CX - 214, 10, 428, H - 20, 26);
      ctx.fill();
      ctx.fillStyle = "#0d0820";
      ctx.beginPath();
      ctx.roundRect(CX - 194, 28, 388, H - 56, 16);
      ctx.fill();

      // The reel.
      const n = faces.length;
      const cardH = n ? 2 * R * Math.sin(Math.PI / n) * 0.9 : 60;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(CX - 194, 28, 388, H - 56, 16);
      ctx.clip();
      const visible = faces
        .map((tag, i) => ({ tag, a: (i * TAU) / n + angle }))
        .map((f) => ({ ...f, c: Math.cos(f.a), s: Math.sin(f.a) }))
        .filter((f) => f.c > 0.04)
        .sort((a, b) => a.c - b.c);
      const blur = Math.min(1, speed / TOP_SPEED);
      for (const f of visible) {
        const y = CY + R * f.s;
        const inWindow = landed && Math.abs(f.s) < 0.05;
        ctx.save();
        ctx.translate(CX, y);
        ctx.scale(1, f.c);
        ctx.fillStyle = inWindow && team ? "#241640" : "#1b1233";
        ctx.beginPath();
        ctx.roundRect(-CARD_W / 2, -cardH / 2, CARD_W, cardH, 10);
        ctx.fill();
        ctx.strokeStyle = inWindow && team ? team.color : "rgba(255,255,255,.08)";
        ctx.lineWidth = inWindow ? 3 : 1;
        ctx.stroke();
        const image = flag(f.tag);
        const fh = cardH * 0.56;
        const fw = fh * 1.55;
        if (image.complete && image.naturalWidth) ctx.drawImage(image, -CARD_W / 2 + 22, -fh / 2, fw, fh);
        else {
          ctx.fillStyle = "#34265a";
          ctx.fillRect(-CARD_W / 2 + 22, -fh / 2, fw, fh);
        }
        ctx.strokeStyle = "rgba(0,0,0,.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(-CARD_W / 2 + 22, -fh / 2, fw, fh);
        ctx.fillStyle = "#efe9ff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = `900 ${Math.round(cardH * 0.4)}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
        const name = (current.config.names[f.tag] ?? f.tag).toUpperCase();
        ctx.fillText(name, -CARD_W / 2 + 40 + fw, 0, CARD_W - fw - 60);
        ctx.restore();
        // Darker towards the top and bottom of the drum, and a blur while it's fast.
        ctx.fillStyle = `rgba(13,8,32,${Math.min(0.95, (1 - f.c) * 0.9 + blur * 0.3)})`;
        ctx.fillRect(CX - CARD_W / 2, y - (cardH * f.c) / 2, CARD_W, cardH * f.c);
      }
      const fade = ctx.createLinearGradient(0, 28, 0, H - 28);
      fade.addColorStop(0, "rgba(13,8,32,.96)");
      fade.addColorStop(0.3, "rgba(13,8,32,0)");
      fade.addColorStop(0.7, "rgba(13,8,32,0)");
      fade.addColorStop(1, "rgba(13,8,32,.96)");
      ctx.fillStyle = fade;
      ctx.fillRect(CX - 194, 28, 388, H - 56);
      ctx.restore();

      // The window, lit in the team's colour once it lands.
      const glow = landed && team ? team.color : "#ff2bd6";
      const pulse = landed ? 0.6 + 0.4 * Math.sin(seg(ms, LAND_END, REEL_MS) * Math.PI * 3) : 0;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 3;
      ctx.shadowColor = glow;
      ctx.shadowBlur = landed ? 18 + 14 * pulse : 12;
      ctx.beginPath();
      ctx.roundRect(CX - CARD_W / 2 - 14, CY - cardH / 2 - 9, CARD_W + 28, cardH + 18, 12);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffb347";
      for (const side of [-1, 1]) {
        const x = CX + side * (CARD_W / 2 + 18);
        ctx.beginPath();
        ctx.moveTo(x + side * 14, CY - 11);
        ctx.lineTo(x, CY);
        ctx.lineTo(x + side * 14, CY + 11);
        ctx.closePath();
        ctx.fill();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [clock]);

  return <canvas ref={canvasRef} aria-hidden className="block h-auto w-full max-w-[520px]" style={{ aspectRatio: `${W} / ${H}` }} />;
}
