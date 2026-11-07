"use client";

/* eslint-disable @next/next/no-img-element -- frames of the real site, drawn as-is */

import { Pause, Play } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTutorialFacts } from "@/components/tutorial/TutorialProvider";
import type { GlobeLayout, WarGlobe as Engine } from "../landing/globeEngine";
import { BEAT, DROPS, DURATION, FPS, GLITCHES, HITS, IMAGES, SHOTS, SLAMS, type GlobeShot, type Shot } from "./script";

/**
 * The trailer, drawn from the time alone: every frame is a pure function of
 * `t` (plus the globe, stepped forward by exactly the time that passed), so
 * scripts/trailer/render.mjs can step it frame by frame and ffmpeg stitches
 * the frames to the track. In the browser it plays live with the music.
 *
 *   /lab/trailer?format=wide|tall           preview with the track
 *   /lab/trailer?format=wide&render=1        bare stage for the renderer
 */

type Format = "wide" | "tall";
const SIZE: Record<Format, [number, number]> = { wide: [1920, 1080], tall: [1080, 1920] };
const TRACK = "/landing/trailer/master-your-game.wav";

// ---- Time helpers. ------------------------------------------------------------------

/** A stable random number in [0, 1) for a frame and a salt. */
const rnd = (a: number, b = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v: number) => 1 - (1 - clamp(v)) ** 3;
const after = (t: number, at: number, rate: number) => (t >= at ? Math.exp(-(t - at) * rate) : 0);
const slamAmount = (t: number) => Math.max(0, ...SLAMS.map((at) => after(t, at, 7)));
const hitAmount = (t: number) => Math.max(slamAmount(t), ...HITS.map((at) => after(t, at, 10) * 0.6));
/** The kick: 1 on each beat in a drop, falling away before the next. */
const kick = (t: number) => {
  const drop = DROPS.find(([a, b]) => t >= a && t < b);
  if (!drop) return 0;
  return Math.exp(-(((t - drop[0]) % BEAT) / BEAT) * 5);
};
const shotAt = (t: number) => SHOTS.find((shot) => t >= shot.start && t < shot.end) ?? SHOTS[SHOTS.length - 1];

// ---- The stage. -------------------------------------------------------------------------

