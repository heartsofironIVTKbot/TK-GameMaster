"use client";

import { ArrowDown, ArrowUp, Copy, Pause, Play, RotateCcw, Search, Timer, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PHASE_LABEL, PHASES, type GGAction, type GGPerson, type GGPhase, type GGState, type GGTeam } from "@/lib/greatGame/model";
import { strengthOrder } from "@/lib/greatGame/engine";
import { describe } from "./GGLog";
import { Avatar, clock, nationName, person, secondsLeft, teamById } from "./ggUi";

/**
 * Organizer controls (Tommy and the organizers). Anything can be changed at
 * any time without touching code or the database: every change outside the
 * normal turn goes into the public log as a fix, with the reason typed here.
 *
 *  Run       a live cockpit: the step, whose turn, the clock (more time,
 *            restart), the step's main button (also on Space), pause, undo
 *            the last action, and every step on a rail to jump to
 *  Fix       stage changes to any team, review them, then apply them
 *  People    find anyone, replace someone who dropped out, add people
 *  Settings  the majors' ranking, turn clocks (with presets) and what a
 *            run-out clock does
 *  Fairness  the code for the announcement; reveal the seed after the lock
 *
 * Anything hard to take back asks first, in the panel.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;
type Tab = "run" | "fix" | "people" | "settings" | "fairness";

/** A question the panel asks before something hard to take back (with an optional reason). */
interface Ask {
  title: string;
  lines?: string[];
  yes: string;
  danger?: boolean;
  reason?: { placeholder: string; required: boolean };
  onYes: (reason: string) => Promise<void> | void;
}

function useSend(act: Act) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (body: Record<string, unknown>, done = "Done.") => {
    setBusy(true);
    const error = await act(body);
    setBusy(false);
    setMessage(error ? { ok: false, text: error } : { ok: true, text: done });
    return !error;
  };
  return { busy, message, setMessage, send };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className="gg-ctl-msg" style={{ color: message.ok ? "var(--gg-ok)" : "#ff9b9b" }}>
      {message.text}
    </p>
  );
}

/** The step's main button: what Tommy presses next (also on Space). */
function primaryOf(state: GGState): { label: string; body: Record<string, unknown>; ask?: string } | null {
  const turn = teamById(state, state.turn.team);
  const index = PHASES.indexOf(state.phase);
  const next = PHASES[index + 1];
  if (state.phase === "drum" && !state.phase_done) return { label: "Draw the next ball", body: { kind: "drum.draw" } };
  if (state.phase === "wheel" && turn) return { label: `Spin for ${turn.name}`, body: { kind: "wheel.spin" } };
  if (state.phase === "vice" && turn) return { label: `Scratch for ${turn.name}`, body: { kind: "vice.draw" } };
  if (state.phase === "recruits" && turn) return { label: `Flip for ${turn.name}`, body: { kind: "recruit.draw" } };
  if (state.phase === "assign" && !state.phase_done)
    return { label: "Place everyone left now", body: { kind: "assign.auto", reason: "Organizer closed the window" }, ask: "Place every player who isn't placed yet at random, and close the window?" };
  if (state.phase_done && next) return { label: `Next: ${PHASE_LABEL[next]}`, body: { kind: "phase.set", phase: next } };
  return null;
}

/** The last action that can be undone (not an undo, not already undone). */
function lastUndoable(state: GGState): GGAction | null {
  const undone = new Set(state.log.filter((entry) => entry.kind === "undo").map((entry) => Number(entry.payload.seq)));
  return [...state.log].reverse().find((entry) => entry.kind !== "undo" && !undone.has(entry.seq)) ?? null;
}

