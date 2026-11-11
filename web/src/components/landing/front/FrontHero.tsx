"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ServerCog } from "lucide-react";
import AuthNotice from "../AuthNotice";
import type { GlobeEvent } from "../globeEngine";
import LandingHero from "../LandingHero";
import LandingTop from "../LandingTop";
import { inviteUrl } from "@/lib/serverSettingsTypes";
import { Glitch, Scramble } from "./fx";

/**
 * The first screen: the war globe, the headline decoding in, and (wide
 * screens) a live feed of what the globe is doing, like an intercepted wire.
 */

// Niko's pick (2026-11-06); the logo above finishes the pun.
const HEADLINE = ["Master", "your game."];

interface FeedLine {
  id: number;
  time: string;
  event: GlobeEvent;
}

export default function FrontHero() {
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const nextId = useRef(0);
  const onEvent = useCallback((event: GlobeEvent) => {
    const time = new Date().toISOString().slice(11, 19);
    nextId.current += 1;
    const id = nextId.current;
    setFeed((current) => [{ id, time, event }, ...current].slice(0, 7));
  }, []);

  return (
    <LandingHero onEvent={onEvent}>
      <LandingTop />
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 pb-10 pt-6 sm:px-8 lg:justify-center lg:pb-24 lg:pt-0">
        <div className="max-w-[680px]">
          <p className="fx-kicker">
            <Scramble text="// Hearts of Iron IV multiplayer · run on Discord" start duration={800} />
          </p>
          {/* The headline glitches in 0s and 1s only, never tears (Niko, 2026-11-06). */}
          <Glitch as="h1" tearing={false} className="gm-title mt-4 text-[60px] sm:text-[96px] lg:text-[118px]">
            <span id="landing-title" className="sr-only">
              {HEADLINE.join(" ")}
            </span>
            {HEADLINE.map((line, index) => (
              <Scramble key={line} text={line} start tearing={false} delay={250 + index * 220} duration={900} className="block whitespace-nowrap" />
            ))}
          </Glitch>
          <p className="mt-6 max-w-[480px] text-base leading-relaxed text-ink-300 sm:text-lg">
            GameMaster runs your community&apos;s games on Discord: the calendar, nation reservations on a live map, attendance,
            player records and an archive of every game played.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={inviteUrl()} className="gm-btn gm-btn-primary h-12 justify-center px-7 text-[15px] [--cut:10px]">
              Add to Discord
            </a>
            {/* Your Discord servers with GameMaster: set it up, change its settings (logs in first when needed). */}
            <Link href="/servers" className="gm-btn gm-btn-secondary h-12 justify-center bg-black/40 px-7 text-[15px] [--cut:10px]">
              <ServerCog aria-hidden strokeWidth={1.75} />
              Your servers
            </Link>
          </div>
          <p className="mt-4 text-xs text-ink-500">No Administrator permission needed. Set up in a few minutes.</p>
          <AuthNotice />
        </div>
      </div>

      {/* The intercepted wire (wide screens); it comes in with the first strike, so it never shows empty where the globe can't run. */}
      <div aria-hidden className={`fx-hud absolute bottom-10 right-8 hidden w-[300px] border border-ink-800/80 bg-black/55 p-3 font-mono text-[11px] backdrop-blur-[2px] transition-opacity duration-700 lg:block ${feed.length ? "opacity-100" : "opacity-0"}`}>
        <p className="flex items-center justify-between text-ink-500">
          <span>SIGNAL · INTERCEPTED</span>
          <span className="flex items-center gap-1.5 text-rose-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            LIVE
          </span>
        </p>
        <ul className="mt-2 h-[126px] space-y-1 overflow-hidden">
          {feed.map((line) => (
            <li key={line.id} className="fx-feed-line flex gap-2 whitespace-nowrap">
              <span className="text-ink-600">{line.time}</span>
              {line.event.kind === "launch" && (
                <>
                  <span className="w-[68px] text-brand-300">LAUNCH</span>
                  <span className="text-ink-200">
                    {line.event.from} ▸ {line.event.to}
                  </span>
                </>
              )}
              {line.event.kind === "impact" && (
                <>
                  <span className="w-[68px] text-orange-300">IMPACT</span>
                  <span className="text-ink-200">{line.event.to}</span>
                </>
              )}
              {line.event.kind === "intercept" && (
                <>
                  <span className="w-[68px] text-sky-300">INTERCEPT</span>
                  <span className="text-ink-200">over {line.event.to}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <a
        href="#story"
        className="mx-auto mb-6 hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-ink-400 transition-colors hover:text-ink-100 lg:flex"
      >
        <span className="h-px w-8 bg-ink-600" />
        Scroll
        <span className="h-px w-8 bg-ink-600" />
      </a>
    </LandingHero>
  );
}
