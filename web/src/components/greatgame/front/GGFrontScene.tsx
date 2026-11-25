"use client";

import { useEffect, useRef } from "react";

/**
 * The front page's poster scene, on one canvas: a synthwave sky with a striped
 * sun setting behind a spinning neon globe (the coasts glow; arcs fly between
 * the majors' capitals), a tank and a battleship with neon rim light, bombers
 * crossing the sky, and a dark sea that mirrors the sun and the globe in
 * ripples. The tank stands on a gridded shore on the left, where a glowing
 * surf line meets the water; the battleship rides the swell on the right.
 *
 * Map data: public/landing/globe-vanilla.json (the globe's coasts, capitals).
 * It stops drawing while off screen, and draws one still frame for reduced motion.
 */

export interface SceneMajor {
  tag: string;
  color: string;
}

interface Lines {
  lon: Float32Array;
  lat: Float32Array;
  sinLat: Float32Array;
  cosLat: Float32Array;
  starts: Uint32Array;
}

interface GlobeJson {
  coast: number[][];
  capitals: Record<string, [number, number]>;
}

const D2R = Math.PI / 180;

/** Polylines thinned so no two kept points are closer than `step` degrees. */
function prepare(source: number[][], step: number): Lines {
  const lon: number[] = [];
  const lat: number[] = [];
  const starts: number[] = [];
  for (const line of source) {
    const begin = lon.length;
    let lastX = Infinity;
    let lastY = Infinity;
    for (let i = 0; i < line.length; i += 2) {
      const x = line[i];
      const y = line[i + 1];
      const end = i >= line.length - 2;
      if (Math.abs(x - lastX) + Math.abs(y - lastY) < step && !end) continue;
      lon.push(x);
      lat.push(y);
      lastX = x;
      lastY = y;
    }
    if (lon.length - begin >= 2) starts.push(begin);
    else lon.length = lat.length = begin;
  }
  starts.push(lon.length);
  const latArr = Float32Array.from(lat);
  return {
    lon: Float32Array.from(lon),
    lat: latArr,
    sinLat: latArr.map((v) => Math.sin(v * D2R)),
    cosLat: latArr.map((v) => Math.cos(v * D2R)),
    starts: Uint32Array.from(starts),
  };
}

// ---------- Silhouettes: a body (filled dark, lit at the rim) and detail lines, in their own boxes (bottom = ground). ----------

interface Art {
  w: number;
  h: number;
  body: string;
  detail: string;
}

const circle = (x: number, y: number, r: number) => `M${x + r} ${y} A${r} ${r} 0 1 0 ${x - r} ${y} A${r} ${r} 0 1 0 ${x + r} ${y} Z `;

/** A WW2 heavy tank, facing right. */
const TANK_ART: Art = {
  w: 236,
  h: 92,
  body: [
    "M18 66 L196 66 Q208 66 211 74 L203 86 Q199 91 192 91 L30 91 Q23 91 19 86 L9 74 Q9 66 18 66 Z",
    "M12 66 L16 50 L40 46 L150 46 L196 54 L214 66 Z",
    "M12 66 L214 66 L209 73 L17 73 Z",
    "M70 46 L76 30 Q78 26 86 25 L132 25 Q140 26 144 32 L152 46 Z",
    "M146 31 L160 30 Q165 35 160 41 L148 43 Z",
    "M158 33.5 L222 32.5 L222 37 L158 38 Z",
    "M220 30 L232 30 L232 39.5 L220 39.5 Z",
    "M92 25 L94 17 Q95 15 98 15 L108 15 Q111 15 111 17 L112 25 Z",
    "M112 18 L121 9 L123 11 L114 20 Z",
    "M84 25 L65 -14 L66.2 -14.5 L86 25 Z",
    "M20 50 L44 47 L44 40 L24 41 Z",
    "M8 55 L14 55 L14 60 L8 60 Z",
  ].join(" "),
  detail: [
    [34, 56, 78, 100, 122, 144, 166, 186].map((x) => circle(x, 80, 8)).join(""),
    [34, 56, 78, 100, 122, 144, 166, 186].map((x) => circle(x, 80, 2.4)).join(""),
    circle(20, 77, 7),
    circle(204, 76, 6),
    "M17 73 L209 73 M42 55 L196 59 M82 40 L146 40 M150 52 L172 55 M96 33 L128 33 M58 50 L58 46",
  ].join(" "),
};

