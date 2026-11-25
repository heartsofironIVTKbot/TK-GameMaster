"use client";

import { Check, Copy, Map as MapIcon, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import * as sound from "./ggSound";
import { Avatar, Flag, nationName, person, SLOT_ROLE, teamMembers } from "./ggUi";
import type { GGViewerInfo } from "./useGreatGame";

/**
 * Step 8: the final lobby. When the organizers lock the teams, everyone gets
 * the finale: neon fireworks in the seven team colours, TEAMS LOCKED slamming
 * in and each team's card flying in one by one. It settles into the poster
 * (screenshot-ready for stream and Discord): every team with its four
 * players and nations, the event's branding, and the fairness card (the code
 * posted before the draft, the seed once revealed, and a check anyone can run
 * in their own browser). A button swaps the poster for the map with everyone
 * on it, and back.
 */

const SHOW_MS = 7000;

export default function GGFinale({
  state,
  viewer,
  now,
  reveal,
  copyText,
}: {
  state: GGState;
  viewer: GGViewerInfo;
  now: number;
  reveal: () => Promise<string | null>;
  copyText: string;
}) {
  const undone = new Set(state.log.filter((entry) => entry.kind === "undo").map((entry) => Number(entry.payload.seq)));
  const lockedAt = [...state.log].reverse().find((entry) => entry.kind === "phase.set" && entry.payload.phase === "locked" && !undone.has(entry.seq))?.at ?? 0;
  // The show plays for a lock that happens while the page is open (or just before it opened).
  const [show] = useState(() => now - lockedAt < 4000);
  const [poster, setPoster] = useState(true);
  const [copied, setCopied] = useState(false);
  const fireworks = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!show) return undefined;
    sound.whoosh(0.6);
    const ids = [window.setTimeout(() => sound.stamp(), 350), window.setTimeout(() => sound.bell(), 900)];
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [show]);

  // Fireworks in the team colours for the first few seconds.
  useEffect(() => {
    const canvas = fireworks.current;
    const ctx = canvas?.getContext("2d");
    if (!show || !canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.scale(ratio, ratio);
    const colors = state.teams.map((team) => team.color);
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
    const sparks: Spark[] = [];
    const burst = (x: number, y: number, color: string) => {
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2 + Math.random() * 0.1;
        const v = 120 + Math.random() * 220;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
      }
    };
    const start = performance.now();
    let last = start;
    let nextBurst = 0;
    let frame = 0;
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const age = t - start;
      if (age < SHOW_MS - 1500 && age >= nextBurst) {
        burst(w * (0.15 + Math.random() * 0.7), h * (0.12 + Math.random() * 0.4), colors[Math.floor(Math.random() * colors.length)]);
        nextBurst = age + 260 + Math.random() * 380;
      }
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vy += 260 * dt;
        s.vx *= 0.985;
        s.vy *= 0.985;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt * 0.75;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (age < SHOW_MS || sparks.length) frame = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [show, state.teams]);

  if (!poster) {
    return (
      <button type="button" className="gg-finale-toggle" onClick={() => setPoster(true)}>
        <ShieldCheck size={18} aria-hidden /> Show the final lobby
      </button>
    );
  }

  return (
    <div className={`gg-finale ${show ? "is-show" : ""}`} role="region" aria-label="Final lobby">
      <canvas ref={fireworks} aria-hidden className="gg-finale-fireworks" />
      <div className="gg-finale-inner">
        <header className="gg-finale-head">
          <div>
            <div className="gg-brush" style={{ fontSize: 40, lineHeight: 1 }}>
              The Great Game
            </div>
            <div className="mt-1 flex items-center gap-2.5 pl-1">
              <span className="gg-year">2026</span>
              <span className="gg-road">Road to 56</span>
            </div>
          </div>
          <div className="gg-finale-stamp">Teams locked</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="gg-btn"
              onClick={() =>
                void navigator.clipboard?.writeText(copyText).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? "Copied" : "Copy for Discord"}
            </button>
            <button type="button" className="gg-btn" onClick={() => setPoster(false)}>
              <MapIcon size={16} aria-hidden /> Show the map
            </button>
          </div>
        </header>
        <div className="gg-finale-grid">
          {state.teams.map((team, i) => (
            <TeamCard key={team.id} state={state} team={team} index={i} />
          ))}
          <Fairness state={state} viewer={viewer} reveal={reveal} />
        </div>
      </div>
    </div>
  );
}

