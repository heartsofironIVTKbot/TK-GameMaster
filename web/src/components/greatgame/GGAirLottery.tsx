"use client";

import { useEffect, useRef } from "react";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import { person } from "./ggUi";

/**
 * Step 1's lottery machine: a glass sphere where air keeps the team balls
 * flying the whole time. When Tommy draws, the server has already picked the
 * team and stamped the time; every page then plays the same timeline from
 * that time: the air surges, the drawn ball is carried up to the catcher,
 * sucked up the tube, and rolls left along it into its place in the order.
 *
 * The tumbling itself is local physics (each page's balls fly their own way);
 * only the draw is shared, so a page opened mid-draw joins at the right
 * moment.
 */

export const DRUM_MS = 3600;
/** Milestones of a draw (ms after the server's draw time). */
const SURGE_END = 1150; // air surges, the drawn ball is carried up to the catcher
const CATCH_END = 1300; // caught in the collar
const RISE_END = 1750; // sucked up the tube
const TURN_END = 1950; // round the bend
const ROLL_END = 3000; // rolls along to its slot
const SETTLE_END = 3300; // a little bounce against the ball before it

const W = 600;
const H = 460;
const CX = 405;
const CY = 268;
const R = 150;
const BALL_R = 22;
const TUBE_Y = 52;
const TUBE_BEND = 30;
const SLOT_X0 = 38;
const SLOT_GAP = 47;
const TAU = Math.PI * 2;