/** A battleship, bow to the left. */
const SHIP_ART: Art = {
  w: 420,
  h: 112,
  body: [
    "M0 72 Q50 82 100 84 L372 84 Q400 84 420 80 L416 98 Q412 106 400 108 L70 110 Q28 100 0 72 Z",
    "M86 84 L90 72 Q92 70 96 70 L122 70 Q126 70 128 74 L132 84 Z",
    "M44 73 L92 72 L92 74.5 L44 75.5 Z M46 77 L92 76 L92 78.5 L46 79.5 Z",
    "M120 84 L120 68 L152 68 L152 84 Z",
    "M118 68 L122 57 Q124 55 128 55 L150 55 Q154 55 155 58 L158 68 Z",
    "M80 58 L124 57 L124 59.5 L80 60.5 Z M82 62 L124 61 L124 63.5 L82 64.5 Z",
    "M160 84 L160 62 L168 62 L168 48 L176 48 L176 36 L182 36 L182 24 L186 24 L186 6 L189 6 L189 24 L194 24 L194 36 L200 36 L200 48 L208 48 L208 62 L216 62 L216 84 Z",
    "M172 30 L206 30 L206 33 L172 33 Z",
    "M222 84 L226 50 Q228 44 236 44 L250 44 Q256 44 257 50 L260 84 Z",
    "M223 46 L259 46 L259 40 L223 40 Z",
    "M270 84 L272 12 L275 12 L278 84 Z M260 28 L288 28 L288 30.5 L260 30.5 Z",
    "M282 84 L282 66 L318 66 L318 84 Z M292 66 L292 54 L308 54 L308 66 Z",
    "M330 84 L333 72 Q335 70 339 70 L362 70 Q366 70 368 72 L372 84 Z",
    "M366 73 L410 72 L410 74.5 L366 75.5 Z M366 77 L408 76 L408 78.5 L366 79.5 Z",
    "M140 84 L140 79 L147 79 L147 84 Z M262 84 L262 78 L268 78 L268 84 Z M322 84 L322 78 L328 78 L328 84 Z",
  ].join(" "),
  detail: [
    "M8 84 L416 84 M168 54 L208 54 M176 42 L200 42 M226 60 L258 60 M100 96 L380 96",
    Array.from({ length: 22 }, (_, i) => circle(110 + i * 12, 90, 1.2)).join(""),
  ].join(" "),
};

/** A four-engined bomber, facing right. */
const PLANE_ART: Art = {
  w: 64,
  h: 26,
  body: [
    "M2 13 Q8 9 24 9 L50 9.5 Q60 10.5 63 13 Q60 15.5 50 16 L24 16.5 Q8 16.5 2 13 Z",
    "M2 13 L4 2 Q5 0.5 7 1 L14 9 Z",
    "M4 13.5 L14 13.5 L10 17 L3 17 Z",
    "M26 12.5 L42 12.5 L36 25 L29 25 Z",
    "M30 15 L41 15 L41 18.5 L30 18.5 Z M33 20 L39 20 L38.5 22.5 L33 22.5 Z",
    "M28 10 L40 10 L35 4 L31 4 Z",
    "M48 9.5 Q52 6.5 56 9.8 Z",
  ].join(" "),
  detail: "M20 12 L48 12 M58 12.5 L62 12.5",
};

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

