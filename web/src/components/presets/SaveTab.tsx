"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SectionCard } from "@/components/schedule/ui";
import type { ModeDefaults } from "@/lib/presetTypes";
import { lockLevelLabel, modeOption } from "@/lib/scheduleOptions";
import { formatDurationMinutes } from "@/lib/timeEngine";
import type { MakerState, MakerTab } from "./model";

export interface MakerIssue {
  tab: MakerTab;
  message: string;
}

/** Everything the preset sets, at a glance, plus what still needs fixing. */
export default function SaveTab({
  state,
  defaults,
  hiddenCount,
  issues,
  savedId,
  dirty,
  onGoTo,
}: {
  state: MakerState;
  defaults: ModeDefaults | undefined;
  hiddenCount: number;
  issues: MakerIssue[];
  savedId: string | null;
  dirty: boolean;
  onGoTo: (tab: MakerTab) => void;
}) {
  const locks = state.locks.filter((group) => group.nations.length > 0);
  const rules = state.rules ?? defaults?.rules ?? [];
  const mods = state.mods ?? defaults?.mods ?? [];
  const row = (tab: MakerTab, label: string, value: ReactNode) => (
    <button
      type="button"
      onClick={() => onGoTo(tab)}
      className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
    >
      <span className="w-24 shrink-0 text-[11px] font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-xs text-slate-200">{value}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {issues.length > 0 ? (
        <SectionCard icon="⚠️" title="Fix before saving">
          <ul className="space-y-1.5">
            {issues.map((issue) => (
              <li key={`${issue.tab}|${issue.message}`}>
                <button
                  type="button"
                  onClick={() => onGoTo(issue.tab)}
                  className="w-full rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-left text-xs text-rose-100 hover:border-rose-300/60"
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : (
        <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {savedId && !dirty ? "✓ Saved — every host of the server can use it now." : "✓ Ready to save."}
        </p>
      )}

      <SectionCard icon="✅" title={state.name.trim() || "Unnamed preset"} subtitle={modeOption(state.mode)?.label ?? state.mode}>
        <div className="-mx-2 space-y-0.5">
          {row("basics", "Sharing", state.shared ? "🌐 In the public library" : "🔒 This server only")}
          {row(
            "groups",
            "Nation groups",
            state.layout
              ? `${state.layout.filter((group) => group.enabled).map((group) => group.name).join(", ") || "none on"}${
                  state.layout.some((group) => !group.enabled)
                    ? ` · off: ${state.layout.filter((group) => !group.enabled).map((group) => group.name).join(", ")}`
                    : ""
                }`
              : "The mode's standard groups",
          )}
          {state.layout && row("groups", "Not playable", hiddenCount === 0 ? "None" : `${hiddenCount} nation${hiddenCount === 1 ? "" : "s"}`)}
          {row("locks", "Who can reserve", `Majors: ${lockLevelLabel(state.majorLevel)} · Minors: ${lockLevelLabel(state.minorLevel)}`)}
          {row(
            "locks",
            "Nation locks",
            locks.length === 0
              ? "None"
              : locks
                  .map(
                    (group) =>
                      `${group.label || "Locked nations"} (${group.nations.length}${
                        group.releaseEnabled ? `, opens ${formatDurationMinutes(group.releaseHoursBefore * 60)} before` : ", all game"
                      })`,
                  )
                  .join(" · "),
          )}
          {row("resources", "Rules", `${state.rules ? "Custom" : "Standard"}: ${rules.map((entry) => entry.name).join(", ") || "none"}`)}
          {row("resources", "Mods", `${state.mods ? "Custom" : "Standard"}: ${mods.map((entry) => entry.name).join(", ") || "none"}`)}
        </div>
      </SectionCard>

      {savedId && (
        <SectionCard icon="🗓️" title="Use it" subtitle="Load it on the calendar when you set up a game.">
          <Link
            href={`/schedule/new?preset=${savedId}`}
            className="block rounded-xl bg-sky-500/20 px-4 py-2.5 text-center text-sm font-bold text-sky-100 hover:bg-sky-500/30"
          >
            Schedule a game with this preset →
          </Link>
          <p className="mt-2 text-[11px] text-slate-500">
            Games copy the preset when they&apos;re scheduled — changing the preset later doesn&apos;t change games already on the
            calendar.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
