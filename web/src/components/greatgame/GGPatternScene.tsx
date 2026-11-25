"use client";

import { useEffect, useRef } from "react";

/**
 * Step 3's backdrop: a plain retro pattern instead of the outrun road, kept
 * moving all the time.
 *
 * - A violet grid drifting diagonally, with a bright ripple ring spreading
 *   from the middle every few seconds.
 * - A halftone dot field along the bottom whose dots swell in travelling
 *   waves, like an equaliser.
 * - Striped corners (cyan top right, amber bottom left) scrolling slowly.
 * - A dozen 80s shapes (triangles, rings, squares, squiggles, zig-zags,
 *   crosses, dot clusters) drifting across the stage, turning and bobbing,
 *   wrapping round the edges.
 * - A soft light bar sweeping across now and then.
 *
 * Canvas 2D at 30 fps; the glowing shapes are drawn once into sprites.
 */

const FRAME_MS = 1000 / 30;
const GRID = 48;
const TAU = Math.PI * 2;
const COLORS = ["#ff2bd6", "#22e5ff", "#ffb347", "#b46bff"];
type Kind = "triangle" | "ring" | "square" | "squiggle" | "zigzag" | "cross" | "dots";
const KINDS: Kind[] = ["triangle", "ring", "square", "squiggle", "zigzag", "cross", "dots", "triangle", "ring", "squiggle", "cross", "square", "zigzag", "dots"];

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** One shape drawn once with its neon glow. */
function shapeSprite(kind: Kind, color: string, size: number): HTMLCanvasElement {
  const pad = 16;
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = size + pad * 2;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;
  ctx.translate(pad + size / 2, pad + size / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(3, size * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  const r = size / 2;
  ctx.beginPath();
  switch (kind) {
    case "triangle":
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.9, r * 0.75);
      ctx.lineTo(-r * 0.9, r * 0.75);
      ctx.closePath();
      ctx.stroke();
      break;
    case "ring":
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, TAU);
      ctx.fill();
      break;
    case "square":
      ctx.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      break;
    case "squiggle":
      ctx.moveTo(-r, 0);
      for (let i = 1; i <= 4; i++) ctx.quadraticCurveTo(-r + (i - 0.5) * (r / 2), (i % 2 ? -1 : 1) * r * 0.45, -r + i * (r / 2), 0);
      ctx.stroke();
      break;
    case "zigzag":
      for (let i = 0; i <= 6; i++) ctx.lineTo(-r + (i * 2 * r) / 6, i % 2 ? -r * 0.3 : r * 0.3);
      ctx.stroke();
      break;
    case "cross":
      ctx.moveTo(0, -r * 0.7);
      ctx.lineTo(0, r * 0.7);
      ctx.moveTo(-r * 0.7, 0);
      ctx.lineTo(r * 0.7, 0);
      ctx.stroke();
      break;
    case "dots":
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          ctx.beginPath();
          ctx.arc(x * r * 0.55, y * r * 0.55, r * 0.11, 0, TAU);
          ctx.fill();
        }
      }
      break;
  }
  return sprite;
}

interface Shape {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  turn: number;
  bob: number;
  alpha: number;
}

