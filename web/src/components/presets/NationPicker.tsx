"use client";

import { useMemo, useState } from "react";

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
  disabled = false,
  placeholder = "🔎 Find a nation…",
}: {
  nations: string[];
  majors: Set<string>;
  status: (nation: string) => string | null;
  action: (nation: string) => string | null;
  onPick: (nation: string) => void;
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
      <input
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
      />
      {results.length > 0 && (
        <ul className="roster-scroll mt-2 max-h-56 space-y-1 overflow-y-auto">
          {results.map((nation) => {
            const label = action(nation);
            const where = status(nation);
            return (
              <li key={nation} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">
                  {majors.has(nation) && <span title="Major nation">👑 </span>}
                  {nation}
                </span>
                {where && <span className="truncate text-[10px] text-sky-300">{where}</span>}
                {label && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(nation)}
                    className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-bold text-slate-200 transition hover:bg-amber-400/25 hover:text-amber-100 disabled:opacity-40"
                  >
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {query.trim() && results.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">No nation matches “{query}”.</p>
      )}
    </div>
  );
}
