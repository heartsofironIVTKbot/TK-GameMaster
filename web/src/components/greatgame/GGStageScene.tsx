"use client";

import { createContext, useEffect, useRef, type MutableRefObject } from "react";

/**
 * The randomizer stage's backdrop: an outrun night like the event poster,
 * always on the move. A starry violet sky, wireframe mountains rolling past on
 * both sides, neon palms (cyan on the left, pink on the right) lining a wet
 * road that mirrors everything above the horizon (the machine at its end
 * too), and a cyan grid floor, all flying
 * towards the viewer at one speed, fading in from the distance. A shooting
 * star crosses the sky about every ten seconds, and a neon Abrams-style tank
 * drives down the middle of the road.
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
  /** The part of the machine (a canvas) the wet road mirrors, as shares of its size. */
  mirror?: { x: number; y: number; w: number; h: number };
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
  floor.addColorStop(0, "#1c0a3a");
  floor.addColorStop(0.3, "#120725");
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
  // The road: dark asphalt and glowing pink edges (the dashes go on after the reflection).
  ctx.fillStyle = "rgba(10,4,22,.92)";
  roadPath(ctx, v);
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
}

const NEAR = 0.55;
const FAR = 60;

function roadPath(ctx: CanvasRenderingContext2D, v: View, half = ROAD) {
  const [nl, ny] = project(v, -half, 0, NEAR);
  const [nr] = project(v, half, 0, NEAR);
  const [fl, fy] = project(v, -half, 0, FAR);
  const [fr] = project(v, half, 0, FAR);
  ctx.beginPath();
  ctx.moveTo(nl, ny);
  ctx.lineTo(nr, ny);
  ctx.lineTo(fr, fy);
  ctx.lineTo(fl, fy);
  ctx.closePath();
}

/** The wet strip: the road and its shoulders where the palms stand, up to the mountains' feet. */
const WET = ROAD + 0.9;

/**
 * The wet road: everything above the horizon (sky glow, mountains, palms)
 * mirrored into the road and the palms' shoulders, squeezed towards the
 * middle so the mountain grids show in it, fading out towards the viewer. The
 * machine at the road's end is mirrored much smaller and fainter, so it
 * doesn't crowd the road.
 */
