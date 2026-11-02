"use client";

import SiteHeader from "@/components/site/SiteHeader";
import { useState, type ReactNode } from "react";
import { CATEGORY_META, categoryOfMode, modeOption } from "@/lib/scheduleOptions";
import type { RpVerdict } from "@/lib/rpArchiveTypes";

/** Shared bits of the public roleplay pages. */

export function RpHeader({ children }: { children?: ReactNode }) {
  return (
    <SiteHeader page="roleplay" icon="🎭" title="Roleplay Archive" subtitle="GameMaster · every game's story" gradient="from-violet-300 to-fuchsia-700">
      {children}
    </SiteHeader>
  );
}

/** A nation's flag (base-game tags; hidden when there's no picture). */
export function Flag({ tag, className = "h-4 w-6" }: { tag: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!tag || failed) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-sm bg-ink-700 text-[8px] font-black text-ink-300 ${className}`}>
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
      className={`shrink-0 rounded-sm object-cover shadow ring-1 ring-black/40 ${className}`}
    />
  );
}

const VERDICT_STYLE: Record<RpVerdict["kind"], string> = {
  commend: "border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
  merit: "border-brand-400/50 bg-brand-500/15 text-brand-100",
  none: "border-white/10 bg-white/5 text-ink-300",
  no_rp: "border-white/10 bg-white/[0.03] text-ink-500",
};

export function VerdictBadge({ verdict, small }: { verdict: RpVerdict; small?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-bold ${small ? "px-1.5 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]"} ${VERDICT_STYLE[verdict.kind]}`}
    >
      {verdict.label}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  const meta = CATEGORY_META[categoryOfMode(mode)];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.chip}`}>
      {meta.emoji} {modeOption(mode)?.label ?? mode}
    </span>
  );
}

export function ServerChip({ name, icon }: { name: string; icon: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-ink-400">
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded-full" />
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[8px] font-black">
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
