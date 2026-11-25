"use client";

import { useEffect, useRef, useState } from "react";
import type { GGState } from "@/lib/greatGame/model";
import * as sound from "./ggSound";
import { Flag, nationName, teamById } from "./ggUi";

/**
 * The moment of a ban or a draft pick: the nation's flag and name in the
 * middle of the screen, and a big stamp slamming across the flag: a red
 * BANNED with a thud and a short shake, or LOCKED IN in the team's colour with
 * a chime. Shown for each new one for everyone watching (not for those that
 * were already in when the page opened).
 */
const SHOW_MS = 2200;

export default function GGBanSlam({ state, now }: { state: GGState; now: number }) {
  const undone = new Set(state.log.filter((entry) => entry.kind === "undo").map((entry) => Number(entry.payload.seq)));
  const latest = [...state.log].reverse().find((entry) => (entry.kind === "ban.set" || entry.kind === "pick.set") && !undone.has(entry.seq) && entry.payload.tag);
  const seen = useRef<number | null>(latest ? latest.seq : null);
  const [shown, setShown] = useState<{ seq: number; tag: string; team: string; pick: boolean; round: number } | null>(null);
  const latestRef = useRef(latest);
  const nowRef = useRef(now);
  useEffect(() => {
    latestRef.current = latest;
    nowRef.current = now;
  });
  const latestSeq = latest?.seq ?? null;

  useEffect(() => {
    const entry = latestRef.current;
    if (!entry || latestSeq === null || latestSeq === seen.current) return;
    seen.current = latestSeq;
    // Only fresh bans (a page that reconnects doesn't replay an old one).
    if (nowRef.current - entry.at > 4000) return;
    const pick = entry.kind === "pick.set";
    setShown({ seq: entry.seq, tag: String(entry.payload.tag), team: String(entry.payload.team), pick, round: Number(entry.payload.round) || 1 });
    if (pick) {
      sound.thunk();
      sound.bell();
      return;
    }
    sound.stamp();
    const main = document.querySelector("main.gg") as HTMLElement | null;
    if (main) {
      main.classList.remove("gg-shake");
      void main.offsetWidth;
      main.classList.add("gg-shake");
    }
  }, [latestSeq]);

  // Clears itself a moment after it lands.
  useEffect(() => {
    if (!shown) return undefined;
    const id = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [shown]);

  if (!shown) return null;
  const team = teamById(state, shown.team);
  return (
    <div className="gg-banslam" role="status" aria-live="assertive">
      <div className="gg-banslam-card" style={{ ["--team" as string]: team?.color ?? "#ff3b3b" }}>
        <Flag tag={shown.tag} w={150} h={96} />
        <div className="gg-banslam-name">{nationName(state, shown.tag)}</div>
        {team && <div className="gg-banslam-by">{shown.pick ? `${team.name} · round ${shown.round}` : `banned by ${team.name}`}</div>}
        <div className={`gg-banslam-stamp ${shown.pick ? "is-pick" : ""}`}>{shown.pick ? "LOCKED IN" : "BANNED"}</div>
      </div>
    </div>
  );
}