export default function GGPatternScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 1;
    let h = 1;
    let ratio = 1;
    let grid: HTMLCanvasElement | null = null;
    let glowGrid: HTMLCanvasElement | null = null;
    let scratch: HTMLCanvasElement | null = null;
    const shapes: Shape[] = KINDS.map((kind, i) => {
      const size = 34 + rand(i * 3.3) * 46;
      return {
        sprite: shapeSprite(kind, COLORS[i % COLORS.length], size),
        x: rand(i * 7.1),
        y: rand(i * 5.9 + 2),
        vx: (rand(i * 2.7 + 1) - 0.5) * 0.024,
        vy: (rand(i * 4.3 + 3) - 0.5) * 0.018,
        spin: (rand(i * 9.1) - 0.5) * 0.7,
        turn: rand(i * 1.9) * TAU,
        bob: rand(i * 6.6) * TAU,
        alpha: 0.32 + rand(i * 8.8) * 0.3,
      };
    });

    // The grid, drawn once faint and once bright (the ripple shows the bright one).
    const gridLayer = (alpha: number, width: number) => {
      const layer = document.createElement("canvas");
      layer.width = Math.round((w + GRID * 2) * ratio);
      layer.height = Math.round((h + GRID * 2) * ratio);
      const g = layer.getContext("2d");
      if (!g) return layer;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.strokeStyle = `rgba(180,107,255,${alpha})`;
      g.lineWidth = width;
      g.beginPath();
      for (let x = 0; x <= w + GRID * 2; x += GRID) {
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, h + GRID * 2);
      }
      for (let y = 0; y <= h + GRID * 2; y += GRID) {
        g.moveTo(0, y + 0.5);
        g.lineTo(w + GRID * 2, y + 0.5);
      }
      g.stroke();
      return layer;
    };

    const build = () => {
      w = Math.max(1, canvas.clientWidth);
      h = Math.max(1, canvas.clientHeight);
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      grid = gridLayer(0.13, 1);
      glowGrid = gridLayer(0.75, 1.6);
      scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
    };
    build();
    const observer = new ResizeObserver(build);
    observer.observe(canvas);

    const draw = (time: number) => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Background: a deep violet glow from the top, breathing slowly.
      const bg = ctx.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, Math.max(w, h) * (1.05 + 0.05 * Math.sin(time * 0.4)));
      bg.addColorStop(0, "#2d1058");
      bg.addColorStop(0.5, "#160a30");
      bg.addColorStop(1, "#0b0618");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // The grid drifting diagonally.
      const shift = (time * 14) % GRID;
      if (grid) ctx.drawImage(grid, 0, 0, grid.width, grid.height, shift - GRID, shift - GRID, grid.width / ratio, grid.height / ratio);

      // A ripple ring spreading from the middle every 5 s, lighting the grid as it passes.
      const cycle = (time % 5) / 5;
      if (glowGrid && scratch) {
        const s = scratch.getContext("2d");
        if (s) {
          const radius = cycle * Math.hypot(w, h) * 0.7;
          s.setTransform(1, 0, 0, 1, 0, 0);
          s.clearRect(0, 0, scratch.width, scratch.height);
          s.setTransform(ratio, 0, 0, ratio, 0, 0);
          s.globalCompositeOperation = "source-over";
          s.drawImage(glowGrid, 0, 0, glowGrid.width, glowGrid.height, shift - GRID, shift - GRID, glowGrid.width / ratio, glowGrid.height / ratio);
          s.globalCompositeOperation = "destination-in";
          const ring = s.createRadialGradient(w / 2, h * 0.45, Math.max(0, radius - 70), w / 2, h * 0.45, radius + 70);
          ring.addColorStop(0, "rgba(0,0,0,0)");
          ring.addColorStop(0.5, `rgba(0,0,0,${0.9 * (1 - cycle)})`);
          ring.addColorStop(1, "rgba(0,0,0,0)");
          s.fillStyle = ring;
          s.fillRect(0, 0, w, h);
          s.globalCompositeOperation = "source-over";
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(scratch, 0, 0);
          ctx.globalCompositeOperation = "source-over";
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
      }

      // Striped corners, scrolling.
      const stripes = (cx: number, cy: number, angle: number, color: string, speed: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.55, 0, TAU);
        ctx.clip();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        const off = (time * speed) % 22;
        const reach = Math.min(w, h) * 0.6;
        for (let x = -reach - 22 + off; x < reach; x += 22) ctx.fillRect(x, -reach, 9, reach * 2);
        ctx.restore();
      };
      ctx.globalAlpha = 0.55;
      stripes(w * 1.02, -h * 0.02, Math.PI / 4, "rgba(34,229,255,.22)", 10);
      stripes(-w * 0.02, h * 1.02, -Math.PI / 4, "rgba(255,179,71,.2)", -10);
      ctx.globalAlpha = 1;

      // Halftone dots along the bottom, swelling in travelling waves.
      const step = 14;
      const top = h * 0.6;
      ctx.fillStyle = "#ff2bd6";
      for (let y = top; y < h + step; y += step) {
        const depth = (y - top) / (h - top);
        for (let x = (y / step) % 2 ? step / 2 : 0; x < w + step; x += step) {
          const wave = 0.5 + 0.5 * Math.sin(x * 0.012 - time * 1.8 + Math.sin(y * 0.02 + time * 0.6) * 1.4);
          const r = 0.5 + depth * (0.9 + wave * 1.6);
          ctx.globalAlpha = 0.12 + depth * 0.4 * (0.5 + wave * 0.5);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // A soft light bar sweeping across every 9 s.
      const sweep = (time % 9) / 9;
      if (sweep < 0.4) {
        const x = -w * 0.3 + (sweep / 0.4) * w * 1.6;
        const bar = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
        bar.addColorStop(0, "rgba(255,255,255,0)");
        bar.addColorStop(0.5, "rgba(200,170,255,.07)");
        bar.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.transform(1, 0, -0.35, 1, h * 0.17, 0);
        ctx.fillStyle = bar;
        ctx.fillRect(x - 160, 0, 320, h);
        ctx.restore();
      }

      // The shapes, drifting across, turning and bobbing; they wrap round the edges.
      for (const shape of shapes) {
        const size = shape.sprite.width;
        const span = 1 + (size * 2) / Math.min(w, h);
        const fx = (((shape.x + shape.vx * time) % span) + span) % span;
        const fy = (((shape.y + shape.vy * time) % span) + span) % span;
        const px = fx * (w + size * 2) / span - size;
        const py = fy * (h + size * 2) / span - size + Math.sin(time * 0.9 + shape.bob) * 10;
        ctx.save();
        ctx.globalAlpha = shape.alpha * (0.75 + 0.25 * Math.sin(time * 1.3 + shape.bob));
        ctx.translate(px, py);
        ctx.rotate(shape.turn + time * shape.spin);
        ctx.drawImage(shape.sprite, -size / 2, -size / 2);
        ctx.restore();
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
