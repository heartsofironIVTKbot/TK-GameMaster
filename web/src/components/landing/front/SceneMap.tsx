"use client";

import { Lock, MousePointerClick, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInView } from "./fx";
import NationCard from "./NationCard";

/**
 * "Claim your nation": the reservation map playing itself. As soon as it's
 * on screen a cursor opens the United Kingdom (it glows yellow) and reserves
 * it; the nation panel closes, the reservations drawer slides
 * in, and the lobby fills up: each nation glows yellow while someone picks it,
 * then turns taken; Germany gets a co-op (blue). Then it starts over, and it
 * pauses while it's off screen. No glitches here (Niko, 2026-11-06).
 *
 * It copies the real map: teal-black sea, the nation panel with its glowing
 * Reserve button, the drawer, and the highlight recipes of nationHighlights.ts
 * (pending yellow glow, others' dashed yellow, your green, co-op blue, taken grey),
 * on the real vanilla borders (public/landing/map-vanilla.json). The map always
 * fills its frame: it's drawn three times side by side (it wraps east-west)
 * and the camera never shows past its top or bottom edge.
 */

interface FlatMap {
  width: number;
  height: number;
  nations: { tag: string; name: string; color: string; d: string }[];
  capitals: Record<string, [number, number]>;
}

const OCEAN = "#0f1d21";
const MAP_W = 1400;
const MAP_H = 509;
const COPIES = [-MAP_W, 0, MAP_W];
const YOU = "ENG";
const SLOTS = 64;
const MAJORS = ["FRA", "GER", "ITA", "JAP", "SOV", "ENG", "USA"];

// Who takes what after you, in waves (the counter jumps 2, 6, 12, 18, 23, 26),
// the next wave glowing yellow while those players pick.
const WAVES: [string, string][][] = [
  [["FRA", "Marianne"], ["GER", "Otto"]],
  [["ITA", "Vittorio"], ["SOV", "Nikolai"], ["POL", "Jan"], ["SPR", "Carmen"]],
  [["ROM", "Mihai"], ["HUN", "Miklós"], ["YUG", "Petar"], ["CZE", "Tomáš"], ["SWE", "Erik"], ["GRE", "Nikos"]],
  [["BEL", "Lotte"], ["HOL", "Daan"], ["NOR", "Ola"], ["FIN", "Aino"], ["TUR", "Emre"], ["POR", "Tiago"]],
  [["BUL", "Ivan"], ["DEN", "Freja"], ["AUS", "Felix"], ["ALB", "Arben"], ["LIT", "Rūta"]],
  [["LAT", "Jānis"], ["EST", "Kalev"], ["IRE", "Seán"]],
];
const CLAIMS = WAVES.flat();
// Co-op partners joining majors (blue), from that wave on.
const COOPS: { tag: string; player: string; wave: number }[] = [
  { tag: "GER", player: "Erwin", wave: 1 },
  { tag: "SOV", player: "Pavel", wave: 2 },
  { tag: "ITA", player: "Rocco", wave: 3 },
  { tag: "FRA", player: "Jeanne", wave: 4 },
];
// Nations the host locked (red), shown once the lobby is open.
const LOCKED = ["SWI", "LUX", "ICE"];

// The drawer's Europe list, as on the real map (majors listed above it).
const EUROPE_TAGS = [
  "ALB", "AUS", "BEL", "BUL", "CZE", "DEN", "EST", "FIN", "GRE", "HOL", "HUN", "ICE", "IRE",
  "LAT", "LIT", "LUX", "NOR", "POL", "POR", "ROM", "SPR", "SWE", "SWI", "TUR", "YUG",
];

// Beats: 0 world, 1 Europe, 2 hover the UK, 3 opened (pending), 4 cursor on
// Reserve, 5 reserved (panel closes, drawer opens), then one beat per wave,
// then a short hold. The end (waves + hold) is under 4 seconds.
const CLAIM_BEAT = 6;
const OUTRO_BEAT = CLAIM_BEAT + WAVES.length;
const BEAT_MS = [1200, 1100, 800, 1800, 1000, 1300];
const CLAIM_MS = 450;
const OUTRO_MS = 1200;