function RunTab({ state, act, now, ask }: { state: GGState; act: Act; now: number; ask: (question: Ask) => void }) {
  const { busy, message, send } = useSend(act);
  const index = PHASES.indexOf(state.phase);
  const turn = teamById(state, state.turn.team);
  const primary = primaryOf(state);
  const left = secondsLeft(state, now);
  const timed = state.turn.seconds !== null && state.turn.started_at !== null;
  const last = lastUndoable(state);
  return (
    <div className="grid gap-4">
      {/* Where we are. */}
      <div className="gg-ctl-now" style={{ ["--team" as string]: turn?.color ?? "#ff2bd6" }}>
        <div className="min-w-0 flex-1">
          <div className="gg-label">Now · step {index}</div>
          <div className="gg-ctl-step">{PHASE_LABEL[state.phase]}</div>
          <div className="gg-ctl-sub">
            {state.phase_done ? (
              <b style={{ color: "var(--gg-ok)" }}>This step is complete.</b>
            ) : turn ? (
              <>
                <span className="gg-ctl-chip" style={{ ["--team" as string]: turn.color }}>
                  {turn.name}
                </span>{" "}
                is up
              </>
            ) : (
              "In progress"
            )}
            {state.paused && <b className="gg-ctl-paused">Paused</b>}
          </div>
        </div>
        {left !== null && (
          <div className={`gg-ctl-clock ${left <= 10 ? "is-urgent" : ""}`} aria-label="Turn clock">
            {left <= 0 ? "0:00" : clock(left)}
          </div>
        )}
      </div>

      {/* The step's main button and pause. */}
      <div className="flex gap-2">
        {primary ? (
          <button
            type="button"
            className="gg-ctl-primary"
            disabled={busy || (state.paused && primary.body.kind !== "phase.set")}
            onClick={() => {
              if (primary.ask) ask({ title: primary.ask, yes: primary.label, onYes: async () => void (await send(primary.body)) });
              else void send(primary.body);
            }}
          >
            {primary.label}
            <kbd>Space</kbd>
          </button>
        ) : (
          <div className="gg-ctl-primary is-idle">{state.phase === "locked" ? "The draft is over" : "Waiting on the captains"}</div>
        )}
        <button type="button" className="gg-btn h-auto px-4" disabled={busy} onClick={() => void send({ kind: "pause.set", on: !state.paused }, state.paused ? "Resumed." : "Paused.")}>
          {state.paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />} {state.paused ? "Resume" : "Pause"}
        </button>
      </div>

      {/* The clock. */}
      {timed && (
        <div className="grid gap-1.5">
          <div className="gg-label">Turn clock</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="gg-btn" disabled={busy} onClick={() => void send({ kind: "clock.set", add: 30 }, "+30 seconds.")}>
              <Timer size={15} aria-hidden /> +30 s
            </button>
            <button type="button" className="gg-btn" disabled={busy} onClick={() => void send({ kind: "clock.set", add: 60 }, "+1 minute.")}>
              <Timer size={15} aria-hidden /> +1 min
            </button>
            <button type="button" className="gg-btn" disabled={busy} onClick={() => void send({ kind: "clock.set", restart: true }, "Clock restarted.")}>
              <RotateCcw size={15} aria-hidden /> Restart clock
            </button>
          </div>
        </div>
      )}

      {/* Undo. */}
      {last && (
        <div className="grid gap-1.5">
          <div className="gg-label">Last action</div>
          <div className="gg-ctl-last">
            <span className="min-w-0 flex-1 truncate">{describe(state, last)}</span>
            <button
              type="button"
              className="gg-btn gg-btn-danger"
              disabled={busy}
              onClick={() =>
                ask({
                  title: "Undo the last action?",
                  lines: [describe(state, last), "Everyone sees it go back. It goes into the log as a fix."],
                  yes: "Undo it",
                  danger: true,
                  reason: { placeholder: "Why (shown in the log)", required: true },
                  onYes: async (reason) => void (await send({ kind: "undo", seq: last.seq, reason }, "Undone.")),
                })
              }
            >
              <Undo2 size={15} aria-hidden /> Undo
            </button>
          </div>
        </div>
      )}

      {/* Every step: jump to any. */}
      <div className="grid gap-1.5">
        <div className="gg-label">Steps</div>
        <div className="gg-ctl-rail">
          {PHASES.map((phase, i) => (
            <button
              key={phase}
              type="button"
              className={`gg-ctl-railstep ${i < index ? "is-done" : ""} ${i === index ? "is-now" : ""}`}
              disabled={busy || i === index}
              onClick={() => {
                const back = i < index;
                const normal = i === index + 1 && state.phase_done;
                if (normal) {
                  void send({ kind: "phase.set", phase }, `Now on ${PHASE_LABEL[phase]}.`);
                  return;
                }
                ask({
                  title: back ? `Go back to ${PHASE_LABEL[phase]}?` : `Jump to ${PHASE_LABEL[phase]}?`,
                  lines: [back ? "Nothing already done is lost." : `Step ${index} isn't complete.`, "It goes into the log as a fix."],
                  yes: back ? "Go back" : "Jump",
                  reason: { placeholder: "Why (shown in the log)", required: true },
                  onYes: async (reason) => void (await send({ kind: "phase.set", phase: phase as GGPhase, reason }, `Now on ${PHASE_LABEL[phase]}.`)),
                });
              }}
            >
              <b>{i}</b>
              <span>{PHASE_LABEL[phase]}</span>
            </button>
          ))}
        </div>
      </div>

      {state.phase === "teams" && (
        <div className="grid gap-1.5">
          <div className="gg-label">Approve teams</div>
          {state.teams.map((team) => (
            <div key={team.id} className="flex items-center gap-2 text-[13px]">
              <span className="h-4 w-4 rounded" style={{ background: team.color }} />
              <span className="flex-1 truncate">{team.name}</span>
              <button type="button" className="gg-btn" disabled={busy} onClick={() => void send({ kind: "team.set", team: team.id, approved: !team.approved })}>
                {team.approved ? "Un-approve" : "Approve"}
              </button>
            </div>
          ))}
        </div>
      )}
      <Message message={message} />
    </div>
  );
}

