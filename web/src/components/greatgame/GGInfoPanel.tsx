"use client";

import { BookOpen, Puzzle, X } from "lucide-react";
import type { ReactNode } from "react";
import { PHASES, type GGState, type TimeoutRule } from "@/lib/greatGame/model";
import { clock } from "./ggUi";

/**
 * The Rules and Mods panels from the top bar: side panels like the Log.
 * Rules are written from the event's own settings, so the clocks and the
 * timeout rules shown are always the ones in force.
 */

/** The mods for the event, with their Steam Workshop pages. */
export const GG_MODS: { name: string; note: string; link?: string }[] = [
  { name: "Road to 56", note: "The main mod the event is played on.", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=820260968" },
  { name: "TK RP sub-mod", note: "Our own sub-mod, made for TK's games. Load it together with Road to 56.", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=3342783457" },
];

function Shell({ title, icon, intro, onClose, children }: { title: string; icon: ReactNode; intro: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="gg-panel absolute bottom-0 right-0 top-[86px] z-[1200] flex w-[min(440px,100%)] flex-col" aria-label={title}>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="gg-disp flex items-center gap-2 text-2xl font-black">
          {icon}
          {title}
        </span>
        <button type="button" className="gg-btn h-8 min-h-0 px-2" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
          <X size={16} />
        </button>
      </div>
      <p className="px-4 pt-1 text-[12px]" style={{ color: "var(--gg-fg-3)" }}>
        {intro}
      </p>
      <div className="gg-scroll mt-2 flex-1 px-4 pb-5">{children}</div>
    </aside>
  );
}

function onTimeout(rule: TimeoutRule, what: "ban" | "pick" | "assign"): string {
  if (rule === "random") return what === "assign" ? "everyone not yet placed goes on a free nation of their team at random" : `a ${what} is drawn at random`;
  if (rule === "skip" && what === "ban") return "the ban is lost";
  return "the clock waits for the captain (organizers can step in)";
}

/** The draft's rules in plain words, from the event's own clocks and timeout rules (the room's panel and the front page). */
export function draftRules(timers: GGState["config"]["timers"], rules: GGState["config"]["on_timeout"], n: number): { title: string; text: string }[] {
  return [
    { title: "Captain order", text: "The lottery drum draws the captains one by one. That order is used for the reel, the scratch tickets and the recruit cards." },
    { title: "Majors", text: "In drum order, the reel gives each captain a major from the ones still left. The last major goes to the last captain without a spin." },
    { title: "Vice-captains", text: "Each team scratches its own ticket to reveal its vice-captain." },
    { title: "Recruits", text: `Two rounds. On its turn a team picks one face-down card from the deck and the recruit is revealed. The last card goes to the last team on its own. ${n * 2} recruits in all.` },
    {
      title: "Bans",
      text: `Each team bans one minor, one at a time, from the strongest major to the weakest. A banned nation can't be picked. ${clock(timers.ban)} per ban; if the clock runs out, ${onTimeout(rules.ban, "ban")}.`,
    },
    {
      title: "Minor draft",
      text: `Three rounds in snake order (${n * 3} picks): the weakest major picks first, and the order reverses each round. ${clock(timers.pick)} per pick; if the clock runs out, ${onTimeout(rules.pick, "pick")}.`,
    },
    {
      title: "Assign players",
      text: `All teams at once get ${clock(timers.assign)} together to put each of their players on one of their nations. Line-ups can change until the window closes; if it runs out, ${onTimeout(rules.assign, "assign")}.`,
    },
    { title: "Teams locked", text: "The final lobby is set and the fairness code is revealed." },
  ];
}

export function GGRules({ state, onClose }: { state: GGState; onClose: () => void }) {
  const steps = draftRules(state.config.timers, state.config.on_timeout, state.teams.length);
  const current = PHASES.indexOf(state.phase);
  return (
    <Shell title="Rules" icon={<BookOpen size={20} aria-hidden />} intro="How the draft runs, step by step. Clocks and timeout rules are the ones set for this event." onClose={onClose}>
      <ol className="grid gap-2">
        {steps.map((step, index) => (
          <li key={step.title} className={`gg-rule ${index + 1 === current ? "is-now" : index + 1 < current ? "is-done" : ""}`}>
            <b className="gg-digit">{String(index + 1).padStart(2, "0")}</b>
            <div>
              <div className="gg-disp text-[17px] font-extrabold uppercase leading-tight">{step.title}</div>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--gg-fg-2)" }}>
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <h3 className="gg-disp mt-5 text-lg font-extrabold uppercase">Fair draws</h3>
      <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--gg-fg-2)" }}>
        Every random result comes from a secret code. Its fingerprint is published before the draft starts, and the code is revealed when the teams lock, so anyone can check that
        no result was changed along the way.
      </p>
      <p className="gg-digit mt-1 break-all text-[11px]" style={{ color: "var(--gg-fg-3)" }}>
        Fingerprint: {state.fairness.commit}
      </p>
      <h3 className="gg-disp mt-4 text-lg font-extrabold uppercase">Organizers</h3>
      <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--gg-fg-2)" }}>
        Organizers can pause, add time, undo and fix mistakes. Every change shows in the Log, with its reason.
      </p>
    </Shell>
  );
}

export function GGMods({ onClose }: { onClose: () => void }) {
  return (
    <Shell title="Mods" icon={<Puzzle size={20} aria-hidden />} intro="What to install before the game. Subscribe to everything here and check the versions match." onClose={onClose}>
      <ul className="grid gap-2">
        {GG_MODS.map((mod) => (
          <li key={mod.name} className="gg-rule">
            <b className="gg-digit">
              <Puzzle size={14} aria-hidden />
            </b>
            <div>
              <div className="gg-disp text-[17px] font-extrabold uppercase leading-tight">
                {mod.link ? (
                  <a href={mod.link} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">
                    {mod.name}
                  </a>
                ) : (
                  mod.name
                )}
              </div>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--gg-fg-2)" }}>
                {mod.note}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12.5px] leading-snug" style={{ color: "var(--gg-fg-3)" }}>
        Subscribe to both on the Steam Workshop and let them update before the game. Anything else the organizers add will show up here.
      </p>
    </Shell>
  );
}
