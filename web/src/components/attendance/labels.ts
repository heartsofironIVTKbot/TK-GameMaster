"use client";

import { useEffect, useState } from "react";
import type { AttendancePhase, AttendancePlayer, Participation, VoiceState } from "@/lib/attendanceTypes";

/** Shared wording and colours for the Attendance page. */

export const VOICE_LABEL: Record<VoiceState, string> = {
  present: "In voice with the Gamer Pass",
  lobby: "In the lobby VC (doesn't count)",
  no_pass: "In voice without the Gamer Pass role",
  no_voice: "Not in voice",
  unknown: "Not found in the server",
  dropped: "Excused (dropped out)",
};

export const VOICE_SHORT: Record<VoiceState, string> = {
  present: "In voice",
  lobby: "Lobby",
  no_pass: "No pass",
  no_voice: "Offline",
  unknown: "Unknown",
  dropped: "Excused",
};

export const VOICE_DOT: Record<VoiceState, string> = {
  present: "bg-emerald-400 border-emerald-300",
  lobby: "bg-amber-400 border-amber-300",
  no_pass: "bg-orange-500 border-orange-400",
  no_voice: "bg-rose-500/80 border-rose-400",
  unknown: "bg-slate-500 border-slate-400",
  dropped: "bg-sky-400 border-sky-300",
};

export const VOICE_TEXT: Record<VoiceState, string> = {
  present: "text-emerald-300",
  lobby: "text-amber-300",
  no_pass: "text-orange-300",
  no_voice: "text-rose-300",
  unknown: "text-slate-400",
  dropped: "text-sky-300",
};

export const PARTICIPATION: Record<Participation, { label: string; className: string; title: string }> = {
  confirmed: { label: "Yes", className: "text-emerald-300", title: "Answered Yes to the participation DM" },
  dropped: { label: "Excused", className: "text-sky-300", title: "Answered No and was excused (Minor in Casual logging — no warning)" },
  declined: { label: "No", className: "text-rose-300", title: "Answered No but can't drop out after the start (Major, or Strict logging)" },
  no_reply: { label: "No reply", className: "text-slate-500", title: "Didn't answer the participation DM" },
};

export const PHASE: Record<AttendancePhase, { label: string; className: string; dot: string }> = {
  live: { label: "Live", className: "border-rose-400/50 bg-rose-500/15 text-rose-200", dot: "bg-rose-400 animate-pulse" },
  ending: { label: "Finalizing", className: "border-amber-400/50 bg-amber-500/15 text-amber-200", dot: "bg-amber-400" },
  finalized: { label: "Finalized", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200", dot: "bg-emerald-400" },
};

/** The result column: the finalized verdict, or where the player is heading. */
export function outcomeOf(player: AttendancePlayer): { label: string; className: string; title: string } {
  const state = player.projection ?? player.verdict;
  switch (state) {
    case "present":
      return player.projection
        ? { label: "On track", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200", title: "Seen in enough samples to count as present" }
        : { label: "Present", className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100", title: "Counted as attended" };
    case "at_risk":
      return { label: "At risk", className: "border-amber-400/50 bg-amber-500/15 text-amber-100", title: "Not seen enough yet — the remaining samples can still count them" };
    case "excused":
      return { label: "Excused", className: "border-sky-400/40 bg-sky-500/10 text-sky-100", title: "Not counted as attended, no warning" };
    default:
      return player.projection
        ? { label: "Absent", className: "border-rose-400/50 bg-rose-500/15 text-rose-100", title: "Too few samples left to count them — no-show at finalize" }
        : { label: "Absent", className: "border-rose-400/50 bg-rose-500/15 text-rose-100", title: "No-show" };
  }
}

export function clockTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Re-renders every `everyMs` so countdowns and relative times stay current. */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Bumps a counter every `everyMs` while the tab is visible (auto-refresh). */
export function useRefreshTick(everyMs: number): [number, () => void] {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((value) => value + 1);
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return [tick, () => setTick((value) => value + 1)];
}
