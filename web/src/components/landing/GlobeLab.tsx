"use client";

import { useState } from "react";
import type { Intensity, Quality } from "./globeEngine";
import WarGlobe, { type GlobeMap, type GlobeStats } from "./WarGlobe";

/** /lab/globe: the war globe full screen, with switches to compare looks. */

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`gm-btn px-2.5 py-1 text-xs ${option.value === value ? "gm-btn-primary" : "gm-btn-secondary"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GlobeLab() {
  const [map, setMap] = useState<GlobeMap>("vanilla");
  const [intensity, setIntensity] = useState<Intensity>("dramatic");
  const [quality, setQuality] = useState<Quality>("high");
  const [motion, setMotion] = useState<"on" | "off">("on");
  const [stats, setStats] = useState<GlobeStats | null>(null);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink-950">
      <WarGlobe
        className="absolute inset-0"
        map={map}
        intensity={intensity}
        quality={quality}
        motion={motion === "on"}
        onStats={(next) => {
          setStats(next);
          if (next.quality !== quality) setQuality(next.quality);
        }}
      />
      <div className="gm-plate absolute left-3 top-3 w-[min(320px,calc(100vw-24px))] space-y-3 p-4 text-ink-300">
        <div className="flex items-baseline justify-between">
          <h1 className="gm-title text-lg text-white">Globe lab</h1>
          <span className="font-mono text-xs tabular-nums text-ink-400">
            {stats ? `${stats.fps} fps · ${stats.strikes} in the air` : "loading…"}
          </span>
        </div>
        <Choice
          label="Map"
          value={map}
          onChange={setMap}
          options={[
            { value: "vanilla", label: "Vanilla HOI4" },
            { value: "modern", label: "Modern Day" },
          ]}
        />
        <Choice
          label="How much war"
          value={intensity}
          onChange={setIntensity}
          options={[
            { value: "calm", label: "Calm" },
            { value: "dramatic", label: "Dramatic" },
            { value: "war", label: "Total war" },
          ]}
        />
        <Choice
          label="Quality"
          value={quality}
          onChange={setQuality}
          options={[
            { value: "high", label: "High (glow)" },
            { value: "low", label: "Low (phones)" },
          ]}
        />
        <Choice
          label="Motion"
          value={motion}
          onChange={setMotion}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Reduced" },
          ]}
        />
        <p className="text-[11px] leading-relaxed text-ink-500">Drag the globe to turn it. High quality steps down by itself after 3 slow seconds.</p>
      </div>
    </main>
  );
}
