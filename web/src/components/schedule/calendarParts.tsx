"use client";

import Link from "next/link";
import { CalendarDays, Drama, Share2, TriangleAlert } from "lucide-react";
import { GAME_STATES } from "@/lib/scheduleOptions";
import { TankIcon } from "./ModeIcon";

/** Pieces both calendars share: the two tabs, the live badge and the legend. */

export function CalendarTabs({ current }: { current: "ours" | "shared" }) {
  const tab = (id: "ours" | "shared", href: string, label: string, Icon: typeof CalendarDays) => (
    <Link
      href={href}
      aria-current={current === id ? "page" : undefined}
      className={`flex h-9 items-center gap-2 px-3 text-[13.5px] font-semibold transition-colors ${
        current === id ? "gm-nav-on text-ink-100" : "text-ink-400 hover:text-ink-100"
      }`}
    >
      <Icon aria-hidden className={`h-4 w-4 ${current === id ? "text-brand-400" : ""}`} strokeWidth={1.75} />
      {label}
    </Link>
  );
  return (
    <nav className="flex items-stretch" aria-label="Calendars">
      {tab("ours", "/schedule", "Our calendar", CalendarDays)}
      {tab("shared", "/schedule/shared", "Shared calendar", Share2)}
    </nav>
  );
}

export function LiveTag({ syncAge }: { syncAge: number | null }) {
  return (
    <span className="gm-tag gm-tag-dot bg-emerald-950 text-emerald-300" title="The calendar refreshes by itself">
      Live
      {syncAge !== null && <span className="font-medium text-emerald-300/60">{syncAge}s ago</span>}
    </span>
  );
}

/** What the colours and marks mean. `shared`: the Shared Calendar's version. */
export function StateLegend({ shared = false }: { shared?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-ink-400">
      {GAME_STATES.map((state) => (
        <span key={state.value} className="inline-flex items-center gap-1.5">
          <i data-game-state={state.value} className="gm-state-bar h-3 w-[3px]" />
          {state.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <i data-game-state="announced" className="gm-addon-edge h-3 w-[3px]" />
        Add-on
      </span>
      <span aria-hidden className="h-3.5 w-px bg-ink-700" />
      <span className="inline-flex items-center gap-1.5">
        <Drama aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
        Roleplay
      </span>
      <span className="inline-flex items-center gap-1.5">
        <TankIcon aria-hidden className="h-3.5 w-3.5" />
        Historical
      </span>
      <span aria-hidden className="h-3.5 w-px bg-ink-700" />
      <span className="inline-flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 bg-[linear-gradient(135deg,var(--color-ink-700)_50%,var(--color-brand-400)_50%)]" />
        {shared ? "Your server" : "Yours"}
      </span>
      {shared ? (
        <span className="inline-flex items-center gap-1.5">
          <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
          Possible clash
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <i className="gm-hatch h-2.5 w-2.5 outline outline-1 outline-ink-700" />
          Staff lock
        </span>
      )}
    </div>
  );
}