export default function TrailerStage() {
  useTutorialFacts({ helpHidden: true });
  const params = useSearchParams();
  const format: Format = params.get("format") === "tall" ? "tall" : "wide";
  const renderMode = params.get("render") === "1";
  const [W, H] = SIZE[format];
  const [t, setT] = useState(Number(params.get("t")) || 0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState({ globe: false, map: false, images: false });
  const [fit, setFit] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const globeTime = useRef(0);
  const globeShot = useRef<GlobeShot | null>(null);
  const layoutRef = useRef<(w: number, h: number) => GlobeLayout>(() => ({ x: 0, y: 0, radius: 0.4 }));
  const waiting = useRef<(() => void) | null>(null);
  const [map, setMap] = useState<MapData | null>(null);

  // Fit the stage to the window when previewing.
  useEffect(() => {
    if (renderMode) return undefined;
    const update = () => setFit(Math.min((window.innerWidth - 32) / W, (window.innerHeight - 120) / H, 1));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [W, H, renderMode]);

  // The globe: our own engine, stepped by hand.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return undefined;
    let cancelled = false;
    let made: Engine | null = null;
    Promise.all([import("../landing/globeEngine"), fetch("/landing/globe-vanilla.json").then((r) => r.json())]).then(([module, data]) => {
      if (cancelled) return;
      made = new module.WarGlobe(element, { intensity: "dramatic", quality: "high", motion: true, layout: (w, h) => layoutRef.current(w, h) });
      const globe = made;
      globe.resize(W, H);
      engine.current = globe;
      void globe.setData(data).then(() => {
        if (!cancelled) setReady((r) => ({ ...r, globe: true }));
      });
    });
    return () => {
      cancelled = true;
      made?.dispose();
      engine.current = null;
    };
  }, [W, H]);

  // The flat map and every screen, loaded up front.
  useEffect(() => {
    fetch("/landing/map-vanilla.json")
      .then((r) => r.json())
      .then((data: MapData) => {
        setMap(data);
        setReady((r) => ({ ...r, map: true }));
      });
    Promise.all(
      IMAGES.map(
        (src) =>
          new Promise<void>((done) => {
            const image = new Image();
            image.onload = () => image.decode().then(done, done);
            image.onerror = () => done();
            image.src = src;
          }),
      ),
    ).then(() => setReady((r) => ({ ...r, images: true })));
  }, []);

  const shot = shotAt(t);

  // Move the globe to this moment: its framing for the shot, then exactly the time that passed.
  useLayoutEffect(() => {
    const globe = engine.current;
    if (!globe) return;
    const want = shot.globe ?? globeShot.current ?? "close";
    if (want !== globeShot.current) {
      globeShot.current = want;
      layoutRef.current = globeLayout(want, format);
      globe.setOptions({ intensity: want === "pullout" || want === "end" ? "war" : "dramatic" });
      globe.resize(W, H);
    }
    const dt = t - globeTime.current;
    if (dt > 0 && dt < 1) globe.advance(dt);
    else globe.advance(0);
    globeTime.current = t;
    waiting.current?.();
    waiting.current = null;
  }, [t, shot, format, W, H]);

  // For the renderer: jump to a moment, resolve once it's painted. (Already there:
  // nothing re-renders, so just wait for a paint.)
  const current = useRef(t);
  useLayoutEffect(() => {
    current.current = t;
  }, [t]);
  const seek = useCallback(
    (to: number) =>
      new Promise<void>((done) => {
        const painted = () => requestAnimationFrame(() => requestAnimationFrame(() => done()));
        if (Math.abs(to - current.current) < 1e-6) {
          painted();
          return;
        }
        waiting.current = painted;
        setT(to);
      }),
    [],
  );
  const allReady = ready.globe && ready.map && ready.images;
  useEffect(() => {
    (window as unknown as { __trailer?: unknown }).__trailer = { duration: DURATION, fps: FPS, ready: allReady, seek };
  }, [allReady, seek]);

  // Live preview: the track is the clock.
  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    const loop = () => {
      const now = audio.current?.currentTime ?? 0;
      setT(now);
      if (now >= DURATION - 0.05) setPlaying(false);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (playing) {
      element.pause();
      setPlaying(false);
    } else {
      if (t >= DURATION - 0.1) element.currentTime = 0;
      void element.play();
      setPlaying(true);
    }
  };

  const shake = hitAmount(t);
  const shakeX = (rnd(Math.floor(t * FPS), 1) - 0.5) * 34 * shake;
  const shakeY = (rnd(Math.floor(t * FPS), 2) - 0.5) * 24 * shake;
  const flash = Math.max(0, ...SLAMS.map((at) => after(t, at, 9))) * (t < DURATION - 0.3 ? 1 : 0);
  const glitching = GLITCHES.some(([a, b]) => t >= a && t < b);

  return (
    <div className={renderMode ? "" : "flex min-h-screen flex-col items-center gap-4 bg-black p-4"}>
      <div style={renderMode ? undefined : { width: W * fit, height: H * fit }}>
        <div
          className="relative overflow-hidden bg-[#020403] text-white"
          style={{ width: W, height: H, transform: renderMode ? undefined : `scale(${fit})`, transformOrigin: "0 0" }}
        >
          <div className="absolute inset-0" style={{ transform: `translate(${shakeX}px, ${shakeY}px)` }}>
            <Backdrop t={t} W={W} H={H} />
            <canvas
              ref={canvas}
              width={W}
              height={H}
              className="absolute inset-0 h-full w-full"
              style={globeStyle(shot, t)}
            />
            <ShotLayer shot={shot} t={t} format={format} W={W} H={H} map={map} />
          </div>
          {glitching ? <Binary t={t} W={W} H={H} /> : null}
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)" }}
          />
          <div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: flash * 0.85 }} />
        </div>
      </div>

      {renderMode ? null : (
        <div className="flex w-full max-w-[900px] items-center gap-3 text-sm text-ink-200">
          <audio ref={audio} src={TRACK} preload="auto" />
          <button type="button" onClick={toggle} className="gm-btn gm-btn-primary h-10 w-10 justify-center p-0" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={DURATION}
            step={1 / FPS}
            value={t}
            onChange={(event) => {
              const to = Number(event.target.value);
              if (audio.current) audio.current.currentTime = to;
              setT(to);
            }}
            className="flex-1 accent-[var(--color-brand-400)]"
          />
          <span className="w-14 font-mono text-xs">{t.toFixed(2)}s</span>
          <a className="gm-btn gm-btn-secondary h-10 px-3" href={`?format=${format === "wide" ? "tall" : "wide"}`}>
            {format === "wide" ? "9:16" : "16:9"}
          </a>
          {allReady ? null : <span className="text-xs text-ink-500">loading…</span>}
        </div>
      )}
    </div>
  );
}

