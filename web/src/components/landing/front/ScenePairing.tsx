"use client";

import { useRef } from "react";
import { useInView } from "./fx";

/**
 * Pair it with IronLegion: GameMaster's sister bot, Steam authentication for
 * HOI4 communities (ironlegionbot.com). IronLegion's own red, so it reads as
 * its own product. IronLegion text always says "authenticate", never
 * "verify" (GameMaster owns "Verified").
 */

const IRONLEGION = "https://ironlegionbot.com";
const RED = "#c01d22";

const POINTS = [
  {
    title: "Authenticate once",
    text: "Members link their Steam account a single time and are recognised on every server that runs IronLegion.",
    icon: <path d="M15 7a3 3 0 11-3 3M4 20l7-7M8 16l2 2M11 13l2 2" />,
  },
  {
    title: "Alts kept out",
    text: "Blacklisted players and fake accounts are stopped at the door, before they ever reach your games.",
    icon: (
      <>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
        <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
      </>
    ),
  },
  {
    title: "Built into GameMaster",
    text: "Switch on Require IronLegion and only authenticated players can reserve a nation, on every game or just the ones you pick.",
    icon: (
      <>
        <path d="M9 12l2 2 4-4" />
        <rect x="3" y="4" width="18" height="16" />
      </>
    ),
  },
];

export default function ScenePairing() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <section aria-labelledby="scene-pairing-title" className="mx-auto max-w-[1240px] px-4 pt-24 sm:px-8 sm:pt-32">
      <div
        ref={ref}
        className={`gm-plate relative overflow-hidden p-6 sm:p-10 ${seen ? "fx-fade-in" : "opacity-0"}`}
        style={{ borderColor: `color-mix(in oklab, ${RED} 45%, transparent)` }}
      >
        {/* A faint red glow in the corner: IronLegion's colour. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: `color-mix(in oklab, ${RED} 22%, transparent)` }}
        />
        <p className="fx-kicker relative" style={{ color: RED }}>
          {"// Better together"}
        </p>
        <h2 id="scene-pairing-title" className="gm-title relative mt-3 text-[36px] sm:text-[56px]">
          Pair it with <span style={{ color: RED }}>IronLegion.</span>
        </h2>
        <p className="relative mt-4 max-w-2xl text-base leading-relaxed text-ink-300">
          IronLegion is GameMaster&apos;s sister bot: Steam authentication for Hearts of Iron IV communities. GameMaster runs your games; IronLegion makes sure the
          people in them are who they say they are. Free as well, with no ads.
        </p>
        <ul className="relative mt-8 grid gap-4 md:grid-cols-3">
          {POINTS.map((point) => (
            <li key={point.title} className="border border-ink-800 bg-black/40 p-5">
              <span
                className="gm-cut mb-3 flex h-10 w-10 items-center justify-center [--cut:8px]"
                style={{ color: RED, background: `color-mix(in oklab, ${RED} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${RED} 40%, transparent)` }}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {point.icon}
                </svg>
              </span>
              <b className="gm-title block text-[22px]">{point.title}</b>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{point.text}</p>
            </li>
          ))}
        </ul>
        <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={`${IRONLEGION}/invite`}
            className="gm-btn h-12 justify-center px-7 text-[15px] text-white [--cut:10px]"
            style={{ background: RED }}
          >
            Add IronLegion
          </a>
          <a href={IRONLEGION} className="gm-btn gm-btn-secondary h-12 justify-center bg-black/40 px-7 text-[15px] [--cut:10px]">
            Learn more at ironlegionbot.com
          </a>
        </div>
      </div>
    </section>
  );
}
