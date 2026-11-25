"use client";

import { useEffect, useRef } from "react";

/**
 * The front page's poster scene, on one canvas: a synthwave sky with a striped
 * sun setting behind a spinning neon globe (the coasts glow; arcs fly between
 * the majors' capitals), a perspective grid floor with the world map glowing
 * on it (pink in the west, cyan in the east), a tank and a battleship on the
 * horizon and bombers crossing the sky.
 *
 * Map data: public/landing/globe-vanilla.json (coast polylines as flat
 * lon, lat lists; capitals by tag). It stops drawing while off screen, and
 * draws one still frame for viewers who asked for reduced motion.
 */

export interface SceneMajor {
  tag: string;
  color: string;
}

interface Lines {
  /** Point data: longitude (deg), and sin/cos of latitude. */
  lon: Float32Array;
  lat: Float32Array;
  sinLat: Float32Array;
  cosLat: Float32Array;
  /** Where each polyline starts in the point arrays (plus the end). */
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

// Silhouettes, as SVG paths in their own little boxes (bottom = the ground or the water line).
const TANK_PATH =
  "M5 38 Q5 30 13 30 L87 30 Q95 30 95 38 Q95 45 87 45 L13 45 Q5 45 5 38 Z M8 30 L13 20 L86 20 L95 27 L93 30 Z M34 20 L38 10 L62 9 L67 12 L67 20 Z M66 11.5 L104 11 L104 14 L66 14.5 Z M45 10 L46 5 L53 5 L54 10 Z";
const SHIP_PATH =
  "M0 33 L12 50 L186 50 L200 37 L200 34 Z M80 34 L80 24 L88 24 L88 14 L95 14 L95 6 L99 6 L99 0 L101 0 L101 6 L105 6 L105 14 L112 14 L112 24 L120 24 L120 34 Z M124 34 L126 18 L137 18 L138 34 Z M36 34 L38 28 L52 28 L54 34 Z M18 29 L38 29 L38 31.5 L18 31.5 Z M58 31 L60 25 L72 25 L74 31 Z M42 26 L60 26 L60 28.5 L42 28.5 Z M150 34 L152 28 L166 28 L168 34 Z M166 29 L186 29 L186 31.5 L166 31.5 Z M140 34 L141 8 L142 8 L143 34 Z";
const PLANE_PATH =
  "M2 12 Q12 7.5 40 8.5 L53 9.5 Q60 12 53 14.5 L40 15.5 Q12 16.5 2 12 Z M21 11 L36 11 L31 23.5 L25 23.5 Z M24 10 L33 10 L30 2.5 L27.5 2.5 Z M3 12 L0 2.5 L6.5 2.5 L11 10 Z M3 12.5 L10 12.5 L7 16.5 L2 16.5 Z";

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
    const TANK = new Path2D(TANK_PATH);
    const SHIP = new Path2D(SHIP_PATH);
    const PLANE = new Path2D(PLANE_PATH);
    let globe: Lines | null = null;
    let floor: Lines | null = null;
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
      // Stars: fixed per size, seeded so they don't jump on resize.
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      stars = Array.from({ length: Math.round((W * H) / 9000) }, () => ({ x: rnd() * W, y: rnd() * H * 0.5, r: 0.4 + rnd() * 1.2, phase: rnd() * 6.28 }));
      if (still || !frame) draw(still ? 12000 : 0);
    };

    // An arc between two majors' capitals: which pair, and when it started.
    let arc: { a: string; b: string; at: number } | null = null;
    let nextArc = 1500;

    const draw = (t: number) => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const narrow = W < 700;
      // Portrait (phones): the globe up top, the title below it over the floor.
      const portrait = W / H < 0.75;
      const R = portrait ? Math.min(W * 0.4, H * 0.2) : Math.min(H * 0.25, W * 0.38);
      const gx = W / 2;
      const gy = portrait ? H * 0.25 : H * 0.66 - R * 1.04;
      const horizon = gy + R * 1.04;
      const lon0 = 12 + (still ? 0 : (t / 1000) * 3.2);
      const lat0 = 30;

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
        ctx.globalAlpha = Math.max(0, a) * (1 - star.y / (H * 0.55));
        ctx.fillStyle = "#fff";
        ctx.fillRect(star.x, star.y, star.r, star.r);
      }
      ctx.globalAlpha = 1;

      // Soft pink clouds drifting along the horizon.
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

      // The sun: behind the globe, cut by the horizon, its stripes sliding down.
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
        const thick = 0.006 + (y - 0.4) * 0.07;
        sunCtx.fillRect(0, y * size, size, thick * size);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, horizon);
      ctx.clip();
      ctx.drawImage(sun, sx - sR, sy - sR, sR * 2, sR * 2);
      ctx.restore();

      // The floor: a grid running towards you and the world map laid on it.
      const floorH = H - horizon;
      const ground = ctx.createLinearGradient(0, horizon, 0, H);
      ground.addColorStop(0, "#1c0532");
      ground.addColorStop(1, "#060110");
      ctx.fillStyle = ground;
      ctx.fillRect(0, horizon, W, floorH);
      const F = floorH * 1.05;
      const zNear = 1;
      const neon = ctx.createLinearGradient(0, 0, W, 0);
      neon.addColorStop(0, "#ff2bd6");
      neon.addColorStop(0.5, "#b46bff");
      neon.addColorStop(1, "#22e5ff");
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizon, W, floorH);
      ctx.clip();
      ctx.strokeStyle = neon;
      // Vertical lines to the vanishing point.
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const spread = (W / F) * 1.6;
      for (let i = -22; i <= 22; i++) {
        const X = (i / 22) * spread * 2.2;
        ctx.moveTo(gx + (X / 60) * F, horizon + F / 60);
        ctx.lineTo(gx + (X / zNear) * F, horizon + F / zNear);
      }
      ctx.stroke();
      // Horizontal lines, sliding towards you.
      const dz = 0.55;
      const shift = still ? 0 : ((t / 1000) * 0.5) % dz;
      ctx.beginPath();
      for (let z = 40; z > zNear; z -= dz) {
        const Z = z - shift;
        if (Z <= zNear * 0.98) continue;
        const y = horizon + F / Z;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      // The map: west to east across, north far away, centred on the globe's longitude.
      if (floor) {
        const latMin = -58;
        const latMax = 80;
        const zFar = 7.5;
        const spanX = ((W * 1.05) / F) * 1.05;
        const project = (i: number): [number, number] => {
          let d = floor!.lon[i] - lon0;
          d = ((((d + 180) % 360) + 360) % 360) - 180;
          const Z = 1.05 + ((floor!.lat[i] - latMin) / (latMax - latMin)) * (zFar - 1.05);
          return [gx + (((d / 180) * spanX) / Z) * F, horizon + F / Z];
        };
        ctx.beginPath();
        for (let l = 0; l < floor.starts.length - 1; l++) {
          let prevLon = 0;
          for (let i = floor.starts[l]; i < floor.starts[l + 1]; i++) {
            const [x, y] = project(i);
            let d = floor.lon[i] - lon0;
            d = ((((d + 180) % 360) + 360) % 360) - 180;
            if (i === floor.starts[l] || Math.abs(d - prevLon) > 90) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            prevLon = d;
          }
        }
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Fade into the haze at the horizon.
      const haze = ctx.createLinearGradient(0, horizon, 0, horizon + floorH * 0.32);
      haze.addColorStop(0, "rgba(28, 5, 50, 1)");
      haze.addColorStop(1, "rgba(28, 5, 50, 0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, horizon, W, floorH * 0.32);
      ctx.restore();
      // The horizon line.
      const line = ctx.createLinearGradient(0, horizon - 6, 0, horizon + 6);
      line.addColorStop(0, "rgba(255, 90, 160, 0)");
      line.addColorStop(0.5, "rgba(255, 150, 190, 0.95)");
      line.addColorStop(1, "rgba(255, 90, 160, 0)");
      ctx.fillStyle = line;
      ctx.fillRect(0, horizon - 6, W, 12);

      // On the horizon: a tank on the left, a battleship on the right.
      const silhouette = (path: Path2D, x: number, y: number, scale: number, flip: boolean, rim: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flip ? -scale : scale, scale);
        ctx.shadowColor = rim;
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#0b0316";
        ctx.fill(path);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = rim;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1 / scale;
        ctx.stroke(path);
        ctx.restore();
        ctx.globalAlpha = 1;
      };
      const unit = Math.min(W, H * 1.8);
      if (!narrow) {
        const tankS = (unit * 0.1) / 100;
        silhouette(TANK, W * 0.09, horizon + floorH * 0.12 - 45 * tankS, tankS, false, "#ff2bd6");
        const shipS = (unit * 0.17) / 200;
        silhouette(SHIP, W * 0.9 - unit * 0.17, horizon + floorH * 0.04 - 50 * shipS, shipS, false, "#22e5ff");
      }

      // The globe.
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
        const x = cosLat * Math.sin(d);
        const y = c0 * sinLat - s0 * cosLat * cd;
        const z = s0 * sinLat + c0 * cosLat * cd;
        return [gx + R * x, gy - R * y, z];
      };
      // Graticule.
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
      // Coasts.
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
      // The light: a sheen top left, the night side bottom right.
      const sheen = ctx.createRadialGradient(gx - R * 0.45, gy - R * 0.5, 0, gx - R * 0.45, gy - R * 0.5, R * 1.2);
      sheen.addColorStop(0, "rgba(160, 200, 255, 0.16)");
      sheen.addColorStop(0.5, "rgba(160, 200, 255, 0)");
      sheen.addColorStop(1, "rgba(2, 2, 20, 0.45)");
      ctx.fillStyle = sheen;
      ctx.fillRect(gx - R, gy - R, R * 2, R * 2);

      // The majors' capitals, and an arc flying between two of them now and then.
      const list = majorsRef.current;
      const spot = (tag: string) => {
        const c = capitals[tag];
        if (!c) return null;
        return { lon: c[0], lat: c[1] };
      };
      for (const major of list) {
        const c = spot(major.tag);
        if (!c) continue;
        const [x, y, z] = toScreen(c.lon, Math.sin(c.lat * D2R), Math.cos(c.lat * D2R));
        if (z <= 0.05) continue;
        const pulse = still ? 0.5 : ((t / 1600 + major.tag.charCodeAt(0) / 10) % 1);
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
            const steps = 40;
            for (let k = 0; k <= steps; k++) {
              const f = tail + ((head - tail) * k) / steps;
              const sa = Math.sin((1 - f) * omega) / Math.sin(omega || 1);
              const sb = Math.sin(f * omega) / Math.sin(omega || 1);
              const v = [va[0] * sa + vb[0] * sb, va[1] * sa + vb[1] * sb, va[2] * sa + vb[2] * sb];
              const lat = Math.asin(Math.max(-1, Math.min(1, v[2])));
              const lon = Math.atan2(v[1], v[0]) / D2R;
              const [x, y, z] = toScreen(lon, Math.sin(lat), Math.cos(lat));
              const lift = 1 + 0.22 * Math.sin(Math.PI * f) * omega;
              const px = gx + (x - gx) * lift;
              const py = gy + (y - gy) * lift;
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
      // The rim: cyan on top, pink below.
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

      // Bombers crossing high up, fighters lower and faster the other way.
      const plane = (x: number, y: number, s: number, flip: boolean, rim: string) => silhouette(PLANE, x, y, s, flip, rim);
      const cross = (period: number, offset: number) => (still ? offset : ((t / period + offset) % 1)) * W * 1.3 - W * 0.15;
      const bomberS = Math.max(0.55, unit / 1500);
      const bx = cross(52000, 0.15);
      plane(bx, H * 0.1, bomberS, false, "#ff6fd8");
      plane(bx - 70 * bomberS, H * 0.135, bomberS * 0.9, false, "#ff6fd8");
      plane(bx - 64 * bomberS, H * 0.07, bomberS * 0.85, false, "#ff6fd8");
      const fx = W - cross(30000, 0.6);
      plane(fx, H * 0.24, bomberS * 0.7, true, "#7ff3ff");
      plane(fx + 46 * bomberS, H * 0.215, bomberS * 0.62, true, "#7ff3ff");

      // Vignette.
      const vignette = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.45, W / 2, H * 0.45, Math.max(W, H) * 0.85);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(3, 0, 10, 0.6)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
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
        floor = prepare(data.coast, 0.9);
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
