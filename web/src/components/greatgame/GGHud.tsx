"use client";

import { useState } from "react";

/**
 * A side readout in the top bar's notch: a sci-fi frame with glowing corner
 * brackets and a scan line, a small label, a big value that glitches and
 * rolls up when it changes, and a row of cells under it (lit in each team's
 * colour once it has acted; the cell of whoever is on the clock pulses).
 */

export interface HudCell {
  color: string;
  on: boolean;
  now?: boolean;
}

export default function GGHud({
  label,
  value,
  cells,
  tone,
  side,
  title,
}: {
  label: string;
  value: string;
  cells: HudCell[];
  tone: "cyan" | "pink";
  side: "left" | "right";
  title?: string;
}) {
  // Remember the value from the last render, so a change can roll the old one out.
  const [shown, setShown] = useState({ value, prev: null as string | null, n: 0 });
  if (shown.value !== value) setShown({ value, prev: shown.value, n: shown.n + 1 });
  const word = !/\d/.test(value);
  return (
    <div className={`gg-hud is-${tone} is-${side}`} title={title} role="status" aria-label={`${label}: ${value}`}>
      <svg className="gg-hud-frame" viewBox="0 0 104 62" preserveAspectRatio="none" aria-hidden>
        <path className="gg-hud-glass" d="M8 1 H96 L103 8 V54 L96 61 H8 L1 54 V8 Z" />
        <path d="M1 14 V8 L8 1 H24 M80 1 H96 L103 8 V14 M103 48 V54 L96 61 H80 M24 61 H8 L1 54 V48" />
      </svg>
      <div className="gg-hud-scan" aria-hidden />
      <div className="gg-hud-label" aria-hidden>
        <span>{label}</span>
        <i>●</i>
      </div>
      <div key={shown.n} className={`gg-hud-val ${word ? "is-word" : ""} ${word && value.length > 6 ? "is-long" : ""} ${shown.n ? "is-glitch" : ""}`} aria-hidden>
        {shown.prev !== null && shown.n > 0 ? (
          <>
            <span className="is-old">{shown.prev}</span>
            <span className="is-new">{shown.value}</span>
          </>
        ) : (
          <span>{shown.value}</span>
        )}
      </div>
      <div className="gg-hud-cells" style={{ gridTemplateColumns: `repeat(${Math.max(1, cells.length)}, 1fr)` }} aria-hidden>
        {cells.map((cell, index) => (
          <b
            key={index}
            className={`${cell.on || cell.now ? "is-on" : ""} ${cell.now ? "is-now" : ""}`}
            style={cell.on || cell.now ? { background: cell.color, color: cell.color } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
