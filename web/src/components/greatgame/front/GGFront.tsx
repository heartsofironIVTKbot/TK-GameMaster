"use client";

import { ArrowRight, Ban, ChevronDown, Crosshair, Film, Layers, Lock, Orbit, Rows3, ShieldCheck, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PHASE_LABEL, PHASES } from "@/lib/greatGame/model";
import type { GGPublic } from "@/lib/greatGame/public";
import { displayName, Flag } from "../ggUi";
import GGFrontScene, { type SceneMajor } from "./GGFrontScene";

/**
 * The Great Game 2026 front page (/greatgame): the poster as a live scene,
 * then the dates, the format, the draft's eight steps, the majors, the teams
 * (once locked) and the fairness seal. Public: it shows only what
 * lib/greatGame/public.ts lets out, refreshed every 20 seconds.
 */

/** The dates. A null time shows as "time to be announced" and counts down in days. */
export const GG_DATES: { key: string; label: string; date: string; time: string | null; confirmed: boolean; note: string }[] = [
  { key: "draft", label: "The draft", date: "2026-11-29", time: null, confirmed: false, note: "Captains, majors, bans and picks, live on stream" },
  { key: "game", label: "Game day", date: "2026-12-27", time: null, confirmed: true, note: "Seven teams, one map, Road to 56" },
];

const STEPS: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <Orbit size={22} />, title: "Captain order", text: "The lottery drum draws the seven captains, one ball at a time." },
  { icon: <Rows3 size={22} />, title: "Majors", text: "In drum order, the reel hands each captain a major." },
  { icon: <Ticket size={22} />, title: "Vice-captains", text: "Each team scratches a ticket to reveal its content-creator vice." },
  { icon: <Layers size={22} />, title: "Recruits", text: "Two rounds of face-down cards deal out the fourteen recruits." },
  { icon: <Ban size={22} />, title: "Bans", text: "One ban per team, from the strongest major to the weakest." },
  { icon: <Crosshair size={22} />, title: "Minor draft", text: "Three snake rounds, weakest major first: 21 minors taken." },
  { icon: <Users size={22} />, title: "Assign players", text: "Ten minutes for every team to put its players on its nations." },
  { icon: <Lock size={22} />, title: "Teams locked", text: "The final lobby is set and the fairness seed is revealed." },
];

// Neon colours for the majors on the globe before teams own them.
const MAJOR_GLOW = ["#ff2bd6", "#22e5ff", "#ffb347", "#b46bff", "#7cf0a0", "#ff5a7a", "#ffe680"];

function useFeatured(): { event: GGPublic | null; loaded: boolean } {
  const [state, setState] = useState<{ event: GGPublic | null; loaded: boolean }>({ event: null, loaded: false });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/greatgame", { cache: "no-store" });
        const body = (await response.json()) as { event: GGPublic | null };
        if (!cancelled) setState({ event: body.event, loaded: true });
      } catch {
        if (!cancelled) setState((current) => ({ ...current, loaded: true }));
      }
    };
    void load();
    const id = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return state;
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function statusOf(event: GGPublic | null, loaded: boolean): { live: boolean; text: string } {
  if (!loaded) return { live: false, text: "Tuning in…" };
  if (!event) return { live: false, text: "Coming soon" };
  if (event.phase === "locked") return { live: false, text: "Teams locked · the final lobby is set" };
  if (!event.started) return { live: false, text: "The draft hasn't started yet" };
  const step = PHASES.indexOf(event.phase);
  return { live: true, text: `${event.paused ? "Paused" : "Live now"} · Step ${step} · ${PHASE_LABEL[event.phase]}` };
}

