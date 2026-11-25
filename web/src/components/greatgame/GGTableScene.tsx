"use client";

import { useEffect, useRef } from "react";

/**
 * Step 4's backdrop: a retro neon card table, moving all the time.
 *
 * - Deep teal felt with a diamond (argyle) lattice; a shimmer band of light
 *   runs across the lattice every few seconds.
 * - Two soft spotlights drifting over the felt.
 * - A neon rim round the table with marquee bulbs chasing along it.
 * - Card suits (spades, hearts, diamonds, clubs) floating up slowly,
 *   turning, fading in and out.
 *
 * Canvas 2D at 30 fps.
 */

const FRAME_MS = 1000 / 30;
const TAU = Math.PI * 2;
const LATTICE = 56;
const SUITS = ["♠", "♥", "♦", "♣"];
const SUIT_COLORS = ["#22e5ff", "#ff2bd6", "#ff2bd6", "#22e5ff"];

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export default function GGTableScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 1;
    let h = 1;
    let ratio = 1;
    let felt: HTMLCanvasElement | null = null;
    let bright: HTMLCanvasElement | null = null;
    let scratch: HTMLCanvasElement | null = null;

    const lattice = (alpha: number, width: number) => {
      const layer = document.createElement("canvas");
      layer.width = Math.round(w * ratio);
      layer.height = Math.round(h * ratio);
      const g = layer.getContext("2d");
      if (!g) return layer;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.strokeStyle = `rgba(120,240,255,${alpha})`;
      g.lineWidth = width;
      g.beginPath();
      for (let x = -h; x < w + h; x += LATTICE) {
        g.moveTo(x, 0);
        g.lineTo(x + h, h);
        g.moveTo(x + h, 0);
        g.lineTo(x, h);
      }
      g.stroke();
      // Small diamonds where the lines cross.
      // Lines X - Y = a and X + Y = b cross at ((a + b) / 2, (b - a) / 2).
      g.fillStyle = `rgba(255,120,230,${alpha * 1.4})`;
      for (let a = -h; a < w + h; a += LATTICE) {
        for (let b = 0; b < w + 2 * h; b += LATTICE) {
          const cx = (a + b) / 2;
          const cy = (b - a) / 2;
          if (cx < -10 || cx > w + 10 || cy < -10 || cy > h + 10) continue;
          g.beginPath();
          g.moveTo(cx, cy - 3);
          g.lineTo(cx + 3, cy);
          g.lineTo(cx, cy + 3);
          g.lineTo(cx - 3, cy);
          g.closePath();
          g.fill();
        }
      }
      return layer;
    };

    const build = () => {
      w = Math.max(1, canvas.clientWidth);
      h = Math.max(1, canvas.clientHeight);
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      felt = lattice(0.07, 1);
      bright = lattice(0.6, 1.4);
      scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
    };
    build();
    const observer = new ResizeObserver(build);
    observer.observe(canvas);

    const suits = Array.from({ length: 14 }, (_, i) => ({
      suit: i % 4,
      x: rand(i * 3.7),
      speed: 0.012 + rand(i * 5.1) * 0.018,
      phase: rand(i * 2.3),
      size: 26 + rand(i * 7.7) * 34,
      spin: (rand(i * 9.4) - 0.5) * 0.8,
      sway: rand(i * 4.4) * TAU,
    }));

    const draw = (time: number) => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // The felt.
      const bg = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.75);
      bg.addColorStop(0, "#0f4152");
      bg.addColorStop(0.55, "#0c2240");
      bg.addColorStop(1, "#090718");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (felt) ctx.drawImage(felt, 0, 0, w, h);

      // A shimmer band running across the lattice every 6 s.
      const cycle = (time % 6) / 6;
      if (bright && scratch && cycle < 0.55) {
        const s = scratch.getContext("2d");
        if (s) {
          const x = -w * 0.3 + (cycle / 0.55) * w * 1.6;
          s.setTransform(1, 0, 0, 1, 0, 0);
          s.clearRect(0, 0, scratch.width, scratch.height);
          s.globalCompositeOperation = "source-over";
          s.drawImage(bright, 0, 0);
          s.globalCompositeOperation = "destination-in";
          s.setTransform(ratio, 0, 0, ratio, 0, 0);
          const band = s.createLinearGradient(x - 140, 0, x + 140, h * 0.4);
          band.addColorStop(0, "rgba(0,0,0,0)");
          band.addColorStop(0.5, "rgba(0,0,0,.85)");
          band.addColorStop(1, "rgba(0,0,0,0)");
          s.fillStyle = band;
          s.fillRect(0, 0, w, h);
          s.globalCompositeOperation = "source-over";
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(scratch, 0, 0);
          ctx.globalCompositeOperation = "source-over";
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
      }

      // Two spotlights drifting over the felt.
      ctx.globalCompositeOperation = "lighter";
      for (const [i, color] of [
        [0, "rgba(255,43,214,.16)"],
        [1, "rgba(34,229,255,.13)"],
      ] as [number, string][]) {
        const sx = w * (0.5 + 0.36 * Math.sin(time * (0.21 + i * 0.07) + i * 2.1));
        const sy = h * (0.5 + 0.28 * Math.cos(time * (0.17 + i * 0.05) + i));
        const r = Math.min(w, h) * 0.55;
        const spot = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        spot.addColorStop(0, color);
        spot.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = spot;
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = "source-over";

      // Card suits floating up.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const suit of suits) {
        const t = (suit.phase + time * suit.speed) % 1;
        const y = h * (1.1 - t * 1.25);
        const x = w * suit.x + Math.sin(time * 0.6 + suit.sway) * 26;
        const fade = Math.min(1, t / 0.15, (1 - t) / 0.2);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(time * suit.spin + suit.sway) * 0.5);
        ctx.globalAlpha = 0.28 * fade;
        ctx.font = `${Math.round(suit.size)}px "Segoe UI Symbol", "Apple Symbols", sans-serif`;
        ctx.lineWidth = 2;
        ctx.strokeStyle = SUIT_COLORS[suit.suit];
        ctx.shadowColor = SUIT_COLORS[suit.suit];
        ctx.shadowBlur = 8;
        ctx.strokeText(SUITS[suit.suit], 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // The neon rim with marquee bulbs chasing round it.
      const inset = 12;
      const rim = ctx.createLinearGradient(0, 0, w, h);
      rim.addColorStop(0, "#ff2bd6");
      rim.addColorStop(0.5, "#8a2be2");
      rim.addColorStop(1, "#22e5ff");
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 1.6);
      ctx.shadowColor = "#ff2bd6";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, 18);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      const perimeter = 2 * (w + h - inset * 4);
      const gap = 30;
      const chase = Math.floor(time * 6);
      for (let d = 0, i = 0; d < perimeter; d += gap, i++) {
        let x: number;
        let y: number;
        const top = w - inset * 2;
        const side = h - inset * 2;
        if (d < top) [x, y] = [inset + d, inset];
        else if (d < top + side) [x, y] = [w - inset, inset + d - top];
        else if (d < top * 2 + side) [x, y] = [w - inset - (d - top - side), h - inset];
        else [x, y] = [inset, h - inset - (d - top * 2 - side)];
        const on = (i + chase) % 4 === 0;
        ctx.fillStyle = on ? "#ffd36b" : "rgba(255,211,107,.16)";
        ctx.beginPath();
        ctx.arc(x, y, on ? 2.6 : 1.8, 0, TAU);
        ctx.fill();
      }
    };

    let frame = 0;
    let last = -Infinity;
    const start = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(still ? 0 : (now - start) / 1000);
      if (still) cancelAnimationFrame(frame);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
