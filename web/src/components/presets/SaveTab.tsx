"use client";

import { CalendarPlus, Check, CircleAlert, ClipboardList } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { playableNations, type ModeDefaults } from "@/lib/presetTypes";
import { lockLevelLabel, modeOption } from "@/lib/scheduleOptions";
import { formatDurationMinutes } from "@/lib/timeEngine";
import { Section } from "./parts";
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
  savesCopy,
  onGoTo,
}: {
  state: MakerState;
  defaults: ModeDefaults | undefined;
  hiddenCount: number;
  issues: MakerIssue[];
  savedId: string | null;
  dirty: boolean;
  /** Saving makes a copy (GameMaster's preset, another server's or another host's). */
  savesCopy: boolean;
  onGoTo: (tab: MakerTab) => void;
}) {
  const locks = state.locks.filter((group) => group.nations.length > 0);
  const rules = state.rules ?? defaults?.rules ?? [];
  const mods = state.mods ?? defaults?.mods ?? [];
  const row = (tab: MakerTab, label: string, value: ReactNode) => (
    <button
      type="button"
      onClick={() => onGoTo(tab)}
      className="gm-cut flex w-full items-start gap-3 px-2 py-1.5 text-left [--cut:6px] hover:bg-ink-800"
    >
      <span className="w-24 shrink-0 text-xs font-semibold text-ink-500">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] text-ink-200">{value}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      {issues.length > 0 ? (
        <Section icon={CircleAlert} title="Fix these first">
          <ul className="space-y-1">
            {issues.map((issue) => (
              <li key={`${issue.tab}|${issue.message}`}>
                <button
                  type="button"
                  onClick={() => onGoTo(issue.tab)}
                  className="gm-cut w-full bg-rose-950/70 px-3 py-2 text-left text-[13px] text-rose-100 [--cut:7px] hover:bg-rose-950"
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <p className="gm-cut flex items-center gap-2 bg-emerald-950/70 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-200 [--cut:8px]">
          <Check aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
          {savedId && !dirty && !savesCopy
            ? "Saved. Every host of the server can use it now."
            : savesCopy
              ? "Ready. Saving makes your own copy; the original stays the same."
              : "Ready to save."}
        </p>
      )}

      <Section icon={ClipboardList} title={state.name.trim() || "Unnamed preset"} subtitle={modeOption(state.mode)?.label ?? state.mode}>
        <div className="-mx-2 space-y-0.5">
          {row("basics", "Sharing", state.shared ? "In the public library" : "This server only")}
          {row(
            "groups",
            "Nations",
            state.layout
              ? `${playableNations(state.layout).length} playable in ${state.layout.filter((group) => group.enabled).map((group) => group.name).join(", ") || "no group"}${
                  state.layout.some((group) => !group.enabled)
                    ? `; off: ${state.layout.filter((group) => !group.enabled).map((group) => group.name).join(", ")}`
                    : ""
                }`
              : "The whole map",
          )}
          {state.layout && row("groups", "Not playable", hiddenCount === 0 ? "None" : `${hiddenCount} nation${hiddenCount === 1 ? "" : "s"}`)}
          {row("locks", "Who can reserve", `Majors ${lockLevelLabel(state.majorLevel)}, Minors ${lockLevelLabel(state.minorLevel)}`)}
          {row(
            "locks",
            "Nation locks",
            locks.length === 0
              ? "None"
              : locks
                  .map(
                    (group) =>
                      `${group.label || "Locked nations"} (${group.nations.length}, ${
                        group.releaseEnabled ? `opens ${formatDurationMinutes(group.releaseHoursBefore * 60)} before` : "all game"
                      })`,
                  )
                  .join("; "),
          )}
          {row("resources", "Rules", `${state.rules ? "Our own" : "Standard"}: ${rules.map((entry) => entry.name).join(", ") || "none"}`)}
          {row("resources", "Mods", `${state.mods ? "Our own" : "Standard"}: ${mods.map((entry) => entry.name).join(", ") || "none"}`)}
        </div>
      </Section>

      {savedId && !savesCopy && (
        <Section icon={CalendarPlus} title="Use it" subtitle="Load it on the calendar when you set up a game.">
          <Link href={`/schedule/new?preset=${savedId}`} className="gm-btn gm-btn-secondary w-full">
            <CalendarPlus aria-hidden strokeWidth={1.75} /> Schedule a game with it
          </Link>
          <p className="mt-2 text-[11px] text-ink-500">
            A game copies the preset when it&apos;s scheduled: changing the preset later doesn&apos;t change games already on the
            calendar.
          </p>
        </Section>
      )}
    </div>
  );
}
