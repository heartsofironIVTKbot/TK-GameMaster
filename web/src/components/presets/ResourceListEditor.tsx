"use client";

import { ArrowDown, ArrowUp, ExternalLink, Plus, Puzzle, ScrollText, Trash2 } from "lucide-react";
import type { ResourceEntry } from "@/lib/presetTypes";
import { Segmented } from "@/components/schedule/ui";
import { Count, Section } from "./parts";

/**
 * A rules or mods list ({name, link}) — used by the preset maker, the
 * calendar's game setup and the Games page. `entries` null = the mode's
 * standard list (only when `allowStandard`).
 */

const LINK_RE = /^https?:\/\/\S+$/i;

export function isValidLink(link: string): boolean {
  return LINK_RE.test(link.trim()) && link.trim().length <= 400;
}

export default function ResourceListEditor({
  kind,
  entries,
  standard,
  limit,
  onChange,
  allowStandard = true,
  disabled = false,
  note,
}: {
  kind: "mods" | "rules";
  entries: ResourceEntry[] | null;
  /** The mode's standard list (shown when `entries` is null). */
  standard: ResourceEntry[];
  limit: number;
  onChange: (entries: ResourceEntry[] | null) => void;
  allowStandard?: boolean;
  disabled?: boolean;
  note?: string;
}) {
  const isMods = kind === "mods";
  const noun = isMods ? "mod" : "ruleset";
  const custom = entries !== null || !allowStandard;
  const list = entries ?? standard;

  const set = (index: number, patch: Partial<ResourceEntry>) =>
    onChange(list.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <Section
      icon={isMods ? Puzzle : ScrollText}
      title={isMods ? "Mods" : "Rules"}
      subtitle={
        isMods
          ? "Shown behind the game's Mods button on the website."
          : "Shown behind the game's Rules button on the website."
      }
      right={
        <Count>
          {list.length}/{limit}
        </Count>
      }
    >
      {allowStandard && (
        <div className="mb-3">
          <Segmented
            ariaLabel={`${isMods ? "Mods" : "Rules"} source`}
            size="sm"
            value={custom ? "custom" : "standard"}
            onChange={(value) => onChange(value === "standard" ? null : standard.slice(0, limit).map((entry) => ({ ...entry })))}
            options={[
              { value: "standard", label: "The mode's usual list", disabled },
              { value: "custom", label: "Our own list", disabled },
            ]}
          />
        </div>
      )}

      {list.length === 0 ? (
        <p className="gm-cut bg-ink-950 px-3 py-4 text-center text-xs text-ink-500 [--cut:8px]">
          {custom ? `No ${noun}s: the game won't post a ${isMods ? "mods" : "rules"} message.` : `This mode has no usual ${noun}s.`}
        </p>
      ) : custom ? (
        <ul className="space-y-1.5">
          {list.map((entry, index) => {
            const badLink = entry.link.trim() !== "" && !isValidLink(entry.link);
            return (
              <li key={index} className="gm-cut bg-ink-950 p-2 [--cut:8px]">
                <div className="flex items-center gap-1">
                  <span className="w-5 shrink-0 text-center text-[11px] font-semibold text-ink-500">{index + 1}</span>
                  <input
                    value={entry.name}
                    maxLength={100}
                    disabled={disabled}
                    onChange={(event) => set(index, { name: event.target.value })}
                    placeholder={isMods ? "Mod name (e.g. Road to 56)" : "Ruleset name"}
                    aria-label={`${noun} ${index + 1} name`}
                    className="gm-input min-h-8 min-w-0 flex-1 bg-ink-900 py-1 text-[13px] font-semibold [--cut:6px]"
                  />
                  <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}
                    className="grid h-7 w-7 place-items-center text-ink-500 hover:text-ink-100 disabled:opacity-30" aria-label="Move up">
                    <ArrowUp aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button type="button" disabled={disabled || index === list.length - 1} onClick={() => move(index, 1)}
                    className="grid h-7 w-7 place-items-center text-ink-500 hover:text-ink-100 disabled:opacity-30" aria-label="Move down">
                    <ArrowDown aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button type="button" disabled={disabled} onClick={() => onChange(list.filter((_, position) => position !== index))}
                    className="grid h-7 w-7 place-items-center text-ink-500 hover:text-rose-300 disabled:opacity-30" aria-label={`Remove ${entry.name || noun}`}>
                    <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
                <input
                  value={entry.link}
                  maxLength={400}
                  disabled={disabled}
                  onChange={(event) => set(index, { link: event.target.value })}
                  placeholder={isMods ? "https://steamcommunity.com/sharedfiles/filedetails/?id=…" : "https://docs.google.com/document/…"}
                  aria-label={`${noun} ${index + 1} link`}
                  className={`gm-input mt-1.5 min-h-8 w-full bg-ink-900 py-1 text-xs [--cut:6px] ${
                    badLink ? "shadow-[inset_0_0_0_1px_var(--color-rose-400)]" : ""
                  }`}
                />
                {badLink && <p className="mt-1 text-[11px] text-rose-300">The link must start with https://</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-1">
          {list.map((entry, index) => (
            <li key={index} className="gm-cut flex items-center gap-2 bg-ink-950 px-3 py-2 text-[13px] [--cut:7px]">
              <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
              <a href={entry.link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-sky-200 hover:underline">
                {entry.name}
              </a>
            </li>
          ))}
        </ul>
      )}

      {custom && (
        <button
          type="button"
          disabled={disabled || list.length >= limit}
          onClick={() => onChange([...list, { name: "", link: "" }])}
          className="gm-btn gm-btn-secondary mt-2 h-8 w-full text-[13px]"
        >
          <Plus aria-hidden strokeWidth={2} /> Add a {noun} {list.length >= limit ? `(limit ${limit})` : ""}
        </button>
      )}
      {note && <p className="mt-2 text-[11px] text-ink-500">{note}</p>}
    </Section>
  );
}
