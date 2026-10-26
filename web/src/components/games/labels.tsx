"use client";

import type { ReactNode } from "react";
import type { GamePhase, LifecycleAction } from "@/lib/gameControlTypes";

/** Shared wording and colours for the Games page. */

export const PHASE: Record<GamePhase, { label: string; className: string; dot: string }> = {
  announced: { label: "Announced", className: "border-sky-400/40 bg-sky-500/10 text-sky-200", dot: "bg-sky-400" },
  starting: { label: "Starting", className: "border-amber-400/50 bg-amber-500/15 text-amber-100", dot: "bg-amber-400 animate-pulse" },
  live: { label: "Live", className: "border-rose-400/50 bg-rose-500/15 text-rose-200", dot: "bg-rose-400 animate-pulse" },
  ending: { label: "Ending", className: "border-amber-400/50 bg-amber-500/15 text-amber-100", dot: "bg-amber-400" },
  ended: { label: "Ended", className: "border-white/15 bg-white/5 text-slate-300", dot: "bg-slate-400" },
  cancelled: { label: "Cancelled", className: "border-rose-400/30 bg-rose-500/5 text-rose-300/80", dot: "bg-rose-400/60" },
};

export const ACTION_LABEL: Record<LifecycleAction, { running: string; done: string; icon: string }> = {
  game_start: { running: "Starting the game", done: "Game started", icon: "🎮" },
  game_end: { running: "Ending the game", done: "Game ended", icon: "🏁" },
  game_cancel: { running: "Cancelling the game", done: "Game cancelled", icon: "🗑️" },
};

export function PhaseBadge({ phase, size = "sm" }: { phase: GamePhase; size?: "sm" | "md" }) {
  const meta = PHASE[phase];
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full border font-black uppercase ${meta.className} ${
        size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/** "Roleplay Game - Monday - 10.19.2026 Reservations" → without the suffix. */
export function gameTitle(name: string): string {
  return name.replace(/\s*Reservations\s*$/i, "").trim() || name;
}

/**
 * The bot's progress lines are Discord markdown: **bold**, `code`, channel /
 * user mentions and custom emoji. Show them readably on the web.
 */
export function BotText({ text }: { text: string }) {
  const clean = text
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<#\d+>/g, "(Discord thread)")
    .replace(/<@!?\d+>/g, "@member")
    .trim();
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clean)) !== null) {
    if (match.index > last) parts.push(clean.slice(last, match.index));
    parts.push(
      match[1] !== undefined ? (
        <b key={match.index} className="font-bold text-white">
          {match[1]}
        </b>
      ) : (
        <code key={match.index} className="rounded bg-white/10 px-1 text-[0.95em] text-amber-100">
          {match[2]}
        </code>
      ),
    );
    last = match.index + match[0].length;
  }
  if (last < clean.length) parts.push(clean.slice(last));
  return <span className="whitespace-pre-line">{parts}</span>;
}

export function clockTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function duration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}