function drawReflection(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  v: View,
  ratio: number,
  machine: { canvas: HTMLCanvasElement; box: { left: number; top: number; width: number; height: number }; part: { x: number; y: number; w: number; h: number } } | null,
) {
  const top = 0;
  const height = v.hy;
  if (height <= 1 || v.h <= v.hy) return;
  // Mirror about the horizon, squeezed towards the middle by (sx, sy): a
  // straight mirror would only show the sky across the road; squeezed, the
  // mountain grids from both sides fold into it. The squeeze is worked out so
  // the mirrored picture still reaches the strip's bottom and outer edges.
  const below = v.h - v.hy;
  const sy = Math.min(0.9, Math.max(0.3, below / height));
  const stripHalf = WET * below; // the wet strip's half-width at the bottom edge (x / z * f with 1 / z * f = below)
  const sx = Math.min(1, Math.max(0.45, (stripHalf * 1.05) / Math.max(1, Math.min(v.cx, v.w - v.cx))));
  const mirror = (sx: number, sy: number) =>
    ctx.setTransform(ratio * sx, 0, 0, -ratio * sy, ratio * v.cx * (1 - sx), v.hy * ratio * (1 + sy));
  ctx.save();
  roadPath(ctx, v, WET);
  ctx.clip();
  ctx.globalAlpha = 0.4;
  mirror(sx, sy);
  ctx.drawImage(source, 0, top * ratio, source.width, height * ratio, 0, top, v.w, height);
  // A second, additive pass: brings out the light parts (the mountains' grid lines, the glow).
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.32;
  ctx.drawImage(source, 0, top * ratio, source.width, height * ratio, 0, top, v.w, height);
  ctx.globalCompositeOperation = "source-over";
  if (machine) {
    const { canvas, box, part } = machine;
    // The machine: much smaller and fainter, so it doesn't crowd the road.
    mirror(0.5, 0.28);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(
      canvas,
      part.x * canvas.width,
      part.y * canvas.height,
      part.w * canvas.width,
      part.h * canvas.height,
      box.left + part.x * box.width,
      box.top + part.y * box.height,
      part.w * box.width,
      part.h * box.height,
    );
  }
  ctx.restore();
  ctx.save();
  roadPath(ctx, v, WET);
  ctx.clip();
  const fade = ctx.createLinearGradient(0, v.hy, 0, v.h);
  fade.addColorStop(0, "rgba(10,4,22,0)");
  fade.addColorStop(0.5, "rgba(10,4,22,.35)");
  fade.addColorStop(1, "rgba(10,4,22,.62)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, v.hy, v.w, v.h - v.hy);
  ctx.restore();
}

function drawDashes(ctx: CanvasRenderingContext2D, v: View, travel: number) {
  const near = NEAR;
  const far = FAR;
  const dash = travel % 4;
  for (let z = -dash; z < far; z += 4) {
    if (z + 1.6 <= near) continue;
    // Clipped at the camera so a dash slides out of view instead of vanishing.
    const z0 = Math.max(z, near);
    ctx.fillStyle = `rgba(255,214,247,${0.85 * Math.min(1, (far - z) / 24)})`;
    const [ax, ay] = project(v, -0.05, 0, z0);
    const [cx] = project(v, 0.05, 0, z0);
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

/** Palms stand in one straight row on each side, a little off the road's edge line. */
const PALM_X = ROAD + 0.3;

/*
 * The neon tank: an Abrams-style main battle tank seen from behind and a
 * little above (like a racing game following a car), driving down the middle
 * of the road with a slow sway and a slight lean. From up here you see the
 * short rear faces of the hull and the turret, and the engine deck and the
 * turret roof stretching away, with the gun pointing straight up the road.
 * It sits between the road's end and the Draw button, its top clearly below
 * the blower so the road's end stays in view.
 *
 * Its body is drawn once into a glowing sprite (neon outlines over dark
 * armour); each frame adds the turning drive sprockets, the treads, the tail
 * lights, the turbine's heat off the deck, the antenna tips, and its
 * reflection in the wet road.
 *
 * Tank units: x across (the hull with its skirts is 204 wide), y up the
 * picture from the road (negative is up). The sprite holds them at 2 px per
 * unit with the origin at (260, 400).
 */
/** Height of the drawing above its base, in tank units (to the gun's muzzle). */
const TANK_TALL = 140;
/** Room kept free under the tank for the Draw button (px), and over it so the blower shows. */
const TANK_BELOW = 54;
const TANK_ABOVE = 22;
const TANK_SPRITE = { w: 520, h: 430, ox: 260, oy: 400, scale: 2 };
const SPROCKETS: [number, number][] = [
  [-90, -15],
  [90, -15],
];

function tankSprite(): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = TANK_SPRITE.w;
  sprite.height = TANK_SPRITE.h;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;
  ctx.translate(TANK_SPRITE.ox, TANK_SPRITE.oy);
  ctx.scale(TANK_SPRITE.scale, TANK_SPRITE.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const CYAN = "#22e5ff";
  const PINK = "#ff4fe0";
  const VIOLET = "#b46bff";
  const neon = (color: string, width: number, blur = 8) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  };
  const path = (points: [number, number][], close = true) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (close) ctx.closePath();
  };
  const solid = (points: [number, number][], fill: string, color: string, width: number, blur = 8) => {
    path(points);
    ctx.shadowBlur = 0;
    ctx.fillStyle = fill;
    ctx.fill();
    neon(color, width, blur);
    ctx.stroke();
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  // Track tops running away on both sides (seen from above), with tread bars.
  for (const side of [-1, 1]) {
    solid(
      [
        [side * 78, -28],
        [side * 102, -28],
        [side * 96, -70],
        [side * 76, -70],
      ],
      "#08030f",
      CYAN,
      1.6,
      6,
    );
    neon("rgba(34,229,255,.35)", 1, 2);
    for (let y = -32; y > -70; y -= 5) line(side * (78 - (y + 28) * 0.05), y, side * (102 + (y + 28) * 0.14), y);
  }
  // Track rear ends (the drive sprockets turn on them each frame).
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(side < 0 ? -104 : 76, -30, 28, 30, 10);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#08030f";
    ctx.fill();
    neon(CYAN, 1.8, 8);
    ctx.stroke();
  }
  // Side skirts: their top edges run away along the tracks.
  for (const side of [-1, 1]) {
    solid(
      [
        [side * 80, -30],
        [side * 106, -32],
        [side * 99, -74],
        [side * 78, -72],
      ],
      "rgba(18,8,39,.85)",
      PINK,
      1.8,
      8,
    );
    neon("rgba(255,79,224,.5)", 1, 3);
    line(side * 93, -31, side * 88, -73);
  }
  // Engine deck, stretching away, with its intake grilles.
  solid(
    [
      [-78, -34],
      [78, -34],
      [72, -66],
      [-72, -66],
    ],
    "#1a0c38",
    PINK,
    1.8,
    8,
  );
  neon("rgba(180,107,255,.6)", 1, 3);
  for (let y = -38; y > -62; y -= 4) {
    const half = 66 - (-34 - y) * 0.2;
    line(-half, y, -10, y);
    line(10, y, half, y);
  }
  // Hull rear face: short from up here, with the three-panel turbine grille and the tail lights.
  solid(
    [
      [-78, -4],
      [78, -4],
      [78, -34],
      [-78, -34],
    ],
    "#150a2e",
    PINK,
    2.2,
    10,
  );
  for (const [x0, x1] of [
    [-52, -18],
    [-16, 16],
    [18, 52],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.roundRect(x0, -30, x1 - x0, 22, 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0d0620";
    ctx.fill();
    neon(VIOLET, 1.4, 6);
    ctx.stroke();
    neon("rgba(180,107,255,.55)", 1, 2);
    for (let y = -27; y < -9; y += 3.5) line(x0 + 2.5, y, x1 - 2.5, y);
  }
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 66, -22, 6.5, 0, TAU);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b0418";
    ctx.fill();
    neon(PINK, 1.6, 8);
    ctx.stroke();
  }

  // The main gun, straight up the road: long, narrowing with distance.
  solid(
    [
      [-5, -94],
      [5, -94],
      [3, -138],
      [-3, -138],
    ],
    "#1a0d36",
    CYAN,
    1.6,
  );
  neon(CYAN, 1.1, 5);
  for (const y of [-104, -126]) line(-4.4 - (y + 94) * 0.045, y, 4.4 + (y + 94) * 0.045, y);
  solid(
    [
      [-5.6, -110],
      [5.6, -110],
      [4.8, -119],
      [-4.8, -119],
    ],
    "#1a0d36",
    CYAN,
    1.3,
  );
  ctx.beginPath();
  ctx.ellipse(0, -139, 3.6, 1.6, 0, 0, TAU);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0b0418";
  ctx.fill();
  neon("#e9fcff", 1.4, 8);
  ctx.stroke();

  // Turret: a short rear face, then the wide flat roof running forward to its wedge.
  solid(
    [
      [-70, -58],
      [70, -58],
      [70, -70],
      [-70, -70],
    ],
    "#170b33",
    CYAN,
    2,
    10,
  );
  solid(
    [
      [-70, -70],
      [70, -70],
      [62, -90],
      [36, -98],
      [-36, -98],
      [-62, -90],
    ],
    "#22104a",
    CYAN,
    2.2,
    12,
  );
  // Roof details: the loader's hatch (left) with its gun, the commander's cupola (right) with its gun, the gunner's sight.
  ctx.beginPath();
  ctx.ellipse(-24, -80, 11, 5, 0, 0, TAU);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1a0c38";
  ctx.fill();
  neon(CYAN, 1.4, 6);
  ctx.stroke();
  line(-24, -83, -27, -96);
  ctx.beginPath();
  ctx.ellipse(24, -79, 12, 5.5, 0, 0, TAU);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1a0c38";
  ctx.fill();
  neon(CYAN, 1.6, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(24, -82, 7, 3, 0, 0, TAU);
  ctx.stroke();
  line(26, -84, 30, -99);
  solid(
    [
      [38, -88],
      [50, -88],
      [48, -95],
      [40, -95],
    ],
    "#1a0c38",
    CYAN,
    1.2,
  );
  // The bustle rack: a rail cage around the turret's back, seen from above.
  neon(PINK, 1.5, 8);
  ctx.beginPath();
  ctx.moveTo(-70, -60);
  ctx.lineTo(-76, -52);
  ctx.lineTo(76, -52);
  ctx.lineTo(70, -60);
  ctx.stroke();
  neon("rgba(255,79,224,.7)", 1, 4);
  for (let x = -66; x <= 66; x += 12) line(x, -52, x * 0.96, -58);
  // Whip antennas at the turret's rear corners.
  neon("rgba(255,79,224,.85)", 1.1, 5);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 62, -70);
    ctx.quadraticCurveTo(side * 64, -100, side * 68, -128);
    ctx.stroke();
  }
  return sprite;
}

