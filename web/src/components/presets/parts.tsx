"use client";

import { Crown, Shield, Snowflake, Star, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Shared pieces of the preset editor (cut-plate look, docs/branding.md). */

/** One block of a step: a green line icon, a title, an optional note and a corner slot. */
export function Section({
  icon: Icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="gm-cut bg-ink-900 p-3.5 [--cut:10px]">
      <div className="mb-3 flex items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 h-[17px] w-[17px] shrink-0 text-brand-400" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A small count in a section's corner. */
export function Count({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "rose" | "mint" }) {
  const color = tone === "rose" ? "bg-rose-950 text-rose-300" : tone === "mint" ? "bg-emerald-950 text-emerald-300" : "bg-ink-800 text-ink-300";
  return <span className={`gm-cut shrink-0 px-2 py-0.5 text-[11px] font-semibold [--cut:4px] ${color}`}>{children}</span>;
}

/** Kaiserreich's four factions get their own marks (there are no faction images to use). */
const FACTION_MARKS: Record<string, { color: string; icon: LucideIcon }> = {
  entente: { color: "oklch(55% 0.13 250)", icon: Shield },
  "third international": { color: "oklch(55% 0.18 25)", icon: Star },
  reichspakt: { color: "oklch(42% 0.02 150)", icon: Crown },
  "moscow accord": { color: "oklch(58% 0.12 80)", icon: Snowflake },
};

/** Swatch colours for every other group. */
export const GROUP_SWATCHES = [
  "oklch(72% 0.14 75)", "oklch(72% 0.11 235)", "oklch(68% 0.13 300)", "oklch(76% 0.12 165)",
  "oklch(68% 0.16 15)", "oklch(70% 0.15 345)", "oklch(84% 0.14 95)", "oklch(66% 0.13 255)",
  "oklch(78% 0.15 145)", "oklch(64% 0.15 310)", "oklch(72% 0.15 50)", "oklch(74% 0.11 190)",
];

/** A group's mark: a faction's own mark, else a colour swatch. */
export function GroupMark({ name, index, size = 26 }: { name: string; index: number; size?: number }) {
  const faction = FACTION_MARKS[name.trim().toLowerCase()];
  if (faction) {
    const Icon = faction.icon;
    return (
      <span
        aria-hidden
        className="gm-cut grid shrink-0 place-items-center text-white [--cut:6px]"
        style={{ width: size, height: size, background: faction.color }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="gm-cut shrink-0 [--cut:4px]"
      style={{ width: size * 0.5, height: size * 0.5, margin: size * 0.25, background: GROUP_SWATCHES[index % GROUP_SWATCHES.length] }}
    />
  );
}

/** A nation with its flag. `onRemove` adds the × that takes it out. */
export function NationChip({
  name,
  flag,
  major = false,
  tone = "ink",
  onRemove,
  removeLabel,
  disabled = false,
}: {
  name: string;
  flag: string | null;
  major?: boolean;
  tone?: "ink" | "rose";
  onRemove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
}) {
  return (
    <span
      className={`gm-cut inline-flex h-6 max-w-full items-center gap-1.5 pl-[5px] text-xs [--cut:5px] ${onRemove ? "pr-0.5" : "pr-2"} ${
        tone === "rose" ? "bg-rose-950 text-rose-100" : "bg-ink-950 text-ink-100"
      }`}
    >
      <Flag src={flag} />
      {major && <Crown aria-label="Major" className="h-3 w-3 shrink-0 text-yellow-300" strokeWidth={2} />}
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="grid h-5 w-5 shrink-0 place-items-center text-ink-400 hover:text-ink-100 disabled:opacity-40"
          aria-label={removeLabel ?? `Take ${name} out`}
        >
          <X aria-hidden className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

/** A nation's flag (scraped game files), or a grey plate when the map doesn't draw it. */
export function Flag({ src }: { src: string | null }) {
  if (!src) return <i aria-hidden className="h-3 w-[18px] shrink-0 bg-ink-700" />;
  return (
    // Static scraped flag files, like the reservation list.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-3 w-[18px] shrink-0 object-cover outline outline-1 outline-white/10" />
  );
}