export default function GGFrontScene({ majors }: { majors: SceneMajor[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const majorsRef = useRef(majors);
  useEffect(() => {
    majorsRef.current = majors;
  }, [majors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Built here: Path2D only exists in the browser.
    const art = (a: Art) => ({ ...a, bodyPath: new Path2D(a.body), detailPath: new Path2D(a.detail) });
    const TANK = art(TANK_ART);
    const SHIP = art(SHIP_ART);
    const PLANE = art(PLANE_ART);
    type Built = ReturnType<typeof art>;

    let globe: Lines | null = null;
    let capitals: Record<string, [number, number]> = {};
    let W = 0;
    let H = 0;
    let ratio = 1;
    let frame = 0;
    let visible = true;
    const sun = document.createElement("canvas");
    const sunCtx = sun.getContext("2d")!;
    let stars: Star[] = [];
    const start = performance.now();

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      W = Math.max(1, box.width);
      H = Math.max(1, box.height);
      ratio = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 1.25);
      canvas.width = Math.round(W * ratio);
      canvas.height = Math.round(H * ratio);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      stars = Array.from({ length: Math.round((W * H) / 9000) }, () => ({ x: rnd() * W, y: rnd() * H * 0.5, r: 0.4 + rnd() * 1.2, phase: rnd() * 6.28 }));
      if (still || !frame) draw(still ? 12000 : 0);
    };

    let arc: { a: string; b: string; at: number } | null = null;
    let nextArc = 1500;

    /** A silhouette: rim glow, a dark body lit from the top, then its detail lines. `x` is its left edge, `y` the ground. */
    const silhouette = (piece: Built, x: number, y: number, width: number, rim: string, flip = false, reflect = 0) => {
      const s = width / piece.w;
      const paint = (mirror: boolean) => {
        ctx.save();
        ctx.translate(flip ? x + width : x, mirror ? y : y - piece.h * s);
        ctx.scale(flip ? -s : s, mirror ? -s * 0.7 : s);
        if (mirror) ctx.translate(0, -piece.h);
        if (!mirror) {
          ctx.shadowColor = rim;
          ctx.shadowBlur = 18;
          ctx.strokeStyle = rim;
          ctx.lineWidth = 3 / s;
          ctx.lineJoin = "round";
          ctx.stroke(piece.bodyPath);
          ctx.shadowBlur = 0;
        }
        const body = ctx.createLinearGradient(0, 0, 0, piece.h);
        body.addColorStop(0, "#140826");
        body.addColorStop(0.5, "#070312");
        body.addColorStop(1, "#020006");
        ctx.fillStyle = body;
        ctx.fill(piece.bodyPath);
        ctx.save();
        ctx.clip(piece.bodyPath);
        const light = ctx.createLinearGradient(0, 0, 0, piece.h * 0.5);
        light.addColorStop(0, `${rim}38`);
        light.addColorStop(1, `${rim}00`);
        ctx.fillStyle = light;
        ctx.fillRect(-10, -20, piece.w + 20, piece.h * 0.5 + 20);
        ctx.strokeStyle = rim;
        ctx.globalAlpha = mirror ? 0.12 : 0.22;
        ctx.lineWidth = 1 / s;
        ctx.stroke(piece.detailPath);
        ctx.globalAlpha = mirror ? 0.25 : 0.5;
        ctx.lineWidth = 1.3 / s;
        ctx.stroke(piece.bodyPath);
        ctx.restore();
        ctx.restore();
      };
      paint(false);
      if (reflect > 0) {
        ctx.save();
        ctx.globalAlpha = reflect;
        paint(true);
        ctx.restore();
      }
    };

    const draw = (t: number) => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const narrow = W < 700;
      const portrait = W / H < 0.75;
      const R = portrait ? Math.min(W * 0.4, H * 0.2) : Math.min(H * 0.25, W * 0.38);
      const gx = W / 2;
      const gy = portrait ? H * 0.25 : H * 0.66 - R * 1.04;
      const horizon = gy + R * 1.04;
      const floorH = H - horizon;
      const F = floorH * 1.05;
      const lon0 = 12 + (still ? 0 : (t / 1000) * 3.2);
      const lat0 = 30;
      const unit = Math.min(W, H * 1.8);

      // Sky.
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#06020f");
      sky.addColorStop(0.4, "#17062f");
      sky.addColorStop(0.75, "#3d0b52");
      sky.addColorStop(1, "#9a1d6b");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);
      for (const star of stars) {
        const a = 0.35 + 0.45 * Math.sin(star.phase + t / 900);
        ctx.globalAlpha = Math.max(0, a) * Math.max(0, 1 - star.y / (horizon * 0.85));
        ctx.fillStyle = "#fff";
        ctx.fillRect(star.x, star.y, star.r, star.r);
      }
      ctx.globalAlpha = 1;
      for (let k = 0; k < 6; k++) {
        const speed = 6 + k * 2.5;
        const x = ((k * 0.23 * W + (t / 1000) * speed) % (W * 1.4)) - W * 0.2;
        const y = horizon - H * (0.03 + (k % 3) * 0.035);
        const w = W * (0.16 + (k % 2) * 0.08);
        const cloud = ctx.createRadialGradient(x, y, 0, x, y, w);
        cloud.addColorStop(0, "rgba(255, 110, 170, 0.16)");
        cloud.addColorStop(1, "rgba(255, 110, 170, 0)");
        ctx.fillStyle = cloud;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.12);
        ctx.translate(-x, -y);
        ctx.fillRect(x - w, y - w, w * 2, w * 2);
        ctx.restore();
      }

      // The sun.
      const sR = R * 1.45;
      const sx = gx;
      const sy = gy + R * 0.3;
      const halo = ctx.createRadialGradient(sx, sy, sR * 0.6, sx, sy, sR * 1.7);
      halo.addColorStop(0, "rgba(255, 120, 120, 0.42)");
      halo.addColorStop(1, "rgba(255, 60, 160, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(sx - sR * 1.7, sy - sR * 1.7, sR * 3.4, sR * 3.4);
      const size = Math.ceil(sR * 2 * ratio);
      if (sun.width !== size) {
        sun.width = size;
        sun.height = size;
      }
      sunCtx.setTransform(1, 0, 0, 1, 0, 0);
      sunCtx.clearRect(0, 0, size, size);
      sunCtx.globalCompositeOperation = "source-over";
      const body = sunCtx.createLinearGradient(0, 0, 0, size);
      body.addColorStop(0, "#ffe680");
      body.addColorStop(0.35, "#ffa24d");
      body.addColorStop(0.62, "#ff5a7a");
      body.addColorStop(1, "#d81fb0");
      sunCtx.fillStyle = body;
      sunCtx.beginPath();
      sunCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      sunCtx.fill();
      sunCtx.globalCompositeOperation = "destination-out";
      const slide = still ? 0.5 : (t / 3200) % 1;
      for (let k = -1; k < 9; k++) {
        const y = 0.42 + (k + slide) * 0.07;
        if (y < 0.4 || y > 1) continue;
        sunCtx.fillRect(0, y * size, size, (0.006 + (y - 0.4) * 0.07) * size);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, horizon);
      ctx.clip();
      ctx.drawImage(sun, sx - sR, sy - sR, sR * 2, sR * 2);
      ctx.restore();

      const neon = ctx.createLinearGradient(0, 0, W, 0);
      neon.addColorStop(0, "#ff2bd6");
      neon.addColorStop(0.5, "#b46bff");
      neon.addColorStop(1, "#22e5ff");


      // The globe first: the sea mirrors everything above the horizon.
      drawTheGlobe(t, gx, gy, R, lon0, lat0);
      // The sky's reflection everywhere, then the sun and globe mirrored in ripples (only where they are).
      const mirrored = ctx.createLinearGradient(0, horizon, 0, H);
      mirrored.addColorStop(0, "#7a1860");
      mirrored.addColorStop(0.35, "#2c0a45");
      mirrored.addColorStop(1, "#08021a");
      ctx.fillStyle = mirrored;
      ctx.fillRect(0, horizon, W, floorH);
      const strip = 4;
      const left = Math.max(0, gx - sR * 1.3);
      const span = Math.min(W, gx + sR * 1.3) - left;
      for (let y = horizon; y < H; y += strip) {
        const dy = y - horizon;
        const src = horizon - dy * 1.35 - strip * 1.35;
        if (src < 0) break;
        const wave = still ? 0 : Math.sin(y * 0.11 + t * 0.0021) * (1.2 + dy * 0.035) + Math.sin(y * 0.031 - t * 0.0013) * dy * 0.02;
        ctx.drawImage(canvas, left * ratio, src * ratio, span * ratio, strip * 1.35 * ratio, left + wave, y, span, strip + 0.5);
      }
      const deep = ctx.createLinearGradient(0, horizon, 0, H);
      deep.addColorStop(0, "rgba(10, 3, 30, 0.25)");
      deep.addColorStop(1, "rgba(5, 1, 14, 0.86)");
      ctx.fillStyle = deep;
      ctx.fillRect(0, horizon, W, floorH);
      // Glints under the sun.
      ctx.fillStyle = "#ffd0ea";
      for (let k = 0; k < 40; k++) {
        const yy = horizon + 4 + (((k * 37) % 100) / 100) * floorH * 0.55;
        const phase = Math.sin(k * 12.9 + t * 0.004 * (0.6 + (k % 5) * 0.2));
        if (phase < 0.35) continue;
        const len = (8 + (k % 7) * 6) * (1 + (yy - horizon) / floorH);
        const off = Math.sin(k * 7.3) * sR * 0.55 * (1 - ((yy - horizon) / floorH) * 0.4);
        ctx.globalAlpha = (phase - 0.35) * 0.9;
        ctx.fillRect(gx + off - len / 2, yy, len, 1.2);
      }
      ctx.globalAlpha = 1;
      // A faint grid over the water.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizon, W, floorH);
      ctx.clip();
      ctx.strokeStyle = neon;
      ctx.globalAlpha = 0.12;
      grid(gx, horizon, F, t, 0.35);
      ctx.restore();
      horizonLine(horizon);
      if (!narrow) {
        // A rocky headland on the left with the tank on top against the sky; the battleship out on the water.
        drawHeadland(t, horizon, unit);
        const shipW = unit * 0.3;
        const shipX = W * 0.97 - shipW;
        const bob = still ? 0 : Math.sin(t / 1300) * 1.6;
        const waterline = horizon + floorH * 0.05 + bob;
        foam(shipX, waterline, shipW, t);
        silhouette(SHIP, shipX, waterline, shipW, "#22e5ff", false, 0.28);
        smoke(shipX + (241 / 420) * shipW, waterline - 72 * (shipW / 420), shipW / 420, t);
      }

      // Bombers crossing high up, fighters lower and faster the other way.
      const cross = (period: number, offset: number) => (still ? offset : ((t / period + offset) % 1)) * W * 1.3 - W * 0.15;
      const planeW = Math.max(36, unit * 0.045);
      const bx = cross(52000, 0.15);
      silhouette(PLANE, bx, H * 0.12, planeW, "#ff6fd8");
      silhouette(PLANE, bx - planeW * 1.15, H * 0.155, planeW * 0.9, "#ff6fd8");
      silhouette(PLANE, bx - planeW * 1.05, H * 0.085, planeW * 0.85, "#ff6fd8");
      const fx = W - cross(30000, 0.6);
      silhouette(PLANE, fx, H * 0.26, planeW * 0.7, "#7ff3ff", true);
      silhouette(PLANE, fx + planeW * 0.8, H * 0.235, planeW * 0.62, "#7ff3ff", true);

      const vignette = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.45, W / 2, H * 0.45, Math.max(W, H) * 0.85);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(3, 0, 10, 0.6)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    };

    /** Perspective grid lines on the ground plane (stroke style and alpha set by the caller). */
    const grid = (gx: number, horizon: number, F: number, t: number, speed: number) => {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -22; i <= 22; i++) {
        const X = (i / 22) * (W / F) * 3.5;
        ctx.moveTo(gx + (X / 60) * F, horizon + F / 60);
        ctx.lineTo(gx + X * F, horizon + F);
      }
      const dz = 0.55;
      const shift = still ? 0 : ((t / 1000) * speed) % dz;
      for (let z = 40; z > 1; z -= dz) {
        const y = horizon + F / (z - shift);
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    /** The headland's skyline: a plateau, then cliffs stepping down into the sea, and a few rocks. */
    const headland = (horizon: number) => {
      const L = W * 0.27;
      const top = H * 0.085;
      const path = new Path2D();
      const rim = new Path2D();
      path.moveTo(0, horizon);
      const plateau = 0.62;
      for (let k = 0; k <= 60; k++) {
        const f = k / 60;
        const x = f * L;
        let h: number;
        if (f < plateau) h = top * (0.92 + 0.05 * Math.sin(f * 17) + 0.03 * Math.sin(f * 41));
        else {
          const g = (f - plateau) / (1 - plateau);
          // Cliffs in steps, falling to the water.
          h = top * Math.max(0, 1 - g * 1.05) * (g < 0.35 ? 0.95 : g < 0.6 ? 0.62 : 0.3) + top * 0.04 * Math.sin(f * 53);
        }
        path.lineTo(x, horizon - Math.max(0, h));
        if (k === 0) rim.moveTo(x, horizon - Math.max(0, h));
        else rim.lineTo(x, horizon - Math.max(0, h));
      }
      path.lineTo(L, horizon);
      // Rocks off the point.
      path.moveTo(L * 1.03, horizon);
      path.quadraticCurveTo(L * 1.05, horizon - top * 0.18, L * 1.08, horizon);
      path.moveTo(L * 1.11, horizon);
      path.quadraticCurveTo(L * 1.12, horizon - top * 0.09, L * 1.14, horizon);
      return { path, rim, plateauEnd: L * plateau, ground: horizon - top * 0.92 };
    };

    const drawHeadland = (t: number, horizon: number, unit: number) => {
      const land = headland(horizon);
      const tankW = Math.min(unit * 0.13, land.plateauEnd * 0.8);
      const tankX = land.plateauEnd * 0.12;
      const paint = () => {
        const rock = ctx.createLinearGradient(0, horizon - H * 0.085, 0, horizon);
        rock.addColorStop(0, "#1c0a32");
        rock.addColorStop(1, "#06020e");
        ctx.save();
        ctx.shadowColor = "#ff2bd6";
        ctx.shadowBlur = 14;
        ctx.fillStyle = rock;
        ctx.fill(land.path);
        ctx.shadowBlur = 0;
        // Sunlit rim along the top, and faint strata in the rock.
        ctx.strokeStyle = "rgba(255, 120, 200, 0.85)";
        ctx.lineWidth = 1.4;
        ctx.stroke(land.rim);
        ctx.clip(land.path);
        ctx.strokeStyle = "rgba(255, 43, 214, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 1; k < 6; k++) {
          const y = horizon - H * 0.07 * (k / 6);
          ctx.moveTo(0, y + Math.sin(k * 3.1) * 3);
          ctx.lineTo(W * 0.3, y - Math.sin(k * 1.7) * 3);
        }
        ctx.stroke();
        ctx.restore();
        silhouette(TANK, tankX, land.ground + 1, tankW, "#ff4fd8");
      };
      paint();
      // Mirrored in the sea, squashed and faint, rippling a little.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizon, W, H - horizon);
      ctx.clip();
      ctx.translate(still ? 0 : Math.sin(t / 700) * 1.5, horizon);
      ctx.scale(1, -0.75);
      ctx.translate(0, -horizon);
      ctx.globalAlpha = 0.35;
      paint();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    /** White water along the battleship's waterline and a bow wave. */
    const foam = (x: number, y: number, width: number, t: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(190, 250, 255, 0.75)";
      ctx.shadowColor = "#22e5ff";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) {
        const px = x + (width * 0.05) + (width * 0.9 * k) / 30;
        const py = y + 1 + (still ? 0 : Math.sin(t / 300 + k * 1.3) * 0.8);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // Bow wave: short strokes spreading from the bow (left).
      for (let k = 0; k < 4; k++) {
        const phase = still ? k / 4 : ((t / 1600 + k / 4) % 1);
        ctx.globalAlpha = 0.7 * (1 - phase);
        ctx.beginPath();
        ctx.moveTo(x + width * 0.03, y + 1);
        ctx.quadraticCurveTo(x - width * 0.02 * (1 + phase * 3), y + 2 + phase * 6, x - width * 0.05 * (1 + phase * 4), y + 3 + phase * 10);
        ctx.stroke();
      }
      ctx.restore();
    };

    const horizonLine = (horizon: number) => {
      const line = ctx.createLinearGradient(0, horizon - 6, 0, horizon + 6);
      line.addColorStop(0, "rgba(255, 90, 160, 0)");
      line.addColorStop(0.5, "rgba(255, 150, 190, 0.95)");
      line.addColorStop(1, "rgba(255, 90, 160, 0)");
      ctx.fillStyle = line;
      ctx.fillRect(0, horizon - 6, W, 12);
    };

    /** Soft smoke drifting back from the battleship's funnel. */
    const smoke = (x: number, y: number, s: number, t: number) => {
      for (let k = 0; k < 7; k++) {
        const life = still ? k / 7 : ((t / 5200 + k / 7) % 1);
        const px = x + life * 120 * s * 2.2;
        const py = y - life * 60 * s * 1.6;
        const r = (6 + life * 26) * s * 1.6;
        const puff = ctx.createRadialGradient(px, py, 0, px, py, r);
        puff.addColorStop(0, `rgba(120, 90, 160, ${0.32 * (1 - life)})`);
        puff.addColorStop(1, "rgba(120, 90, 160, 0)");
        ctx.fillStyle = puff;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
    };

    const drawTheGlobe = (t: number, gx: number, gy: number, R: number, lon0: number, lat0: number) => {
      const halo2 = ctx.createRadialGradient(gx, gy, R * 0.85, gx, gy, R * 1.4);
      halo2.addColorStop(0, "rgba(60, 140, 255, 0.35)");
      halo2.addColorStop(1, "rgba(60, 140, 255, 0)");
      ctx.fillStyle = halo2;
      ctx.fillRect(gx - R * 1.4, gy - R * 1.4, R * 2.8, R * 2.8);
      const sphere = ctx.createRadialGradient(gx - R * 0.35, gy - R * 0.4, R * 0.08, gx, gy, R * 1.05);
      sphere.addColorStop(0, "#2d4cb8");
      sphere.addColorStop(0.45, "#13207a");
      sphere.addColorStop(1, "#060a2e");
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(gx, gy, R, 0, Math.PI * 2);
      ctx.fill();
      const s0 = Math.sin(lat0 * D2R);
      const c0 = Math.cos(lat0 * D2R);
      const toScreen = (lon: number, sinLat: number, cosLat: number): [number, number, number] => {
        const d = (lon - lon0) * D2R;
        const cd = Math.cos(d);
        return [gx + R * cosLat * Math.sin(d), gy - R * (c0 * sinLat - s0 * cosLat * cd), s0 * sinLat + c0 * cosLat * cd];
      };
      ctx.save();
      ctx.beginPath();
      ctx.arc(gx, gy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(90, 160, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let m = -180; m < 180; m += 20) {
        let pen = false;
        for (let la = -80; la <= 80; la += 4) {
          const [x, y, z] = toScreen(m, Math.sin(la * D2R), Math.cos(la * D2R));
          if (z <= 0) pen = false;
          else if (!pen) {
            ctx.moveTo(x, y);
            pen = true;
          } else ctx.lineTo(x, y);
        }
      }
      for (let la = -60; la <= 60; la += 20) {
        let pen = false;
        const sl = Math.sin(la * D2R);
        const cl = Math.cos(la * D2R);
        for (let lo = -180; lo <= 180; lo += 4) {
          const [x, y, z] = toScreen(lo, sl, cl);
          if (z <= 0) pen = false;
          else if (!pen) {
            ctx.moveTo(x, y);
            pen = true;
          } else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      if (globe) {
        ctx.beginPath();
        for (let l = 0; l < globe.starts.length - 1; l++) {
          let pen = false;
          for (let i = globe.starts[l]; i < globe.starts[l + 1]; i++) {
            const [x, y, z] = toScreen(globe.lon[i], globe.sinLat[i], globe.cosLat[i]);
            if (z <= 0) pen = false;
            else if (!pen) {
              ctx.moveTo(x, y);
              pen = true;
            } else ctx.lineTo(x, y);
          }
        }
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#ff3fb4";
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 3.4;
        ctx.stroke();
        ctx.strokeStyle = "#ff8fd6";
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.15;
        ctx.stroke();
      }
      const sheen = ctx.createRadialGradient(gx - R * 0.45, gy - R * 0.5, 0, gx - R * 0.45, gy - R * 0.5, R * 1.2);
      sheen.addColorStop(0, "rgba(160, 200, 255, 0.16)");
      sheen.addColorStop(0.5, "rgba(160, 200, 255, 0)");
      sheen.addColorStop(1, "rgba(2, 2, 20, 0.45)");
      ctx.fillStyle = sheen;
      ctx.fillRect(gx - R, gy - R, R * 2, R * 2);

      const list = majorsRef.current;
      const spot = (tag: string) => {
        const c = capitals[tag];
        return c ? { lon: c[0], lat: c[1] } : null;
      };
      for (const major of list) {
        const c = spot(major.tag);
        if (!c) continue;
        const [x, y, z] = toScreen(c.lon, Math.sin(c.lat * D2R), Math.cos(c.lat * D2R));
        if (z <= 0.05) continue;
        const pulse = still ? 0.5 : (t / 1600 + major.tag.charCodeAt(0) / 10) % 1;
        ctx.globalAlpha = z * (1 - pulse);
        ctx.strokeStyle = major.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 3 + pulse * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = z;
        ctx.fillStyle = "#fff";
        ctx.shadowColor = major.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      if (!still) {
        if (!arc && t > nextArc) {
          const facing = list.filter((major) => {
            const c = spot(major.tag);
            return c && toScreen(c.lon, Math.sin(c.lat * D2R), Math.cos(c.lat * D2R))[2] > 0.2;
          });
          if (facing.length >= 2) {
            const a = facing[Math.floor(Math.random() * facing.length)];
            let b = facing[Math.floor(Math.random() * facing.length)];
            if (b === a) b = facing[(facing.indexOf(a) + 1) % facing.length];
            arc = { a: a.tag, b: b.tag, at: t };
          } else nextArc = t + 600;
        }
        if (arc) {
          const age = (t - arc.at) / 1700;
          const A = spot(arc.a);
          const B = spot(arc.b);
          if (!A || !B || age > 1.5) {
            arc = null;
            nextArc = t + 900 + Math.random() * 1400;
          } else {
            const vec = (p: { lon: number; lat: number }) => [Math.cos(p.lat * D2R) * Math.cos(p.lon * D2R), Math.cos(p.lat * D2R) * Math.sin(p.lon * D2R), Math.sin(p.lat * D2R)];
            const va = vec(A);
            const vb = vec(B);
            const omega = Math.acos(Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
            const head = Math.min(1, age);
            const tail = Math.max(0, age - 0.5);
            const color = list.find((major) => major.tag === arc!.a)?.color ?? "#22e5ff";
            ctx.beginPath();
            let last: [number, number] | null = null;
            for (let k = 0; k <= 40; k++) {
              const f = tail + ((head - tail) * k) / 40;
              const sa = Math.sin((1 - f) * omega) / Math.sin(omega || 1);
              const sb = Math.sin(f * omega) / Math.sin(omega || 1);
              const v = [va[0] * sa + vb[0] * sb, va[1] * sa + vb[1] * sb, va[2] * sa + vb[2] * sb];
              const lat = Math.asin(Math.max(-1, Math.min(1, v[2])));
              const lon = Math.atan2(v[1], v[0]) / D2R;
              const [x, y, z] = toScreen(lon, Math.sin(lat), Math.cos(lat));
              const up = 1 + 0.22 * Math.sin(Math.PI * f) * omega;
              const px = gx + (x - gx) * up;
              const py = gy + (y - gy) * up;
              if (z < -0.1) {
                last = null;
                continue;
              }
              if (!last) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
              last = [px, py];
            }
            ctx.strokeStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.lineWidth = 2;
            ctx.globalAlpha = age > 1 ? Math.max(0, 1 - (age - 1) * 2) : 1;
            ctx.stroke();
            if (last && age < 1) {
              ctx.fillStyle = "#fff";
              ctx.beginPath();
              ctx.arc(last[0], last[1], 3, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx.restore();
      const rim = ctx.createLinearGradient(gx, gy - R, gx, gy + R);
      rim.addColorStop(0, "#7ff3ff");
      rim.addColorStop(0.55, "#8f7bff");
      rim.addColorStop(1, "#ff2bd6");
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = "#22e5ff";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(gx, gy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      draw(performance.now() - start);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(canvas);
    resize();

    let cancelled = false;
    fetch("/landing/globe-vanilla.json")
      .then((response) => response.json() as Promise<GlobeJson>)
      .then((data) => {
        if (cancelled) return;
        globe = prepare(data.coast, 0.3);
        capitals = data.capitals;
        if (still) draw(12000);
      })
      .catch(() => undefined);
    if (!still) frame = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      seen.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="ggf-scene" aria-hidden />;
}
