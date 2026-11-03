"use client";

import {
  Ban,
  BadgeCheck,
  BadgeX,
  Mail,
  Medal,
  Minus,
  Recycle,
  Scale,
  ShieldCheck,
  Star,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Each logged action's icon and what it means: good (mint), a warning
 * (yellow), a sanction (red) or neutral (grey), the same on every row.
 */
export type Tone = "good" | "warn" | "bad" | "ink";
export const ACTION_ICON: Record<string, [LucideIcon, Tone]> = {
  commend: [Star, "good"],
  commend_removed: [Minus, "ink"],
  merit: [Medal, "good"],
  merit_removed: [Minus, "ink"],
  warn: [TriangleAlert, "warn"],
  warn_removed: [Undo2, "ink"],
  redeem: [Recycle, "good"],
  ban: [Ban, "bad"],
  unban: [Undo2, "ink"],
  appeal: [Mail, "ink"],
  valor_trusted: [ShieldCheck, "good"],
  host_acclamation: [Star, "good"],
  host_violation: [TriangleAlert, "warn"],
  host_acclamation_removed: [Minus, "ink"],
  host_violation_removed: [Undo2, "ink"],
  dishonored_give: [Scale, "bad"],
  dishonored_take: [Undo2, "ink"],
  valor_earned: [Medal, "good"],
  verified_granted: [BadgeCheck, "good"],
  verified_removed: [BadgeX, "ink"],
  vip_granted: [Star, "good"],
  vip_removed: [Minus, "ink"],
  vip_declined: [X, "ink"],
};

const TONE: Record<Tone, string> = {
  good: "bg-emerald-950 text-emerald-300",
  warn: "bg-yellow-950 text-yellow-300",
  bad: "bg-rose-950 text-rose-300",
  ink: "bg-ink-800 text-ink-300",
};

/** An action's icon on a small cut tile in its tone. */
export function ActionIcon({ icon: Icon, tone, size = 28 }: { icon: LucideIcon; tone: Tone; size?: number }) {
  return (
    <span className={`gm-cut flex shrink-0 items-center justify-center [--cut:6px] ${TONE[tone]}`} style={{ width: size, height: size }}>
      <Icon aria-hidden className="h-[15px] w-[15px]" strokeWidth={1.75} />
    </span>
  );
}