/**
 * Where the tank is now: its base point on screen, pixels per tank unit, its
 * lean, and the road's y at its distance. It stands just above the Draw
 * button and is sized so its top stays clear of the road's end (the blower),
 * whatever the screen.
 */
function tankPlace(v: View, time: number) {
  const baseY = v.h - TANK_BELOW;
  const zone = Math.max(40, baseY - v.hy); // the road from the horizon down to the tank's base
  const z = v.f / zone;
  const k = Math.max(0.3, Math.min((zone - TANK_ABOVE) / TANK_TALL, (zone * 2 * ROAD * 0.8) / 204));
  const sway = Math.sin(time * 0.45) * 0.28 + Math.sin(time * 1.15) * 0.05;
  const lean = Math.cos(time * 0.45) * 0.025;
  const [sx, roadY] = project(v, sway, 0, z);
  return { sx, sy: roadY - Math.abs(Math.sin(time * 7)) * 0.9 * k, k, lean, roadY };
}

function drawTank(ctx: CanvasRenderingContext2D, v: View, time: number, travel: number, sprite: HTMLCanvasElement, reflected = false) {
  const { sx, sy, k, lean, roadY } = tankPlace(v, time);
  const body = () =>
    ctx.drawImage(sprite, -TANK_SPRITE.ox / TANK_SPRITE.scale, -TANK_SPRITE.oy / TANK_SPRITE.scale, TANK_SPRITE.w / TANK_SPRITE.scale, TANK_SPRITE.h / TANK_SPRITE.scale);
  if (reflected) {
    ctx.save();
    roadPath(ctx, v, WET);
    ctx.clip();
    ctx.globalAlpha = 0.28;
    ctx.translate(sx, roadY);
    ctx.rotate(-lean);
    ctx.scale(k, -k * 0.55);
    body();
    ctx.restore();
    return;
  }
  // A soft shadow and a neon glow on the road under it.
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 130 * k);
  glow.addColorStop(0, "rgba(0,0,0,.6)");
  glow.addColorStop(0.6, "rgba(255,43,214,.14)");
  glow.addColorStop(1, "rgba(255,43,214,0)");
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(1, 0.2);
  ctx.translate(-sx, -sy);
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 140 * k, sy - 140 * k, 280 * k, 280 * k);
  ctx.restore();

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(lean);
  ctx.scale(k, k);
  // The turbine's heat: a faint glow and shimmer rising off the rear grille.
  for (let i = 0; i < 7; i++) {
    const age = (time * 0.7 + i / 7) % 1;
    const x = -40 + ((i * 37) % 80) + Math.sin(time * 3 + i) * 4;
    ctx.fillStyle = `rgba(255,140,200,${0.1 * (1 - age)})`;
    ctx.beginPath();
    ctx.ellipse(x, -44 + age * 26, 8 + age * 16, 3 + age * 5, 0, 0, TAU);
    ctx.fill();
  }
  body();
  // Treads moving on the tracks' rear ends.
  ctx.strokeStyle = "rgba(34,229,255,.45)";
  ctx.lineWidth = 1.4;
  const roll = (travel * 30) % 5;
  for (const left of [-102, 78]) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left, -28, 24, 26, 8);
    ctx.clip();
    for (let y = -33 + roll; y < 0; y += 5) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + 24, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Drive sprockets turning.
  const turn = travel * 3.2;
  for (const [cx, cy] of SPROCKETS) {
    ctx.strokeStyle = "rgba(34,229,255,.95)";
    ctx.shadowColor = "#22e5ff";
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const a = turn + (i * TAU) / 9;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
      ctx.lineTo(cx + Math.cos(a) * 10.5, cy + Math.sin(a) * 10.5);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, TAU);
    ctx.stroke();
  }
  // Tail lights, glowing red, and the antenna tips.
  const pulse = 0.75 + 0.25 * Math.sin(time * 3);
  for (const side of [-1, 1]) {
    ctx.shadowColor = "#ff2b5e";
    ctx.shadowBlur = 16 * pulse;
    ctx.fillStyle = `rgba(255,60,100,${0.8 * pulse + 0.2})`;
    ctx.beginPath();
    ctx.arc(side * 66, -22, 4.2, 0, TAU);
    ctx.fill();
  }
  const blink = Math.sin(time * 4) > 0.5 ? 1 : 0.25;
  ctx.shadowColor = "#ff4fe0";
  ctx.shadowBlur = 10 * blink;
  ctx.fillStyle = `rgba(255,150,240,${blink})`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 68, -129, 2.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