export default function GGFront() {
  const { event, loaded } = useFeatured();
  const status = statusOf(event, loaded);
  const sceneMajors = useMemo<SceneMajor[]>(() => {
    const tags = event?.majors.map((major) => major.tag) ?? ["SOV", "USA", "GER", "FRA", "ENG", "JAP", "ITA"];
    return tags.map((tag, i) => ({ tag, color: event?.teams?.find((team) => team.major === tag)?.color ?? MAJOR_GLOW[i % MAJOR_GLOW.length] }));
  }, [event]);
  const room = event ? `/greatgame/${event.slug}` : null;

  return (
    <div className="ggf">
      <section className="ggf-hero">
        <GGFrontScene majors={sceneMajors} />
        <nav className="ggf-nav" aria-label="Great Game">
          <Link href="/" className="ggf-nav-home">
            GameMaster
          </Link>
          <div className="ggf-nav-links">
            <a href="#format">Format</a>
            <a href="#draft">The draft</a>
            <a href="#majors">Majors</a>
            <a href="#fairness">Fairness</a>
          </div>
        </nav>

        <div className="ggf-title">
          <div className={`ggf-status ${status.live ? "is-live" : ""}`} role="status">
            <i aria-hidden />
            {status.text}
          </div>
          <h1 className="ggf-h1">
            <span className="ggf-chrome" data-text="Road to 56">
              Road to 56
            </span>
            <span className="ggf-bars" aria-hidden>
              <b />
              <span className="ggf-bars-text">7 teams · 28 players</span>
              <b />
            </span>
            <span className="ggf-brush">The Great Game</span>
            <span className="ggf-year">
              <i aria-hidden />
              2026
              <i aria-hidden />
            </span>
          </h1>
          <div className="ggf-cta">
            {room ? (
              <a className="ggf-btn is-primary" href={room}>
                Enter the draft room <ArrowRight size={18} aria-hidden />
              </a>
            ) : null}
            {room && event?.started ? (
              <a className="ggf-btn" href={`${room}/replay`}>
                <Film size={17} aria-hidden /> Watch the replay
              </a>
            ) : (
              <a className="ggf-btn" href="#draft">
                How it works
              </a>
            )}
          </div>
          {room && <p className="ggf-cta-note">The draft room is for players, casters and organizers. Everyone else: catch it live on stream.</p>}
        </div>
        <a className="ggf-scroll" href="#dates" aria-label="Scroll down">
          <ChevronDown size={26} />
        </a>
      </section>

      <main className="ggf-main">
        <Dates />
        <Format event={event} />
        <Steps event={event} />
        <Majors event={event} />
        {event?.teams && <Teams event={event} />}
        <Fairness event={event} />
        <footer className="ggf-footer">
          <span className="ggf-footer-brush">The Great Game</span>
          <span>2026 · Road to 56 · run on GameMaster</span>
        </footer>
      </main>
    </div>
  );
}

function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="ggf-head">
      <span className="ggf-kicker">{kicker}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </header>
  );
}