interface Ball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function chrome(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "#f4f1fb");
  g.addColorStop(0.35, "#b9b4c9");
  g.addColorStop(0.5, "#5d5873");
  g.addColorStop(0.68, "#e6e1f2");
  g.addColorStop(1, "#8f88aa");
  return g;
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, label: string, spin: number, glow = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 24 * glow;
  }
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.08, 0, 0, r);
  body.addColorStop(0, shade(color, 0.6));
  body.addColorStop(0.5, color);
  body.addColorStop(0.92, shade(color, -0.55));
  body.addColorStop(1, shade(color, -0.7));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  // The label band turns with the ball; squashed a little as it turns away.
  const face = Math.cos(spin * 0.5);
  ctx.save();
  ctx.rotate(spin * 0.15);
  ctx.scale(0.55 + 0.45 * Math.abs(face), 1);
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.52, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#120a24";
  ctx.font = `900 ${Math.round(r * 0.68)}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, r * 0.05);
  ctx.restore();
  // Rim light from the pink neon below, and a specular highlight.
  ctx.strokeStyle = "rgba(255,79,224,.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.36, -r * 0.46, r * 0.3, r * 0.15, -0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.beginPath();
  ctx.arc(-r * 0.46, -r * 0.5, r * 0.06, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Where a ball is on its way from the catcher to `slotX`, `ms` after the draw. */
function tubePosition(ms: number, slotX: number): { x: number; y: number; spin: number } {
  const mouthY = CY - R + BALL_R + 2;
  const bendY = TUBE_Y + TUBE_BEND;
  if (ms < RISE_END) {
    const e = easeIn(seg(ms, CATCH_END, RISE_END));
    return { x: CX, y: lerp(mouthY, bendY, e), spin: 0 };
  }
  if (ms < TURN_END) {
    const a = seg(ms, RISE_END, TURN_END) * (Math.PI / 2);
    // A quarter turn from going up to going left, around (CX - TUBE_BEND, bendY).
    return { x: CX - TUBE_BEND + Math.cos(a) * TUBE_BEND, y: bendY - Math.sin(a) * TUBE_BEND, spin: a };
  }
  const startX = CX - TUBE_BEND;
  if (ms < ROLL_END) {
    const e = easeOut(seg(ms, TURN_END, ROLL_END));
    const x = lerp(startX, slotX + 6, e);
    return { x, y: TUBE_Y, spin: -(x - startX) / BALL_R };
  }
  const b = seg(ms, ROLL_END, SETTLE_END);
  const x = slotX + 6 * (1 - b) * Math.cos(b * Math.PI * 3);
  return { x, y: TUBE_Y, spin: -(x - startX) / BALL_R };
}

export default function GGAirLottery({ state, clock }: { state: GGState; clock: () => number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || W;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(((width * H) / W) * ratio);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const balls = new Map<string, Ball>();
    const particles: Particle[] = [];
    let air = 1;
    let last = performance.now();
    let frame = 0;

    const spawn = (id: string, index: number): Ball => ({
      id,
      x: CX + ((index % 4) - 1.5) * BALL_R * 2.2,
      y: CY + R * 0.55 - Math.floor(index / 4) * BALL_R * 2.2,
      vx: (Math.random() - 0.5) * 80,
      vy: 0,
      spin: Math.random() * TAU,
    });

    const step = (dt: number, time: number, power: number, guide: { id: string; pull: number } | null) => {
      const live = [...balls.values()];
      const steps = 4;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const b of live) {
          b.vy += 900 * h;
          // The jet: strongest at the bottom centre, with turbulence so the balls swirl.
          const depth = (b.y - (CY + R * 0.1)) / R;
          if (depth > 0) {
            const centred = 1 - Math.min(1, Math.abs(b.x - CX) / (R * 0.9));
            b.vy -= power * 2900 * h * depth * (0.55 + 0.45 * centred) * (0.6 + Math.random() * 0.8);
          }
          b.vx += (Math.sin(b.y * 0.021 + time * 1.7) * 900 + Math.sin(b.x * 0.013 - time * 1.1) * 520) * power * h;
          b.vy += Math.cos(b.x * 0.017 + time * 1.3) * 380 * power * h;
          if (guide && b.id === guide.id) {
            // The drawn ball rides the air up to the catcher.
            const tx = CX;
            const ty = CY - R + BALL_R + 2;
            b.vx += (tx - b.x) * 60 * guide.pull * h - b.vx * 6 * guide.pull * h;
            b.vy += (ty - b.y) * 60 * guide.pull * h - b.vy * 6 * guide.pull * h;
          }
          const damp = 1 - 0.12 * h;
          b.vx *= damp;
          b.vy *= damp;
          b.x += b.vx * h;
          b.y += b.vy * h;
          b.spin += (b.vx / BALL_R) * h;
        }
        for (let i = 0; i < live.length; i++) {
          for (let j = i + 1; j < live.length; j++) {
            const a = live[i];
            const c = live[j];
            const dx = c.x - a.x;
            const dy = c.y - a.y;
            const d = Math.hypot(dx, dy) || 0.01;
            const min = BALL_R * 2;
            if (d < min) {
              const nx = dx / d;
              const ny = dy / d;
              const overlap = (min - d) / 2;
              a.x -= nx * overlap;
              a.y -= ny * overlap;
              c.x += nx * overlap;
              c.y += ny * overlap;
              const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
              if (rv < 0) {
                const impulse = (-(1 + 0.88) * rv) / 2;
                a.vx -= impulse * nx;
                a.vy -= impulse * ny;
                c.vx += impulse * nx;
                c.vy += impulse * ny;
              }
            }
          }
        }
        for (const b of live) {
          const dx = b.x - CX;
          const dy = b.y - CY;
          const d = Math.hypot(dx, dy);
          const limit = R - BALL_R - 3;
          if (d > limit) {
            const nx = dx / d;
            const ny = dy / d;
            b.x = CX + nx * limit;
            b.y = CY + ny * limit;
            const vn = b.vx * nx + b.vy * ny;
            if (vn > 0) {
              b.vx -= 1.8 * vn * nx;
              b.vy -= 1.8 * vn * ny;
            }
          }
        }
      }
      // Air bubbles rising from the nozzle.
      const want = power * (still ? 0 : 1.6);
      for (let k = 0; k < want; k++) {
        if (Math.random() < want - k) {
          particles.push({ x: CX + (Math.random() - 0.5) * 30, y: CY + R - 16, vx: (Math.random() - 0.5) * 340, vy: -(220 + Math.random() * 240) * power, life: 0.6 + Math.random() * 0.4 });
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += (p.vx + Math.sin(p.y * 0.03 + time * 2.4) * 90) * dt;
        p.vx *= 1 - 0.8 * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.3;
        if (p.life <= 0 || Math.hypot(p.x - CX, p.y - CY) > R - 4) particles.splice(i, 1);
      }
    };

    const render = (drawn: { team: GGTeam; ms: number } | null, queue: GGTeam[], current: GGState) => {
      const k = canvas.width / W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const teamOf = new Map(current.teams.map((team) => [team.id, team]));
      const initial = (team: GGTeam) => (person(current, team.captain)?.name ?? team.name).trim().charAt(0).toUpperCase() || "?";

      // Spotlight and floor.
      const spot = ctx.createRadialGradient(CX, CY + 20, 20, CX, CY + 20, 190);
      spot.addColorStop(0, "rgba(255,43,214,.16)");
      spot.addColorStop(1, "rgba(255,43,214,0)");
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.beginPath();
      ctx.ellipse(CX, H - 18, 150, 13, 0, 0, TAU);
      ctx.fill();

      // Pedestal.
      ctx.fillStyle = chrome(ctx, CX - 110, 0, CX + 110, 0);
      ctx.beginPath();
      ctx.moveTo(CX - 62, CY + R - 12);
      ctx.lineTo(CX + 62, CY + R - 12);
      ctx.lineTo(CX + 104, H - 20);
      ctx.lineTo(CX - 104, H - 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff2bd6";
      ctx.shadowColor = "#ff2bd6";
      ctx.shadowBlur = 14;
      ctx.fillRect(CX - 88, H - 46, 176, 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#120a24";
      ctx.font = '800 12px "Orbitron", "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("CAPTAIN ORDER", CX, H - 30);

      // Tube: back wall.
      const tubeLeft = 14;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const tubePath = () => {
        ctx.beginPath();
        ctx.moveTo(CX, CY - R + 8);
        ctx.lineTo(CX, TUBE_Y + TUBE_BEND);
        ctx.arc(CX - TUBE_BEND, TUBE_Y + TUBE_BEND, TUBE_BEND, 0, -Math.PI / 2, true);
        ctx.lineTo(tubeLeft, TUBE_Y);
      };
      ctx.strokeStyle = "rgba(170,210,255,.12)";
      ctx.lineWidth = BALL_R * 2 + 8;
      tubePath();
      ctx.stroke();

      // Slot numbers under the tube; a filled slot glows in its team's colour.
      ctx.font = '800 11px "Orbitron", "Segoe UI", sans-serif';
      for (let i = 0; i < current.teams.length; i++) {
        const x = SLOT_X0 + i * SLOT_GAP;
        const team = queue[i];
        ctx.fillStyle = team ? team.color : "rgba(185,174,224,.55)";
        ctx.fillText(String(i + 1), x, TUBE_Y + BALL_R + 18);
      }

      // Balls already drawn, resting in the tube.
      queue.forEach((team, i) => {
        if (drawn && team.id === drawn.team.id && drawn.ms < SETTLE_END) return;
        drawBall(ctx, SLOT_X0 + i * SLOT_GAP, TUBE_Y, BALL_R, team.color, initial(team), -i * 1.3);
      });

      // Sphere: back glass.
      const back = ctx.createRadialGradient(CX - 50, CY - 60, 20, CX, CY, R);
      back.addColorStop(0, "rgba(140,110,230,.16)");
      back.addColorStop(0.8, "rgba(40,20,80,.42)");
      back.addColorStop(1, "rgba(20,10,45,.6)");
      ctx.fillStyle = back;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.06)";
      ctx.lineWidth = 1;
      for (const ry of [0.35, 0.7]) {
        ctx.beginPath();
        ctx.ellipse(CX, CY, R, R * ry, 0, 0, TAU);
        ctx.stroke();
      }

      // Nozzle and the air.
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R - 2, 0, TAU);
      ctx.clip();
      for (const p of particles) {
        ctx.strokeStyle = `rgba(200,245,255,${0.18 * p.life})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.035);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = chrome(ctx, CX - 22, 0, CX + 22, 0);
      ctx.beginPath();
      ctx.moveTo(CX - 24, CY + R - 4);
      ctx.lineTo(CX - 10, CY + R - 20);
      ctx.lineTo(CX + 10, CY + R - 20);
      ctx.lineTo(CX + 24, CY + R - 4);
      ctx.closePath();
      ctx.fill();

      // Balls in the air, back to front.
      const live = [...balls.values()].sort((a, b) => a.y - b.y);
      for (const b of live) {
        const team = teamOf.get(b.id);
        if (team) drawBall(ctx, b.x, b.y, BALL_R, team.color, initial(team), b.spin);
      }

      // The drawn ball on its way.
      if (drawn && drawn.ms >= CATCH_END && drawn.ms < SETTLE_END) {
        const slot = queue.findIndex((team) => team.id === drawn.team.id);
        const p = tubePosition(drawn.ms, SLOT_X0 + Math.max(0, slot) * SLOT_GAP);
        drawBall(ctx, p.x, p.y, BALL_R, drawn.team.color, initial(drawn.team), p.spin, 1);
      }

      // Front glass.
      ctx.strokeStyle = "rgba(230,240,255,.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.42)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(CX, CY, R - 15, Math.PI * 1.08, Math.PI * 1.4);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.2)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(CX, CY, R - 13, Math.PI * 1.5, Math.PI * 1.6);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,79,224,.28)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(CX, CY, R - 12, Math.PI * 0.1, Math.PI * 0.4);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,43,214,.75)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#ff2bd6";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(CX, CY, R + 4, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Tube: front glass and the catcher collar.
      ctx.strokeStyle = "rgba(220,235,255,.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CX - BALL_R - 4, CY - R + 10);
      ctx.lineTo(CX - BALL_R - 4, TUBE_Y + TUBE_BEND);
      ctx.arc(CX - TUBE_BEND, TUBE_Y + TUBE_BEND, TUBE_BEND - BALL_R - 4, 0, -Math.PI / 2, true);
      ctx.lineTo(tubeLeft, TUBE_Y + BALL_R + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(CX + BALL_R + 4, CY - R + 6);
      ctx.lineTo(CX + BALL_R + 4, TUBE_Y + TUBE_BEND);
      ctx.arc(CX - TUBE_BEND, TUBE_Y + TUBE_BEND, TUBE_BEND + BALL_R + 4, 0, -Math.PI / 2, true);
      ctx.lineTo(tubeLeft, TUBE_Y - BALL_R - 4);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tubeLeft + 10, TUBE_Y - BALL_R + 3);
      ctx.lineTo(CX - TUBE_BEND - 10, TUBE_Y - BALL_R + 3);
      ctx.stroke();
      ctx.fillStyle = chrome(ctx, tubeLeft - 10, 0, tubeLeft + 6, 0);
      ctx.beginPath();
      ctx.roundRect(tubeLeft - 10, TUBE_Y - BALL_R - 7, 12, BALL_R * 2 + 14, 4);
      ctx.fill();
      const catching = drawn && drawn.ms > SURGE_END - 250 && drawn.ms < RISE_END;
      ctx.fillStyle = chrome(ctx, CX - 34, 0, CX + 34, 0);
      ctx.beginPath();
      ctx.roundRect(CX - 34, CY - R - 8, 68, 16, 6);
      ctx.fill();
      ctx.fillStyle = catching ? "#22e5ff" : "rgba(34,229,255,.35)";
      ctx.shadowColor = "#22e5ff";
      ctx.shadowBlur = catching ? 18 : 0;
      ctx.fillRect(CX - 24, CY - R - 2, 48, 4);
      ctx.shadowBlur = 0;
    };

    const loop = (wall: number) => {
      const dt = Math.min(0.033, (wall - last) / 1000);
      last = wall;
      const current = stateRef.current;
      const now = clock();
      const time = now / 1000;
      const draw = current.last_draw?.kind === "drum" ? current.last_draw : null;
      const ms = draw ? now - draw.at : Infinity;
      const drawnTeam = draw && ms < SETTLE_END ? (current.teams.find((team) => team.id === draw.team) ?? null) : null;
      const queue = current.order.map((id) => current.teams.find((team) => team.id === id)).filter((team): team is GGTeam => Boolean(team));
      // In the sphere: every team not yet drawn, plus the drawn one until it's caught.
      const inDrum = current.teams.filter((team) => !current.order.includes(team.id) || (drawnTeam?.id === team.id && ms < CATCH_END));
      const want = new Set(inDrum.map((team) => team.id));
      for (const id of [...balls.keys()]) if (!want.has(id)) balls.delete(id);
      inDrum.forEach((team, i) => {
        if (!balls.has(team.id)) balls.set(team.id, spawn(team.id, i));
      });

      // Air: idle, then a surge while the drawn ball is carried up, easing back after the catch.
      const surge = drawnTeam ? Math.sin(Math.PI * seg(ms, 0, SURGE_END + 500)) : 0;
      const target = 1 + 0.9 * surge;
      air += (target - air) * Math.min(1, dt * 4);
      const pull = drawnTeam && ms < CATCH_END ? easeInOut(seg(ms, 350, SURGE_END)) : 0;
      if (drawnTeam && ms >= SURGE_END && ms < CATCH_END) {
        // Into the collar.
        const b = balls.get(drawnTeam.id);
        if (b) {
          const e = easeOut(seg(ms, SURGE_END, CATCH_END));
          b.x = lerp(b.x, CX, e);
          b.y = lerp(b.y, CY - R + BALL_R + 2, e);
          b.vx = 0;
          b.vy = 0;
        }
      }
      step(still ? 0 : dt, time, air, drawnTeam && pull > 0 ? { id: drawnTeam.id, pull } : null);
      render(drawnTeam ? { team: drawnTeam, ms } : null, queue, current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [clock]);

  return <canvas ref={canvasRef} aria-hidden className="block h-auto w-full" style={{ aspectRatio: `${W} / ${H}` }} />;
}
