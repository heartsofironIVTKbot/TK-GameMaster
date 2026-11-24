"use client";

import { useState } from "react";
import { draftOrder, nationsOf, strengthOrder } from "@/lib/greatGame/engine";
import type { GGState, GGTeam } from "@/lib/greatGame/model";
import { Avatar, EmptySlot, Flag, hexA, nationName, person, SLOT_ROLE, teamMembers } from "./ggUi";
import type { GGViewerInfo } from "./useGreatGame";

/**
 * The left drawer. One team stack all evening, sorted so whoever acts next is
 * on top, ending each row with what this step is about (approval, drum
 * number, players found, the ban, the three minors, players placed). The team
 * on the clock opens to show its four players, roles written out. The draft
 * adds the 21-pick snake wheel above the stack; once the teams lock the
 * drawer becomes the final lobby table.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

function orderFor(state: GGState): GGTeam[] {
  const byId = new Map(state.teams.map((team) => [team.id, team]));
  switch (state.phase) {
    case "drum":
    case "wheel": {
      const drawn = state.order.map((id) => byId.get(id)!).filter(Boolean);
      return [...drawn, ...state.teams.filter((team) => !state.order.includes(team.id))];
    }
    case "vice":
    case "recruits":
    case "bans":
    case "locked":
      return strengthOrder(state.teams, state.config.majors);
    case "draft":
    case "assign":
      return [...strengthOrder(state.teams, state.config.majors)].reverse();
    default:
      return state.teams;
  }
}

function RowEnd({ state, team }: { state: GGState; team: GGTeam }) {
  const small = (text: string, color = "var(--gg-fg-3)") => (
    <span className="text-[11px] font-semibold" style={{ color }}>
      {text}
    </span>
  );
  const members = teamMembers(team).filter(Boolean).length;
  switch (state.phase) {
    case "teams":
      return team.approved ? small("✓ Approved", "var(--gg-ok)") : small("Waiting for approval", "var(--gg-pending)");
    case "drum": {
      const at = state.order.indexOf(team.id);
      return at >= 0 ? small(`#${at + 1}`, "var(--gg-cyan)") : small("In the drum");
    }
    case "vice":
    case "recruits":
      return small(`${members} of 4`, members === 4 ? "var(--gg-ok)" : "var(--gg-fg-3)");
    case "bans":
      if (team.ban) {
        return (
          <span className="relative inline-block" title={`Banned ${nationName(state, team.ban)}`}>
            <Flag tag={team.ban} w={40} h={26} />
            <span className="gg-disp absolute -bottom-1.5 -left-2 rotate-[-10deg] px-1 text-[10px] font-black text-white" style={{ background: "var(--gg-stamp)" }}>
              Banned
            </span>
          </span>
        );
      }
      if (team.ban === "") return small("Ban lost");
      return state.turn.team === team.id ? <EmptySlot w={40} h={26} pulse label="?" /> : <EmptySlot w={40} h={26} />;
    case "draft":
      return (
        <span className="flex gap-1">
          {team.picks.map((pick, index) =>
            pick ? (
              <Flag key={index} tag={pick} w={24} h={16} title={nationName(state, pick)} />
            ) : (
              <EmptySlot key={index} pulse={state.turn.team === team.id && state.turn.round === index + 1} />
            ),
          )}
        </span>
      );
    case "assign": {
      const placed = teamMembers(team).filter((id) => id && team.assign[id]).length;
      return small(`${placed} of 4 placed`, placed === 4 ? "var(--gg-ok)" : "var(--gg-pending)");
    }
    default:
      return null;
  }
}

function subline(state: GGState, team: GGTeam): string {
  const captain = person(state, team.captain)?.name ?? "—";
  if (state.phase === "wheel" || state.phase === "vice") return team.major ? nationName(state, team.major) : `Captain ${captain}`;
  return `Captain ${captain}`;
}

function TeamSetupForm({ team, act }: { team: GGTeam; act: Act }) {
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color === "#8a7fb0" ? "#3d7bff" : team.color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(await act({ kind: "team.set", team: team.id, name, color }));
        setBusy(false);
      }}
    >
      <label className="gg-label" htmlFor="gg-team-name">
        Your team name
      </label>
      <input id="gg-team-name" className="gg-input" value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
      <label className="gg-label" htmlFor="gg-team-color">
        Your team colour
      </label>
      <div className="flex items-center gap-2">
        <input id="gg-team-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent" />
        <span className="gg-digit text-xs" style={{ color: "var(--gg-fg-2)" }}>
          {color}
        </span>
        <button type="submit" className="gg-btn gg-btn-primary ml-auto" disabled={busy}>
          Save
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "#ff9b9b" }}>
          {error}
        </p>
      )}
      <p className="text-[11px]" style={{ color: "var(--gg-fg-3)" }}>
        Two teams can&apos;t have colours that look alike. An organizer approves your team when it&apos;s ready.
      </p>
    </form>
  );
}

function AssignList({ state, team, act, canEdit }: { state: GGState; team: GGTeam; act: Act; canEdit: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const nations = nationsOf(team);
  return (
    <div className="mt-2 grid gap-1.5">
      {teamMembers(team).map((id, index) => {
        if (!id) return null;
        const who = person(state, id);
        const current = team.assign[id] ?? "";
        return (
          <div key={id} className="flex items-center gap-2 text-[12.5px]">
            <Avatar name={who?.name ?? "?"} color={team.color} size={20} />
            <span className="min-w-0 flex-1 truncate font-semibold">{who?.name ?? id}</span>
            <span className="w-[74px] shrink-0 text-[11px]" style={{ color: "var(--gg-fg-3)" }}>
              {SLOT_ROLE[index]}
            </span>
            {canEdit ? (
              <select
                aria-label={`Nation for ${who?.name ?? "player"}`}
                className="gg-input h-8 w-[128px] text-xs"
                style={{ borderColor: current ? "var(--gg-line-2)" : "var(--gg-pending)" }}
                value={current}
                onChange={async (event) => setError(await act({ kind: "assign.set", team: team.id, person: id, tag: event.target.value }))}
              >
                <option value="">Choose a nation…</option>
                {nations.map((tag) => (
                  <option key={tag} value={tag}>
                    {nationName(state, tag)}
                  </option>
                ))}
              </select>
            ) : current ? (
              <span className="flex w-[128px] items-center gap-1.5 text-xs">
                <Flag tag={current} w={20} h={13} /> {nationName(state, current)}
              </span>
            ) : (
              <span className="w-[128px] text-xs" style={{ color: "var(--gg-pending)" }}>
                Not placed yet
              </span>
            )}
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-xs" style={{ color: "#ff9b9b" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function SnakeWheel({ state }: { state: GGState }) {
  const order = draftOrder(state.teams, state.config.majors);
  const byId = new Map(state.teams.map((team) => [team.id, team]));
  const cx = 110;
  const cy = 110;
  const r1 = 100;
  const r2 = 72;
  const P = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  const current = state.turn.pick ? state.turn.pick - 1 : -1;
  return (
    <div className="flex items-center gap-3 px-3.5 pb-2">
      <svg width="190" height="190" viewBox="0 0 220 220" role="img" aria-label={`Snake draft: pick ${state.turn.pick ?? 21} of 21`}>
        {order.map((slot, i) => {
          const a0 = ((-90 + (i * 360) / 21 + 1.3) * Math.PI) / 180;
          const a1 = ((-90 + ((i + 1) * 360) / 21 - 1.3) * Math.PI) / 180;
          const team = byId.get(slot.team)!;
          const pick = team.picks[slot.round - 1];
          const isCurrent = i === current;
          const am = ((-90 + (i + 0.5) * (360 / 21)) * Math.PI) / 180;
          return (
            <g key={i}>
              <path
                d={`M${P(r1, a0)} A${r1} ${r1} 0 0 1 ${P(r1, a1)} L${P(r2, a1)} A${r2} ${r2} 0 0 0 ${P(r2, a0)} Z`}
                fill={pick ? team.color : isCurrent ? "#ffd23f" : "transparent"}
                fillOpacity={pick ? 0.85 : 1}
                stroke={isCurrent ? "#ffd23f" : team.color}
                strokeWidth={isCurrent ? 2 : 1.2}
                strokeOpacity={pick ? 0 : 0.85}
                style={isCurrent ? { filter: "drop-shadow(0 0 8px #ffd23f)" } : undefined}
              >
                <title>{`Pick ${slot.pick} · ${team.name}${pick ? ` · ${nationName(state, pick)}` : ""}`}</title>
              </path>
              {pick && <image href={`/assets_rt56/flags/${pick}.png`} x={cx + 86 * Math.cos(am) - 8} y={cy + 86 * Math.sin(am) - 5} width="16" height="10" />}
            </g>
          );
        })}
        {[7, 14].map((i) => {
          const a = ((-90 + (i * 360) / 21) * Math.PI) / 180;
          return <line key={i} x1={cx + 66 * Math.cos(a)} y1={cy + 66 * Math.sin(a)} x2={cx + 106 * Math.cos(a)} y2={cy + 106 * Math.sin(a)} stroke="#fff" strokeWidth="1.5" strokeOpacity=".6" />;
        })}
        <text x="110" y="100" textAnchor="middle" fill="#b9aee0" fontSize="11" letterSpacing="2">
          PICK
        </text>
        <text x="110" y="132" textAnchor="middle" fill="#fff" fontSize="36" fontWeight="900" fontFamily="var(--gg-display)">
          {state.turn.pick ?? 21}
        </text>
        <text x="110" y="148" textAnchor="middle" fill="#8a7fb0" fontSize="10">
          of 21
        </text>
      </svg>
      <div className="min-w-0 text-[11.5px] leading-relaxed" style={{ color: "var(--gg-fg-2)" }}>
        <div>Round {state.turn.round ?? 3}</div>
        <div style={{ color: "var(--gg-fg-3)" }}>Next</div>
        {order.slice(current + 1, current + 4).map((slot) => {
          const team = byId.get(slot.team)!;
          return (
            <div key={slot.pick} className="truncate font-bold" style={{ color: team.color }}>
              {team.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinalTable({ state }: { state: GGState }) {
  return (
    <div className="grid gap-2 px-3 pb-4">
      {strengthOrder(state.teams, state.config.majors).map((team) => (
        <div key={team.id}>
          <div className="flex h-6 items-center gap-2 rounded px-2" style={{ background: team.color, color: "#120a24" }}>
            <span className="gg-disp text-base font-black">{team.name}</span>
            <span className="ml-auto text-[11px] font-bold">{nationName(state, team.major)}</span>
          </div>
          {teamMembers(team).map((id, index) => {
            const tag = id ? team.assign[id] : null;
            return (
              <div key={index} className="flex h-[22px] items-center gap-2 px-2 text-xs">
                <Flag tag={tag} w={20} h={13} />
                <span className="w-[112px] truncate" style={{ color: "var(--gg-fg-2)" }}>
                  {nationName(state, tag) || "—"}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{person(state, id)?.name ?? "—"}</span>
                <span className="text-[11px]" style={{ color: "var(--gg-fg-3)" }}>
                  {SLOT_ROLE[index]}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function finalText(state: GGState): string {
  return strengthOrder(state.teams, state.config.majors)
    .map((team) => {
      const lines = teamMembers(team).map((id) => {
        const tag = id ? team.assign[id] : null;
        return `${nationName(state, tag) || "—"}: ${person(state, id)?.name ?? "—"}`;
      });
      return `**${team.name}**\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

const TITLES: Record<string, string> = {
  teams: "Teams",
  drum: "Captain order",
  wheel: "Majors",
  vice: "Vice-captains",
  recruits: "Recruits",
  bans: "Bans",
  draft: "Draft",
  assign: "Assign players",
};

export default function GGTeamStack({ state, viewer, act }: { state: GGState; viewer: GGViewerInfo; act: Act }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const turnTeam = state.turn.team;
  const expanded = open ?? (state.phase === "assign" || state.phase === "teams" ? viewer.captainOf : turnTeam);

  if (state.phase === "locked") {
    return (
      <>
        <div className="flex items-baseline justify-between gap-3 pb-2 pl-3.5 pr-14 pt-3.5">
          <span className="gg-disp text-2xl font-black">Final lobby</span>
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: "var(--gg-cyan)" }}
            onClick={() => {
              void navigator.clipboard?.writeText(finalText(state)).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy for Discord"}
          </button>
        </div>
        <FinalTable state={state} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-baseline justify-between gap-3 pb-2 pl-3.5 pr-14 pt-3.5">
        <span className="gg-disp text-2xl font-black">{TITLES[state.phase]}</span>
        <span className="text-xs" style={{ color: "var(--gg-fg-3)" }}>
          {state.phase === "bans" ? "strongest first" : state.phase === "draft" ? "snake order" : ""}
        </span>
      </div>
      {state.phase === "draft" && <SnakeWheel state={state} />}
      {orderFor(state).map((team, index) => {
        const isOpen = expanded === team.id;
        const onClock = turnTeam === team.id;
        const header = (
          <>
            <span className="h-[30px] w-1 shrink-0 rounded" style={{ background: team.color }} />
            <span className="gg-digit w-3 shrink-0 text-[11px]" style={{ color: "var(--gg-fg-3)" }}>
              {index + 1}
            </span>
            <Flag tag={team.major} w={isOpen ? 36 : 30} h={isOpen ? 23 : 19} title={nationName(state, team.major)} />
            <span className="min-w-0 flex-1 text-left">
              <span className="gg-disp block truncate leading-none" style={{ fontWeight: isOpen ? 800 : 700, fontSize: isOpen ? 22 : 18 }}>
                {team.name}
              </span>
              <span className="block truncate text-[11.5px]" style={{ color: isOpen && onClock ? "var(--gg-cyan)" : "var(--gg-fg-3)", fontWeight: isOpen && onClock ? 600 : 400 }}>
                {isOpen && onClock ? "ON THE CLOCK" : subline(state, team)}
              </span>
            </span>
            <RowEnd state={state} team={team} />
          </>
        );
        if (!isOpen) {
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => setOpen(team.id)}
              className="flex h-12 w-full items-center gap-2.5 border-b px-3.5"
              style={{ borderColor: "#22173f" }}
            >
              {header}
            </button>
          );
        }
        const mine = viewer.captainOf === team.id;
        return (
          <div
            key={team.id}
            className="mx-2 my-1.5 rounded-[10px] p-3"
            style={{ background: hexA(team.color, 0.1), border: `1px solid ${hexA(team.color, 0.7)}`, boxShadow: `0 0 20px ${hexA(team.color, 0.25)}` }}
          >
            <button type="button" className="flex w-full items-center gap-2.5" onClick={() => setOpen(open === team.id ? "" : team.id)}>
              {header}
            </button>
            {state.phase === "assign" ? (
              <AssignList state={state} team={team} act={act} canEdit={(mine || viewer.organizer) && state.phase === "assign"} />
            ) : (
              <div className="mt-2 grid gap-0.5">
                {teamMembers(team).map((id, slot) => {
                  const who = person(state, id);
                  return (
                    <div key={slot} className="flex h-6 items-center gap-2 text-[12.5px]">
                      {who ? (
                        <>
                          <Avatar name={who.name} color={team.color} size={20} />
                          <span className="min-w-0 truncate font-semibold">{who.name}</span>
                          {who.filler && <span className="text-[10px]" style={{ color: "var(--gg-pending)" }}>to be named</span>}
                        </>
                      ) : (
                        <>
                          <span className="h-5 w-5 shrink-0 rounded-full" style={{ border: "1.5px dashed var(--gg-line-2)" }} />
                          <span style={{ color: "var(--gg-fg-3)" }}>Not drawn yet</span>
                        </>
                      )}
                      <span className="ml-auto text-[11.5px]" style={{ color: "var(--gg-fg-3)" }}>
                        {SLOT_ROLE[slot]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {state.phase === "teams" && mine && !team.approved && <TeamSetupForm team={team} act={act} />}
          </div>
        );
      })}
    </>
  );
}
