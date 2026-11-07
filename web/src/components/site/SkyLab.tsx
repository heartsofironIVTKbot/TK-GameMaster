"use client";

import { CalendarDays, ChevronDown, Database, Settings2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sky, SKY_DEFAULTS, type SkyOptions } from "./skyEngine";

/**
 * /lab/background (dev only): the night sky behind a stand-in page, with a
 * switch for every layer, sliders, and presets to compare.
 */

const LAYERS: { key: keyof SkyOptions; label: string; note: string }[] = [
  { key: "stars", label: "Stars", note: "A still field, some twinkling" },
  { key: "haze", label: "Green haze", note: "Faint nebula in two corners" },
  { key: "drift", label: "Drift + parallax", note: "Creeps sideways; scroll moves near stars more" },
  { key: "shooting", label: "Shooting stars", note: "A streak every so often" },
  { key: "satellites", label: "Satellites", note: "A tiny dot crossing slowly" },
  { key: "grid", label: "Faint grid", note: "Latitude / longitude lines, fading out" },
  { key: "aurora", label: "Aurora", note: "Soft green band at the top" },
];

const OFF = { stars: false, haze: false, drift: false, shooting: false, satellites: false, grid: false, aurora: false };

const PRESETS: { label: string; options: Partial<SkyOptions> }[] = [
  { label: "Black (today)", options: { ...OFF } },
  { label: "Stars only", options: { ...OFF, stars: true } },
  { label: "My pick", options: { ...OFF, stars: true, haze: true, shooting: true } },
  { label: "Front page", options: { ...OFF, stars: true, haze: true, shooting: true, drift: true, satellites: true } },
  { label: "War room", options: { ...OFF, stars: true, haze: true, grid: true, satellites: true } },
  { label: "Everything", options: { ...OFF, stars: true, haze: true, shooting: true, drift: true, satellites: true, grid: true, aurora: true } },
];

export default function SkyLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sky = useRef<Sky | null>(null);
  const [options, setOptions] = useState<SkyOptions>({ ...SKY_DEFAULTS, ...PRESETS[2].options });
  const [page, setPage] = useState(true);
  const [panel, setPanel] = useState(true);

  useEffect(() => {
    const element = canvas.current!;
    const engine = new Sky(element, options);
    sky.current = engine;
    const fit = () => engine.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    engine.start();
    return () => {
      window.removeEventListener("resize", fit);
      engine.destroy();
    };
    // The engine is made once; option changes go through setOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sky.current?.setOptions(options);
  }, [options]);

  const set = (change: Partial<SkyOptions>) => setOptions((current) => ({ ...current, ...change }));

  return (
    <div className="relative min-h-screen w-full text-ink-100">
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />

      {page ? <StandInPage /> : <div className="h-[200vh]" />}

      {/* The switches. */}
      <aside className="fixed right-4 top-4 z-50 w-[300px] max-w-[calc(100vw-32px)]">
        <div className="gm-plate p-0">
          <button type="button" onClick={() => setPanel(!panel)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            <Sparkles aria-hidden className="h-4 w-4 text-brand-400" />
            <b className="gm-title flex-1 text-lg">Background lab</b>
            <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${panel ? "rotate-180" : ""}`} />
          </button>
          {panel ? (
            <div className="space-y-4 border-t border-ink-800 px-4 pb-4 pt-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Presets</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => set(preset.options)}
                      className="gm-btn gm-btn-secondary px-2.5 py-1 text-xs"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Layers</p>
                <ul className="mt-1.5 space-y-1">
                  {LAYERS.map((layer) => (
                    <li key={layer.key}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded px-1 py-1 hover:bg-ink-800/60">
                        <input
                          type="checkbox"
                          checked={Boolean(options[layer.key])}
                          onChange={(event) => set({ [layer.key]: event.target.checked })}
                          className="mt-0.5 h-4 w-4 accent-[var(--color-brand-400)]"
                        />
                        <span className="leading-tight">
                          <b className="block text-sm font-semibold">{layer.label}</b>
                          <span className="text-xs text-ink-400">{layer.note}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <Slider label="Star density" value={options.density} min={0.3} max={2} step={0.1} onChange={(density) => set({ density })} />
              <Slider label="Brightness" value={options.brightness} min={0.3} max={1.5} step={0.05} onChange={(brightness) => set({ brightness })} />
              <Slider
                label="Shooting star every"
                value={options.shootingEvery}
                min={5}
                max={90}
                step={5}
                unit="s"
                onChange={(shootingEvery) => set({ shootingEvery })}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="gm-btn gm-btn-secondary px-3 py-1.5 text-xs" onClick={() => sky.current?.shootNow()}>
                  Shoot one now
                </button>
                <button type="button" className="gm-btn gm-btn-secondary px-3 py-1.5 text-xs" onClick={() => setPage(!page)}>
                  {page ? "Hide the page" : "Show the page"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">
        {label}
        <span className="font-mono normal-case tracking-normal text-ink-300">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-[var(--color-brand-400)]"
      />
    </label>
  );
}

/** A page shaped like the real ones: a header, then solid plates with gaps the sky shows through. */
function StandInPage() {
  return (
    <div className="relative">
      <header className="flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-950/80 px-6 backdrop-blur-[2px]">
        <span className="gm-cut flex h-8 w-8 items-center justify-center bg-brand-400 font-stencil text-sm font-extrabold text-brand-950 [--cut:6px]">GM</span>
        <CalendarDays aria-hidden className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
        <b className="gm-title text-2xl">Calendar</b>
      </header>
      <main className="mx-auto grid max-w-[1200px] gap-5 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="gm-plate min-h-[520px] p-5">
          <p className="gm-title text-xl">November 2026</p>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="h-16 rounded-sm border border-ink-800 bg-ink-950/60 p-1.5 text-[11px] text-ink-500">
                {((i + 26) % 31) + 1}
                {i % 6 === 2 ? <span className="mt-1 block h-4 rounded-sm bg-yellow-400/20" /> : null}
                {i % 9 === 4 ? <span className="mt-1 block h-4 rounded-sm bg-brand-400/25" /> : null}
              </div>
            ))}
          </div>
        </section>
        <div className="space-y-5">
          <section className="gm-plate p-5">
            <p className="flex items-center gap-2 font-semibold">
              <Database aria-hidden className="h-4 w-4 text-brand-400" /> Upcoming games
            </p>
            {["Roleplay · Sat 20:00", "Vanilla · Sun 18:00", "Kaiserreich · Tue 20:00"].map((row) => (
              <p key={row} className="mt-3 rounded-sm border border-ink-800 px-3 py-2 text-sm text-ink-300">
                {row}
              </p>
            ))}
          </section>
          <section className="gm-plate p-5">
            <p className="flex items-center gap-2 font-semibold">
              <Settings2 aria-hidden className="h-4 w-4 text-brand-400" /> Host tools
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              Scroll this page to see how the sky behaves under content (with Drift on, near stars move more than far ones).
            </p>
          </section>
        </div>
        <section className="gm-plate min-h-[600px] p-5 lg:col-span-2">
          <p className="gm-title text-xl">More of the page</p>
          <p className="mt-2 text-sm text-ink-400">Plates stay solid; the sky only shows in the margins and gaps.</p>
        </section>
      </main>
    </div>
  );
}