function TeamCard({ state, team, index }: { state: GGState; team: GGTeam; index: number }) {
  return (
    <section className="gg-finale-card" style={{ ["--team" as string]: team.color, ["--i" as string]: index }}>
      <header>
        <span className="gg-finale-team">{team.name}</span>
        <Flag tag={team.major} w={34} h={22} title={nationName(state, team.major)} />
      </header>
      <div className="grid gap-1.5">
        {teamMembers(team).map((id, slot) => {
          if (!id) return null;
          const who = person(state, id);
          const tag = team.assign[id];
          return (
            <div key={id} className="gg-finale-row">
              <Avatar id={id} name={who?.name ?? "?"} color={team.color} size={26} />
              <span className="min-w-0">
                <span className="gg-finale-name">{who?.name ?? "?"}</span>
                <span className="gg-finale-role">{SLOT_ROLE[slot]}</span>
              </span>
              {tag ? (
                <span className="gg-finale-nation">
                  <Flag tag={tag} w={24} h={15} />
                  <span className="truncate">{nationName(state, tag)}</span>
                </span>
              ) : (
                <span className="gg-finale-nation" style={{ color: "var(--gg-fg-3)" }}>
                  —
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The sealed envelope: the code posted before the draft, the seed once revealed, and a check anyone can run. */
function Fairness({ state, viewer, reveal }: { state: GGState; viewer: GGViewerInfo; reveal: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<"match" | "mismatch" | null>(null);
  const { commit, seed } = state.fairness;
  return (
    <section className="gg-finale-card gg-finale-fair" style={{ ["--team" as string]: "#22e5ff", ["--i" as string]: state.teams.length }}>
      <header>
        <span className="gg-finale-team">Fairness</span>
        <ShieldCheck size={20} aria-hidden style={{ color: "#22e5ff" }} />
      </header>
      <p className="gg-finale-fair-text">
        Every random result tonight came from a secret seed, sealed by this code before the draft. With the seed out, anyone can check it.
      </p>
      <div className="gg-finale-code" title={commit}>
        <small>Code</small> {commit.slice(0, 20)}…
      </div>
      {seed ? (
        <>
          <div className="gg-finale-code" title={seed}>
            <small>Seed</small> {seed.slice(0, 20)}…
          </div>
          <button
            type="button"
            className="gg-btn gg-btn-primary mt-1 w-full"
            onClick={async () => {
              const bytes = new TextEncoder().encode(seed);
              const digest = await crypto.subtle.digest("SHA-256", bytes);
              const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
              setCheck(hex === commit ? "match" : "mismatch");
            }}
          >
            Check it
          </button>
          {check && (
            <p className="gg-finale-fair-text" style={{ color: check === "match" ? "var(--gg-ok)" : "#ff9b9b", fontWeight: 700 }}>
              {check === "match" ? "✓ The seed matches the code posted before the draft." : "✗ The seed doesn't match the code."}
            </p>
          )}
        </>
      ) : viewer.organizer ? (
        <button
          type="button"
          className="gg-btn gg-btn-primary mt-1 w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(await reveal());
            setBusy(false);
          }}
        >
          {busy ? "Revealing…" : "Reveal the seed"}
        </button>
      ) : (
        <p className="gg-finale-fair-text" style={{ color: "var(--gg-pending)" }}>
          The organizers reveal the seed shortly.
        </p>
      )}
      {error && (
        <p role="alert" className="gg-finale-fair-text" style={{ color: "#ff9b9b" }}>
          {error}
        </p>
      )}
    </section>
  );
}
