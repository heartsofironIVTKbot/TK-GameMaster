"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { GGState } from "@/lib/greatGame/model";
import { Flag, nationName, teamById } from "./ggUi";

/**
 * The right side during the bans: every minor still in the pool as a flag
 * you can click (it opens the nation and its Ban button), searchable, with
 * the banned ones crossed out at the bottom. Captains don't have to hunt
 * across the world map, and viewers can follow what's left.
 */
export default function GGPoolPanel({ state, onSelect }: { state: GGState; onSelect: (tag: string) => void }) {
  const [query, setQuery] = useState("");
  const taken = useMemo(() => new Set(state.teams.flatMap((team) => [team.major, ...team.picks]).filter(Boolean)), [state.teams]);
  const bans = state.teams.filter((team) => team.ban);
  const banned = new Set(bans.map((team) => team.ban));
  const q = query.trim().toLowerCase();
  const free = state.config.pool
    .filter((tag) => !taken.has(tag) && !banned.has(tag))
    .map((tag) => ({ tag, name: nationName(state, tag) }))
    .filter((entry) => !q || entry.name.toLowerCase().includes(q) || entry.tag.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const turn = teamById(state, state.turn.team);
  return (
    <aside className="gg-pool gg-scroll" aria-label="Minors still in the pool">
      <div className="gg-pool-head">
        <div className="gg-teambox-label" style={{ margin: 0 }}>
          {state.phase === "draft" ? "Still free" : "Still bannable"} · {free.length}
        </div>
        {turn && (
          <div className="gg-pool-turn" style={{ ["--team" as string]: turn.color }}>
            {turn.name} {state.phase === "draft" ? "pick next" : "ban next"}
          </div>
        )}
        <label className="gg-pool-search">
          <Search size={14} aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a nation" aria-label="Find a nation in the pool" />
        </label>
      </div>
      <div className="gg-pool-grid">
        {free.map((entry) => (
          <button key={entry.tag} type="button" className="gg-pool-nation" onClick={() => onSelect(entry.tag)} title={entry.name}>
            <Flag tag={entry.tag} w={30} h={19} />
            <span className="truncate">{entry.name}</span>
          </button>
        ))}
        {free.length === 0 && <p className="gg-teambox-sub col-span-2 px-1">No nation matches.</p>}
      </div>
      {bans.length > 0 && (
        <>
          <div className="gg-teambox-label mt-4" style={{ marginBottom: 6 }}>
            Banned · {bans.length}
          </div>
          <div className="grid gap-1">
            {bans.map((team) => (
              <button key={team.id} type="button" className="gg-pool-banned" onClick={() => onSelect(team.ban!)} style={{ ["--team" as string]: team.color }}>
                <Flag tag={team.ban} w={30} h={19} />
                <s className="truncate">{nationName(state, team.ban)}</s>
                <span className="ml-auto shrink-0 text-[11px]" style={{ color: team.color }}>
                  {team.name}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
