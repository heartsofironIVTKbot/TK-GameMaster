"use client";

import { Check, Clock, DoorOpen, Gavel, KeyRound, Medal, Scale, Star, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ArchiveCounts, ArchiveMarks, ArchivePresence, ArchiveRating, ArchiveStatus } from "@/lib/archiveTypes";

/** Shared bits of the archive pages: one icon and colour per presence and mark, everywhere. */

export const PRESENCE: Record<Exclude<ArchivePresence, "none">, { icon: LucideIcon; tone: string; label: string }> = {
  played: { icon: Check, tone: "text-emerald-300", label: "Played" },
  no_show: { icon: X, tone: "text-rose-400", label: "No-show" },
  told_host: { icon: DoorOpen, tone: "text-sky-300", label: "Told the host" },
  late: { icon: KeyRound, tone: "text-amber-300", label: "Joined late" },
  pending: { icon: Clock, tone: "text-ink-400", label: "Not counted yet" },
};

/** A running game says "In game" instead of "Played". */
export function presenceLabel(presence: Exclude<ArchivePresence, "none">, running: boolean): string {
  return running && presence === "played" ? "In game" : PRESENCE[presence].label;
}

export const MARK: Record<keyof ArchiveMarks, { icon: LucideIcon; tone: string; label: string; plural: string }> = {
  commend: { icon: Star, tone: "text-emerald-300", label: "Commend", plural: "Commends" },
  merit: { icon: Medal, tone: "text-yellow-300", label: "Merit", plural: "Merit" },
  warn: { icon: TriangleAlert, tone: "text-amber-400", label: "Warning", plural: "Warnings" },
  dishonored: { icon: Scale, tone: "text-orange-400", label: "Dishonored", plural: "Dishonored" },
  ban: { icon: Gavel, tone: "text-rose-400", label: "Game ban", plural: "Game bans" },
};

export const MARK_ORDER: (keyof ArchiveMarks)[] = ["commend", "merit", "warn", "dishonored", "ban"];

/** Icon + number pairs (zeros left out). */
export function IconCounts({
  items,
  className = "",
}: {
  items: { icon: LucideIcon; tone: string; label: string; value: number }[];
  className?: string;
}) {
  const shown = items.filter((item) => item.value > 0);
  if (shown.length === 0) return null;
  return (
    <span className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-ink-100 ${className}`}>
      {shown.map(({ icon: Icon, tone, label, value }) => (
        <span key={label} className="inline-flex items-center gap-1" title={`${label}: ${value}`}>
          <Icon aria-hidden className={`h-[15px] w-[15px] ${tone}`} strokeWidth={1.75} />
          {value}
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </span>
  );
}

export function presenceItems(counts: ArchiveCounts, running: boolean) {
  return [
    { ...PRESENCE.played, label: running ? "In game" : "Played", value: counts.played },
    { ...PRESENCE.no_show, value: counts.no_show },
    { ...PRESENCE.told_host, value: counts.told_host },
    { ...PRESENCE.late, value: counts.late },
  ];
}

export function markItems(counts: ArchiveCounts) {
  return MARK_ORDER.map((key) => ({ ...MARK[key], label: MARK[key].plural, value: counts[key] }));
}

/** Five stars filled to the nearest half. */
export function Stars({ value, size = 15, className = "" }: { value: number | null; size?: number; className?: string }) {
  const rounded = value === null ? 0 : Math.round(value * 2) / 2;
  return (
    <span className={`inline-flex shrink-0 gap-px ${className}`} role="img" aria-label={value === null ? "Not rated" : `${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((index) => {
        const fill = rounded >= index ? 1 : rounded >= index - 0.5 ? 0.5 : 0;
        return (
          <span key={index} className="relative" style={{ width: size, height: size }}>
            <Star aria-hidden className="absolute inset-0 text-ink-700" style={{ width: size, height: size }} strokeWidth={1.75} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: fill === 1 ? size : size / 2 }}>
                <Star aria-hidden className="fill-yellow-300 text-yellow-300" style={{ width: size, height: size }} strokeWidth={1.75} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** The list's compact rating: stars, average, how many rated. */
export function RatingInline({ rating }: { rating: ArchiveRating }) {
  if (rating.count === 0) return <span className="text-xs text-ink-500">{rating.open ? "Rating open" : "Not rated"}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]" title={`${rating.count} players rated it`}>
      <Stars value={rating.average} size={13} />
      <b className="font-semibold text-ink-100">{(rating.average ?? 0).toFixed(1)}</b>
      <span className="text-xs text-ink-500">{rating.count}</span>
    </span>
  );
}

/** The game page's rating: the average, the stars, and how many gave each number. */
export function RatingBlock({ rating }: { rating: ArchiveRating }) {
  const most = Math.max(1, ...rating.spread);
  return (
    <div data-tour="archive.rating" className="gm-cut flex shrink-0 items-center gap-4 bg-ink-950 px-3.5 py-3 [--cut:10px]">
      <div className="flex flex-col items-center gap-1">
        <strong className="font-display text-[40px] font-extrabold leading-none text-ink-100">
          {rating.average === null ? "None" : rating.average.toFixed(1)}
        </strong>
        <Stars value={rating.average} size={17} />
        <span className="text-[11.5px] text-ink-400">
          {rating.count === 0 ? "Nobody rated yet" : `${rating.count} ${rating.count === 1 ? "player" : "players"} rated`}
        </span>
      </div>
      <div className="grid w-[170px] gap-[3px]">
        {rating.spread.map((value, index) => (
          <div key={index} className="grid grid-cols-[10px_12px_minmax(0,1fr)_18px] items-center gap-1.5 text-[11.5px] text-ink-400">
            <span>{5 - index}</span>
            <Star aria-hidden className="h-3 w-3 fill-yellow-300 text-yellow-300" strokeWidth={1.75} />
            <span className="h-1.5 bg-ink-800">
              <span className="block h-full bg-yellow-300" style={{ width: `${(value / most) * 100}%` }} />
            </span>
            <span className="text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_META: Record<ArchiveStatus, { label: string; tone: string }> = {
  starting: { label: "Starting", tone: "bg-yellow-950 text-yellow-300" },
  ongoing: { label: "On-going", tone: "bg-sky-950 text-sky-300" },
  ended: { label: "Ended", tone: "bg-ink-800 text-ink-300" },
  cancelled: { label: "Cancelled", tone: "bg-rose-950 text-rose-300" },
};

export function StatusTag({ status }: { status: ArchiveStatus }) {
  const meta = STATUS_META[status];
  return <span className={`gm-tag gm-tag-dot shrink-0 ${meta.tone}`}>{meta.label}</span>;
}

/** The legend under the list: every icon the archive uses. */
export function ArchiveLegend() {
  const items = [
    PRESENCE.played,
    PRESENCE.no_show,
    PRESENCE.told_host,
    PRESENCE.late,
    ...MARK_ORDER.map((key) => MARK[key]),
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs text-ink-400">
      {items.map(({ icon: Icon, tone, label }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <Icon aria-hidden className={`h-3.5 w-3.5 ${tone}`} strokeWidth={1.75} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function when(ts: number, withTime = true): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
