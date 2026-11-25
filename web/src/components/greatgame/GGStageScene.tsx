"use client";

import { createContext, useEffect, useRef, type MutableRefObject } from "react";

/**
 * The randomizer stage's backdrop: an outrun night like the event poster,
 * always on the move. A starry violet sky, wireframe mountains rolling past on
 * both sides, neon palms (cyan on the left, pink on the right) lining a wet
 * road that mirrors the light at its end, and a cyan grid floor, all flying
 * towards the viewer at one speed, out of a haze on the horizon. A shooting
 * star crosses the sky about every ten seconds.
 *
 * A machine can stand at the end of the road: it registers an anchor (the
 * point where the road meets it), and the scene puts its horizon and
 * vanishing point there. The drum's sphere is the moon this way. With no
 * anchor (the reel), the scene draws its own planet above the horizon.
 *
 * The sky is drawn once per size; everything else 30 times a second (the
 * machines in front keep their own 60).
 */

export interface StageAnchor {
  el: HTMLElement;
  /** The anchor point as a share of the element's width and height. */
  fx: number;
  fy: number;
}

/** Lets a machine on the stage tell the scene where the road should end. */
export const StageAnchorContext = createContext<MutableRefObject<StageAnchor | null> | null>(null);

const TAU = Math.PI * 2;
const DEFAULT_HORIZON = 0.56; // share of the height, with no anchor
const CAM_H = 1; // camera height above the ground, in world units
const ROAD = 1.25; // half the road's width
const SPEED = 3; // world units per second
const FRAME_MS = 1000 / 30;

interface View {
  w: number;
  h: number;
  hy: number; // horizon y
  cx: number; // vanishing point x
  f: number; // focal length
}

/** World (x across, y up, z ahead) to screen. */
function project(v: View, x: number, y: number, z: number): [number, number] {
  return [v.cx + (x / z) * v.f, v.hy + ((CAM_H - y) / z) * v.f];
}

/** A fixed pseudo-random number for a seed, so the scene is the same every time. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Terrain height at world (x, z) and time: flat by the road, rising into
 * ridges away from it, and swelling up and down in slow waves.
 */
function terrain(x: number, z: number, time: number): number {
  const out = Math.abs(x) - ROAD - 0.9;
  if (out <= 0) return 0;
  const ridge = 0.6 + 0.4 * Math.sin(z * 0.32 + x * 0.6) * Math.cos(z * 0.17 - x * 0.29);
  const bumps = 0.35 * Math.sin(z * 0.9 + x * 1.7) + 0.22 * Math.cos(z * 1.6 - x * 1.2);
  const swell = 0.72 + 0.42 * Math.sin(time * 0.55 + z * 0.4 + x * 0.55) + 0.12 * Math.sin(time * 1.0 - x * 0.9);
  return Math.max(0, Math.pow(out, 1.15) * 0.55 * (ridge + bumps * 0.5) * swell);
}

