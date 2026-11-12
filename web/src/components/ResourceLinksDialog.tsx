"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Puzzle, ScrollText, X } from "lucide-react";
import type { ResourceEntry } from "@/lib/presetTypes";

/**
 * The map's Rules / Mods pop-up: the selected game's own list (as announced),
 * each with its name, so a player sees what's in use and opens one, some or
 * all of them. Browsers let one click open a single tab, so "Open selected"
 * says how many tabs were blocked when pop-ups aren't allowed for the site.
 */

export type ResourceKind = "mods" | "rules";

const COPY: Record<ResourceKind, { title: string; lead: (count: number) => string; empty: string }> = {
  mods: {
    title: "Mods",
    lead: (count) => `This game uses ${count === 1 ? "this mod" : `these ${count} mods`}. Subscribe before it starts.`,
    empty: "The host hasn't listed any mods for this game.",
  },
  rules: {
    title: "Rules",
    lead: (count) => `This game is played by ${count === 1 ? "this ruleset" : `these ${count} rulesets`}.`,
    empty: "The host hasn't listed any rules for this game.",
  },
};

function siteOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Opens each link in a new tab; returns how many the browser blocked. */
function openTabs(links: string[]): number {
  let blocked = 0;
  for (const link of links) {
    const tab = window.open(link, "_blank");
    if (tab) tab.opener = null;
    else blocked += 1;
  }
  return blocked;
}

export default function ResourceLinksDialog({
  kind,
  entries,
  loading,
  noGame,
  onClose,
}: {
  kind: ResourceKind;
  entries: ResourceEntry[];
  loading: boolean;
  noGame: boolean;
  onClose: () => void;
}) {
  const copy = COPY[kind];
  const Icon = kind === "mods" ? Puzzle : ScrollText;
  const [picked, setPicked] = useState<Set<number>>(() => new Set(entries.map((_, index) => index)));
  const [blocked, setBlocked] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (index: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const pickedLinks = entries.filter((_, index) => picked.has(index)).map((entry) => entry.link);

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-ink-950/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title" className="gm-plate w-full max-w-lg bg-ink-950 p-5 [--cut:14px] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="gm-cut flex h-10 w-10 shrink-0 items-center justify-center bg-ink-800 text-brand-300 [--cut:8px]">
            <Icon aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="resource-dialog-title" className="gm-title text-[26px] leading-none">
              {copy.title}
            </h2>
            <p className="mt-1.5 text-sm text-ink-400">
              {noGame ? "Pick a game first." : loading ? "Loading…" : entries.length === 0 ? copy.empty : copy.lead(entries.length)}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="gm-cut p-1.5 text-ink-400 [--cut:6px] hover:bg-ink-800 hover:text-ink-100">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        {!noGame && !loading && entries.length > 0 && (
          <>
            <ul className="roster-scroll mt-4 max-h-[50vh] space-y-1.5 overflow-y-auto">
              {entries.map((entry, index) => (
                <li key={`${index}-${entry.link}`} className="flex items-center gap-3 gm-cut border border-ink-800 bg-ink-900 px-3 py-2.5 [--cut:8px]">
                  {entries.length > 1 && (
                    <input
                      type="checkbox"
                      checked={picked.has(index)}
                      onChange={() => toggle(index)}
                      aria-label={`Select ${entry.name}`}
                      className="h-4 w-4 shrink-0 accent-brand-400"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-100">{entry.name}</p>
                    {siteOf(entry.link) && <p className="truncate text-[11px] text-ink-500">{siteOf(entry.link)}</p>}
                  </div>
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gm-btn gm-btn-secondary h-8 shrink-0 px-3 text-xs"
                  >
                    Open
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>

            {entries.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pickedLinks.length === 0}
                  onClick={() => setBlocked(openTabs(pickedLinks))}
                  className="gm-btn gm-btn-primary h-9 px-4 text-[13px] disabled:opacity-40"
                >
                  {pickedLinks.length === entries.length ? `Open all ${entries.length}` : `Open selected (${pickedLinks.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setPicked(picked.size === entries.length ? new Set() : new Set(entries.map((_, index) => index)))}
                  className="px-2 text-xs font-bold text-ink-400 hover:text-ink-100"
                >
                  {picked.size === entries.length ? "Select none" : "Select all"}
                </button>
              </div>
            )}
            {blocked > 0 && (
              <p role="status" className="mt-3 text-xs text-amber-200">
                Your browser blocked {blocked === 1 ? "1 tab" : `${blocked} tabs`}. Allow pop-ups for this site, or open them one at a time with Open.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
