"use client";

import { Play } from "lucide-react";
import { Glitch, Scramble } from "./fx";

/**
 * The trailer, right under the hero. Until the video exists the screen says
 * it's on its way; drop the file in public/landing/ and set TRAILER.
 */
const TRAILER: { src: string; poster?: string } | null = null;

export default function SceneTrailer({ number }: { number: number }) {
  return (
    <section aria-labelledby="scene-trailer-title" className="mx-auto max-w-[1240px] px-4 py-20 sm:px-8 sm:py-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fx-kicker">{`${String(number).padStart(2, "0")} // Trailer`}</p>
          <Glitch as="h2" className="gm-title mt-3 text-[40px] sm:text-[60px]">
            <span id="scene-trailer-title">See it run.</span>
          </Glitch>
        </div>
        <p className="max-w-md text-base leading-relaxed text-ink-400">
          From the calendar to the final roll call: one game, start to finish, in GameMaster.
        </p>
      </div>

      <div className="fx-hud relative mt-8 aspect-video w-full">
        {TRAILER ? (
          <video
            src={TRAILER.src}
            poster={TRAILER.poster}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full bg-black object-cover"
          />
        ) : (
          <div className="fx-crt flex h-full w-full flex-col items-center justify-center gap-5 !rounded-none">
            <span className="gm-cut relative z-[3] flex h-20 w-20 items-center justify-center bg-brand-400/10 text-brand-300 ring-1 ring-brand-400/40 [--cut:14px] sm:h-24 sm:w-24">
              <Play aria-hidden className="h-9 w-9 translate-x-0.5" fill="currentColor" strokeWidth={1.5} />
            </span>
            <p className="relative z-[3] text-center font-mono text-sm uppercase tracking-[0.3em] sm:text-base">
              <Scramble text="Trailer incoming" start duration={1200} />
            </p>
            <p className="relative z-[3] text-xs text-brand-300/70">Coming soon</p>
            {/* A player's bar, waiting. */}
            <div className="absolute inset-x-6 bottom-5 z-[3] flex items-center gap-3 font-mono text-[11px] text-brand-300/60 sm:inset-x-10 sm:bottom-7">
              <span>00:00</span>
              <span className="h-1 flex-1 bg-brand-400/15" />
              <span>--:--</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