function beatMs(beat: number): number {
  if (beat < CLAIM_BEAT) return BEAT_MS[beat];
  if (beat < OUTRO_BEAT) return CLAIM_MS;
  return OUTRO_MS;
}
const TOTAL_MS = BEAT_MS.reduce((sum, ms) => sum + ms, 0) + WAVES.length * CLAIM_MS + OUTRO_MS;
function elapsedAt(beat: number): number {
  let total = 0;
  for (let b = 0; b < beat; b++) total += beatMs(b);
  return total;
}

/** What the camera looks at: a centre and how much of the map's height is in view. */
interface Camera {
  cx: number;
  cy: number;
  h: number;
}
const WORLD: Camera = { cx: 730, cy: MAP_H / 2, h: MAP_H };
const EUROPE: Camera = { cx: 742, cy: 128, h: 150 };
const EUROPE_WIDE: Camera = { cx: 765, cy: 140, h: 210 };
const UK_PHONE: Camera = { cx: 700, cy: 165, h: 210 };
const EUROPE_PHONE: Camera = { cx: 760, cy: 125, h: 240 };
const PHONE_WORLD: Camera = { cx: 760, cy: MAP_H / 2, h: MAP_H };

function cameraFor(beat: number, phone: boolean): Camera {
  if (beat === 0) return phone ? PHONE_WORLD : WORLD;
  if (beat <= 4) return beat >= 2 && phone ? UK_PHONE : EUROPE;
  return phone ? EUROPE_PHONE : EUROPE_WIDE;
}

function caption(beat: number): string {
  if (beat === 0) return "Every game gets a live map.";
  if (beat <= 2) return "Find your nation.";
  if (beat <= 4) return "Click it. Check it out.";
  if (beat === 5) return "Reserve it. It's yours.";
  if (beat < OUTRO_BEAT) return "Then the lobby fills up.";
  return "See you Saturday.";
}

// ---- The real map's highlight recipes (nationHighlights.ts), bottom to top.
// Widths are screen pixels, like the real map's.

interface Layer {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  width?: number;
  dash?: readonly [number, number];
}
const TAKEN: Layer[] = [{ fill: "#232a35", fillOpacity: 0.7, stroke: "#9aa4b2", strokeOpacity: 0.22, width: 0.8 }];
const SELF: Layer[] = [
  { fill: "#8affc0", fillOpacity: 0.14, stroke: "#19f57a", strokeOpacity: 0.34, width: 9 },
  { stroke: "#62ffa8", strokeOpacity: 1, width: 2.1 },
];
const CO_OP: Layer[] = [
  { fill: "#7fd0ff", fillOpacity: 0.14, stroke: "#1f6bff", strokeOpacity: 0.36, width: 9 },
  { stroke: "#3cc4ff", strokeOpacity: 1, width: 2.3 },
  { stroke: "#f2fbff", strokeOpacity: 0.95, width: 1, dash: [1.2, 5.8] },
];
/** Locked by the host: red. */
const LOCKED_GLOW: Layer[] = [
  { fill: "#240208", fillOpacity: 0.32, stroke: "#ff2442", strokeOpacity: 0.3, width: 8 },
  { stroke: "#ff5266", strokeOpacity: 1, width: 1.9 },
];
/** Someone else picking a nation: still dashed yellow, a faint wash. */
const OTHERS: Layer[] = [
  { fill: "#ffe14d", fillOpacity: 0.1, stroke: "#ffb000", strokeOpacity: 0.3, width: 8 },
  { stroke: "#ffd60a", strokeOpacity: 0.95, width: 1.8, dash: [7, 5] },
];
/** Your pending claim: a still yellow glow (the real map's, nationHighlights.ts). */
const PENDING: Layer[] = [
  { fill: "#ffe14d", fillOpacity: 0.12, stroke: "#ffb000", strokeOpacity: 0.34, width: 9 },
  { stroke: "#ffe14d", strokeOpacity: 0.95, width: 2.6 },
  { stroke: "#fffbe6", strokeOpacity: 0.85, width: 1.1 },
];
const HOVER: Layer[] = [
  { fill: "#ffffff", fillOpacity: 0.16 },
  { stroke: "#ffffff", strokeOpacity: 0.3, width: 5 },
  { stroke: "#ffffff", strokeOpacity: 0.95, width: 1.3 },
];

/**
 * One nation's highlight. The map is zoomed by a CSS transform, so widths and
 * dashes are given in map units (screen px / zoom) to look like the real
 * map's.
 */
