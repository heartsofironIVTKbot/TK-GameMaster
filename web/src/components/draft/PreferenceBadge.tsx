import { DRAFT_CHOICES, draftChoiceOf } from "@/lib/draft";

const TONES = {
  major: "bg-violet-500/20 text-violet-100",
  minor: "bg-slate-600/40 text-slate-200",
  coop: "bg-sky-500/20 text-sky-100",
  filler: "bg-emerald-500/15 text-emerald-100",
} as const;

/** What a pool player signed up as: 👑 Major, 🏳️ Minor, 🤝 Major Co-op or 🧩 Filler. */
export default function PreferenceBadge({ preference, size = "sm" }: { preference: string; size?: "xs" | "sm" }) {
  const choice = draftChoiceOf(preference);
  const meta = DRAFT_CHOICES.find((entry) => entry.value === choice);
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold ${size === "xs" ? "text-[10px]" : "text-[11px]"} ${TONES[choice]}`}
    >
      {meta?.icon} {meta?.title ?? preference}
    </span>
  );
}
