"use client";

import { useState, type ReactNode } from "react";
import ModeIcon from "@/components/schedule/ModeIcon";
import SiteHeader from "@/components/site/SiteHeader";
import { CATEGORY_META, categoryOfMode, modeOption } from "@/lib/scheduleOptions";
import type { RpVerdict } from "@/lib/rpArchiveTypes";

/** Shared bits of the public roleplay pages. */

export function RpHeader({ children }: { children?: ReactNode }) {
  return (
    <SiteHeader page="roleplay" title="Roleplay Archive" subtitle="Every graded game, on every server">
      {children}
    </SiteHeader>
  );
}

/** A nation's flag (base-game tags; hidden when there's no picture). */
export function Flag({ tag, className = "h-4 w-6" }: { tag: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!tag || failed) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center bg-ink-700 text-[8px] font-bold text-ink-300 ${className}`}>
        {tag.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/assets/flags/${tag}.png`}
      alt=""
      onError={() => setFailed(true)}
      className={`shrink-0 object-cover ring-1 ring-black/40 ${className}`}
    />
  );
}

/** Commends mint, Merit gold, nothing grey. */
const VERDICT_STYLE: Record<RpVerdict["kind"], string> = {
  commend: "bg-emerald-950 text-emerald-300",
  merit: "bg-yellow-950 text-yellow-300",
  none: "bg-ink-800 text-ink-300",
  no_rp: "bg-ink-900 text-ink-500",
};

export function VerdictBadge({ verdict, small }: { verdict: RpVerdict; small?: boolean }) {
  return (
    <span
      className={`gm-tag shrink-0 ${small ? "h-[18px] px-2 text-[10.5px]" : ""} ${VERDICT_STYLE[verdict.kind]}`}
    >
      {verdict.label}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  const meta = CATEGORY_META[categoryOfMode(mode)];
  return (
    <span className={`gm-tag bg-ink-800 ${meta.text}`}>
      <ModeIcon mode={mode} aria-hidden className="h-3 w-3" strokeWidth={1.75} />
      {modeOption(mode)?.label ?? mode}
    </span>
  );
}

export function ServerChip({ name, icon }: { name: string; icon: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-ink-400">
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded-full" />
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[8px] font-bold">
          {name.charAt(0)}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

export function playedOn(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function words(count: number): string {
  return count >= 10_000 ? `${Math.round(count / 1000)}k` : count.toLocaleString();
}
