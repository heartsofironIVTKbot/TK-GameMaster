"use client";

import { Gamepad2, type LucideIcon } from "lucide-react";
import { formatInZone } from "@/lib/timeEngine";

export interface TimelineMarker {
  key: string;
  unixSec: number;
  icon: LucideIcon;
  label: string;
  color: string;
}

/**
 * "Now → game start" track showing when each automated step fires
 * (announcement, unlocks, nation-lock releases). `compact` is the one-line
 * strip above the setup panel's footer; the full one lists every step.
 */
export default function Timeline({
  nowSec,
  gameSec,
  markers,
  timeZone,
  compact = false,
}: {
  nowSec: number;
  gameSec: number;
  markers: TimelineMarker[];
  timeZone: string;
  compact?: boolean;
}) {
  const span = Math.max(1, gameSec - nowSec);
  const position = (unixSec: number) => Math.min(100, Math.max(0, ((unixSec - nowSec) / span) * 100));
  const sorted = [...markers].sort((a, b) => a.unixSec - b.unixSec);
  const short = (unixSec: number) =>
    new Intl.DateTimeFormat(undefined, { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(
      unixSec * 1000,
    );

  const track = (
    <div className="relative mx-2 h-4">
      <div className="absolute inset-x-0 top-[7px] h-0.5 bg-ink-700" />
      {sorted.map((marker) => (
        <span
          key={marker.key}
          title={`${marker.label}: ${formatInZone(marker.unixSec * 1000, timeZone)}`}
          className="gm-cut absolute top-0.5 h-3 w-3 -translate-x-1/2 [--cut:3px]"
          style={{ left: `${position(marker.unixSec)}%`, background: marker.color }}
        />
      ))}
      <span
        title={`Game starts: ${formatInZone(gameSec * 1000, timeZone)}`}
        className="gm-cut absolute right-0 top-0 h-4 w-4 translate-x-1/2 bg-brand-400 [--cut:4px]"
      />
    </div>
  );

  if (compact) {
    const first = sorted[0];
    return (
      <div className="gm-cut bg-ink-900 px-3 py-2 [--cut:9px]">
        <div className="mb-1 flex justify-between gap-3 text-[11.5px] text-ink-400">
          <span className="truncate">
            {first ? (
              <>
                {first.label} <b className="font-semibold text-ink-100">{first.unixSec <= nowSec ? "right away" : short(first.unixSec)}</b>
                {sorted.length > 1 && <span className="text-ink-500">, +{sorted.length - 1} more</span>}
              </>
            ) : (
              "Now"
            )}
          </span>
          <span className="shrink-0">
            Starts <b className="font-semibold text-ink-100">{short(gameSec)}</b>
          </span>
        </div>
        {track}
      </div>
    );
  }

  return (
    <div className="gm-cut bg-ink-900 p-3.5 [--cut:10px]">
      <div className="mb-2 flex items-center justify-between text-xs text-ink-500">
        <span>Now</span>
        <span>Game start</span>
      </div>
      {track}
      <ul className="mt-3 space-y-1.5">
        {sorted.map((marker) => {
          const Icon = marker.icon;
          return (
            <li key={marker.key} className="flex items-center gap-2 text-xs">
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: marker.color }} strokeWidth={1.75} />
              <span className="font-semibold text-ink-200">{marker.label}</span>
              <span className="ml-auto tabular-nums text-ink-400">
                {formatInZone(marker.unixSec * 1000, timeZone)}
                {marker.unixSec <= nowSec && <span className="ml-1 text-brand-300">(right away)</span>}
              </span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 text-xs">
          <Gamepad2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-400" strokeWidth={1.75} />
          <span className="font-semibold text-ink-100">Game starts</span>
          <span className="ml-auto tabular-nums text-ink-300">{formatInZone(gameSec * 1000, timeZone)}</span>
        </li>
      </ul>
    </div>
  );
}
