"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeData, GlobeEvent, GlobeLayout, Intensity, Quality, WarGlobe as Engine } from "./globeEngine";

/**
 * The war globe for the front page. three.js and the map data load only
 * here, after the page is up; until then (and where WebGL is missing) the
 * space shows a quiet green glow.
 */

export type GlobeMap = "vanilla" | "modern";

export interface GlobeStats {
  fps: number;
  strikes: number;
  quality: Quality;
}

/** High (glow, sharp) only on a desktop that looks able for it; it steps down by itself if it runs slow. */
function guessQuality(): Quality {
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const lowMemory = device.deviceMemory !== undefined && device.deviceMemory < 4;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  const small = window.innerWidth < 768;
  return touch || lowMemory || fewCores || small || device.connection?.saveData ? "low" : "high";
}

/** Run once the page has painted and the browser has a moment, so the globe never holds up the first screen. */
function whenIdle(run: () => void): () => void {
  const idle = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (idle.requestIdleCallback) {
    const id = idle.requestIdleCallback(run, { timeout: 1500 });
    return () => idle.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 300);
  return () => window.clearTimeout(id);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function WarGlobe({
  map = "vanilla",
  intensity = "dramatic",
  quality,
  motion,
  layout,
  onStats,
  onEvent,
  className = "relative",
}: {
  map?: GlobeMap;
  intensity?: Intensity;
  /** Left out: picked from the device (and stepped down if it runs slow). */
  quality?: Quality;
  /** Left out: follows the viewer's reduced-motion setting. */
  motion?: boolean;
  /** Where the globe sits for a box of this size (default: whole globe, centred). Read once. */
  layout?: (width: number, height: number) => GlobeLayout;
  onStats?: (stats: GlobeStats) => void;
  /** Every launch, hit and interception (by nation tag). */
  onEvent?: (event: GlobeEvent) => void;
  /** Size and position (it fills this box); "relative" by default. */
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const statsRef = useRef(onStats);
  const eventRef = useRef(onEvent);
  useEffect(() => {
    statsRef.current = onStats;
    eventRef.current = onEvent;
  });
  const initial = useRef({ intensity, quality, motion, layout });

  // Start the engine once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let cleanup = () => {};
    const cancelIdle = whenIdle(() =>
    import("./globeEngine")
      .then(({ WarGlobe }) => {
        if (cancelled) return;
        const start = initial.current;
        let engine: Engine;
        try {
          engine = new WarGlobe(canvas, {
            intensity: start.intensity,
            quality: start.quality ?? guessQuality(),
            motion: start.motion ?? !prefersReducedMotion(),
            layout: start.layout,
            onStats: (stats) => statsRef.current?.(stats),
            onEvent: (event) => eventRef.current?.(event),
            onReady: () => {
              if (!cancelled) setState("ready");
            },
            onGiveUp: () => {
              if (!cancelled) setState("failed");
            },
          });
        } catch {
          setState("failed"); // no WebGL
          return;
        }
        engineRef.current = engine;
        if (process.env.NODE_ENV === "development") (window as unknown as { __gmGlobe?: Engine }).__gmGlobe = engine;
        const box = canvas.getBoundingClientRect();
        engine.resize(box.width, box.height);

        const resize = new ResizeObserver(([entry]) => {
          engine.resize(entry.contentRect.width, entry.contentRect.height);
        });
        resize.observe(canvas);
        // Only animate while it's on screen and the tab is open.
        let onScreen = true;
        const sync = () => {
          if (onScreen && document.visibilityState === "visible") engine.start();
          else engine.stop();
        };
        const seen = new IntersectionObserver(([entry]) => {
          onScreen = entry.isIntersecting;
          sync();
        });
        seen.observe(canvas);
        document.addEventListener("visibilitychange", sync);
        // A phone short of graphics memory can take WebGL away: show the quiet
        // glow instead of a dead canvas.
        const lost = (event: Event) => {
          event.preventDefault();
          engine.stop();
          setState("failed");
        };
        canvas.addEventListener("webglcontextlost", lost);
        sync();
        cleanup = () => {
          resize.disconnect();
          seen.disconnect();
          document.removeEventListener("visibilitychange", sync);
          canvas.removeEventListener("webglcontextlost", lost);
          engine.dispose();
          engineRef.current = null;
        };
      })
      .catch(() => setState("failed")),
    );
    return () => {
      cancelled = true;
      cancelIdle();
      cleanup();
    };
  }, []);

  // The map (loaded again when it changes).
  useEffect(() => {
    let cancelled = false;
    fetch(`/landing/globe-${map}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<GlobeData>;
      })
      .then((data) => {
        const wait = () => {
          if (cancelled) return;
          const engine = engineRef.current;
          if (!engine) {
            window.setTimeout(wait, 50);
            return;
          }
          // Ready (onReady) once its shaders are built.
          engine.setData(data).catch(() => {
            if (!cancelled) setState("failed");
          });
        };
        wait();
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [map]);

  useEffect(() => {
    engineRef.current?.setOptions({ intensity });
  }, [intensity]);
  useEffect(() => {
    if (quality) engineRef.current?.setOptions({ quality });
  }, [quality]);
  useEffect(() => {
    if (motion !== undefined) engineRef.current?.setOptions({ motion });
  }, [motion]);

  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${state === "ready" ? "opacity-0" : "opacity-100"}`}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--color-brand-700) 45%, transparent) 0%, transparent 38%)",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-label="A spinning globe of the Hearts of Iron IV world, with missiles and explosions"
        role="img"
        className={`block h-full w-full touch-pan-y transition-opacity duration-1000 ${state === "ready" ? "opacity-100" : "opacity-0"} ${state === "failed" ? "hidden" : ""}`}
      />
    </div>
  );
}
