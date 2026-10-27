"use client";

import type { ResourceEntry } from "@/lib/presetTypes";
import { SectionCard, Segmented } from "@/components/schedule/ui";

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
    <SectionCard
      icon={isMods ? "🛠️" : "📖"}
      title={isMods ? "Mods" : "Rules"}
      subtitle={
        isMods
          ? "Shown behind the game's Mods button on the website."
          : "Shown behind the game's Rules button on the website."
      }
      right={
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300">
          {list.length}/{limit}
        </span>
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
              { value: "standard", label: "Mode's standard list", disabled },
              { value: "custom", label: "Custom list", disabled },
            ]}
          />
        </div>
      )}

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
          {custom ? `No ${noun}s — the game won't post a ${isMods ? "mods" : "rules"} message.` : `This mode has no standard ${noun}s.`}
        </p>
      ) : custom ? (
        <ul className="space-y-2">
          {list.map((entry, index) => {
            const badLink = entry.link.trim() !== "" && !isValidLink(entry.link);
            return (
              <li key={index} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-[11px] font-black text-slate-500">{index + 1}</span>
                  <input
                    value={entry.name}
                    maxLength={100}
                    disabled={disabled}
                    onChange={(event) => set(index, { name: event.target.value })}
                    placeholder={isMods ? "Mod name (e.g. Road to 56)" : "Ruleset name"}
                    aria-label={`${noun} ${index + 1} name`}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-sm font-semibold text-slate-100 placeholder:text-slate-600 focus:border-amber-300/50 focus:outline-none"
                  />
                  <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}
                    className="rounded-md px-1.5 text-slate-500 hover:text-white disabled:opacity-30" aria-label="Move up">↑</button>
                  <button type="button" disabled={disabled || index === list.length - 1} onClick={() => move(index, 1)}
                    className="rounded-md px-1.5 text-slate-500 hover:text-white disabled:opacity-30" aria-label="Move down">↓</button>
                  <button type="button" disabled={disabled} onClick={() => onChange(list.filter((_, position) => position !== index))}
                    className="rounded-md px-1.5 text-slate-500 hover:text-rose-300 disabled:opacity-30" aria-label={`Remove ${entry.name || noun}`}>✕</button>
                </div>
                <input
                  value={entry.link}
                  maxLength={400}
                  disabled={disabled}
                  onChange={(event) => set(index, { link: event.target.value })}
                  placeholder={isMods ? "https://steamcommunity.com/sharedfiles/filedetails/?id=…" : "https://docs.google.com/document/…"}
                  aria-label={`${noun} ${index + 1} link`}
                  className={`mt-1.5 w-full rounded-lg border bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none ${
                    badLink ? "border-rose-400/60" : "border-white/10 focus:border-amber-300/50"
                  }`}
                />
                {badLink && <p className="mt-1 text-[11px] text-rose-300">The link must start with https://</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {list.map((entry, index) => (
            <li key={index} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
              <span className="text-slate-500">{isMods ? "🔗" : "📜"}</span>
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
          className="mt-2 w-full rounded-xl border border-dashed border-white/15 py-2 text-xs font-semibold text-slate-400 transition hover:border-amber-300/40 hover:text-amber-200 disabled:opacity-40"
        >
          ＋ Add a {noun} {list.length >= limit ? `(limit ${limit})` : ""}
        </button>
      )}
      {note && <p className="mt-2 text-[11px] text-slate-500">{note}</p>}
    </SectionCard>
  );
}
