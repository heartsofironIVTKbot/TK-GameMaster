"use client";

import { useRef } from "react";
import { useInView } from "./fx";

/** What GameMaster won't do: charge you, show you ads, or sell your server's data. */

const PROMISES = [
  {
    title: "No monetization",
    text: "Free for every community: no paid tiers and nothing behind a paywall. The one exception is AI analysis, an optional extra that costs real money for every game it reads.",
    // A coin's S, struck through.
    icon: (
      <>
        <path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3.2c0 4.6 10 2.4 10 7 0 2-2.2 3.3-5 3.3s-5-1.3-5-3.3" />
        <path d="M4 4l16 16" />
      </>
    ),
  },
  {
    title: "Ad-free",
    text: "No adverts on the website, in Discord or in your game announcements. Ever.",
    // A screen with "AD", struck through.
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" />
        <path d="M7 15l2.5-6L12 15M8 13h3M15 9v6h1.5a2.5 2.5 0 000-6z" />
        <path d="M3 21L21 3" />
      </>
    ),
  },
  {
    title: "Your data stays yours",
    text: "Your server's records are never sold or shared. They're used for one thing: running your games.",
    // A shield with a check.
    icon: (
      <>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
];

export default function ScenePromise() {
  const ref = useRef<HTMLUListElement>(null);
  const seen = useInView(ref);
  return (
    <section aria-labelledby="scene-promise-title" className="mx-auto max-w-[1240px] px-4 pb-24 pt-4 sm:px-8 sm:pb-32">
      <h2 id="scene-promise-title" className="gm-title text-[36px] sm:text-[52px]">
        Built for the community,
        <br />
        <span className="text-brand-400">not for profit.</span>
      </h2>
      <ul ref={ref} className="mt-8 grid gap-4 md:grid-cols-3">
        {PROMISES.map((promise, index) => (
          <li
            key={promise.title}
            className={`gm-plate group p-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 ${seen ? "fx-fade-in" : "opacity-0"}`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <span className="gm-cut mb-4 flex h-11 w-11 items-center justify-center bg-brand-400/10 text-brand-400 ring-1 ring-inset ring-brand-400/30 [--cut:8px]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {promise.icon}
              </svg>
            </span>
            <b className="gm-title block text-[24px]">{promise.title}</b>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">{promise.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