// ---- The globe's framing per shot. -----------------------------------------------------

function globeLayout(shot: GlobeShot, format: Format): (w: number, h: number) => GlobeLayout {
  const tall = format === "tall";
  const layouts: Record<GlobeShot, GlobeLayout> = {
    close: tall ? { x: 0, y: 0.2, radius: 0.36 } : { x: 0.16, y: 0.16, radius: 0.66 },
    punch: tall ? { x: 0, y: 0.06, radius: 0.3 } : { x: 0, y: 0.04, radius: 0.46 },
    slam: tall ? { x: 0, y: 0, radius: 0.26 } : { x: 0, y: 0, radius: 0.4 },
    pullout: tall ? { x: 0, y: 0.08, radius: 0.5 } : { x: 0, y: 0.06, radius: 0.9 },
    end: tall ? { x: 0, y: 0.42, radius: 0.36 } : { x: 0, y: 0.62, radius: 0.62 },
  };
  const layout = layouts[shot];
  return () => layout;
}

/** The globe's canvas: shown in its shots, dimmed behind the logo and end card, zoomed by hand. */
function globeStyle(shot: Shot, t: number): CSSProperties {
  const u = t - shot.start;
  const p = (t - shot.start) / (shot.end - shot.start);
  const visible = shot.kind === "globe" || shot.kind === "logo" || shot.kind === "end";
  let scale = 1;
  if (shot.globe === "close") scale = 1.08 - 0.08 * ease(p);
  if (shot.globe === "punch") scale = 1 + 0.06 * Math.floor(u / BEAT) + 0.04 * Math.exp(-((u % BEAT) / BEAT) * 6);
  if (shot.globe === "slam") scale = 1.25 - 0.25 * ease(u / 0.35);
  if (shot.globe === "pullout") scale = 1 - 0.5 * ease(p * 1.2);
  if (shot.globe === "end") scale = 1 + 0.03 * Math.sin(u * 1.5);
  const dim = shot.kind === "logo" ? 0.55 : shot.kind === "end" ? 0.7 : 1;
  // Shrunk, the canvas's faint glow would show its edges: fade them out round the globe.
  const mask = shot.globe === "pullout" ? "radial-gradient(circle at 50% 53%, black 34%, transparent 62%)" : undefined;
  return { opacity: visible ? dim : 0, transform: `scale(${scale})`, transformOrigin: "50% 50%", maskImage: mask, WebkitMaskImage: mask };
}

// ---- Layers. -------------------------------------------------------------------------------