function Dates() {
  const now = useNow(1000);
  return (
    <section id="dates" className="ggf-section ggf-dates">
      {GG_DATES.map((entry) => {
        const at = entry.time ? new Date(`${entry.date}T${entry.time}`).getTime() : new Date(`${entry.date}T00:00:00`).getTime();
        const left = at - now;
        const day = new Date(`${entry.date}T12:00:00`);
        const days = Math.max(0, Math.ceil(left / 86_400_000));
        const parts = entry.time
          ? [Math.floor(left / 86_400_000), Math.floor(left / 3_600_000) % 24, Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60].map((n) => Math.max(0, n))
          : null;
        return (
          <article key={entry.key} className="ggf-date">
            <span className="ggf-kicker">{entry.label}</span>
            <div className="ggf-date-day">
              {day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              {!entry.confirmed && <em>to be confirmed</em>}
            </div>
            <div className="ggf-count">
              {left <= 0 ? (
                <b className="ggf-count-big">{entry.key === "draft" ? "Under way" : "Today"}</b>
              ) : parts ? (
                ["days", "hrs", "min", "sec"].map((unit, i) => (
                  <span key={unit} className="ggf-count-cell">
                    <b>{String(parts[i]).padStart(2, "0")}</b>
                    <small>{unit}</small>
                  </span>
                ))
              ) : (
                <span className="ggf-count-cell is-days">
                  <b>{days}</b>
                  <small>{days === 1 ? "day to go" : "days to go"}</small>
                </span>
              )}
            </div>
            <p>
              {entry.note}
              {!entry.time && " · time to be announced"}
            </p>
          </article>
        );
      })}
    </section>
  );
}

function Format({ event }: { event: GGPublic | null }) {
  const counts = event?.counts ?? { teams: 7, captains: 7, vices: 7, recruits: 14, casters: 3, minors: 50 };
  const cards = [
    { n: counts.captains, title: "Pro captains", text: "Seasoned players lead the teams. The drum decides who goes first." },
    { n: counts.vices, title: "Vice-captains", text: "Content creators, one per team, revealed on scratch tickets." },
    { n: counts.recruits, title: "Recruits", text: "The pool of fourteen, dealt out on face-down cards." },
  ];
  return (
    <section id="format" className="ggf-section">
      <SectionHead kicker="The format" title={`${counts.teams} teams of four`}>
        Every team is a captain, a vice-captain and two recruits, playing one major and three minors on the Road to 56 map: {event?.majors.length ?? 7} majors and{" "}
        {counts.minors} minors to fight over.
      </SectionHead>
      <div className="ggf-format">
        {cards.map((card) => (
          <article key={card.title} className="ggf-card">
            <b className="ggf-big">{card.n}</b>
            <h3>{card.title}</h3>
            <p>{card.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Steps({ event }: { event: GGPublic | null }) {
  const current = event?.started ? PHASES.indexOf(event.phase) : -1;
  return (
    <section id="draft" className="ggf-section">
      <SectionHead kicker="The draft" title="Eight steps, all on stream">
        Every random result comes from a seed sealed before the night, so nobody, organizers included, can steer a draw.
      </SectionHead>
      <ol className="ggf-steps">
        {STEPS.map((step, i) => {
          const n = i + 1;
          const state = n < current || (n === current && event?.phaseDone) || event?.phase === "locked" ? "is-done" : n === current ? "is-now" : "";
          return (
            <li key={step.title} className={`ggf-step ${state}`}>
              <span className="ggf-step-icon">{step.icon}</span>
              <span className="ggf-step-n">{String(n).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              {state === "is-now" && <span className="ggf-step-live">Live</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Majors({ event }: { event: GGPublic | null }) {
  const majors = event?.majors ?? [
    { tag: "SOV", name: "Soviet Union" },
    { tag: "USA", name: "United States" },
    { tag: "GER", name: "Germany" },
    { tag: "FRA", name: "France" },
    { tag: "ENG", name: "United Kingdom" },
    { tag: "JAP", name: "Japan" },
    { tag: "ITA", name: "Italy" },
  ];
  return (
    <section id="majors" className="ggf-section">
      <SectionHead kicker="The majors" title="Ranked strongest to weakest">
        The ranking sets the order: bans go strongest first, and the minor draft starts with the weakest.
      </SectionHead>
      <ol className="ggf-majors">
        {majors.map((major, i) => {
          const owner = event?.teams?.find((team) => team.major === major.tag);
          return (
            <li key={major.tag} className="ggf-major" style={owner ? { ["--team" as string]: owner.color } : undefined}>
              <span className="ggf-major-rank">#{i + 1}</span>
              <Flag tag={major.tag} w={72} h={47} title={major.name} />
              <h3>{displayName(major.name)}</h3>
              <span className="ggf-major-owner">{owner ? owner.name : i === 0 ? "Bans first" : i === majors.length - 1 ? "Picks first" : " "}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Teams({ event }: { event: GGPublic }) {
  return (
    <section id="teams" className="ggf-section">
      <SectionHead kicker="The final lobby" title="The teams" />
      <div className="ggf-teams">
        {event.teams!.map((team) => (
          <article key={team.name} className="ggf-team" style={{ ["--team" as string]: team.color }}>
            <header>
              <h3>{team.name}</h3>
              {team.major && <Flag tag={team.major} w={34} h={22} title={event.names[team.major]} />}
            </header>
            <ul>
              {team.players.map((player) => (
                <li key={`${player.role}-${player.name}`}>
                  <span>
                    <b>{player.name}</b>
                    <small>{player.role}</small>
                  </span>
                  {player.nation && (
                    <span className="ggf-team-nation">
                      <Flag tag={player.nation} w={20} h={13} title={event.names[player.nation]} />
                      {displayName(event.names[player.nation] ?? player.nation)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function Fairness({ event }: { event: GGPublic | null }) {
  const [check, setCheck] = useState<"match" | "mismatch" | null>(null);
  const commit = event?.fairness.commit ?? null;
  const seed = event?.fairness.seed ?? null;
  return (
    <section id="fairness" className="ggf-section">
      <div className="ggf-seal">
        <div className="ggf-seal-badge" aria-hidden>
          <ShieldCheck size={46} />
        </div>
        <div>
          <span className="ggf-kicker">Fairness</span>
          <h2>Sealed before the draft</h2>
          <p>
            Every draw of the night (balls, reel, tickets, cards) comes from one secret seed. Its fingerprint is published here before the draft starts. When the teams lock, the
            seed is revealed: anyone can check it matches, and players can re-run every single draw in the replay.
          </p>
          {commit ? (
            <>
              <div className="ggf-code">
                <small>Fingerprint (SHA-256 of the seed)</small>
                <span>{commit}</span>
              </div>
              {seed ? (
                <>
                  <div className="ggf-code">
                    <small>Seed, revealed</small>
                    <span>{seed}</span>
                  </div>
                  <button
                    type="button"
                    className="ggf-btn"
                    onClick={async () => {
                      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
                      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
                      setCheck(hex === commit ? "match" : "mismatch");
                    }}
                  >
                    <ShieldCheck size={17} aria-hidden /> Check it in your browser
                  </button>
                  {check && <p className={`ggf-check ${check === "match" ? "is-ok" : "is-bad"}`}>{check === "match" ? "✓ The seed matches the fingerprint." : "✗ The seed doesn't match."}</p>}
                </>
              ) : (
                <p className="ggf-sealed">The seed stays sealed until the teams lock.</p>
              )}
            </>
          ) : (
            <p className="ggf-sealed">The fingerprint is posted here once the event is set up.</p>
          )}
        </div>
      </div>
    </section>
  );
}