function Highlight({ d, layers, zoom }: { d: string; layers: Layer[]; zoom: number }) {
  const unit = 1 / zoom;
  return (
    <g className="fx-fade-in">
      {layers.map((layer, index) => (
        <path
          key={index}
          d={d}
          fill={layer.fill ?? "none"}
          fillOpacity={layer.fillOpacity}
          stroke={layer.stroke ?? "none"}
          strokeOpacity={layer.strokeOpacity}
          strokeWidth={layer.width !== undefined ? layer.width * unit : undefined}
          strokeDasharray={layer.dash?.map((value) => value * unit).join(" ")}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

/** Just the rings of a path near a point (the UK's home islands, not its whole empire). */
function ringsNear(d: string, x: number, y: number, reach: number): string {
  return d
    .split("M")
    .filter(Boolean)
    .filter((ring) => {
      const [px, py] = ring.split(/[ Z]/).map(Number);
      return Math.hypot(px - x, py - y) < reach;
    })
    .map((ring) => `M${ring}`)
    .join("");
}

const PANEL_W = 380; // the real nation panel's width
const DRAWER_W = 300;

export default function SceneMap({ number }: { number: number }) {
  const frame = useRef<HTMLDivElement>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const reserveButton = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<FlatMap | null>(null);
  const [beat, setBeat] = useState(0);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [reserveSpot, setReserveSpot] = useState<{ x: number; y: number } | null>(null);
  // Plays while at least a third of it is on screen.
  const onScreen = useInView(frame, { once: false, threshold: 0.35, margin: "0px" });

  useEffect(() => {
    let cancelled = false;
    fetch("/landing/map-vanilla.json")
      .then((response) => response.json() as Promise<FlatMap>)
      .then((map) => {
        if (!cancelled) setData(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // The clock: one beat after another while on screen; the end loops back.
  useEffect(() => {
    if (!onScreen || !data) return undefined;
    const timer = window.setTimeout(() => setBeat(beat >= OUTRO_BEAT ? 0 : beat + 1), beatMs(beat));
    return () => window.clearTimeout(timer);
  }, [beat, onScreen, data]);

  useLayoutEffect(() => {
    const element = mapBox.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Where the Reserve button is, for the cursor (relative to the map box).
  useLayoutEffect(() => {
    if (beat < 3 || beat > 4) return undefined;
    const button = reserveButton.current;
    const box = mapBox.current;
    if (!button || !box) return undefined;
    const timer = window.setTimeout(() => {
      const a = button.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      setReserveSpot({ x: a.left - b.left + a.width * 0.6, y: a.top - b.top + a.height * 0.55 });
    }, 800); // after the panel has slid in (0.7s)
    return () => window.clearTimeout(timer);
  }, [beat, size]);

  const phone = size.width < 560;
  // The nation panel while you look at the UK; the drawer once you've reserved.
  const panelOpen = beat === 3 || beat === 4;
  const drawerOpen = beat >= 5 && !phone;

  const camera = useMemo(() => {
    const target = cameraFor(beat, phone);
    const h = Math.min(MAP_H, target.h);
    const scale = size.height / h;
    // Never past the map's top or bottom edge.
    const cy = Math.max(h / 2, Math.min(MAP_H - h / 2, target.cy));
    // Centre on the part of the map the panel or the drawer leaves free.
    let cx = target.cx;
    if (!phone && panelOpen) cx += PANEL_W / 2 / scale;
    if (drawerOpen) cx -= DRAWER_W / 2 / scale;
    return { cx, cy, scale };
  }, [beat, phone, size, panelOpen, drawerOpen]);

  // The camera box is moved by hand (not by React), in two steps per move:
  // first the map is redrawn at the larger of the two zooms (where it is now
  // and where it's going) with the box set so nothing seems to change; then
  // the box glides to the target. The picture only ever shrinks while it
  // moves, so it stays sharp; once there, it's redrawn at the exact zoom.
  const cameraBox = useRef<HTMLDivElement>(null);
  const drawRef = useRef(0);
  const targetRef = useRef({ x: 0, y: 0, scale: 1 });
  const cameraKey = `${camera.cx.toFixed(2)},${camera.cy.toFixed(2)},${camera.scale.toFixed(4)},${size.width},${size.height}`;
  useLayoutEffect(() => {
    const box = cameraBox.current;
    if (!box) return;
    const target = {
      x: size.width / 2 - camera.cx * camera.scale,
      y: size.height / 2 - camera.cy * camera.scale,
      scale: camera.scale,
    };
    targetRef.current = target;
    const drawAt = (draw: number) => {
      drawRef.current = draw;
      box.style.setProperty("--fx-draw", String(draw));
    };
    if (!drawRef.current) {
      drawAt(target.scale);
      box.style.transition = "none";
      box.style.transform = `translate(${target.x}px, ${target.y}px)`;
      return;
    }
    const now = new DOMMatrixReadOnly(getComputedStyle(box).transform === "none" ? undefined : getComputedStyle(box).transform);
    const nowScale = now.a * drawRef.current;
    const draw = Math.max(nowScale, target.scale);
    box.style.transition = "none";
    drawAt(draw);
    box.style.transform = `translate(${now.e}px, ${now.f}px) scale(${nowScale / draw})`;
    void box.offsetWidth; // apply that before the glide starts
    box.style.transition = "transform 1.1s cubic-bezier(0.65, 0, 0.25, 1)";
    box.style.transform = `translate(${target.x}px, ${target.y}px) scale(${target.scale / draw})`;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key covers the camera and size
  }, [cameraKey, data]);
  const settle = () => {
    const box = cameraBox.current;
    const target = targetRef.current;
    if (!box || drawRef.current === target.scale) return;
    box.style.transition = "none";
    drawRef.current = target.scale;
    box.style.setProperty("--fx-draw", String(target.scale));
    box.style.transform = `translate(${target.x}px, ${target.y}px)`;
  };

  const toScreen = (x: number, y: number) => {
    // The copy of this spot nearest the camera.
    const wrapped = x + Math.round((camera.cx - x) / MAP_W) * MAP_W;
    return { x: size.width / 2 + (wrapped - camera.cx) * camera.scale, y: size.height / 2 + (y - camera.cy) * camera.scale };
  };
  const nearestCopy = (x: number) => Math.round((camera.cx - x) / MAP_W) * MAP_W;

  const waves = Math.max(0, Math.min(WAVES.length, beat - CLAIM_BEAT + 1));
  const lastWave = waves > 0 ? WAVES[waves - 1] : [];
  const claimed = WAVES.slice(0, waves).reduce((sum, wave) => sum + wave.length, 0);
  const takenBy = new Map(CLAIMS.slice(0, claimed));
  const latest = lastWave.length > 0 ? lastWave[lastWave.length - 1][0] : null;
  // The next wave is being picked (yellow) for a beat before it's taken.
  const choosingTags = new Set(beat >= 5 && waves < WAVES.length ? WAVES[waves].map(([tag]) => tag) : []);
  const coops = COOPS.filter((coop) => waves > coop.wave);
  const coopBy = new Map(coops.map((coop) => [coop.tag, coop.player]));
  const lockedOn = beat >= 5;
  const yours = beat >= 5;
  const taken = claimed + (yours ? 1 : 0);
  const majorsTaken = MAJORS.filter((tag) => takenBy.has(tag) || (tag === YOU && yours)).length;

  // The cursor: off to the side, to the UK, to the Reserve button, then away.
  const ukCapital = data?.capitals[YOU] ?? [696, 121];
  const ukSpot = toScreen(ukCapital[0] - 3, ukCapital[1] - 7);
  let cursor = { x: size.width * 0.8, y: size.height * 0.9, visible: false };
  if (beat === 1) cursor = { x: size.width * 0.72, y: size.height * 0.78, visible: true };
  if (beat === 2 || beat === 3) cursor = { ...ukSpot, visible: true };
  if (beat === 4 && reserveSpot) cursor = { ...reserveSpot, visible: true };

  // Keep the newest reservation in view in the drawer (it scrolls like the real one).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = latest ? list.querySelector<HTMLElement>(`[data-row="${latest}"]`) : null;
    const top = row ? Math.max(0, row.offsetTop - list.clientHeight / 2) : 0;
    list.scrollTo({ top, behavior: beat === 0 ? "auto" : "smooth" });
  }, [latest, beat]);

  const pathOf = (tag: string) => data?.nations.find((nation) => nation.tag === tag)?.d;
  const pinScale = 1 / Math.sqrt(camera.scale);
  const title = caption(beat);
  const progress = Math.min(1, (elapsedAt(beat) + beatMs(beat)) / TOTAL_MS);

  // The highlight layers, in the real map's order (taken under everything).
  // Static ones live with the nations; the breathing ones (yours, the co-op)
  // and the pending UK get layers of their own, so they don't make the
  // whole map repaint every frame.
  const highlights: { key: string; tag: string; layers: Layer[] }[] = [];
  for (const [tag] of CLAIMS.slice(0, claimed)) {
    if (!coopBy.has(tag)) highlights.push({ key: `taken-${tag}`, tag, layers: TAKEN });
  }
  if (lockedOn) for (const tag of LOCKED) highlights.push({ key: `locked-${tag}`, tag, layers: LOCKED_GLOW });
  for (const tag of choosingTags) highlights.push({ key: `others-${tag}`, tag, layers: OTHERS });
  if (beat === 2) highlights.push({ key: "hover", tag: YOU, layers: HOVER });
  const glows: { key: string; tag: string; layers: Layer[] }[] = [];
  for (const coop of coops) glows.push({ key: `coop-${coop.tag}`, tag: coop.tag, layers: CO_OP });
  // Your green only the moment you reserve (it was too much left on).
  if (beat === 5) glows.push({ key: "self", tag: YOU, layers: SELF });
  // The nations themselves never change: built once, so a step of the demo
  // doesn't make React walk 288 shapes.
  const nationShapes = useMemo(
    () =>
      data
        ? COPIES.map((offset) => (
            <g key={offset} transform={offset ? `translate(${offset} 0)` : undefined}>
              {data.nations.map((nation) => (
                <path key={nation.tag} d={nation.d} fill={nation.color} className="fx-map-nation" />
              ))}
            </g>
          ))
        : null,
    [data],
  );
  const ukHome = useMemo(() => {
    const d = data?.nations.find((nation) => nation.tag === YOU)?.d;
    const capital = data?.capitals[YOU];
    return d && capital ? ringsNear(d, capital[0], capital[1], 60) : "";
  }, [data]);

  return (
    <section aria-labelledby="scene-map-title" className="mx-auto w-full max-w-[1400px] px-3 py-20 sm:px-8 sm:py-28">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pb-4">
        <div>
          <p className="fx-kicker">{`${String(number).padStart(2, "0")} // The live map`}</p>
          <h2 id="scene-map-title" className="gm-title mt-2 text-[34px] sm:text-[56px]">
            <span key={title} className="fx-tag-in inline-block">
              {title}
            </span>
          </h2>
        </div>
        <p className="font-mono text-sm text-ink-400">
          <span className="text-2xl font-bold text-ink-100 sm:text-3xl">{taken}</span>
          <span className="text-ink-500"> / {SLOTS} taken</span>
        </p>
      </div>

      {/* The map "screen" */}
      <div
        ref={frame}
        className="fx-hud relative flex h-[clamp(480px,calc(100svh-210px),760px)] flex-col overflow-hidden border border-ink-800 bg-ink-950"
      >
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-950 px-3">
          <span className="gm-cut flex h-6 w-6 items-center justify-center bg-brand-400 font-stencil text-[13px] font-extrabold text-brand-950 [--cut:5px]">
            GM
          </span>
          <span className="min-w-0 flex-1 truncate text-center">
            <span className="gm-title text-[15px] sm:text-[18px]">Historical game · Vanilla 1936</span>
            <span className="ml-2 hidden text-xs text-ink-400 sm:inline">Starts Saturday 18:00 UTC</span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-rose-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
            LIVE
          </span>
        </div>

        <div ref={mapBox} className="relative min-h-0 flex-1 overflow-hidden" style={{ background: OCEAN }}>
          {data && (
            // The camera: a plain box moved and zoomed by a CSS transform, so
            // the browser animates it on the GPU instead of redrawing the map
            // every frame. Inside, the map is drawn three times side by side
            // (it wraps), in map units (1 unit = 1px before the zoom).
            <div
              ref={cameraBox}
              className="absolute left-0 top-0 h-0 w-0 origin-top-left"
              onTransitionEnd={(event) => {
                if (event.target === event.currentTarget && event.propertyName === "transform") settle();
              }}
            >
              <svg
                className="absolute overflow-visible"
                style={{ left: `calc(var(--fx-draw) * ${-MAP_W}px)`, top: 0, width: `calc(var(--fx-draw) * ${MAP_W * 3}px)`, height: `calc(var(--fx-draw) * ${MAP_H}px)`, ["--fx-sw" as string]: `${0.8 / camera.scale}px` }}
                viewBox={`${-MAP_W} 0 ${MAP_W * 3} ${MAP_H}`}
                role="img"
                aria-label="The reservation map filling up as players claim nations"
              >
                <defs>
                  {/* Trim the map's straight frame edges, so outlines don't run along them. */}
                  <clipPath id="fx-map-frame">
                    <rect x={-MAP_W - 20} y={1.4} width={MAP_W * 3 + 40} height={MAP_H - 2.8} />
                  </clipPath>
                </defs>
                <g clipPath="url(#fx-map-frame)">
                  {nationShapes}
                  {highlights.map((highlight) => {
                    const d = pathOf(highlight.tag);
                    const x = data.capitals[highlight.tag]?.[0] ?? 0;
                    return d ? (
                      <g key={highlight.key} transform={nearestCopy(x) ? `translate(${nearestCopy(x)} 0)` : undefined}>
                        <Highlight d={d} layers={highlight.layers} zoom={camera.scale} />
                      </g>
                    ) : null;
                  })}
                </g>
                {/* Player pins at the capitals */}
                {CLAIMS.slice(0, claimed).map(([tag, player]) => {
                  const spot = data.capitals[tag];
                  if (!spot) return null;
                  const x = spot[0] + nearestCopy(spot[0]);
                  return (
                    <g key={tag} className="fx-map-pin">
                      <circle cx={x} cy={spot[1]} r={4.2 * pinScale} fill="rgb(244 63 94)" stroke="#fff" strokeWidth={0.6 * pinScale} />
                      <text
                        x={x}
                        y={spot[1]}
                        dy="0.35em"
                        textAnchor="middle"
                        fontSize={4.6 * pinScale}
                        fontWeight={800}
                        fill="#fff"
                        style={{ fontFamily: "var(--font-sans)" }}
                      >
                        {player[0]}
                      </text>
                    </g>
                  );
                })}
                {yours && (
                  <circle
                    className="fx-map-pin"
                    cx={ukCapital[0] + nearestCopy(ukCapital[0])}
                    cy={ukCapital[1]}
                    r={5 * pinScale}
                    fill="var(--color-brand-400)"
                    stroke="#fff"
                    strokeWidth={0.7 * pinScale}
                  />
                )}
                {beat === 3 && (
                  <circle
                    key="ripple"
                    cx={ukCapital[0] + nearestCopy(ukCapital[0])}
                    cy={ukCapital[1] + 4}
                    r={6}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1}
                    className="fx-map-ripple"
                  />
                )}
                {/* Name tags over the latest few nations taken (screen-sized). */}
                {lastWave.slice(0, phone ? 2 : 4).map(([tag, player]) => {
                  const spot = data.capitals[tag];
                  if (!spot) return null;
                  const width = player.length * 6.6 + 12;
                  return (
                    <g
                      key={tag}
                      className="fx-fade-in"
                      transform={`translate(${spot[0] + nearestCopy(spot[0])} ${spot[1]}) scale(${1 / camera.scale})`}
                    >
                      <rect x={-width / 2} y={-27} width={width} height={18} rx={2} fill="rgb(225 29 72)" />
                      <text y={-14} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff" style={{ fontFamily: "var(--font-sans)" }}>
                        {player}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Breathing glows (yours, the co-op): their own layer, faded as a whole. */}
              {glows.length > 0 && (
                <svg
                  aria-hidden
                  className="fx-breathe-layer pointer-events-none absolute overflow-visible"
                  style={{ left: `calc(var(--fx-draw) * ${-MAP_W}px)`, top: 0, width: `calc(var(--fx-draw) * ${MAP_W * 3}px)`, height: `calc(var(--fx-draw) * ${MAP_H}px)` }}
                  viewBox={`${-MAP_W} 0 ${MAP_W * 3} ${MAP_H}`}
                >
                  {glows.map((glow) => {
                    const d = pathOf(glow.tag);
                    const x = data.capitals[glow.tag]?.[0] ?? 0;
                    return d ? (
                      <g key={glow.key} transform={nearestCopy(x) ? `translate(${nearestCopy(x)} 0)` : undefined}>
                        <Highlight d={d} layers={glow.layers} zoom={camera.scale} />
                      </g>
                    ) : null;
                  })}
                </svg>
              )}

              {/* The pending glow round the UK's home islands: its own small layer. */}
              {(beat === 3 || beat === 4) && ukHome && (
                <svg
                  aria-hidden
                  className="pointer-events-none absolute overflow-visible"
                  style={{ left: `calc(var(--fx-draw) * ${-MAP_W}px)`, top: 0, width: `calc(var(--fx-draw) * ${MAP_W * 3}px)`, height: `calc(var(--fx-draw) * ${MAP_H}px)` }}
                  viewBox={`${-MAP_W} 0 ${MAP_W * 3} ${MAP_H}`}
                >
                  <g transform={nearestCopy(ukCapital[0]) ? `translate(${nearestCopy(ukCapital[0])} 0)` : undefined}>
                    <Highlight d={ukHome} layers={PENDING} zoom={camera.scale} />
                  </g>
                </svg>
              )}
            </div>
          )}

          {/* The reservations drawer (wide screens), like the real map's; slides in once you've reserved */}
          <aside
            aria-hidden={!drawerOpen}
            className={`absolute inset-y-0 left-0 z-10 hidden flex-col border-r border-ink-800 bg-ink-950 transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.25,1)] md:flex ${
              drawerOpen ? "translate-x-0" : "-translate-x-[105%]"
            }`}
            style={{ width: DRAWER_W }}
          >
            <p className="gm-title px-3 pt-3 text-[22px]">Reservations</p>
            <div className="mx-3 mt-2 grid grid-cols-5 divide-x divide-ink-800 border border-ink-800 text-center">
              <Count value={taken} of={SLOTS} label="Taken" highlight />
              <Count value={majorsTaken} of={7} label="Majors" />
              <Count value={taken - majorsTaken} of={SLOTS - 7} label="Minors" />
              <Count value={coops.length} label="Co-op" />
              <Count value={0} label="Filler" />
            </div>
            <div ref={listRef} className="relative mt-2 min-h-0 flex-1 overflow-hidden border-t border-ink-800">
              <p className="px-3 pb-1 pt-2 text-[11px] text-ink-500">Majors</p>
              <ul className="px-1.5">
                {MAJORS.map((tag) => (
                  <Row
                    key={tag}
                    tag={tag}
                    data={data}
                    player={tag === YOU && yours ? "You" : takenBy.get(tag)}
                    choosing={choosingTags.has(tag)}
                    latest={latest === tag}
                    coop={coopBy.get(tag)}
                  />
                ))}
              </ul>
              <p className="px-3 pb-1 pt-3 text-[11px] text-ink-500">Europe</p>
              <ul className="px-1.5 pb-3">
                {EUROPE_TAGS.map((tag) => (
                  <Row
                    key={tag}
                    tag={tag}
                    data={data}
                    player={takenBy.get(tag)}
                    choosing={choosingTags.has(tag)}
                    latest={latest === tag}
                    locked={lockedOn && LOCKED.includes(tag)}
                  />
                ))}
              </ul>
            </div>
          </aside>

          {/* The cursor */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-0 top-0 z-20 h-6 w-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            style={{
              transform: `translate(${cursor.x}px, ${cursor.y}px)`,
              opacity: cursor.visible ? 1 : 0,
              transition: "transform 1s cubic-bezier(0.65, 0, 0.25, 1), opacity 0.4s",
            }}
          >
            <path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>

          {/* The nation panel: the real one's markup and the UK's 1936 data */}
          <div
            className={`absolute z-10 flex flex-col overflow-hidden border-ink-800 bg-ink-950 transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.25,1)] ${
              phone
                ? `inset-x-0 bottom-0 max-h-[58%] border-t ${panelOpen ? "translate-y-0" : "translate-y-[105%]"}`
                : `inset-y-0 right-0 border-l ${panelOpen ? "translate-x-0" : "translate-x-[105%]"}`
            }`}
            style={phone ? undefined : { width: PANEL_W }}
          >
            <NationCard status="pending" />
          </div>

          {/* Bottom of the map, as on the real one: the hint, then the glowing Reserve button */}
          <div
            className="pointer-events-none absolute bottom-6 z-[15] -translate-x-1/2 transition-[left] duration-700"
            style={{ left: !phone && panelOpen ? (size.width - PANEL_W) / 2 : size.width / 2 }}
          >
            <div
              className={`gm-plate absolute bottom-0 left-1/2 flex w-max -translate-x-1/2 items-center gap-3 bg-ink-950 py-2 pl-4 pr-4 transition-opacity duration-300 ${
                beat <= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              <MousePointerClick aria-hidden className="h-[18px] w-[18px] shrink-0 text-brand-400" />
              <span className="text-[13px] text-ink-100 sm:text-sm">Click a nation on the map to reserve it</span>
            </div>
            <div className={`transition-opacity duration-300 ${panelOpen && !phone ? "opacity-100" : "opacity-0"}`}>
              <div className="gm-reserve">
                <span aria-hidden className="gm-reserve-halo" />
                <span aria-hidden className="gm-reserve-halo" />
                <span aria-hidden className="gm-reserve-halo" />
                <button
                  ref={reserveButton}
                  type="button"
                  tabIndex={-1}
                  className="gm-btn gm-btn-primary h-[64px] whitespace-nowrap px-[44px] font-display text-[28px] font-extrabold uppercase tracking-[0.03em]"
                >
                  Reserve nation
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* How far through the demo */}
        <div aria-hidden className="h-[3px] shrink-0 bg-ink-900">
          <div
            className="h-full origin-left bg-brand-400"
            style={{
              transform: `scaleX(${progress})`,
              transition: beat === 0 ? "none" : `transform ${beatMs(beat)}ms linear`,
            }}
          />
        </div>
      </div>
    </section>
  );
}

function Flag({ tag }: { tag: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/assets/flags/${tag}.png`} alt="" className="h-3.5 w-5 shrink-0 object-cover" loading="lazy" />;
}

function Chip({ player, choosing }: { player?: string; choosing?: boolean }) {
  if (player === "You") return <span className="gm-tag bg-brand-400 px-2 text-[10.5px] font-bold text-brand-950">You</span>;
  if (player) return <span className="gm-tag bg-rose-600/85 px-2 text-[10.5px] font-bold text-white">{player}</span>;
  if (choosing) return <span className="gm-tag gm-tag-dot px-2 text-[10.5px] text-yellow-300">Pending</span>;
  return <span className="gm-tag gm-tag-dot px-2 text-[10.5px] text-emerald-300">Open</span>;
}

function Row({
  tag,
  data,
  player,
  choosing,
  latest,
  coop,
  locked = false,
}: {
  tag: string;
  data: FlatMap | null;
  player?: string;
  choosing: boolean;
  latest: boolean;
  coop?: string;
  locked?: boolean;
}) {
  const name = data?.nations.find((nation) => nation.tag === tag)?.name ?? tag;
  return (
    <li data-row={tag} className={`px-1.5 py-1 ${latest ? "bg-rose-500/10" : ""} ${choosing ? "bg-yellow-400/5" : ""}`}>
      {/* key: the row flashes when it's taken */}
      <div key={player ?? ""} className={`flex items-center gap-2 ${player && player !== "You" ? "fx-row-new" : ""}`}>
        <Flag tag={tag} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-100">{name}</span>
        {locked ? (
          <span className="gm-tag bg-rose-950/80 px-2 text-[10.5px] text-rose-300">
            <Lock aria-hidden className="h-3 w-3" strokeWidth={2} />
            Locked
          </span>
        ) : (
          <Chip player={player} choosing={choosing} />
        )}
      </div>
      {coop && (
        <p className="fx-tag-in ml-7 mt-0.5 flex items-center gap-1.5 text-[11px] text-sky-300">
          <Users aria-hidden className="h-3 w-3" strokeWidth={2} />
          Co-op <span className="font-semibold text-ink-100">{coop}</span>
        </p>
      )}
    </li>
  );
}

function Count({ value, of, label, highlight = false }: { value: number; of?: number; label: string; highlight?: boolean }) {
  return (
    <div className="px-0.5 py-1.5">
      <p className="font-display text-lg font-extrabold leading-none">
        <span className={highlight ? "text-brand-400" : "text-ink-100"}>{value}</span>
        {of !== undefined && <span className="text-xs text-ink-500">/{of}</span>}
      </p>
      <p className="mt-0.5 text-[10px] text-ink-500">{label}</p>
    </div>
  );
}