/** A still star field with a slow green haze (the site's sky, for the trailer). */
function Backdrop({ t, W, H }: { t: number; W: number; H: number }) {
  const stars = useMemo(
    () => Array.from({ length: 220 }, (_, i) => ({ x: rnd(i, 3) * W, y: rnd(i, 4) * H, r: 0.6 + rnd(i, 5) * 1.4, a: 0.2 + rnd(i, 6) * 0.6, tw: rnd(i, 7) })),
    [W, H],
  );
  return (
    <svg className="absolute inset-0" width={W} height={H} aria-hidden>
      <defs>
        <radialGradient id="haze" cx="20%" cy="90%" r="70%">
          <stop offset="0%" stopColor="rgba(40,150,70,0.16)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#haze)" />
      {stars.map((star, i) => (
        <circle
          key={i}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill="#fff"
          opacity={star.tw < 0.35 ? star.a * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 3 + i))) : star.a}
        />
      ))}
    </svg>
  );
}

/** Rows of flickering 0s and 1s (the front page's glitch). */
function Binary({ t, W, H }: { t: number; W: number; H: number }) {
  const frame = Math.floor(t * FPS);
  const rows = Array.from({ length: 9 }, (_, i) => {
    const y = rnd(frame, i + 10) * H;
    const text = Array.from({ length: 80 }, (_, k) => (rnd(frame * 7 + i, k) > 0.5 ? "1" : "0"))
      .join("")
      .replace(/(.{4})/g, "$1 ");
    return { y, text, x: (rnd(frame, i + 30) - 0.5) * W * 0.4, hot: rnd(frame, i + 50) > 0.6 };
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden font-mono" aria-hidden>
      {rows.map((row, i) => (
        <p
          key={i}
          className="absolute whitespace-nowrap px-2"
          style={{
            top: row.y,
            left: row.x,
            fontSize: 30,
            color: row.hot ? "#020403" : "#7ee387",
            background: row.hot ? "#53d064" : "rgba(2,4,3,0.75)",
            textShadow: "3px 0 rgba(255,40,80,0.7), -3px 0 rgba(0,220,255,0.7)",
          }}
        >
          {row.text}
        </p>
      ))}
    </div>
  );
}

function ShotLayer({ shot, t, format, W, H, map }: { shot: Shot; t: number; format: Format; W: number; H: number; map: MapData | null }) {
  const u = t - shot.start;
  const tall = format === "tall";
  if (shot.kind === "black") return null;
  if (shot.kind === "logo") return <Logo t={t} u={u} W={W} tall={tall} />;
  if (shot.kind === "end") return <EndCard t={t} u={u} H={H} tall={tall} />;
  if (shot.kind === "word") return <Words shot={shot} u={u} t={t} W={W} H={H} tall={tall} centered />;
  if (shot.kind === "globe") return <Words shot={shot} u={u} t={t} W={W} H={H} tall={tall} centered={shot.globe !== "close"} />;
  if (shot.kind === "map") return <MapShot shot={shot} t={t} u={u} W={W} H={H} tall={tall} map={map} />;
  return <Screens shot={shot} t={t} u={u} W={W} H={H} tall={tall} />;
}

/** Big lines that slam in with a colour split, then sit (punching on the kick). */
function Title({
  lines,
  u,
  t,
  size: wanted,
  align,
  width,
  accentLast = true,
}: {
  lines: string[];
  u: number;
  t: number;
  size: number;
  align: "left" | "center";
  /** The space it has: the size shrinks so the longest line fits on one row. */
  width?: number;
  accentLast?: boolean;
}) {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const size = width ? Math.min(wanted, width / (longest * 0.46)) : wanted;
  return (
    <div style={{ textAlign: align }}>
      {lines.map((line, i) => {
        const at = i * 0.08;
        const k = clamp((u - at) / 0.16);
        const split = (1 - ease((u - at) / 0.22)) * 18 + kick(t) * 4;
        const scale = (1.35 - 0.35 * ease(k)) * (1 + kick(t) * 0.025);
        return (
          <p
            key={line}
            className="font-display font-extrabold uppercase leading-[0.86]"
            style={{
              fontSize: size,
              letterSpacing: "-0.01em",
              opacity: k > 0 ? 1 : 0,
              transform: `scale(${scale})`,
              transformOrigin: align === "left" ? "0% 50%" : "50% 50%",
              filter: `blur(${(1 - k) * 8}px)`,
              color: accentLast && i === lines.length - 1 && lines.length > 1 ? "#53d064" : "#f4fbf5",
              textShadow: `${split}px 0 rgba(255,40,80,0.75), ${-split}px 0 rgba(0,220,255,0.75), 0 0 40px rgba(83,208,100,0.35)`,
            }}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}

function Sub({ text, u, size }: { text: string; u: number; size: number }) {
  const k = ease((u - 0.25) / 0.3);
  return (
    <p className="font-sans font-semibold text-ink-100" style={{ fontSize: size, opacity: k, transform: `translateY(${(1 - k) * 16}px)` }}>
      {text}
    </p>
  );
}

function Words({ shot, u, t, W, H, tall, centered }: { shot: Shot; u: number; t: number; W: number; H: number; tall: boolean; centered: boolean }) {
  const lines = shot.title ?? [];
  const size = shot.kind === "word" ? (tall ? 210 : 260) : tall ? 150 : 170;
  if (!centered) {
    return (
      <div className="absolute" style={tall ? { left: 70, right: 70, top: 260 } : { left: 110, top: H * 0.36, width: W * 0.42 }}>
        <Title lines={lines} u={u} t={t} size={tall ? 132 : 150} align={tall ? "center" : "left"} width={tall ? W - 140 : W * 0.42} />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ padding: tall ? 60 : 120 }}>
      <Title lines={lines} u={u} t={t} size={size} align="center" width={W - (tall ? 120 : 240)} />
    </div>
  );
}

/** The site's GM mark. */
function Mark({ size }: { size: number }) {
  return (
    <span
      className="gm-cut inline-flex items-center justify-center bg-brand-400 font-stencil font-extrabold text-brand-950"
      style={{ width: size, height: size, fontSize: size * 0.48, ["--cut" as string]: `${size * 0.18}px` }}
    >
      GM
    </span>
  );
}

function Logo({ t, u, W, tall }: { t: number; u: number; W: number; tall: boolean }) {
  const k = ease(u / 0.2);
  const ring = clamp(u / 0.7);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: tall ? 40 : 30 }}>
      <div
        className="absolute rounded-full border-[6px] border-brand-300"
        style={{ width: 200 + ring * W * 0.9, height: 200 + ring * W * 0.9, opacity: (1 - ring) * 0.8 }}
      />
      <div className="flex items-center" style={{ gap: tall ? 28 : 36, transform: `scale(${2.2 - 1.2 * k})`, opacity: k > 0 ? 1 : 0, flexDirection: tall ? "column" : "row" }}>
        <Mark size={tall ? 210 : 190} />
        <span
          className="font-display font-extrabold uppercase"
          style={{
            fontSize: tall ? 190 : 230,
            lineHeight: 0.85,
            textShadow: `${(1 - k) * 24}px 0 rgba(255,40,80,0.8), ${-(1 - k) * 24}px 0 rgba(0,220,255,0.8), 0 0 60px rgba(83,208,100,0.45)`,
          }}
        >
          GAMEMASTER
        </span>
      </div>
      {u > 0.55 ? (
        <div style={{ marginTop: tall ? 30 : 10 }}>
          <Title lines={["MASTER YOUR GAME."]} u={u - 0.55} t={t} size={tall ? 92 : 96} align="center" accentLast={false} />
        </div>
      ) : null}
    </div>
  );
}

function EndCard({ t, u, H, tall }: { t: number; u: number; H: number; tall: boolean }) {
  const k = ease(u / 0.25);
  const pulse = 0.5 + 0.5 * Math.sin(u * 7);
  return (
    <div className="absolute inset-0 flex flex-col items-center" style={{ paddingTop: tall ? H * 0.2 : H * 0.17, gap: tall ? 46 : 34 }}>
      <div className="flex items-center" style={{ gap: 30, transform: `scale(${1.3 - 0.3 * k})`, opacity: k, flexDirection: tall ? "column" : "row" }}>
        <Mark size={tall ? 170 : 150} />
        <span className="font-display font-extrabold uppercase" style={{ fontSize: tall ? 150 : 180, lineHeight: 0.85, textShadow: "0 0 50px rgba(83,208,100,0.45)" }}>
          GAMEMASTER
        </span>
      </div>
      {u > 0.35 ? <Title lines={["MASTER YOUR GAME."]} u={u - 0.35} t={t} size={tall ? 96 : 92} align="center" accentLast={false} /> : null}
      {u > 0.8 ? (
        <div style={{ opacity: ease((u - 0.8) / 0.25), transform: `scale(${1 + kick(t) * 0.04})` }}>
          <span
            className="gm-cut inline-flex items-center bg-brand-400 font-display font-extrabold uppercase text-brand-950"
            style={{
              padding: tall ? "26px 56px" : "22px 52px",
              fontSize: tall ? 64 : 56,
              ["--cut" as string]: "18px",
              boxShadow: `0 0 ${40 + pulse * 50}px rgba(83,208,100,${0.35 + pulse * 0.35})`,
            }}
          >
            Add it to your Discord
          </span>
        </div>
      ) : null}
      {u > 1.2 ? (
        <p className="font-mono uppercase text-brand-300" style={{ fontSize: tall ? 26 : 26, letterSpacing: tall ? "0.08em" : "0.3em", opacity: ease((u - 1.2) / 0.3) }}>
          Free · No ads · Built for Hearts of Iron IV
        </p>
      ) : null}
    </div>
  );
}

/** Real screens of the site, one per beat, in a glowing frame; a slice glitch on every cut. */
function Screens({ shot, t, u, W, H, tall }: { shot: Shot; t: number; u: number; W: number; H: number; tall: boolean }) {
  const screens = shot.screens ?? [];
  const per = (shot.end - shot.start) / Math.max(1, screens.length);
  const index = Math.min(screens.length - 1, Math.floor(u / per));
  const sinceCut = u - index * per;
  const src = screens[index];
  const enter = ease(u / 0.22);
  const punch = 1 + kick(t) * 0.03 + (1 - ease(sinceCut / 0.12)) * 0.04;
  // The montage's word per screen, stacked (EVERY / PLAYER.) so it never runs into the screen.
  const words = shot.words ? shot.words[Math.min(shot.words.length - 1, index)].split(" ") : shot.title ?? [];
  const wordU = shot.words ? sinceCut : u;
  const glitch = sinceCut < 2 / FPS && u > 0.05;

  // Wide: the screen to the right, the words to the left. Tall: words on top, the screen
  // cropped to its interesting part in the middle, the line under it.
  const frameW = tall ? W * 1.35 : W * 0.6;
  const frameH = (frameW * 10) / 16;
  const box: CSSProperties = tall
    ? { left: -(frameW - W) * (shot.focus ?? 0.5), top: H * 0.3, width: frameW, height: frameH }
    : { left: W * 0.36, top: (H - frameH) / 2 + 30, width: frameW, height: frameH };
  const tilt = tall ? `perspective(2400px) rotateX(${4 - 4 * enter}deg)` : `perspective(2600px) rotateY(${-14 + 4 * enter}deg) rotateX(3deg)`;

  return (
    <>
      <div
        className="absolute overflow-hidden border border-brand-400/50 bg-black"
        style={{
          ...box,
          transform: `${tilt} scale(${(0.92 + 0.08 * enter) * punch})`,
          transformOrigin: tall ? "50% 50%" : "0% 50%",
          boxShadow: "0 0 80px rgba(83,208,100,0.28), 0 40px 120px rgba(0,0,0,0.8)",
          opacity: enter,
        }}
      >
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover object-top" style={{ transform: `scale(${1.02 + 0.05 * (u / (shot.end - shot.start))})` }} />
        {glitch
          ? [0, 1, 2].map((k) => {
              const y1 = rnd(Math.floor(t * FPS), k) * 80;
              return (
                <img
                  key={k}
                  src={src}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  style={{
                    clipPath: `inset(${y1}% 0 ${Math.max(0, 92 - y1 - 6)}% 0)`,
                    transform: `translateX(${(rnd(Math.floor(t * FPS), k + 9) - 0.5) * 120}px)`,
                    filter: k === 0 ? "hue-rotate(90deg) saturate(3)" : k === 1 ? "hue-rotate(-60deg) saturate(3)" : "none",
                  }}
                />
              );
            })
          : null}
        {shot.clock ? <Clock t={t} tall={tall} /> : null}
      </div>
      <div className="absolute" style={tall ? { left: 60, right: 60, top: H * 0.08 } : { left: 100, top: H * 0.24, width: W * 0.33 }}>
        <Title lines={words} u={wordU} t={t} size={tall ? 128 : 124} align={tall ? "center" : "left"} width={tall ? W - 120 : W * 0.31} />
      </div>
      {shot.sub ? (
        <div className="absolute" style={tall ? { left: 80, right: 80, top: H * 0.3 + frameH + 60, textAlign: "center" } : { left: 104, top: H * 0.24 + 270 + (words.length - 1) * 107, width: W * 0.3 }}>
          <Sub text={shot.sub} u={u} size={tall ? 46 : 34} />
        </div>
      ) : null}
      <div className="absolute flex items-center gap-3 opacity-80" style={tall ? { left: 60, bottom: 70 } : { left: 70, top: 56 }}>
        <Mark size={tall ? 64 : 52} />
        <span className="font-display font-extrabold uppercase" style={{ fontSize: tall ? 50 : 40 }}>
          GameMaster
        </span>
      </div>
    </>
  );
}

/** Time racing by over the attendance roster: the voice checks come on their own. */
function Clock({ t, tall }: { t: number; tall: boolean }) {
  const s = tall ? 1.6 : 1.3;
  return (
    <div
      className="absolute flex items-center gap-4 border border-brand-400/60 bg-black/90 px-5 py-3"
      style={{ right: tall ? "auto" : 30, left: tall ? "40%" : "auto", bottom: 30, transform: `scale(${s})`, transformOrigin: "100% 100%" }}
    >
      <svg viewBox="0 0 40 40" className="h-12 w-12 text-brand-300">
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="20" y1="20" x2="20" y2="12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${t * 60} 20 20)`} />
        <line x1="20" y1="20" x2="20" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" transform={`rotate(${t * 720} 20 20)`} />
      </svg>
      <span className="leading-tight">
        <b className="block text-lg">Automatic voice check</b>
        <span className="text-sm text-ink-400">every 20 minutes</span>
      </span>
    </div>
  );
}

// ---- The live map: nations claimed, faster and faster. ------------------------------------

interface MapData {
  width: number;
  height: number;
  nations: { tag: string; name: string; color: string; d: string }[];
  capitals: Record<string, [number, number]>;
}

const MAJORS = ["GER", "SOV", "ENG", "FRA", "ITA", "USA", "JAP", "CHI"];

function MapShot({ shot, t, u, W, H, tall, map }: { shot: Shot; t: number; u: number; W: number; H: number; tall: boolean; map: MapData | null }) {
  const order = useMemo(() => {
    if (!map) return [] as string[];
    const rest = map.nations.map((n) => n.tag).filter((tag) => !MAJORS.includes(tag));
    // A stable shuffle, majors first.
    rest.sort((a, b) => rnd(a.charCodeAt(0) * 31 + a.charCodeAt(1), 3) - rnd(b.charCodeAt(0) * 31 + b.charCodeAt(1), 3));
    return [...MAJORS, ...rest];
  }, [map]);
  if (!map) return null;
  const building = shot.start < 14.4;
  const p = clamp(u / (shot.end - shot.start));
  // Claimed so far: a few while building, then up to 64 through the drop.
  const claimed = building ? Math.floor(ease(p) ** 2 * 6) : 6 + Math.floor(ease(p * 1.15) * 58);
  const taken = new Set(order.slice(0, claimed));
  const pending = new Set(order.slice(claimed, claimed + (building ? 2 : 4)));
  // Camera: world view sliding into Europe while building, a punch on each kick in the drop.
  const zoom = building ? 1 + 1.6 * ease(p) ** 2 : 1.4 + kick(t) * 0.05;
  const cx = building ? 0.5 + (0.56 - 0.5) * ease(p) : 0.56;
  const cy = building ? 0.5 + (0.24 - 0.5) * ease(p) : 0.34;
  const mapW = tall ? H * 0.9 * (map.width / map.height) * 0.62 : W * 1.04;
  const mapH = (mapW * map.height) / map.width;
  const top = tall ? H * 0.22 : (H - mapH) / 2;
  const count = building ? null : Math.min(64, claimed);
  return (
    <>
      <div className="absolute overflow-hidden" style={{ left: tall ? 0 : -W * 0.02, top, width: tall ? W : W * 1.04, height: tall ? H * 0.5 : mapH }}>
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          width={mapW}
          height={mapH}
          className="absolute"
          style={{
            left: tall ? W / 2 - mapW * cx * zoom : W * 0.52 - mapW * cx * zoom,
            top: tall ? H * 0.25 - mapH * cy * zoom : mapH / 2 - mapH * cy * zoom,
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={map.width} height={map.height} fill="#0b1a1c" />
          {map.nations.map((nation) => {
            const isTaken = taken.has(nation.tag);
            const isPending = pending.has(nation.tag);
            return (
              <path
                key={nation.tag}
                d={nation.d}
                fill={isTaken ? nation.color : "#16241c"}
                fillOpacity={isTaken ? 0.9 : 1}
                stroke={isPending ? "#ffd84a" : isTaken ? "#c8f7cf" : "#2f6b3c"}
                strokeWidth={isPending ? 1.6 / zoom : 0.6 / zoom}
                strokeDasharray={isPending ? `${4 / zoom} ${3 / zoom}` : undefined}
                strokeDashoffset={isPending ? -t * 30 : undefined}
                filter={isTaken || isPending ? "url(#glow)" : undefined}
              />
            );
          })}
        </svg>
      </div>
      <div className="absolute" style={tall ? { left: 60, right: 60, top: H * 0.07 } : { left: 100, top: H * 0.08, width: W * 0.6 }}>
        <Title lines={shot.title ?? []} u={u} t={t} size={tall ? 128 : 132} align={tall ? "center" : "left"} width={tall ? W - 120 : W * 0.6} />
      </div>
      {count !== null ? (
        <div className="absolute font-mono" style={tall ? { left: 0, right: 0, top: H * 0.86, textAlign: "center" } : { right: 90, bottom: 80 }}>
          <span className="font-display font-extrabold text-brand-300" style={{ fontSize: tall ? 140 : 120 }}>
            {count}
          </span>
          <span className="text-ink-300" style={{ fontSize: tall ? 44 : 38 }}>
            {" "}
            / 64 taken
          </span>
        </div>
      ) : null}
      {shot.sub ? (
        <div className="absolute" style={tall ? { left: 80, right: 80, top: H * 0.76, textAlign: "center" } : { left: 104, top: H * 0.08 + 260, width: W * 0.4 }}>
          <Sub text={shot.sub} u={u} size={tall ? 44 : 34} />
        </div>
      ) : null}
    </>
  );
}

