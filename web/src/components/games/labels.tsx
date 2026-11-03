"use client";

import { Flag, Play, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { GamePhase, LifecycleAction } from "@/lib/gameControlTypes";
import type { GameState } from "@/lib/scheduleOptions";

/**
 * Shared wording and colours for the Games page. A game's phase uses the
 * calendar's status colours (GameState, .gm-state-tag in globals.css):
 * announced green, starting / on-going / ending blue, ended grey, cancelled red.
 */

export const PHASE: Record<GamePhase, { label: string; state: GameState }> = {
  announced: { label: "Announced", state: "announced" },
  starting: { label: "Starting", state: "live" },
  live: { label: "On-going", state: "live" },
  ending: { label: "Ending", state: "live" },
  ended: { label: "Ended", state: "ended" },
  cancelled: { label: "Cancelled", state: "cancelled" },
};

export const ACTION_LABEL: Record<LifecycleAction, { running: string; done: string; icon: LucideIcon }> = {
  game_start: { running: "Starting the game", done: "Game started", icon: Play },
  game_end: { running: "Ending the game", done: "Game ended", icon: Flag },
  game_cancel: { running: "Cancelling the game", done: "Game cancelled", icon: Trash2 },
};

export function PhaseBadge({ phase }: { phase: GamePhase }) {
  const meta = PHASE[phase];
  return (
    <span data-game-state={meta.state} className="gm-tag gm-tag-dot gm-state-tag shrink-0 font-sans normal-case">
      {meta.label}
    </span>
  );
}

/** A card's heading: a green line icon and the display title. */
export function CardTitle({
  icon: Icon,
  title,
  tone = "brand",
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: "brand" | "danger";
  children?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center gap-2.5">
      <Icon aria-hidden className={`h-[18px] w-[18px] shrink-0 ${tone === "danger" ? "text-rose-300" : "text-brand-400"}`} strokeWidth={1.75} />
      <h2 className="gm-title text-[22px]">{title}</h2>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
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
        <b key={match.index} className="font-semibold text-ink-100">
          {match[1]}
        </b>
      ) : (
        <code key={match.index} className="bg-ink-800 px-1 text-[0.95em] text-ink-100">
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
