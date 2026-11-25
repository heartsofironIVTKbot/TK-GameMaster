"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import { Avatar, Flag, nationName, person, SLOT_ROLE } from "./ggUi";
import type { GGViewerInfo } from "./useGreatGame";

/**
 * Step 7's line-up board, bottom centre over the map: a team's four nations
 * as big cards and its four players as chips. Drag a player onto a nation,
 * or click a player and then a nation (dropping onto a taken nation swaps
 * the player already there back to the bench; the cross takes one off). The
 * captain sees their own team; an organizer can switch between teams. Every
 * placement shows on the map for everyone at once.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

export default function GGLineupBoard({ state, viewer, act }: { state: GGState; viewer: GGViewerInfo; act: Act }) {
  const own = viewer.captainOf ? state.teams.find((team) => team.id === viewer.captainOf) ?? null : null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editable = viewer.organizer ? state.teams : own ? [own] : [];
  if (!editable.length || state.phase !== "assign") return null;
  // An organizer starts on the first team that isn't done.
  const firstOpen = editable.find((team) => members(team).some((id) => !team.assign[id])) ?? editable[0];
  const team = editable.find((entry) => entry.id === chosen) ?? (own && !viewer.organizer ? own : (own ?? firstOpen));
  const players = members(team);
  const nations = [team.major, ...team.picks].filter((tag): tag is string => Boolean(tag));
  const who = new Map(Object.entries(team.assign).map(([id, tag]) => [tag, id]));
  const bench = players.filter((id) => !team.assign[id]);
  const done = bench.length === 0;

  const place = async (personId: string, tag: string) => {
    setHeld(null);
    setOver(null);
    setError(await act({ kind: "assign.set", team: team.id, person: personId, tag }));
  };

  return (
    <section className={`gg-lineup ${open ? "" : "is-closed"}`} style={{ ["--team" as string]: team.color }} aria-label={`${team.name}: line-up`}>
      <header className="gg-lineup-head">
        <span className="gg-lineup-title">{team.name} line-up</span>
        <span className="gg-lineup-count">{done ? "All four placed ✓" : `${players.length - bench.length} of ${players.length} placed`}</span>
        {viewer.organizer && editable.length > 1 && (
          <select className="gg-input h-8 w-[150px] text-xs" value={team.id} onChange={(event) => setChosen(event.target.value)} aria-label="Team to place">
            {editable.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({members(entry).filter((id) => entry.assign[id]).length}/4)
              </option>
            ))}
          </select>
        )}
        <button type="button" className="gg-btn h-8 min-h-0 px-2" onClick={() => setOpen((value) => !value)} aria-label={open ? "Fold the board" : "Open the board"}>
          {open ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
        </button>
      </header>
      {open && (
        <>
          <p className="gg-lineup-hint">{held ? `Now click a nation for ${person(state, held)?.name ?? "them"}.` : "Drag each player onto a nation, or click a player and then a nation."}</p>
          <div className="gg-lineup-nations">
            {nations.map((tag, i) => {
              const placed = who.get(tag) ?? null;
              const p = person(state, placed);
              return (
                <div
                  key={tag}
                  className={`gg-lineup-nation ${over === tag ? "is-over" : ""} ${held ? "is-target" : ""} ${placed ? "is-filled" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOver(tag);
                  }}
                  onDragLeave={() => setOver((value) => (value === tag ? null : value))}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/plain");
                    if (id) void place(id, tag);
                  }}
                  onClick={() => held && void place(held, tag)}
                  role={held ? "button" : undefined}
                  tabIndex={held ? 0 : undefined}
                  onKeyDown={(event) => held && (event.key === "Enter" || event.key === " ") && void place(held, tag)}
                >
                  <span className="gg-lineup-kind">{i === 0 ? "Major" : `Minor ${i}`}</span>
                  <Flag tag={tag} w={46} h={29} />
                  <span className="gg-lineup-nation-name">{nationName(state, tag)}</span>
                  {p ? (
                    <span
                      className="gg-lineup-player is-placed"
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", p.id)}
                    >
                      <Avatar id={p.id} name={p.name} color={team.color} size={22} />
                      <span className="truncate">{p.name}</span>
                      <button
                        type="button"
                        className="gg-lineup-off"
                        aria-label={`Take ${p.name} off ${nationName(state, tag)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void place(p.id, "");
                        }}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  ) : (
                    <span className="gg-lineup-empty">Drop a player here</span>
                  )}
                </div>
              );
            })}
          </div>
          {bench.length > 0 && (
            <div className="gg-lineup-bench">
              {bench.map((id) => {
                const p = person(state, id);
                const role = SLOT_ROLE[slotOf(team, id)] ?? "";
                return (
                  <button
                    key={id}
                    type="button"
                    draggable
                    className={`gg-lineup-player ${held === id ? "is-held" : ""}`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", id);
                      setHeld(null);
                    }}
                    onClick={() => setHeld((value) => (value === id ? null : id))}
                  >
                    <Avatar id={id} name={p?.name ?? "?"} color={team.color} size={24} />
                    <span className="truncate">{p?.name ?? "?"}</span>
                    <small>{role}</small>
                  </button>
                );
              })}
            </div>
          )}
          {error && (
            <p role="alert" className="gg-lineup-hint" style={{ color: "#ff9b9b" }}>
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function members(team: GGTeam): string[] {
  return [team.captain, team.vice, ...team.recruits].filter((id): id is string => Boolean(id));
}

/** 0 captain, 1 vice-captain, 2 and 3 recruits (as SLOT_ROLE). */
function slotOf(team: GGTeam, id: string): number {
  if (team.captain === id) return 0;
  if (team.vice === id) return 1;
  return team.recruits[0] === id ? 2 : 3;
}
