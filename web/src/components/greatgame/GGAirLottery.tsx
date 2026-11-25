"use client";

import { useContext, useEffect, useRef } from "react";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import { person } from "./ggUi";
import * as sound from "./ggSound";
import { StageAnchorContext } from "./GGStageScene";

/**
 * Step 1's lottery machine: a glowing neon moon at the end of the stage's road
 * (a glass sphere), where air keeps the team balls flying the whole time,
 * each ball wearing its captain's Discord picture.
 *
 * When Tommy draws, the server has already picked the team and stamped the
 * time. Every page then plays the draw from that time: the air surges and the
 * drawn ball catches more of the jet (nothing drags it), rises with the
 * others, and is caught when it actually reaches the collar moving upward. It
 * enters the tube at the speed it arrived with, is sucked up, and rolls left
 * into its place in the order. If it hasn't reached the collar after a couple
 * of seconds, the jet's core gathers it in gently.
 *
 * The tumbling is local physics, so each page's balls fly their own way and
 * the catch lands within about a second on every page; a page opened mid-draw
 * joins in.
 */

/** Longest a draw can take on any page (the page counts it as animating until then). */
export const DRUM_MS = 8000;
/**
 * The suspense: the air builds for about 2.5 s with every ball flying, then
 * the drawn ball starts catching more of the jet. A simulation of 300 draws
 * caught it by itself between 3.6 and 5.3 s (4 s on average), never later.
 */
const SURGE_BUILD = 2500; // the air rises to full over this long
const LIFT_FROM = 3000; // the drawn ball starts catching more of the jet
const CATCH_FROM = 3600; // earliest catch
const GATHER_FROM = 4500; // still not caught: the jet core gathers it in
const CATCH_BY = 5500; // caught by now on every page
/** After the catch (ms). */
const ENTER_MS = 240; // from where it was caught into the collar
const RISE_MS = 380; // sucked up the tube
const TURN_MS = 180; // round the bend
const ROLL_MS = 1000; // rolls along to its slot
const SETTLE_MS = 320; // a little bounce against the ball before it
const LANDED_MS = ENTER_MS + RISE_MS + TURN_MS + ROLL_MS;
const DONE_MS = LANDED_MS + SETTLE_MS;

// The sphere is the scene's moon: it sits on the horizon at the end of the
// road, and the canvas runs on below it (transparent) so the road shows.
const W = 1000;
const H = 620; // the moon, then road below it for the tank
const CX = W / 2;
const CY = 250;
const R = 170;
/** Where the road ends: right behind the blower at the moon's foot, which covers it. */
const ROAD_END_Y = CY + R - 12;
const BALL_R = 22;
const TUBE_Y = 44;
const TUBE_BEND = 30;
const SLOT_X0 = 40;
const SLOT_GAP = 47;
const MOUTH_Y = CY - R + BALL_R + 4;
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

