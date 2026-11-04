"use client";

import { Crown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Flag } from "./parts";

/**
 * Search the mode's nations (the bot's exact names) and pick one. `status`
 * says where a nation is now ("in Axis", "locked"…); `action` labels the
 * button for it ("Add", "Move here", "Remove").
 */
export default function NationPicker({
  nations,
  majors,
  status,
  action,
  onPick,
  flagOf,
  disabled = false,
  placeholder = "Find a nation",
}: {
  nations: string[];
  majors: Set<string>;
  status: (nation: string) => string | null;
  action: (nation: string) => string | null;
  onPick: (nation: string) => void;
  flagOf?: (nation: string) => string | null;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return nations.filter((nation) => nation.toLowerCase().includes(needle)).slice(0, 30);
  }, [query, nations]);

  return (
    <div>
      <label className="gm-field">
        <Search aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </label>
      {results.length > 0 && (
        <ul className="roster-scroll mt-1.5 max-h-56 space-y-0.5 overflow-y-auto">
          {results.map((nation) => {
            const label = action(nation);
            const where = status(nation);
            return (
              <li key={nation} className="gm-cut flex items-center gap-2 bg-ink-950 py-1 pl-2 pr-1 [--cut:6px]">
                {flagOf && <Flag src={flagOf(nation)} />}
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] text-ink-200">
                  {majors.has(nation) && <Crown aria-label="Major" className="h-3 w-3 shrink-0 text-yellow-300" strokeWidth={2} />}
                  <span className="truncate">{nation}</span>
                </span>
                {where && <span className="truncate text-[11px] text-ink-500">{where}</span>}
                {label && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(nation)}
                    className="gm-btn gm-btn-secondary h-7 shrink-0 px-2.5 text-[11.5px] [--cut:6px]"
                  >
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {query.trim() && results.length === 0 && <p className="mt-2 text-xs text-ink-500">No nation matches “{query}”.</p>}
    </div>
  );
}
