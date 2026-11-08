"use client";

import Link from "next/link";
import { Fragment } from "react";
import { inviteUrl } from "@/lib/serverSettingsTypes";
import { Glitch, TypeLines } from "./fx";
import ScenePairing from "./ScenePairing";

/** The close: everything else GameMaster does on a ticker, then the call to add it. */

const ROW_ONE = ["Calendar", "Live map", "Drafts", "Presets", "Attendance", "Player records", "Archive"];
const ROW_TWO = ["Host teams", "Works with IronLegion", "Guided tours", "Crash reports", "Tickets", "Shared calendar", "Audit log"];

function Row({ items, reverse = false, outline = false }: { items: string[]; reverse?: boolean; outline?: boolean }) {
  // Twice over, so the loop has no seam.
  const all = [...items, ...items];
  return (
    <div className="fx-marquee py-1" data-reverse={reverse ? "" : undefined}>
      {all.map((item, index) => (
        <Fragment key={`${item}-${index}`}>
          <span className={`gm-title whitespace-nowrap px-6 text-[44px] sm:text-[72px] ${outline ? "fx-outline" : "text-ink-100"}`}>{item}</span>
          <span aria-hidden className="self-center text-[28px] text-brand-400 sm:text-[40px]">
            ◆
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export default function SceneClose() {
  return (
    <section aria-labelledby="scene-close-title">
      <div aria-label="Everything else GameMaster does" className="overflow-hidden border-y border-ink-800 bg-black py-8">
        <Row items={ROW_ONE} />
        <Row items={ROW_TWO} reverse outline />
      </div>

      <ScenePairing />

      <div className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8 sm:py-36">
        <TypeLines
          lines={[{ text: '> gamemaster deploy --server "your community"' }]}
          speed={30}
          className="font-mono text-sm text-brand-300 sm:text-base"
        />
        <Glitch as="h2" className="gm-title mt-6 text-[56px] sm:text-[104px] lg:text-[136px]">
          <span id="scene-close-title">Your server</span>
          <br />
          <span className="text-brand-400">is next.</span>
        </Glitch>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-400 sm:text-lg">
          Add the bot, then set it up on the website: your roles, channels and game modes, with a check at every step.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={inviteUrl()} className="gm-btn gm-btn-primary h-14 justify-center px-9 text-base [--cut:12px]">
            Add to Discord
          </a>
          <Link href="/servers" className="gm-btn gm-btn-secondary h-14 justify-center px-9 text-base [--cut:12px]">
            Set up a server I already added
          </Link>
        </div>
        <p className="mt-4 text-xs text-ink-500">No Administrator permission needed. Each server keeps its own records. Every change is logged.</p>
      </div>
    </section>
  );
}