/** This page's view of the current draw: where and when the ball was caught. */
interface Catch {
  seq: number;
  at: number | null; // ms after the draw
  x: number;
  y: number;
  vx: number;
  vy: number;
  landedSent: boolean;
  /** Sounds already played for this draw. */
  heard: Set<string>;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * (3 - 2 * t);

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

/** Cubic Hermite: from p0 moving at v0 to p1 moving at v1, over `duration` seconds. */
function hermite(p0: number, v0: number, p1: number, v1: number, t: number, duration: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * v0 * duration + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * v1 * duration;
}

const ENTER_SPEED = 650; // px/s up into the collar

/** Where the drawn ball is `c` ms after it was caught, on its way to `slotX`. */
function afterCatch(c: number, caught: Catch, slotX: number): { x: number; y: number; spin: number } {
  const bendY = TUBE_Y + TUBE_BEND;
  if (c < ENTER_MS) {
    const t = c / ENTER_MS;
    const d = ENTER_MS / 1000;
    return { x: hermite(caught.x, caught.vx, CX, 0, t, d), y: hermite(caught.y, caught.vy, MOUTH_Y, -ENTER_SPEED, t, d), spin: 0 };
  }
  c -= ENTER_MS;
  if (c < RISE_MS) {
    // Keeps rising at the entry speed and is sucked faster as it goes.
    const t = c / 1000;
    const T = RISE_MS / 1000;
    const distance = MOUTH_Y - bendY;
    const accel = (2 * (distance - ENTER_SPEED * T)) / (T * T);
    return { x: CX, y: MOUTH_Y - (ENTER_SPEED * t + 0.5 * accel * t * t), spin: 0 };
  }
  c -= RISE_MS;
  if (c < TURN_MS) {
    const a = (c / TURN_MS) * (Math.PI / 2);
    return { x: CX - TUBE_BEND + Math.cos(a) * TUBE_BEND, y: bendY - Math.sin(a) * TUBE_BEND, spin: -a };
  }
  c -= TURN_MS;
  const startX = CX - TUBE_BEND;
  if (c < ROLL_MS) {
    const x = lerp(startX, slotX + 5, easeOut(c / ROLL_MS));
    return { x, y: TUBE_Y, spin: -(startX - x) / BALL_R };
  }
  c -= ROLL_MS;
  const b = clamp(c / SETTLE_MS, 0, 1);
  const x = slotX + 5 * (1 - b) * Math.cos(b * Math.PI * 3);
  return { x, y: TUBE_Y, spin: -(startX - x) / BALL_R };
}

export default function GGAirLottery({
  state,
  clock,
  avatars,
  onLanded,
}: {
  state: GGState;
  clock: () => number;
  avatars: Record<string, string>;
  /** Called once per draw, when the drawn ball reaches its slot on this page. */
  onLanded?: (seq: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const anchorRef = useContext(StageAnchorContext);
  const stateRef = useRef(state);
  const avatarsRef = useRef(avatars);
  const landedRef = useRef(onLanded);
  useEffect(() => {
    stateRef.current = state;
    avatarsRef.current = avatars;
    landedRef.current = onLanded;
  }, [state, avatars, onLanded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!anchorRef || !canvas) return undefined;
    const top = CY - R * 1.2;
    anchorRef.current = {
      el: canvas,
      fx: CX / W,
      fy: ROAD_END_Y / H,
      mirror: { x: (CX - R * 1.2) / W, y: top / H, w: (R * 2.4) / W, h: (ROAD_END_Y - top) / H },
    };
    return () => {
      anchorRef.current = null;
    };
  }, [anchorRef]);

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

    const pictures = new Map<string, HTMLImageElement>();
    const picture = (url: string | undefined) => {
      if (!url) return null;
      let image = pictures.get(url);
      if (!image) {
        image = new Image();
        image.decoding = "async";
        image.src = url;
        pictures.set(url, image);
      }
      return image.complete && image.naturalWidth ? image : null;
    };

    const balls = new Map<string, Ball>();
    const particles: Particle[] = [];
    let caught: Catch | null = null;
    let air = 1;
    let fan = 0;
    let lastSound = 0;
    const impacts: { kind: "clack" | "tink"; strength: number; x: number }[] = [];
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

    const drawBall = (x: number, y: number, team: GGTeam, label: string, avatar: string | undefined, spin: number, glow = 0) => {
      const r = BALL_R;
      ctx.save();
      ctx.translate(x, y);
      if (glow > 0) {
        ctx.shadowColor = team.color;
        ctx.shadowBlur = 24 * glow;
      }
      const body = ctx.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.08, 0, 0, r);
      body.addColorStop(0, shade(team.color, 0.6));
      body.addColorStop(0.5, team.color);
      body.addColorStop(0.92, shade(team.color, -0.55));
      body.addColorStop(1, shade(team.color, -0.7));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      // The face (picture or initial) turns with the ball, always round.
      ctx.save();
      ctx.rotate(spin * 0.15);
      const disc = r * 0.62;
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.beginPath();
      ctx.arc(0, 0, disc + 2, 0, TAU);
      ctx.fill();
      const image = picture(avatar);
      if (image) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, disc, 0, TAU);
        ctx.clip();
        ctx.drawImage(image, -disc, -disc, disc * 2, disc * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = "#120a24";
        ctx.font = `900 ${Math.round(r * 0.68)}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, 0, r * 0.05);
      }
      ctx.restore();
      // Glossy shell over the picture, a pink rim light and a highlight.
      const gloss = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 0, 0, 0, r);
      gloss.addColorStop(0, "rgba(255,255,255,.28)");
      gloss.addColorStop(0.45, "rgba(255,255,255,0)");
      gloss.addColorStop(1, "rgba(0,0,0,.25)");
      ctx.fillStyle = gloss;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,79,224,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.26, r * 0.12, -0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    const step = (dt: number, time: number, power: number, drawn: { id: string; ms: number } | null) => {
      const live = [...balls.values()];
      const steps = 4;
      const h = dt / steps;
      // The drawn ball catches more of the jet: more lift, and drift towards the jet's core.
      const lift = drawn ? smooth(seg(drawn.ms, LIFT_FROM, CATCH_FROM + 400)) : 0;
      const gather = drawn ? smooth(seg(drawn.ms, GATHER_FROM, CATCH_BY)) : 0;
      for (let s = 0; s < steps; s++) {
        for (const b of live) {
          b.vy += 900 * h;
          const depth = (b.y - (CY + R * 0.1)) / R;
          if (depth > 0) {
            const centred = 1 - Math.min(1, Math.abs(b.x - CX) / (R * 0.9));
            b.vy -= power * 2900 * h * depth * (0.55 + 0.45 * centred) * (0.6 + Math.random() * 0.8);
          }
          b.vx += (Math.sin(b.y * 0.021 + time * 1.7) * 900 + Math.sin(b.x * 0.013 - time * 1.1) * 520) * power * h;
          b.vy += Math.cos(b.x * 0.017 + time * 1.3) * 380 * power * h;
          if (drawn && b.id === drawn.id) {
            b.vy -= (2600 * lift + 3200 * gather) * h;
            b.vx += (CX - b.x) * (8 * lift + 20 * gather) * h;
            b.vx *= 1 - 2.5 * gather * h;
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
                if (rv < -140) impacts.push({ kind: "clack", strength: -rv / 650, x: (a.x + c.x) / 2 });
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
              if (vn > 160) impacts.push({ kind: "tink", strength: vn / 700, x: b.x });
              b.vx -= 1.8 * vn * nx;
              b.vy -= 1.8 * vn * ny;
            }
          }
        }
      }
      // Air streaks rising from the blower, fanning out with the turbulence; many more and faster in a surge.
      const boost = clamp((power - 1) / 0.5, 0, 1);
      const want = still ? 0 : 1.2 + 5 * boost;
      for (let k = 0; k < want; k++) {
        if (Math.random() < want - k) {
          particles.push({
            x: CX + (Math.random() - 0.5) * 30,
            y: CY + R - 18,
            vx: (Math.random() - 0.5) * 340 * (1 + boost),
            vy: -(220 + Math.random() * 240) * (1 + 1.6 * boost),
            life: 0.6 + Math.random() * 0.4,
          });
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

    const render = (time: number, drawn: { team: GGTeam; ms: number } | null, queue: GGTeam[], current: GGState) => {
      const k = canvas.width / W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const teamOf = new Map(current.teams.map((team) => [team.id, team]));
      const pics = avatarsRef.current;
      const initial = (team: GGTeam) => (person(current, team.captain)?.name ?? team.name).trim().charAt(0).toUpperCase() || "?";
      const avatar = (team: GGTeam) => (team.captain ? pics[team.captain] : undefined);

      // Tube: back wall.
      const tubeLeft = 14;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(170,210,255,.12)";
      ctx.lineWidth = BALL_R * 2 + 8;
      ctx.beginPath();
      ctx.moveTo(CX, CY - R + 8);
      ctx.lineTo(CX, TUBE_Y + TUBE_BEND);
      ctx.arc(CX - TUBE_BEND, TUBE_Y + TUBE_BEND, TUBE_BEND, 0, -Math.PI / 2, true);
      ctx.lineTo(tubeLeft, TUBE_Y);
      ctx.stroke();

      // Slot numbers under the tube; a filled slot glows in its team's colour.
      ctx.font = '800 16px "Orbitron", "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (let i = 0; i < current.teams.length; i++) {
        const team = queue[i];
        const x = SLOT_X0 + i * SLOT_GAP;
        const y = TUBE_Y + BALL_R + 20;
        // A dark outline so the number reads on any part of the scene.
        ctx.strokeStyle = "rgba(8,3,20,.9)";
        ctx.lineWidth = 4;
        ctx.strokeText(String(i + 1), x, y);
        ctx.fillStyle = team ? team.color : "rgba(255,255,255,.85)";
        if (team) {
          ctx.shadowColor = team.color;
          ctx.shadowBlur = 8;
        }
        ctx.fillText(String(i + 1), x, y);
        ctx.shadowBlur = 0;
      }

      // Balls already drawn, resting in the tube.
      queue.forEach((team, i) => {
        if (drawn && team.id === drawn.team.id) return;
        drawBall(SLOT_X0 + i * SLOT_GAP, TUBE_Y, team, initial(team), avatar(team), -i * 1.3);
      });

      // The moon: a breathing halo, then a translucent glowing body with drifting bands; the balls fly inside it.
      const halo = ctx.createRadialGradient(CX, CY, R * 0.85, CX, CY, R * 1.5);
      halo.addColorStop(0, `rgba(255,79,224,${0.36 + 0.1 * Math.sin(time * 1.3)})`);
      halo.addColorStop(1, "rgba(255,79,224,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(CX - R * 1.5, CY - R * 1.5, R * 3, R * 3);
      const moon = ctx.createLinearGradient(0, CY - R, 0, CY + R);
      moon.addColorStop(0, "rgba(255,208,244,.62)");
      moon.addColorStop(0.4, "rgba(228,139,240,.46)");
      moon.addColorStop(0.75, "rgba(154,74,216,.42)");
      moon.addColorStop(1, "rgba(90,33,150,.6)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, TAU);
      ctx.fillStyle = moon;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,.09)";
      ctx.lineWidth = R * 0.05;
      const drift = (time * 6) % (R * 0.26);
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.ellipse(CX, CY + i * R * 0.26 + drift, R * 1.1, R * 0.07, -0.08, 0, TAU);
        ctx.stroke();
      }
      const shade = ctx.createRadialGradient(CX - R * 0.35, CY - R * 0.45, R * 0.2, CX, CY, R * 1.1);
      shade.addColorStop(0, "rgba(255,255,255,.16)");
      shade.addColorStop(0.6, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(40,0,70,.4)");
      ctx.fillStyle = shade;
      ctx.fillRect(CX - R, CY - R, R * 2, R * 2);
      ctx.restore();

      // The air and the nozzle.
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R - 2, 0, TAU);
      ctx.clip();
      for (const p of particles) {
        ctx.strokeStyle = `rgba(200,245,255,${(0.16 + 0.16 * clamp((air - 1) / 0.5, 0, 1)) * p.life})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.035);
        ctx.stroke();
      }
      ctx.restore();
      // The blower: a turbine under a chrome cowl, its blades a blur when the air surges.
      const fx = CX;
      const fy = CY + R - 14;
      const boostNow = clamp((air - 1) / 0.5, 0, 1);
      ctx.fillStyle = chrome(ctx, fx - 30, 0, fx + 30, 0);
      ctx.beginPath();
      ctx.ellipse(fx, fy + 4, 30, 11, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#120a24";
      ctx.beginPath();
      ctx.ellipse(fx, fy, 23, 8, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(fx, fy, 23, 8, 0, 0, TAU);
      ctx.clip();
      const trails = 1 + Math.round(3 * boostNow);
      for (let tr = 0; tr < trails; tr++) {
        for (let blade = 0; blade < 6; blade++) {
          const a = fan - tr * 0.09 + (blade * TAU) / 6;
          ctx.strokeStyle = `rgba(230,225,242,${0.85 / (1 + tr * 1.4)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + Math.cos(a) * 22, fy + Math.sin(a) * 8);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.fillStyle = `rgba(34,229,255,${0.35 + 0.6 * boostNow})`;
      ctx.shadowColor = "#22e5ff";
      ctx.shadowBlur = 12 * boostNow;
      ctx.beginPath();
      ctx.arc(fx, fy, 3.5, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Balls in the air, back to front.
      for (const b of [...balls.values()].sort((a, c) => a.y - c.y)) {
        const team = teamOf.get(b.id);
        if (team) drawBall(b.x, b.y, team, initial(team), avatar(team), b.spin);
      }

      // The drawn ball, once caught.
      if (drawn && caught && caught.at !== null) {
        const c = drawn.ms - caught.at;
        if (c < DONE_MS) {
          const slot = Math.max(0, queue.findIndex((team) => team.id === drawn.team.id));
          const p = afterCatch(c, caught, SLOT_X0 + slot * SLOT_GAP);
          drawBall(p.x, p.y, drawn.team, initial(drawn.team), avatar(drawn.team), p.spin, 1 - seg(c, LANDED_MS, DONE_MS));
        } else {
          const slot = Math.max(0, queue.findIndex((team) => team.id === drawn.team.id));
          drawBall(SLOT_X0 + slot * SLOT_GAP, TUBE_Y, drawn.team, initial(drawn.team), avatar(drawn.team), -slot * 1.3);
        }
      }

      // Front glass.
      ctx.strokeStyle = "rgba(255,214,247,.6)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.3)";
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
      // The collar's light wakes as the draw starts and flashes at the catch.
      const sinceCatch = drawn && caught?.at != null ? drawn.ms - caught.at : null;
      const armed = drawn ? smooth(seg(drawn.ms, 0, CATCH_FROM)) : 0;
      const flash = sinceCatch !== null ? 1 - seg(sinceCatch, 0, ENTER_MS + RISE_MS) : 0;
      ctx.fillStyle = chrome(ctx, CX - 34, 0, CX + 34, 0);
      ctx.beginPath();
      ctx.roundRect(CX - 34, CY - R - 8, 68, 16, 6);
      ctx.fill();
      // Pulses faster and faster as the catch nears.
      const light = sinceCatch !== null ? flash : armed * (0.55 + 0.45 * Math.sin(Math.pow((drawn?.ms ?? 0) / 1000, 1.6) * 7));
      ctx.fillStyle = `rgba(34,229,255,${0.35 + 0.65 * light})`;
      ctx.shadowColor = "#22e5ff";
      ctx.shadowBlur = 20 * light;
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
      const drawnTeam = draw && ms < DRUM_MS ? (current.teams.find((team) => team.id === draw.team) ?? null) : null;
      if (draw && (!caught || caught.seq !== draw.seq)) caught = { seq: draw.seq, at: null, x: CX, y: MOUTH_Y, vx: 0, vy: -ENTER_SPEED, landedSent: false, heard: new Set() };
      // Opened long after this draw: treat it as caught at the latest moment.
      if (drawnTeam && caught && caught.at === null && ms >= CATCH_BY && !balls.has(drawnTeam.id)) caught.at = CATCH_BY;
      const queue = current.order.map((id) => current.teams.find((team) => team.id === id)).filter((team): team is GGTeam => Boolean(team));
      // In the sphere: every team not yet drawn, plus the drawn one until this page catches it.
      const waiting = drawnTeam && caught && caught.at === null;
      const inDrum = current.teams.filter((team) => !current.order.includes(team.id) || (waiting && drawnTeam?.id === team.id));
      const want = new Set(inDrum.map((team) => team.id));
      for (const id of [...balls.keys()]) if (!want.has(id)) balls.delete(id);
      inDrum.forEach((team, i) => {
        if (!balls.has(team.id)) balls.set(team.id, spawn(team.id, i));
      });

      // The catch: the drawn ball reaches the collar moving up (or the latest moment arrives).
      if (drawnTeam && caught && caught.at === null) {
        const b = balls.get(drawnTeam.id);
        if (b && ms >= CATCH_FROM && ((Math.abs(b.x - CX) < 36 && b.y < MOUTH_Y + 50 && b.vy < 120) || ms >= CATCH_BY)) {
          caught.at = ms;
          caught.x = b.x;
          caught.y = b.y;
          caught.vx = b.vx;
          caught.vy = Math.min(b.vy, -200);
          balls.delete(drawnTeam.id);
        }
      }
      if (draw && caught && caught.at !== null && !caught.landedSent && ms - caught.at >= LANDED_MS) {
        caught.landedSent = true;
        landedRef.current?.(draw.seq);
      }

      // Air: idle, a surge while the drawn ball rides up, easing back after the catch.
      const surging = drawnTeam && caught && (caught.at === null || ms - caught.at < 400);
      air += ((surging ? 1 + 0.5 * smooth(seg(ms, 0, SURGE_BUILD)) : 1) - air) * Math.min(1, dt * 3);
      const boost = clamp((air - 1) / 0.5, 0, 1);
      if (!still) fan += dt * (7 + 38 * boost);
      impacts.length = 0;
      step(still ? 0 : dt, time, air, drawnTeam && caught?.at === null ? { id: drawnTeam.id, ms } : null);

      // Sounds: the blower all the time, the loudest few impacts of this frame, and the draw's moments.
      sound.airLevel(still ? null : boost);
      if (impacts.length && wall - lastSound > 28) {
        impacts.sort((a, b) => b.strength - a.strength);
        for (const hit of impacts.slice(0, 2)) {
          const pan = (hit.x - W / 2) / (W / 2);
          if (hit.kind === "clack") sound.clack(hit.strength, pan);
          else sound.tink(hit.strength, pan);
        }
        lastSound = wall;
      }
      if (drawnTeam && caught && caught.at !== null) {
        const c = ms - caught.at;
        const once = (key: string, at: number, play: () => void) => {
          // Only moments that happen while the page watches (not ones long past on a late join).
          if (!caught!.heard.has(key) && c >= at && c < at + 400) play();
          if (c >= at) caught!.heard.add(key);
        };
        once("catch", 0, () => sound.thunk(0.3));
        once("suck", ENTER_MS * 0.5, () => sound.whoosh((ENTER_MS * 0.5 + RISE_MS + TURN_MS) / 1000, 0.3));
        once("roll", ENTER_MS + RISE_MS + TURN_MS, () => sound.roll(ROLL_MS / 1000));
        once("settle", LANDED_MS, () => sound.clack(0.7, -0.6));
      }
      render(time, drawnTeam ? { team: drawnTeam, ms } : null, queue, current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      sound.airLevel(null);
    };
  }, [clock]);

  return <canvas ref={canvasRef} aria-hidden className="block h-auto w-full" style={{ aspectRatio: `${W} / ${H}` }} />;
}
