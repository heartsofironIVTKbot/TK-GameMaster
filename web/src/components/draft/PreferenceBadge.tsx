import { Crown, Flag, Handshake, Puzzle, type LucideIcon } from "lucide-react";
import { DRAFT_CHOICES, draftChoiceOf, type DraftChoice } from "@/lib/draft";

/** Each draft choice's line icon (the website's; DRAFT_CHOICES keeps the bot's emoji). */
export const DRAFT_ICONS: Record<DraftChoice, LucideIcon> = {
  major: Crown,
  minor: Flag,
  coop: Handshake,
  filler: Puzzle,
};

/** What a pool player signed up as: Major, Minor, Major Co-op or Filler. */
export default function PreferenceBadge({ preference, size = "sm" }: { preference: string; size?: "xs" | "sm" }) {
  const choice = draftChoiceOf(preference);
  const meta = DRAFT_CHOICES.find((entry) => entry.value === choice);
  const Icon = DRAFT_ICONS[choice];
  return (
    <span
      className={`gm-tag shrink-0 gap-1 bg-ink-800 text-ink-300 ${size === "xs" ? "h-5 px-2 text-[11px]" : "h-[22px] px-2.5 text-xs"}`}
    >
      <Icon aria-hidden className="h-3 w-3" strokeWidth={2} />
      {meta?.title ?? preference}
    </span>
  );
}
