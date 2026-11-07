"use client";

import type { ReactNode } from "react";
import type { GlobeEvent, GlobeLayout } from "./globeEngine";
import WarGlobe from "./WarGlobe";

/**
 * The front page's first screen: the war globe filling it, the words on top.
 * Wide screens: words on the left, globe on the right. Phones and tablets:
 * words at the top, then a strip (RISE of the width) where the top of a big
 * globe rises like a horizon, so it never runs under the words.
 */

const RISE = 0.75;

function heroLayout(width: number, height: number): GlobeLayout {
  if (width >= 1024) {
    // Bigger on wide screens, but never so wide it runs under the words.
    const radius = Math.min(0.47, (width * 0.3) / height);
    return { x: 0.21, y: 0.03, radius };
  }
  // Radius 0.9 of the width; the globe's top sits at the top of the strip.
  const radius = (0.9 * width) / height;
  return { x: 0, y: 0.5 + ((0.9 - RISE) * width) / height, radius };
}

export default function LandingHero({ children, onEvent }: { children: ReactNode; onEvent?: (event: GlobeEvent) => void }) {
  return (
    <section aria-labelledby="landing-title" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      {/* Always moving, even with "reduce motion" on (Niko's call, 2026-11-06). */}
      <WarGlobe className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_calc(100%-180px),transparent)]" map="vanilla" intensity="dramatic" quality="high" motion layout={heroLayout} onEvent={onEvent} />
      {/* Shade under the words, and a fade into the page below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black_calc(100%-180px),transparent)] bg-[linear-gradient(180deg,rgb(0_0_0/0.92)_0%,rgb(0_0_0/0.7)_38%,transparent_62%)] lg:bg-[linear-gradient(90deg,rgb(0_0_0/0.9)_0%,rgb(0_0_0/0.65)_34%,transparent_58%)]"
      />
      {/* The words let drags through to the globe, except on their links. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        {children}
        <div aria-hidden className="shrink-0 lg:hidden" style={{ height: `${RISE * 100}vw` }} />
      </div>
    </section>
  );
}
