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
          <span key={team.ban} className="gg-ban-in relative inline-block" title={`Banned ${nationName(state, team.ban)}`}>
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
              <span key={`${index}:${pick}`} className="gg-ban-in inline-flex">
                <Flag tag={pick} w={24} h={16} title={nationName(state, pick)} />
              </span>
            ) : (
              <EmptySlot key={index} pulse={state.turn.team === team.id && state.turn.round === index + 1} />
            ),
          )}
        </span>
      );
    case "assign": {
      const placedBy = new Map(Object.entries(team.assign).map(([id, tag]) => [tag, id]));
      const all = teamMembers(team).every((id) => id && team.assign[id]);
      return (
        <span className="flex items-center gap-1">
          {nationsOf(team).map((tag) => {
            const id = placedBy.get(tag);
            const who = id ? person(state, id) : null;
            return (
              <span key={tag} className="gg-row-nation" title={`${nationName(state, tag)}${who ? ` · ${who.name}` : " · not placed yet"}`}>
                <Flag tag={tag} w={22} h={14} />
                {who ? (
                  <span key={who.id} className="gg-row-face gg-ban-in">
                    <Avatar id={who.id} name={who.name} color={team.color} size={14} />
                  </span>
                ) : (
                  <span className="gg-row-face is-empty" />
                )}
              </span>
            );
          })}
          {all && (
            <span className="gg-row-done" aria-label="Line-up set">
              ✓
            </span>
          )}
        </span>
      );
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

/** Who plays what in a team (step 7): the board at the bottom does the placing. */
function AssignList({ state, team }: { state: GGState; team: GGTeam }) {
  return (
    <div className="mt-2 grid gap-1.5">
      {teamMembers(team).map((id, index) => {
        if (!id) return null;
        const who = person(state, id);
        const current = team.assign[id] ?? "";
        return (
          <div key={id} className="flex items-center gap-2 text-[12.5px]">
            <Avatar id={who?.id} name={who?.name ?? "?"} color={team.color} size={20} />
            <span className="min-w-0 flex-1 truncate font-semibold">{who?.name ?? id}</span>
            <span className="w-[74px] shrink-0 text-[11px]" style={{ color: "var(--gg-fg-3)" }}>
              {SLOT_ROLE[index]}
            </span>
            {current ? (
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
    </div>
  );
}

/**
 * The draft's centrepiece: the 21 picks in snake order round a ring, three
 * rounds of seven. A picked segment fills with its team's colour and shows
 * the nation's flag; the pick on the clock glows yellow and pulses, with a
 * pointer outside the ring that sweeps on to the next segment after every
 * pick. In the middle: the team on the clock, its captain and the pick
 * number; under the ring, who picks next.
 */
function SnakeWheel({ state }: { state: GGState }) {
  const order = draftOrder(state.teams, state.config.majors);
  const byId = new Map(state.teams.map((team) => [team.id, team]));
  const SIZE = 250;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r1 = 118;
  const r2 = 80;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const P = (r: number, deg: number) => `${(cx + r * Math.cos(rad(deg))).toFixed(1)},${(cy + r * Math.sin(rad(deg))).toFixed(1)}`;
  const seg = 360 / 21;
  const current = state.turn.pick ? state.turn.pick - 1 : -1;
  const onClock = current >= 0 ? byId.get(order[current].team) : null;
  const captain = onClock ? person(state, onClock.captain) : null;
  const done = current < 0;
  const next = done ? [] : order.slice(current + 1, current + 4);
  return (
    <div className="gg-snake">
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={done ? "Snake draft: every pick is in" : `Snake draft: pick ${current + 1} of 21`}>
          {order.map((slot, i) => {
            const a0 = -90 + i * seg + 0.9;
            const a1 = -90 + (i + 1) * seg - 0.9;
            const am = -90 + (i + 0.5) * seg;
            const team = byId.get(slot.team)!;
            const pick = team.picks[slot.round - 1];
            const isNow = i === current;
            return (
              <g key={i}>
                <path
                  className={isNow ? "gg-snake-now" : undefined}
                  d={`M${P(r1, a0)} A${r1} ${r1} 0 0 1 ${P(r1, a1)} L${P(r2, a1)} A${r2} ${r2} 0 0 0 ${P(r2, a0)} Z`}
                  fill={pick ? team.color : isNow ? "#ffd23f" : hexA(team.color, 0.14)}
                  fillOpacity={pick ? 0.92 : 1}
                  stroke={isNow ? "#fff3b0" : team.color}
                  strokeWidth={isNow ? 2 : 1.2}
                  strokeOpacity={pick ? 0.4 : 0.9}
                >
                  <title>{`Pick ${slot.pick} · Round ${slot.round} · ${team.name}${pick ? ` · ${nationName(state, pick)}` : ""}`}</title>
                </path>
                {pick && (
                  <image
                    href={`/assets_rt56/flags/${pick}.png`}
                    x={cx + 99 * Math.cos(rad(am)) - 10}
                    y={cy + 99 * Math.sin(rad(am)) - 6.5}
                    width="20"
                    height="13"
                    preserveAspectRatio="none"
                  />
                )}
              </g>
            );
          })}
          {/* Round boundaries, and their numbers just outside the ring. */}
          {[0, 7, 14].map((i, round) => {
            const a = -90 + i * seg;
            const al = -90 + (i + 3.5) * seg;
            return (
              <g key={i}>
                <line x1={cx + (r2 - 4) * Math.cos(rad(a))} y1={cy + (r2 - 4) * Math.sin(rad(a))} x2={cx + (r1 + 4) * Math.cos(rad(a))} y2={cy + (r1 + 4) * Math.sin(rad(a))} stroke="#fff" strokeWidth="2.2" strokeOpacity=".75" />
                <text x={cx + 70 * Math.cos(rad(al))} y={cy + 70 * Math.sin(rad(al)) + 3.5} textAnchor="middle" fill="#8a7fb0" fontSize="9.5" fontWeight="800" letterSpacing="1">
                  R{round + 1}
                </text>
              </g>
            );
          })}
          {/* The pointer, sweeping on to the pick on the clock. */}
          {!done && (
            <g className="gg-snake-pointer" style={{ transform: `rotate(${(current + 0.5) * seg}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
              <path d={`M${cx - 7},${cy - r1 - 13} L${cx + 7},${cy - r1 - 13} L${cx},${cy - r1 - 3} Z`} fill="#ffd23f" style={{ filter: "drop-shadow(0 0 5px #ffd23f)" }} />
            </g>
          )}
        </svg>
        {/* The middle: who's on the clock. */}
        <div className="gg-snake-mid">
          {onClock ? (
            <>
              <Avatar id={onClock.captain} name={captain?.name ?? onClock.name} color={onClock.color} size={40} />
              <span className="gg-snake-team" style={{ color: onClock.color }}>
                {onClock.name}
              </span>
              <span className="gg-snake-pick">
                Pick <b>{current + 1}</b> / 21
              </span>
            </>
          ) : (
            <span className="gg-snake-team">All 21 in</span>
          )}
        </div>
      </div>
      {next.length > 0 && (
        <div className="gg-snake-next">
          <span className="gg-snake-next-label">Next</span>
          {next.map((slot) => {
            const team = byId.get(slot.team)!;
            return (
              <span key={slot.pick} className="gg-snake-chip" style={{ ["--team" as string]: team.color }}>
                <b>{slot.pick}</b> {team.name}
              </span>
            );
          })}
        </div>
      )}
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
            {team.major ? (
              <Flag tag={team.major} w={isOpen ? 36 : 30} h={isOpen ? 23 : 19} title={nationName(state, team.major)} />
            ) : (
              // No major yet: the captain's picture stands for the team.
              <span className="flex w-[30px] shrink-0 justify-center">
                <Avatar id={team.captain} name={person(state, team.captain)?.name ?? team.name} color={team.color} size={isOpen ? 28 : 24} />
              </span>
            )}
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
              <AssignList state={state} team={team} />
            ) : (
              <div className="mt-2 grid gap-0.5">
                {teamMembers(team).map((id, slot) => {
                  const who = person(state, id);
                  return (
                    <div key={slot} className="flex h-6 items-center gap-2 text-[12.5px]">
                      {who ? (
                        <>
                          <Avatar id={who.id} name={who.name} color={team.color} size={20} />
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