/** One field of a team that the Fix tab can change. */
type Field = "major" | "captain" | "vice" | "r1" | "r2" | "ban" | "pick1" | "pick2" | "pick3";

function FixTab({ state, act, ask }: { state: GGState; act: Act; ask: (question: Ask) => void }) {
  const { busy, message, setMessage } = useSend(act);
  const [teamId, setTeamId] = useState(state.turn.team ?? state.teams[0].id);
  // Changes waiting to be applied: team id -> field -> new value.
  const [staged, setStaged] = useState<Record<string, Partial<Record<Field, string>>>>({});
  const [order, setOrder] = useState<string[] | null>(null);
  const team = teamById(state, teamId) as GGTeam;
  const current = (t: GGTeam, field: Field): string =>
    ({
      major: t.major ?? "",
      captain: t.captain,
      vice: t.vice ?? "",
      r1: t.recruits[0] ?? "",
      r2: t.recruits[1] ?? "",
      ban: t.ban ?? "",
      pick1: t.picks[0] ?? "",
      pick2: t.picks[1] ?? "",
      pick3: t.picks[2] ?? "",
    })[field];
  const value = (field: Field) => staged[teamId]?.[field] ?? current(team, field);
  const stage = (field: Field, next: string) =>
    setStaged((all) => {
      const forTeam = { ...(all[teamId] ?? {}) };
      if (next === current(team, field)) delete forTeam[field];
      else forTeam[field] = next;
      return { ...all, [teamId]: forTeam };
    });
  const byRole = (role: GGPerson["role"]) => state.config.people.filter((entry) => entry.role === role);
  const poolOptions = state.config.pool.map((tag) => ({ value: tag, label: nationName(state, tag) })).sort((a, b) => a.label.localeCompare(b.label));
  const peopleOptions = (role: GGPerson["role"]) => byRole(role).map((entry) => ({ value: entry.id, label: entry.name + (entry.filler ? " (filler)" : "") }));
  const labelOf = (field: Field, v: string) =>
    !v ? "empty" : ["captain", "vice", "r1", "r2"].includes(field) ? (person(state, v)?.name ?? v) : nationName(state, v);
  const FIELD_NAME: Record<Field, string> = { major: "Major", captain: "Captain", vice: "Vice-captain", r1: "Recruit 1", r2: "Recruit 2", ban: "Ban", pick1: "Pick 1", pick2: "Pick 2", pick3: "Pick 3" };
  const bodyOf = (t: GGTeam, field: Field, v: string): Record<string, unknown> => {
    if (field === "major") return { kind: "major.set", team: t.id, tag: v };
    if (field === "ban") return { kind: "ban.set", team: t.id, tag: v };
    if (field.startsWith("pick")) return { kind: "pick.set", team: t.id, round: Number(field.slice(4)), tag: v };
    return { kind: "member.set", team: t.id, slot: field, person: v };
  };
  const changes = Object.entries(staged).flatMap(([id, fields]) =>
    Object.entries(fields ?? {}).map(([field, v]) => ({ team: teamById(state, id) as GGTeam, field: field as Field, value: v as string })),
  );
  const orderChanged = order !== null && order.join(",") !== state.order.join(",");
  const count = changes.length + (orderChanged ? 1 : 0);

  const field = (f: Field, options: { value: string; label: string }[], empty = "— empty —") => {
    const changed = staged[teamId]?.[f] !== undefined;
    return (
      <label key={f} className="gg-ctl-field">
        <span>{FIELD_NAME[f]}</span>
        <select className={`gg-input ${changed ? "is-changed" : ""}`} value={value(f)} disabled={busy} onChange={(event) => stage(f, event.target.value)}>
          {f !== "captain" && <option value="">{empty}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  };
  const drumOrder = order ?? (state.order.length ? state.order : state.teams.map((t) => t.id));

  return (
    <div className="grid gap-3">
      <p className="gg-ctl-help">Pick a team, change what you need (changes wait here, outlined in pink), then review and apply them. Applied fixes go into the public log.</p>
      <div className="gg-ctl-teams">
        {state.teams.map((entry) => {
          const n = Object.keys(staged[entry.id] ?? {}).length;
          return (
            <button key={entry.id} type="button" className={`gg-ctl-teamchip ${entry.id === teamId ? "is-on" : ""}`} style={{ ["--team" as string]: entry.color }} onClick={() => setTeamId(entry.id)}>
              {entry.name}
              {n > 0 && <b>{n}</b>}
            </button>
          );
        })}
      </div>
      <div className="gg-ctl-group">
        <div className="gg-label">Players</div>
        {field("captain", peopleOptions("captain"))}
        {field("vice", peopleOptions("vice"))}
        {field("r1", peopleOptions("recruit"))}
        {field("r2", peopleOptions("recruit"))}
      </div>
      <div className="gg-ctl-group">
        <div className="gg-label">Nations</div>
        {field(
          "major",
          state.config.majors.map((tag) => ({ value: tag, label: nationName(state, tag) })),
        )}
        {field("ban", poolOptions, team.ban === "" ? "— lost —" : "— none —")}
        {field("pick1", poolOptions)}
        {field("pick2", poolOptions)}
        {field("pick3", poolOptions)}
      </div>
      <div className="gg-ctl-group">
        <div className="gg-label">Captain order (the drum)</div>
        {drumOrder.map((id, i) => (
          <div key={id} className="flex items-center gap-2 text-[13px]">
            <span className="gg-digit w-4 text-xs" style={{ color: "var(--gg-fg-3)" }}>
              {i + 1}
            </span>
            <span className="h-3 w-3 rounded-sm" style={{ background: teamById(state, id)?.color }} />
            <span className="flex-1 truncate">{teamById(state, id)?.name}</span>
            {[-1, 1].map((by) => (
              <button
                key={by}
                type="button"
                className="gg-btn h-7 min-h-0 px-2"
                disabled={i + by < 0 || i + by >= drumOrder.length}
                aria-label={by < 0 ? "Move up" : "Move down"}
                onClick={() => {
                  const next = [...drumOrder];
                  [next[i], next[i + by]] = [next[i + by], next[i]];
                  setOrder(next);
                }}
              >
                {by < 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="gg-ctl-apply">
        <button type="button" className="gg-btn" disabled={!count || busy} onClick={() => (setStaged({}), setOrder(null))}>
          Discard
        </button>
        <button
          type="button"
          className="gg-btn gg-btn-primary flex-1"
          disabled={!count || busy}
          onClick={() =>
            ask({
              title: `Apply ${count} change${count === 1 ? "" : "s"}?`,
              lines: [
                ...changes.map((c) => `${c.team.name}: ${FIELD_NAME[c.field]} ${labelOf(c.field, current(c.team, c.field))} → ${labelOf(c.field, c.value)}`),
                ...(orderChanged ? [`Captain order: ${drumOrder.map((id) => teamById(state, id)?.name).join(", ")}`] : []),
              ],
              yes: "Apply",
              reason: { placeholder: "Why (shown in the log)", required: true },
              onYes: async (reason) => {
                for (const c of changes) {
                  const error = await act({ ...bodyOf(c.team, c.field, c.value), reason });
                  if (error) {
                    setMessage({ ok: false, text: `${c.team.name} ${FIELD_NAME[c.field]}: ${error}` });
                    return;
                  }
                }
                if (orderChanged) {
                  const error = await act({ kind: "order.set", order: drumOrder, reason });
                  if (error) {
                    setMessage({ ok: false, text: error });
                    return;
                  }
                }
                setStaged({});
                setOrder(null);
                setMessage({ ok: true, text: "Applied. It's in the log." });
              },
            })
          }
        >
          Review &amp; apply{count ? ` (${count})` : ""}
        </button>
      </div>
      <Message message={message} />
    </div>
  );
}

const ROLE_GROUPS: { role: GGPerson["role"]; label: string }[] = [
  { role: "organizer", label: "Organizers" },
  { role: "captain", label: "Captains" },
  { role: "vice", label: "Vice-captains" },
  { role: "recruit", label: "Recruits" },
  { role: "caster", label: "Casters" },
];

function PeopleTab({ state, act }: { state: GGState; act: Act }) {
  const { busy, message, send } = useSend(act);
  const [query, setQuery] = useState("");
  const [replaces, setReplaces] = useState("");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<GGPerson["role"]>("recruit");
  const [channel, setChannel] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const replaced = person(state, replaces);
  const teamOf = (personId: string) => state.teams.find((t) => [t.captain, t.vice, ...t.recruits].includes(personId)) ?? null;
  const q = query.trim().toLowerCase();
  return (
    <div className="grid gap-3">
      <form
        ref={formRef}
        className="gg-ctl-group"
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await send(
            {
              kind: "person.set",
              person: { id: id.trim(), name: name.trim(), role: replaced?.role ?? role, channel: channel.trim() || null },
              replaces: replaces || undefined,
              reason: replaces ? `${name.trim()} replaces ${replaced?.name}` : `${name.trim()} added`,
            },
            replaces ? "Replaced everywhere." : "Added.",
          );
          if (ok) {
            setId("");
            setName("");
            setChannel("");
            setReplaces("");
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="gg-label">{replaced ? `Replace ${replaced.name}` : "Add someone"}</div>
          {replaced && (
            <button type="button" className="gg-btn h-7 min-h-0 px-2 text-xs" onClick={() => setReplaces("")}>
              Cancel
            </button>
          )}
        </div>
        <input className="gg-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" aria-label="Name" required />
        <input
          className="gg-input"
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="Discord user id (18–19 digits)"
          aria-label="Discord user id"
          inputMode="numeric"
          required
        />
        {!replaced && (
          <select className="gg-input" value={role} onChange={(event) => setRole(event.target.value as GGPerson["role"])} aria-label="Role">
            {ROLE_GROUPS.map((group) => (
              <option key={group.role} value={group.role}>
                {group.label.slice(0, -1)}
              </option>
            ))}
          </select>
        )}
        <input className="gg-input" value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="Channel link (content creators, optional)" aria-label="Channel link" />
        <button type="submit" className="gg-btn gg-btn-primary" disabled={busy}>
          {replaced ? `Replace ${replaced.name}` : "Add"}
        </button>
        <p className="gg-ctl-help">A replacement takes over the old person&apos;s team slot and nation. Right-click a name in Discord → Copy User ID.</p>
      </form>
      <Message message={message} />
      <label className="gg-pool-search">
        <Search size={14} aria-hidden />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find someone" aria-label="Find someone" />
      </label>
      {ROLE_GROUPS.map((group) => {
        const people = state.config.people.filter((entry) => entry.role === group.role && (!q || entry.name.toLowerCase().includes(q) || entry.id.includes(q)));
        if (!people.length) return null;
        return (
          <div key={group.role} className="grid gap-1">
            <div className="gg-label">{group.label}</div>
            {people.map((entry) => {
              const team = teamOf(entry.id);
              return (
                <div key={entry.id} className="gg-ctl-person" title={entry.id.startsWith("filler:") ? "Stand-in" : `Discord id ${entry.id}`}>
                  <Avatar id={entry.id} name={entry.name} color={team?.color ?? "#6b5b9a"} size={24} />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  {entry.filler && <span className="gg-ctl-tag is-filler">stand-in</span>}
                  {team && (
                    <span className="gg-ctl-tag" style={{ ["--team" as string]: team.color }}>
                      {team.name}
                    </span>
                  )}
                  <button
                    type="button"
                    className="gg-btn h-7 min-h-0 px-2 text-xs"
                    onClick={() => {
                      setReplaces(entry.id);
                      setName("");
                      setId("");
                      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Replace
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function SettingsTab({ state, act }: { state: GGState; act: Act }) {
  const { busy, message, send } = useSend(act);
  const [majors, setMajors] = useState(state.config.majors);
  const [timers, setTimers] = useState(state.config.timers);
  const [rules, setRules] = useState(state.config.on_timeout);
  const move = (index: number, by: number) => {
    const next = [...majors];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setMajors(next);
  };
  const ruleOptions = {
    ban: [
      ["wait", "Wait (organizers decide)"],
      ["skip", "Ban is lost"],
      ["random", "Random ban"],
    ],
    pick: [
      ["wait", "Wait (organizers decide)"],
      ["random", "Random pick"],
    ],
    assign: [
      ["random", "Place everyone left at random"],
      ["wait", "Wait (organizers decide)"],
    ],
  } as const;
  const presets = { ban: [60, 90, 120], pick: [60, 90, 120], assign: [300, 600, 900] } as const;
  const short = (seconds: number) => (seconds >= 120 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);
  return (
    <div className="grid gap-4">
      <div className="gg-ctl-group">
        <div className="gg-label">Majors, strongest first</div>
        <p className="gg-ctl-help">Bans go in this order; the draft starts from the bottom. Change it before the bans start.</p>
        {majors.map((tag, index) => (
          <div key={tag} className="flex items-center gap-2 py-0.5 text-[13px]">
            <span className="gg-digit w-4 text-xs" style={{ color: "var(--gg-fg-3)" }}>
              {index + 1}
            </span>
            <span className="flex-1">{nationName(state, tag)}</span>
            <button type="button" className="gg-btn h-7 min-h-0 px-2" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${nationName(state, tag)} up`}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="gg-btn h-7 min-h-0 px-2" disabled={index === majors.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${nationName(state, tag)} down`}>
              <ArrowDown size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="gg-ctl-group">
        <div className="gg-label">Turn clocks</div>
        {(["ban", "pick", "assign"] as const).map((key) => (
          <div key={key} className="grid gap-1.5">
            <div className="grid grid-cols-[64px_78px_1fr] items-center gap-2 text-[13px]">
              <label htmlFor={`gg-timer-${key}`} style={{ color: "var(--gg-fg-2)" }}>
                {key === "ban" ? "Ban" : key === "pick" ? "Pick" : "Assign"}
              </label>
              <input
                id={`gg-timer-${key}`}
                type="number"
                min={10}
                max={3600}
                className="gg-input"
                value={timers[key]}
                onChange={(event) => setTimers({ ...timers, [key]: Number(event.target.value) })}
              />
              <select className="gg-input" value={rules[key]} onChange={(event) => setRules({ ...rules, [key]: event.target.value as typeof rules.ban })} aria-label={`When the ${key} clock runs out`}>
                {ruleOptions[key].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1.5 pl-[72px]">
              {presets[key].map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className={`gg-ctl-preset ${timers[key] === seconds ? "is-on" : ""}`}
                  onClick={() => setTimers({ ...timers, [key]: seconds })}
                >
                  {short(seconds)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="gg-ctl-help">Seconds. The right column is what happens when a clock runs out. The assign clock is one window for all teams at once.</p>
      </div>
      <button
        type="button"
        className="gg-btn gg-btn-primary"
        disabled={busy}
        onClick={() => void send({ kind: "config.set", majors, timers, on_timeout: rules, reason: "Settings changed" }, "Saved.")}
      >
        Save settings
      </button>
      <Message message={message} />
    </div>
  );
}

function FairnessTab({ state, reveal, ask }: { state: GGState; reveal: () => Promise<string | null>; ask: (question: Ask) => void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3 text-[13px]">
      <p className="gg-ctl-help">
        Post this code in the announcement before the draft. It seals tonight&apos;s random results: once the teams lock, revealing the seed lets anyone check that every draw was
        decided before the event, and nobody could re-roll in secret.
      </p>
      <div className="gg-label">Fairness code</div>
      <div className="flex items-center gap-2">
        <code className="gg-digit min-w-0 flex-1 break-all rounded p-2 text-[11px]" style={{ background: "#160d2e", border: "1px solid var(--gg-line)" }}>
          {state.fairness.commit}
        </code>
        <button
          type="button"
          className="gg-btn"
          onClick={() => void navigator.clipboard?.writeText(state.fairness.commit).then(() => setCopied(true), () => setCopied(false))}
          aria-label="Copy the fairness code"
        >
          <Copy size={14} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {state.fairness.seed ? (
        <>
          <div className="gg-label">Revealed seed</div>
          <code className="gg-digit break-all rounded p-2 text-[11px]" style={{ background: "#160d2e", border: "1px solid var(--gg-line)" }}>
            {state.fairness.seed}
          </code>
        </>
      ) : (
        <button
          type="button"
          className="gg-btn gg-btn-primary"
          disabled={state.phase !== "locked"}
          onClick={() =>
            ask({
              title: "Reveal the seed now?",
              lines: ["After this every draw of the night can be checked publicly."],
              yes: "Reveal",
              onYes: async () => {
                const error = await reveal();
                setMessage(error ? { ok: false, text: error } : { ok: true, text: "Revealed." });
              },
            })
          }
        >
          {state.phase === "locked" ? "Reveal the seed" : "Reveal the seed (after the teams lock)"}
        </button>
      )}
      <Message message={message} />
    </div>
  );
}

/** The panel's own "are you sure", with an optional reason for the log. */
function AskBar({ question, onClose }: { question: Ask; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !question.reason?.required || reason.trim().length > 0;
  return (
    <div className="gg-ctl-ask" role="alertdialog" aria-label={question.title}>
      <div className="gg-ctl-ask-title">{question.title}</div>
      {question.lines && (
        <ul className="gg-ctl-ask-lines">
          {question.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {question.reason && (
        <input className="gg-input" value={reason} maxLength={200} autoFocus placeholder={question.reason.placeholder} onChange={(event) => setReason(event.target.value)} />
      )}
      <div className="flex gap-2">
        <button type="button" className="gg-btn flex-1" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`gg-btn flex-1 ${question.danger ? "gg-btn-danger" : "gg-btn-primary"}`}
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            await question.onYes(reason.trim());
            setBusy(false);
            onClose();
          }}
        >
          {question.yes}
        </button>
      </div>
    </div>
  );
}

export default function GGControlPanel({
  state,
  act,
  reveal,
  onClose,
  now,
  viewers,
  live,
}: {
  state: GGState;
  act: Act;
  reveal: () => Promise<string | null>;
  onClose: () => void;
  now: number;
  viewers: number;
  live: boolean;
}) {
  const [tab, setTab] = useState<Tab>("run");
  const [question, setQuestion] = useState<Ask | null>(null);
  const tabs: [Tab, string][] = [
    ["run", "Run"],
    ["fix", "Fix"],
    ["people", "People"],
    ["settings", "Settings"],
    ["fairness", "Fairness"],
  ];
  // Space runs the step's main button (not while typing, or with a question open).
  const primary = useMemo(() => primaryOf(state), [state]);
  const stateRef = useRef({ primary, paused: state.paused, question });
  useEffect(() => {
    stateRef.current = { primary, paused: state.paused, question };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, button, [contenteditable]") || target.isContentEditable)) return;
      const { primary: action, paused, question: open } = stateRef.current;
      if (!action || open || (paused && action.body.kind !== "phase.set")) return;
      event.preventDefault();
      if (action.ask) setQuestion({ title: action.ask, yes: action.label, onYes: async () => void (await act(action.body)) });
      else void act(action.body);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  return (
    <aside className="gg-ctl" aria-label="Organizer controls">
      <div className="gg-ctl-head">
        <span className="gg-disp text-2xl font-black">Organizer controls</span>
        <span className={`gg-ctl-live ${live ? "" : "is-off"}`}>{live ? `● Live · ${viewers} watching` : "● Reconnecting"}</span>
        <button type="button" className="gg-btn h-8 min-h-0 px-2" onClick={onClose} aria-label="Close the controls">
          <X size={16} />
        </button>
      </div>
      <div role="tablist" className="gg-ctl-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={tab === id ? "is-on" : ""}>
            {label}
          </button>
        ))}
      </div>
      <div className="gg-scroll flex-1 p-4">
        {tab === "run" && <RunTab state={state} act={act} now={now} ask={setQuestion} />}
        {tab === "fix" && <FixTab state={state} act={act} ask={setQuestion} />}
        {tab === "people" && <PeopleTab state={state} act={act} />}
        {tab === "settings" && <SettingsTab state={state} act={act} />}
        {tab === "fairness" && <FairnessTab state={state} reveal={reveal} ask={setQuestion} />}
      </div>
      {question && <AskBar key={question.title} question={question} onClose={() => setQuestion(null)} />}
    </aside>
  );
}

export { strengthOrder };