function drawSky(ctx: CanvasRenderingContext2D, v: View, stars: { x: number; y: number; r: number; a: number }[]) {
  const { w, h, hy } = v;
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, "#07031a");
  sky.addColorStop(0.45, "#170835");
  sky.addColorStop(0.8, "#3a0f5c");
  sky.addColorStop(1, "#7a1a7d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hy + 1);
  for (const star of stars) {
    if (star.y > hy - 6) continue;
    ctx.fillStyle = `rgba(235,230,255,${star.a})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
  }
  const haze = ctx.createRadialGradient(v.cx, hy, 0, v.cx, hy, w * 0.6);
  haze.addColorStop(0, "rgba(255,120,230,.55)");
  haze.addColorStop(0.35, "rgba(255,43,214,.22)");
  haze.addColorStop(1, "rgba(255,43,214,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
}

/** The planet (only when no machine stands at the end of the road): drifting bands, a breathing glow. */
function drawPlanet(ctx: CanvasRenderingContext2D, v: View, time: number) {
  const pr = v.h * 0.19;
  const px = v.cx;
  const py = v.hy - pr * 0.95;
  const breathe = 0.85 + 0.15 * Math.sin(time * 1.3);
  const halo = ctx.createRadialGradient(px, py, pr * 0.8, px, py, pr * 1.7);
  halo.addColorStop(0, `rgba(255,79,224,${0.45 * breathe})`);
  halo.addColorStop(1, "rgba(255,79,224,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(px - pr * 1.7, py - pr * 1.7, pr * 3.4, pr * 3.4);
  const body = ctx.createLinearGradient(0, py - pr, 0, py + pr);
  body.addColorStop(0, "#ffd0f4");
  body.addColorStop(0.35, "#e48bf0");
  body.addColorStop(0.7, "#9a4ad8");
  body.addColorStop(1, "#5a2196");
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = pr * 0.05;
  const drift = (time * 6) % (pr * 0.26);
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath();
    ctx.ellipse(px, py + i * pr * 0.26 + drift, pr * 1.1, pr * 0.07, -0.08, 0, TAU);
    ctx.stroke();
  }
  const shade = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.45, pr * 0.2, px, py, pr * 1.1);
  shade.addColorStop(0, "rgba(255,255,255,.18)");
  shade.addColorStop(0.6, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(40,0,70,.45)");
  ctx.fillStyle = shade;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  ctx.restore();
}

function drawFloor(ctx: CanvasRenderingContext2D, v: View, travel: number) {
  const { w, h, hy } = v;
  const floor = ctx.createLinearGradient(0, hy, 0, h);
  floor.addColorStop(0, "#2a0b48");
  floor.addColorStop(0.25, "#120725");
  floor.addColorStop(1, "#070312");
  ctx.fillStyle = floor;
  ctx.fillRect(0, hy, w, h - hy);
  const near = 0.55;
  const far = 60;
  ctx.lineWidth = 1;
  for (let x = -26; x <= 26; x++) {
    if (Math.abs(x) < ROAD) continue;
    const [x0, y0] = project(v, x, 0, near);
    const [x1, y1] = project(v, x, 0, far);
    const g = ctx.createLinearGradient(0, y1, 0, y0);
    g.addColorStop(0, "rgba(34,229,255,0)");
    g.addColorStop(1, "rgba(34,229,255,.7)");
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  const offset = travel % 1;
  for (let i = 0; i < 70; i++) {
    const z = near + i + 1 - offset;
    const [, y] = project(v, 0, 0, z);
    if (y < hy + 1 || y > h) continue;
    ctx.strokeStyle = `rgba(34,229,255,${Math.min(0.75, 2.4 / z)})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // The road: dark asphalt, glowing pink edges, centre dashes.
  const [nl, ny] = project(v, -ROAD, 0, near);
  const [nr] = project(v, ROAD, 0, near);
  const [fl, fy] = project(v, -ROAD, 0, far);
  const [fr] = project(v, ROAD, 0, far);
  ctx.fillStyle = "rgba(10,4,22,.92)";
  ctx.beginPath();
  ctx.moveTo(nl, ny);
  ctx.lineTo(nr, ny);
  ctx.lineTo(fr, fy);
  ctx.lineTo(fl, fy);
  ctx.closePath();
  ctx.fill();
  for (const [width, color] of [
    [6, "rgba(255,43,214,.25)"],
    [2, "rgba(255,79,224,.95)"],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const side of [-1, 1]) {
      const [ax, ay] = project(v, side * ROAD, 0, near);
      const [bx, by] = project(v, side * ROAD, 0, far);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
  // Reflection: the glow at the road's end mirrored down the wet asphalt.
  const [rl, ry] = project(v, -ROAD * 0.55, 0, near);
  const [rr] = project(v, ROAD * 0.55, 0, near);
  const shine = ctx.createLinearGradient(0, fy, 0, ry);
  shine.addColorStop(0, "rgba(255,150,240,.55)");
  shine.addColorStop(0.25, "rgba(255,79,224,.22)");
  shine.addColorStop(1, "rgba(255,79,224,0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.moveTo(v.cx, fy);
  ctx.lineTo(rr, ry);
  ctx.lineTo(rl, ry);
  ctx.closePath();
  ctx.fill();
  // The edge lights mirrored faintly just inside the road.
  ctx.strokeStyle = "rgba(255,79,224,.16)";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    const [ax, ay] = project(v, side * ROAD * 0.86, 0, near);
    const [bx, by] = project(v, side * ROAD * 0.86, 0, far);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  const dash = travel % 4;
  ctx.fillStyle = "rgba(255,214,247,.85)";
  for (let z = 4 - dash; z < far; z += 4) {
    if (z < 1.6) continue;
    const [ax, ay] = project(v, -0.05, 0, z);
    const [cx] = project(v, 0.05, 0, z);
    const [bx, by] = project(v, 0.05, 0, z + 1.6);
    const [dx] = project(v, -0.05, 0, z + 1.6);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(dx, by);
    ctx.closePath();
    ctx.fill();
  }
}

/** Wireframe mountains rolling past on both sides: rows scroll towards the viewer, far to near. */
function drawMountains(ctx: CanvasRenderingContext2D, v: View, travel: number, time: number) {
  const DZ = 1.5;
  const Z_NEAR = 2.4;
  const Z_FAR = 54;
  const phase = travel % DZ;
  const zs: number[] = [];
  for (let k = Math.ceil(Z_FAR / DZ); k >= 0; k--) {
    const z = k * DZ + DZ - phase;
    if (z > Z_NEAR && z <= Z_FAR) zs.push(z);
  }
  zs.push(Z_NEAR);
  const xs: number[] = [];
  for (let x = ROAD + 0.9; x < 15; x += 1) xs.push(x);
  ctx.lineWidth = 1;
  for (let k = 0; k < zs.length - 1; k++) {
    const z0 = zs[k];
    const z1 = zs[k + 1];
    const fog = Math.min(1, 6 / z1);
    const edge = `rgba(${Math.round(120 + 60 * fog)},${Math.round(120 + 100 * fog)},255,${0.12 + 0.45 * fog})`;
    // New rows appear far away: fade them in over the last stretch.
    ctx.globalAlpha = Math.min(1, (Z_FAR - z0) / 14);
    for (const side of [-1, 1]) {
      for (let i = 0; i < xs.length - 1; i++) {
        const x0 = side * xs[i];
        const x1 = side * xs[i + 1];
        const a = project(v, x0, terrain(x0, z0 + travel, time), z0);
        const b = project(v, x1, terrain(x1, z0 + travel, time), z0);
        const c = project(v, x1, terrain(x1, z1 + travel, time), z1);
        const d = project(v, x0, terrain(x0, z1 + travel, time), z1);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.lineTo(d[0], d[1]);
        ctx.closePath();
        ctx.fillStyle = "#12072a";
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Haze along the horizon, over the far end of the floor, the road and the
 * mountains, so everything rises out of the distance instead of appearing.
 */
function drawHaze(ctx: CanvasRenderingContext2D, v: View) {
  const band = v.h * 0.06;
  const haze = ctx.createLinearGradient(0, v.hy - band, 0, v.hy + band * 0.6);
  haze.addColorStop(0, "rgba(122,26,125,0)");
  haze.addColorStop(0.62, "rgba(122,26,125,.5)");
  haze.addColorStop(0.76, "rgba(90,20,110,.38)");
  haze.addColorStop(1, "rgba(42,11,72,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, v.hy - band, v.w, band * 1.6);
}

/** A shooting star now and then: a bright head and a fading tail, in a random direction. */
interface Meteor {
  x: number;
  y: number;
  dx: number;
  dy: number;
  born: number;
  life: number;
}

function drawMeteors(ctx: CanvasRenderingContext2D, meteors: Meteor[], time: number) {
  for (const m of meteors) {
    const age = (time - m.born) / m.life;
    if (age < 0 || age > 1) continue;
    const speed = 900;
    const travelled = age * m.life * speed;
    const hx = m.x + m.dx * travelled;
    const hy = m.y + m.dy * travelled;
    const tail = 140 * Math.min(1, age * 4);
    const fade = Math.sin(Math.PI * age);
    const g = ctx.createLinearGradient(hx, hy, hx - m.dx * tail, hy - m.dy * tail);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
    g.addColorStop(0.3, `rgba(180,240,255,${0.5 * fade})`);
    g.addColorStop(1, "rgba(255,79,224,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - m.dx * tail, hy - m.dy * tail);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${fade})`;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.8, 0, TAU);
    ctx.fill();
  }
}

/** One glowing palm, drawn once into a sprite (glow is costly per frame). Base at (130, 370). */
function palmSprite(color: string): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = 260;
  sprite.height = 380;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;
  const baseX = 130;
  const baseY = 370;
  const topX = 158;
  const topY = 96;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.fillStyle = "#0b0418";
  ctx.lineCap = "round";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(baseX + 6, baseY - 160, topX, topY);
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const angle = -Math.PI / 2 + (i - 4) * 0.38;
    const reach = 92 * (0.78 + 0.22 * Math.cos(i * 1.7));
    const tipX = topX + Math.cos(angle) * reach * 1.15;
    const tipY = topY + Math.sin(angle) * reach * 0.42 + reach * 0.6;
    const ctrlX = topX + Math.cos(angle) * reach * 0.7;
    const ctrlY = topY + Math.sin(angle) * reach * 0.8 - reach * 0.12;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(ctrlX, ctrlY - 12, tipX, tipY);
    ctx.quadraticCurveTo(ctrlX, ctrlY + 10, topX, topY);
    ctx.closePath();
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
  }
  return sprite;
}

const PALM_SPAN = 54; // palms repeat every this many units along the road
const PALMS = 7; // per side

function drawPalms(ctx: CanvasRenderingContext2D, v: View, travel: number, sprites: { left: HTMLCanvasElement; right: HTMLCanvasElement }) {
  const palms: { side: number; x: number; z: number; tall: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < PALMS; i++) {
      const start = (i * PALM_SPAN) / PALMS + (side > 0 ? PALM_SPAN / PALMS / 2 : 0);
      const z = 2.5 + ((((start - travel) % PALM_SPAN) + PALM_SPAN) % PALM_SPAN);
      palms.push({ side, x: side * (ROAD + 0.3 + rand(i * 7 + side) * 0.3), z, tall: 1.8 + rand(i * 13 + side * 3) * 0.6 });
    }
  }
  palms.sort((a, b) => b.z - a.z);
  for (const palm of palms) {
    const fade = Math.min(1, (palm.z - 2.5) / 2.5, (PALM_SPAN + 2.5 - palm.z) / 8);
    if (fade <= 0) continue;
    const [sx, sy] = project(v, palm.x, 0, palm.z);
    const k = (palm.tall * v.f) / palm.z / 280;
    ctx.globalAlpha = fade;
    if (palm.side < 0) {
      // Left palms lean outwards: the sprite mirrored.
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(-k, k);
      ctx.drawImage(sprites.left, -130, -370);
      ctx.restore();
    } else {
      ctx.drawImage(sprites.right, sx - 130 * k, sy - 370 * k, 260 * k, 380 * k);
    }
  }
  ctx.globalAlpha = 1;
}

export default function GGStageScene({ anchorRef }: { anchorRef: MutableRefObject<StageAnchor | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = { left: palmSprite("#22e5ff"), right: palmSprite("#ff4fe0") };
    let view: View = { w: 1, h: 1, hy: 1, cx: 1, f: 1 };
    let sky: HTMLCanvasElement | null = null;
    let twinkle: { x: number; y: number; r: number; speed: number }[] = [];
    let ratio = 1;

    // Where the road ends: at the anchored machine, or the default horizon.
    const place = (): boolean => {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      let hy = h * DEFAULT_HORIZON;
      let cx = w / 2;
      const anchor = anchorRef.current;
      if (anchor?.el.isConnected) {
        const box = canvas.getBoundingClientRect();
        const target = anchor.el.getBoundingClientRect();
        hy = target.top - box.top + anchor.fy * target.height;
        cx = target.left - box.left + anchor.fx * target.width;
      }
      const changed = Math.abs(view.w - w) > 0.5 || Math.abs(view.h - h) > 0.5 || Math.abs(view.hy - hy) > 0.5 || Math.abs(view.cx - cx) > 0.5;
      view = { w, h, hy, cx, f: h * 0.85 };
      return changed;
    };

    const build = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(view.w * ratio);
      canvas.height = Math.round(view.h * ratio);
      const stars = Array.from({ length: Math.round((view.w * view.h) / 2600) }, (_, i) => ({
        x: rand(i * 3.1) * view.w,
        y: rand(i * 5.7 + 1) * view.h * 0.6,
        r: 0.4 + rand(i * 9.3 + 2) * 1.1,
        a: 0.25 + rand(i * 2.3 + 3) * 0.6,
      }));
      twinkle = stars.filter((_, i) => i % 7 === 0).map((star, i) => ({ x: star.x, y: star.y, r: star.r + 0.3, speed: 0.8 + rand(i * 4.4) * 2.2 }));
      sky = document.createElement("canvas");
      sky.width = canvas.width;
      sky.height = canvas.height;
      const skyCtx = sky.getContext("2d");
      if (!skyCtx) return;
      skyCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawSky(skyCtx, view, stars);
    };
    place();
    build();
    const observer = new ResizeObserver(() => {
      place();
      build();
    });
    observer.observe(canvas);

    let frame = 0;
    let lastDraw = -Infinity;
    let lastPlace = 0;
    const meteors: Meteor[] = [];
    let nextMeteor = 3 + Math.random() * 4;
    const start = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;
      if (now - lastPlace > 400) {
        lastPlace = now;
        if (place()) build();
      }
      const time = still ? 0 : (now - start) / 1000;
      const travel = time * SPEED;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (sky) ctx.drawImage(sky, 0, 0);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (const star of twinkle) {
        if (star.y > view.hy - 6) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.75 * Math.max(0, Math.sin(time * star.speed + star.x))})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, TAU);
        ctx.fill();
      }
      if (!anchorRef.current) drawPlanet(ctx, view, time);
      drawFloor(ctx, view, travel);
      drawMountains(ctx, view, travel, time);
      drawHaze(ctx, view);
      drawPalms(ctx, view, travel, sprites);
      // A shooting star about every 10 s, somewhere in the sky, in any direction.
      if (!still && time >= nextMeteor) {
        const angle = Math.random() * TAU;
        meteors.push({
          x: view.w * (0.1 + Math.random() * 0.8),
          y: view.hy * (0.08 + Math.random() * 0.5),
          dx: Math.cos(angle),
          dy: Math.sin(angle) * 0.6 + 0.25,
          born: time,
          life: 0.7 + Math.random() * 0.4,
        });
        nextMeteor = time + 8 + Math.random() * 4;
      }
      while (meteors.length && time - meteors[0].born > 2) meteors.shift();
      drawMeteors(ctx, meteors, time);
      if (still) cancelAnimationFrame(frame);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [anchorRef]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