const PALM_SPAN = 54; // palms repeat every this many units along the road
const PALMS = 7; // per side

function palmsAt(travel: number): { side: number; x: number; z: number; tall: number; fade: number }[] {
  const palms: { side: number; x: number; z: number; tall: number; fade: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < PALMS; i++) {
      const start = (i * PALM_SPAN) / PALMS + (side > 0 ? PALM_SPAN / PALMS / 2 : 0);
      const z = 1.2 + ((((start - travel) % PALM_SPAN) + PALM_SPAN) % PALM_SPAN);
      const fade = Math.min(1, (z - 1.2) / 0.5, (PALM_SPAN + 1.2 - z) / 8);
      if (fade > 0) palms.push({ side, x: side * PALM_X, z, tall: 1.8 + rand(i * 13 + side * 3) * 0.6, fade });
    }
  }
  return palms.sort((a, b) => b.z - a.z);
}

/**
 * The palms, far to near. With `reflected`, each palm's reflection instead:
 * flipped at its own base, shorter and faint, inside the wet strip.
 */
function drawPalms(
  ctx: CanvasRenderingContext2D,
  v: View,
  travel: number,
  sprites: { left: HTMLCanvasElement; right: HTMLCanvasElement },
  reflected = false,
  only: "all" | "behind-tank" | "before-tank" = "all",
) {
  if (reflected) {
    ctx.save();
    roadPath(ctx, v, WET);
    ctx.clip();
  }
  for (const palm of palmsAt(travel)) {
    const tankZ = v.f / Math.max(40, v.h - TANK_BELOW - v.hy);
    if ((only === "behind-tank" && palm.z < tankZ) || (only === "before-tank" && palm.z >= tankZ)) continue;
    const [sx, sy] = project(v, palm.x, 0, palm.z);
    const k = (palm.tall * v.f) / palm.z / 280;
    ctx.globalAlpha = palm.fade * (reflected ? 0.3 : 1);
    ctx.save();
    ctx.translate(sx, sy);
    // Left palms lean outwards (the sprite mirrored); a reflection hangs down from the base.
    ctx.scale(palm.side < 0 ? -k : k, reflected ? -k * 0.6 : k);
    ctx.drawImage(palm.side < 0 ? sprites.left : sprites.right, -130, -370);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (reflected) ctx.restore();
}

export default function GGStageScene({ anchorRef }: { anchorRef: MutableRefObject<StageAnchor | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // A front layer, above the machine but below the stage's controls: the tank
  // and the palms nearer than it are close to the viewer, in front of the moon.
  const frontRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const front = frontRef.current;
    const fctx = front?.getContext("2d");
    if (!canvas || !ctx || !front || !fctx) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = { left: palmSprite("#22e5ff"), right: palmSprite("#ff4fe0") };
    const tank = tankSprite();
    let view: View = { w: 1, h: 1, hy: 1, cx: 1, f: 1 };
    let sky: HTMLCanvasElement | null = null;
    let twinkle: { x: number; y: number; r: number; speed: number }[] = [];
    let ratio = 1;
    let machineBox: { left: number; top: number; width: number; height: number } | null = null;

    // Where the road ends: at the anchored machine, or the default horizon.
    const place = (): boolean => {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      let hy = h * DEFAULT_HORIZON;
      let cx = w / 2;
      const anchor = anchorRef.current;
      machineBox = null;
      if (anchor?.el.isConnected) {
        const box = canvas.getBoundingClientRect();
        const target = anchor.el.getBoundingClientRect();
        hy = target.top - box.top + anchor.fy * target.height;
        cx = target.left - box.left + anchor.fx * target.width;
        machineBox = { left: target.left - box.left, top: target.top - box.top, width: target.width, height: target.height };
      }
      const changed = Math.abs(view.w - w) > 0.5 || Math.abs(view.h - h) > 0.5 || Math.abs(view.hy - hy) > 0.5 || Math.abs(view.cx - cx) > 0.5;
      view = { w, h, hy, cx, f: h * 0.85 };
      return changed;
    };

    const build = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(view.w * ratio);
      canvas.height = Math.round(view.h * ratio);
      front.width = canvas.width;
      front.height = canvas.height;
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
      const anchor = anchorRef.current;
      drawReflection(
        ctx,
        canvas,
        view,
        ratio,
        anchor?.mirror && machineBox && anchor.el instanceof HTMLCanvasElement ? { canvas: anchor.el, box: machineBox, part: anchor.mirror } : null,
      );
      // The tank drives on the drum's road only (a machine standing at the road's end).
      const withTank = Boolean(anchor);
      drawPalms(ctx, view, travel, sprites, true);
      if (withTank) drawTank(ctx, view, time, travel, tank, true);
      drawDashes(ctx, view, travel);
      drawPalms(ctx, view, travel, sprites, false, withTank ? "behind-tank" : "all");
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, front.width, front.height);
      if (withTank) {
        fctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawTank(fctx, view, time, travel, tank);
        drawPalms(fctx, view, travel, sprites, false, "before-tank");
      }
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

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas ref={frontRef} aria-hidden className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />
    </>
  );
}
