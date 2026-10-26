"use client";

import { formatInZone } from "@/lib/timeEngine";

export interface TimelineMarker {
  key: string;
  unixSec: number;
  icon: string;
  label: string;
  color: string;
}

/**
 * Horizontal "now → game start" track showing when each automated step
 * fires (announcement, unlocks, nation-lock releases).
 */
export default function Timeline({
  nowSec,
  gameSec,
  markers,
  timeZone,
}: {
  nowSec: number;
  gameSec: number;
  markers: TimelineMarker[];
  timeZone: string;
}) {
  const span = Math.max(1, gameSec - nowSec);
  const position = (unixSec: number) =>
    Math.min(100, Math.max(0, ((unixSec - nowSec) / span) * 100));
  const sorted = [...markers].sort((a, b) => a.unixSec - b.unixSec);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        <span>Now</span>
        <span>Game start</span>
      </div>
      <div className="relative mx-2 h-2 rounded-full bg-slate-800">
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-slate-700 via-amber-500/60 to-amber-400" />
        {sorted.map((marker) => (
          <span
            key={marker.key}
            title={`${marker.label} · ${formatInZone(marker.unixSec * 1000, timeZone)}`}
            className="absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-950 text-[11px] shadow-lg"
            style={{ left: `${position(marker.unixSec)}%`, background: marker.color }}
          >
            {marker.icon}
          </span>
        ))}
        <span
          className="absolute right-0 top-1/2 flex h-7 w-7 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-950 bg-amber-400 text-xs shadow-lg shadow-amber-500/40"
          title={`Game · ${formatInZone(gameSec * 1000, timeZone)}`}
        >
          🎮
        </span>
      </div>
      <ul className="mt-5 space-y-1.5">
        {sorted.map((marker) => (
          <li key={marker.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: marker.color }} />
            <span className="font-semibold text-slate-200">{marker.label}</span>
            <span className="ml-auto tabular-nums text-slate-400">
              {formatInZone(marker.unixSec * 1000, timeZone)}
              {marker.unixSec <= nowSec && <span className="ml-1 text-amber-300">(right away)</span>}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
          <span className="font-bold text-amber-200">Game starts</span>
          <span className="ml-auto tabular-nums text-amber-200/80">
            {formatInZone(gameSec * 1000, timeZone)}
          </span>
        </li>
      </ul>
    </div>
  );
}
