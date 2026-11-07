"use client";

import { Play, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Glitch, useInView } from "./fx";

/**
 * The trailer, right under the hero (made in /lab/trailer, rendered by
 * scripts/trailer/render.mjs, music: "Master Your Game", Niko's Suno track).
 * It plays muted on a loop while it's on screen, like a feed; "Play with
 * sound" starts it over from the top with the music and the player's controls.
 */
const TRAILER = {
  src: "/landing/trailer/gamemaster-trailer-wide.mp4",
  /** 720p for phones and small windows: a third of the size. */
  small: "/landing/trailer/gamemaster-trailer-wide-720.mp4",
  poster: "/landing/trailer/gamemaster-trailer-wide.jpg",
};

/** The viewer asked their browser to save data: no muted preview, just the poster. */
function savingData(): boolean {
  return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

export default function SceneTrailer({ number }: { number: number }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const onScreen = useInView(box, { once: false, threshold: 0.4, margin: "0px" });
  const [sound, setSound] = useState(false);

  // Muted preview while it's on screen; with sound it's the viewer's to control.
  useEffect(() => {
    const element = video.current;
    if (!element || sound) return;
    if (onScreen && !savingData()) void element.play().catch(() => {});
    else element.pause();
  }, [onScreen, sound]);

  const withSound = () => {
    const element = video.current;
    if (!element) return;
    element.currentTime = 0;
    element.muted = false;
    element.loop = false;
    setSound(true);
    void element.play().catch(() => {});
  };

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
          From the calendar to the final roll call: one game, start to finish, in GameMaster. Thirty seconds, sound on.
        </p>
      </div>

      <div ref={box} className="fx-hud relative mt-8 aspect-video w-full bg-black">
        <video
          ref={video}
          poster={TRAILER.poster}
          muted={!sound}
          loop={!sound}
          controls={sound}
          playsInline
          // Nothing downloads until it's on screen (or played).
          preload="none"
          aria-label="The GameMaster trailer"
          className="h-full w-full object-cover"
        >
          <source src={TRAILER.small} media="(max-width: 900px)" type="video/mp4" />
          <source src={TRAILER.src} type="video/mp4" />
        </video>
        {sound ? null : (
          <button
            type="button"
            onClick={withSound}
            className="group absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent pb-8 sm:items-center sm:pb-0"
            aria-label="Play the trailer with sound"
          >
            <span className="gm-cut flex items-center gap-3 bg-brand-400 px-6 py-3.5 font-display text-xl font-extrabold uppercase text-brand-950 shadow-[0_0_50px_rgba(83,208,100,0.45)] transition-transform [--cut:12px] group-hover:scale-105 sm:text-2xl">
              <Play aria-hidden className="h-5 w-5" fill="currentColor" strokeWidth={1.5} />
              Play with sound
              <Volume2 aria-hidden className="h-5 w-5" strokeWidth={2} />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
