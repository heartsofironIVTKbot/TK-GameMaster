"use client";

import { useEffect, useRef } from "react";

/**
 * The randomizer stage's backdrop: an outrun night like the event poster. A
 * starry violet sky with a big glowing planet, wireframe mountains on both
 * sides, neon palm trees along a road that runs to a glowing horizon over a
 * cyan grid floor.
 *
 * Everything that stands still is drawn once per size into two offscreen
 * layers (behind: sky, planet, haze; in front: mountains, palms); each frame
 * draws the moving floor grid, the road's dashes and a few twinkling stars
 * between them.
 */

const TAU = Math.PI * 2;
const HORIZON = 0.56; // share of the height
const CAM_H = 1; // camera height above the ground, in world units
const ROAD = 1.25; // half the road's width

interface View {
  w: number;
  h: number;
  hy: number; // horizon y
  f: number; // focal length
}

/** World (x across, y up, z ahead) to screen. */
function project(v: View, x: number, y: number, z: number): [number, number] {
  return [v.w / 2 + (x / z) * v.f, v.hy + ((CAM_H - y) / z) * v.f];
}

/** A fixed pseudo-random number for a seed, so the scene is the same every time. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function mountainHeight(x: number, z: number): number {
  const out = Math.abs(x) - ROAD - 0.9;
  if (out <= 0) return 0;
  const ridge = 0.55 + 0.45 * Math.sin(z * 0.45 + x * 0.7) * Math.cos(z * 0.21 - x * 0.33);
  const bumps = 0.35 * Math.sin(z * 1.3 + x * 1.9) + 0.2 * Math.cos(z * 2.1 - x * 1.4);
  return Math.max(0, Math.pow(out, 1.15) * 0.55 * (ridge + bumps * 0.5));
}

/** The back layer: sky, stars, the planet and the haze. */
function drawSky(ctx: CanvasRenderingContext2D, v: View, stars: { x: number; y: number; r: number; a: number }[]) {
  const { w, h, hy } = v;
  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, "#07031a");
  sky.addColorStop(0.45, "#170835");
  sky.addColorStop(0.8, "#3a0f5c");
  sky.addColorStop(1, "#7a1a7d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hy + 1);
  for (const star of stars) {
    ctx.fillStyle = `rgba(235,230,255,${star.a})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
  }

  // The planet, glowing, its lower half fading into the haze.
  const pr = h * 0.19;
  const px = w * 0.5;
  const py = hy - pr * 0.95;
  ctx.save();
  ctx.shadowColor = "rgba(255,79,224,.8)";
  ctx.shadowBlur = pr * 0.6;
  const body = ctx.createLinearGradient(0, py - pr, 0, py + pr);
  body.addColorStop(0, "#ffd0f4");
  body.addColorStop(0.35, "#e48bf0");
  body.addColorStop(0.7, "#9a4ad8");
  body.addColorStop(1, "#5a2196");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Soft shading and faint bands on the planet.
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.clip();
  const shadow = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.45, pr * 0.2, px, py, pr * 1.1);
  shadow.addColorStop(0, "rgba(255,255,255,.18)");
  shadow.addColorStop(0.6, "rgba(0,0,0,0)");
  shadow.addColorStop(1, "rgba(40,0,70,.45)");
  ctx.fillStyle = shadow;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  ctx.strokeStyle = "rgba(255,255,255,.07)";
  ctx.lineWidth = pr * 0.05;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(px, py + i * pr * 0.26, pr * 1.1, pr * 0.07, -0.08, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // Haze along the horizon.
  const haze = ctx.createRadialGradient(w / 2, hy, 0, w / 2, hy, w * 0.55);
  haze.addColorStop(0, "rgba(255,120,230,.55)");
  haze.addColorStop(0.35, "rgba(255,43,214,.22)");
  haze.addColorStop(1, "rgba(255,43,214,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);

}

/** The front layer (transparent elsewhere): mountains and palms, drawn over the moving floor. */
function drawFront(ctx: CanvasRenderingContext2D, v: View) {
  // Wireframe mountains on both sides, far to near: dark faces, glowing edges.
  const zs: number[] = [];
  for (let z = 70; z > 2.6; z /= 1.11) zs.push(z);
  const xs: number[] = [];
  for (let x = ROAD + 0.9; x < 16; x += 0.75) xs.push(x);
  for (const side of [-1, 1]) {
    for (let k = 0; k < zs.length - 1; k++) {
      const z0 = zs[k];
      const z1 = zs[k + 1];
      const fog = Math.min(1, 6 / z1);
      for (let i = 0; i < xs.length - 1; i++) {
        const x0 = side * xs[i];
        const x1 = side * xs[i + 1];
        const a = project(v, x0, mountainHeight(x0, z0), z0);
        const b = project(v, x1, mountainHeight(x1, z0), z0);
        const c = project(v, x1, mountainHeight(x1, z1), z1);
        const d = project(v, x0, mountainHeight(x0, z1), z1);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.lineTo(d[0], d[1]);
        ctx.closePath();
        ctx.fillStyle = "#12072a";
        ctx.fill();
        ctx.strokeStyle = `rgba(${Math.round(120 + 60 * fog)},${Math.round(120 + 100 * fog)},255,${0.12 + 0.45 * fog})`;
        ctx.lineWidth = 0.6 + 0.6 * fog;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.strokeStyle = `rgba(180,107,255,${0.06 + 0.2 * fog})`;
        ctx.stroke();
      }
    }
  }

  // Neon palms along the road, far to near.
  const palms: { x: number; z: number; tall: number; lean: number; color: string }[] = [];
  for (const side of [-1, 1]) {
    [32, 21, 14, 9].forEach((z, i) => {
      palms.push({
        x: side * (ROAD + 0.7 + rand(i * 7 + side) * 0.9),
        z,
        tall: 1.7 + rand(i * 13 + side * 3) * 0.7,
        lean: side * (0.25 + rand(i * 5 - side) * 0.35),
        color: side < 0 ? "#22e5ff" : "#ff4fe0",
      });
    });
  }
  palms.sort((a, b) => b.z - a.z);
  for (const palm of palms) drawPalm(ctx, v, palm);
}

function drawPalm(ctx: CanvasRenderingContext2D, v: View, palm: { x: number; z: number; tall: number; lean: number; color: string }) {
  const [bx, by] = project(v, palm.x, 0, palm.z);
  const scale = v.f / palm.z;
  const height = palm.tall * scale;
  const topX = bx + palm.lean * scale;
  const topY = by - height;
  ctx.save();
  ctx.shadowColor = palm.color;
  ctx.shadowBlur = Math.max(4, scale * 0.25);
  ctx.strokeStyle = palm.color;
  ctx.fillStyle = "#0b0418";
  // Trunk: a gentle curve, thicker at the base.
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.2, scale * 0.09);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(bx + palm.lean * scale * 0.1, by - height * 0.55, topX, topY);
  ctx.stroke();
  // Fronds: drooping leaves fanned around the top.
  const leaf = scale * 0.85;
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (i - 3.5) * 0.42 + (palm.lean > 0 ? 0.12 : -0.12);
    const reach = leaf * (0.75 + 0.25 * Math.cos(i * 1.7));
    const tipX = topX + Math.cos(angle) * reach * 1.1;
    const tipY = topY + Math.sin(angle) * reach * 0.45 + reach * 0.55;
    const ctrlX = topX + Math.cos(angle) * reach * 0.7;
    const ctrlY = topY + Math.sin(angle) * reach * 0.75 - reach * 0.1;
    const width = Math.max(1, scale * 0.12);
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(ctrlX, ctrlY - width, tipX, tipY);
    ctx.quadraticCurveTo(ctrlX, ctrlY + width, topX, topY);
    ctx.closePath();
    ctx.lineWidth = Math.max(0.8, scale * 0.025);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawMoving(ctx: CanvasRenderingContext2D, v: View, time: number, twinkle: { x: number; y: number; r: number; speed: number }[]) {
  const { w, h, hy } = v;
  // Twinkling stars.
  for (const star of twinkle) {
    const a = 0.25 + 0.75 * Math.max(0, Math.sin(time * star.speed + star.x));
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
  }

  // The floor: dark, then a cyan grid running towards the viewer.
  const floor = ctx.createLinearGradient(0, hy, 0, h);
  floor.addColorStop(0, "#2a0b48");
  floor.addColorStop(0.25, "#120725");
  floor.addColorStop(1, "#070312");
  ctx.fillStyle = floor;
  ctx.fillRect(0, hy, w, h - hy);
  const near = 0.55;
  const far = 60;
  ctx.lineWidth = 1;
  for (let x = -24; x <= 24; x++) {
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
  const offset = (time * 1.6) % 1;
  for (let i = 0; i < 70; i++) {
    const z = near + i - offset;
    if (z <= near * 0.9) continue;
    const [, y] = project(v, 0, 0, z);
    if (y < hy + 1) continue;
    const alpha = Math.min(0.75, 2.4 / z);
    ctx.strokeStyle = `rgba(34,229,255,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // The road: dark asphalt with glowing pink edges and moving centre dashes.
  const [nl] = project(v, -ROAD, 0, near);
  const [nr] = project(v, ROAD, 0, near);
  const [fl, fy] = project(v, -ROAD, 0, far);
  const [fr] = project(v, ROAD, 0, far);
  const [, ny] = project(v, 0, 0, near);
  ctx.fillStyle = "rgba(10,4,22,.92)";
  ctx.beginPath();
  ctx.moveTo(nl, ny);
  ctx.lineTo(nr, ny);
  ctx.lineTo(fr, fy);
  ctx.lineTo(fl, fy);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "#ff2bd6";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "rgba(255,79,224,.9)";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    const [ax, ay] = project(v, side * ROAD, 0, near);
    const [bx, by] = project(v, side * ROAD, 0, far);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.restore();
  const dash = (time * 6) % 4;
  ctx.fillStyle = "rgba(255,214,247,.85)";
  for (let z = near - dash + 4; z < far; z += 4) {
    if (z < 1.6) continue;
    const [ax, ay] = project(v, -0.05, 0, z);
    const [bx, by] = project(v, 0.05, 0, z + 1.6);
    const [cx] = project(v, 0.05, 0, z);
    const [dx] = project(v, -0.05, 0, z + 1.6);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(dx, by);
    ctx.closePath();
    ctx.fill();
  }

  // The horizon line itself.
  const line = ctx.createLinearGradient(0, 0, w, 0);
  line.addColorStop(0, "rgba(255,79,224,0)");
  line.addColorStop(0.5, "rgba(255,214,247,.95)");
  line.addColorStop(1, "rgba(255,79,224,0)");
  ctx.fillStyle = line;
  ctx.fillRect(0, hy - 1, w, 2);
}

export default function GGStageScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let view: View = { w: 1, h: 1, hy: 1, f: 1 };
    let back: HTMLCanvasElement | null = null;
    let front: HTMLCanvasElement | null = null;
    let twinkle: { x: number; y: number; r: number; speed: number }[] = [];
    let ratio = 1;

    const build = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      view = { w, h, hy: h * HORIZON, f: h * 0.85 };
      const stars = Array.from({ length: Math.round((w * h) / 2600) }, (_, i) => ({
        x: rand(i * 3.1) * w,
        y: rand(i * 5.7 + 1) * view.hy * 0.88,
        r: 0.4 + rand(i * 9.3 + 2) * 1.1,
        a: 0.25 + rand(i * 2.3 + 3) * 0.6,
      }));
      twinkle = stars.filter((_, i) => i % 7 === 0).map((star, i) => ({ x: star.x, y: star.y, r: star.r + 0.3, speed: 0.8 + rand(i * 4.4) * 2.2 }));
      const layer = (paint: (layerCtx: CanvasRenderingContext2D) => void) => {
        const element = document.createElement("canvas");
        element.width = canvas.width;
        element.height = canvas.height;
        const layerCtx = element.getContext("2d");
        if (!layerCtx) return null;
        layerCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
        paint(layerCtx);
        return element;
      };
      back = layer((layerCtx) => drawSky(layerCtx, view, stars));
      front = layer((layerCtx) => drawFront(layerCtx, view));
    };
    build();
    const observer = new ResizeObserver(build);
    observer.observe(canvas);

    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const time = still ? 0 : (now - start) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (back) ctx.drawImage(back, 0, 0);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawMoving(ctx, view, time, twinkle);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (front) ctx.drawImage(front, 0, 0);
      if (!still) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
