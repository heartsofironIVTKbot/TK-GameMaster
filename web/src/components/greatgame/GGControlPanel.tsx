"use client";

import { ArrowDown, ArrowUp, Copy, Pause, Play, X } from "lucide-react";
import { useState } from "react";
import { PHASE_LABEL, PHASES, type GGPerson, type GGState, type GGTeam } from "@/lib/greatGame/model";
import { strengthOrder } from "@/lib/greatGame/engine";
import { nationName, person, teamById } from "./ggUi";

/**
 * Organizer controls (Tommy and the organizers). Anything can be changed at
 * any time without touching code or the database: every change outside the
 * normal turn goes into the public log as a fix, with the reason typed here.
 *
 *  Run       move between steps, pause, run the current step's draw
 *  Fix       set any team's major, players, ban or picks directly
 *  People    replace someone who dropped out, name the filler vice-captain
 *  Settings  the majors' ranking, turn clocks and what a run-out clock does
 *  Fairness  the code for the announcement; reveal the seed after the lock
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;
type Tab = "run" | "fix" | "people" | "settings" | "fairness";

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
  return { busy, message, send };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className="mt-2 text-xs" style={{ color: message.ok ? "var(--gg-ok)" : "#ff9b9b" }}>
      {message.text}
    </p>
  );
}

function RunTab({ state, act }: { state: GGState; act: Act }) {
  const { busy, message, send } = useSend(act);
  const index = PHASES.indexOf(state.phase);
  const next = PHASES[index + 1];
  const prev = PHASES[index - 1];
  const turn = teamById(state, state.turn.team);
  const quick: { label: string; body: Record<string, unknown> }[] = [];
  if (state.phase === "drum" && !state.phase_done) quick.push({ label: "Draw the next ball", body: { kind: "drum.draw" } });
  if (state.phase === "wheel" && turn) quick.push({ label: `Spin for ${turn.name}`, body: { kind: "wheel.spin" } });
  if (state.phase === "vice" && turn) quick.push({ label: `Scratch for ${turn.name}`, body: { kind: "vice.draw" } });
  if (state.phase === "recruits" && turn) quick.push({ label: `Flip for ${turn.name}`, body: { kind: "recruit.draw" } });
  if (state.phase === "assign" && !state.phase_done) quick.push({ label: "Place everyone left at random now", body: { kind: "assign.auto", reason: "Organizer closed the window" } });
  return (
    <div className="grid gap-4">
      <div className="rounded-lg p-3" style={{ background: "#160d2e", border: "1px solid var(--gg-line)" }}>
        <div className="gg-label">Now</div>
        <div className="gg-disp mt-1 text-2xl font-black">
          Step {index} · {PHASE_LABEL[state.phase]}
        </div>
        <div className="mt-1 text-[13px]" style={{ color: state.phase_done ? "var(--gg-ok)" : "var(--gg-fg-2)" }}>
          {state.phase_done ? "This step is complete." : turn ? `${turn.name} is up.` : "In progress."}
          {state.paused && <b style={{ color: "var(--gg-pending)" }}> Paused.</b>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {next && (
          <button
            type="button"
            className="gg-btn gg-btn-primary gg-btn-big flex-1"
            disabled={busy}
            onClick={() => {
              if (!state.phase_done && !window.confirm(`Step ${index} isn't complete. Move on to ${PHASE_LABEL[next]} anyway? It goes into the log as a fix.`)) return;
              void send({ kind: "phase.set", phase: next, reason: state.phase_done ? null : "Moved on early" }, `Now on ${PHASE_LABEL[next]}.`);
            }}
          >
            Next: {PHASE_LABEL[next]}
          </button>
        )}
        <button type="button" className="gg-btn" disabled={busy} onClick={() => void send({ kind: "pause.set", on: !state.paused }, state.paused ? "Resumed." : "Paused.")}>
          {state.paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />} {state.paused ? "Resume" : "Pause"}
        </button>
        {prev && (
          <button
            type="button"
            className="gg-btn"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Go back to ${PHASE_LABEL[prev]}? Nothing already done is lost.`)) return;
              void send({ kind: "phase.set", phase: prev, reason: "Went back a step" }, `Back on ${PHASE_LABEL[prev]}.`);
            }}
          >
            Back to {PHASE_LABEL[prev]}
          </button>
        )}
      </div>
      {quick.length > 0 && (
        <div className="grid gap-2">
          <div className="gg-label">This step</div>
          {quick.map((entry) => (
            <button key={entry.label} type="button" className="gg-btn justify-start" disabled={busy || state.paused} onClick={() => void send(entry.body)}>
              {entry.label}
            </button>
          ))}
        </div>
      )}
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

function FixTab({ state, act }: { state: GGState; act: Act }) {
  const { busy, message, send } = useSend(act);
  const [teamId, setTeamId] = useState(state.turn.team ?? state.teams[0].id);
  const [reason, setReason] = useState("");
  const team = teamById(state, teamId) as GGTeam;
  const byRole = (role: GGPerson["role"]) => state.config.people.filter((entry) => entry.role === role);
  const fix = (body: Record<string, unknown>) => {
    if (!reason.trim()) {
      window.alert("Type a short reason first: it goes into the public log with the fix.");
      return;
    }
    void send({ ...body, reason: reason.trim() }, "Fixed. It's in the log.");
  };
  const row = (label: string, control: React.ReactNode) => (
    <label className="grid grid-cols-[96px_1fr] items-center gap-2 text-[13px]">
      <span style={{ color: "var(--gg-fg-2)" }}>{label}</span>
      {control}
    </label>
  );
  const select = (value: string, options: { value: string; label: string }[], onChange: (value: string) => void, empty = "— empty —") => (
    <select className="gg-input" value={value} disabled={busy} onChange={(event) => onChange(event.target.value)}>
      <option value="">{empty}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  const poolOptions = state.config.pool.map((tag) => ({ value: tag, label: nationName(state, tag) })).sort((a, b) => a.label.localeCompare(b.label));
  const peopleOptions = (role: GGPerson["role"]) => byRole(role).map((entry) => ({ value: entry.id, label: entry.name + (entry.filler ? " (filler)" : "") }));
  return (
    <div className="grid gap-3">
      <p className="text-[12.5px]" style={{ color: "var(--gg-fg-2)" }}>
        Changes apply at once for everyone and go into the public log as a fix. The turn moves to the first empty slot by itself.
      </p>
      {row("Reason", <input className="gg-input" value={reason} maxLength={200} placeholder="Captain misclicked, asked in voice" onChange={(event) => setReason(event.target.value)} />)}
      {row(
        "Team",
        <select className="gg-input" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
          {state.teams.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>,
      )}
      <div className="h-px" style={{ background: "var(--gg-line)" }} />
      {row("Major", select(team.major ?? "", state.config.majors.map((tag) => ({ value: tag, label: nationName(state, tag) })), (tag) => fix({ kind: "major.set", team: team.id, tag })))}
      {row("Captain", select(team.captain, peopleOptions("captain"), (id) => id && fix({ kind: "member.set", team: team.id, slot: "captain", person: id })))}
      {row("Vice-captain", select(team.vice ?? "", peopleOptions("vice"), (id) => fix({ kind: "member.set", team: team.id, slot: "vice", person: id })))}
      {row("Recruit 1", select(team.recruits[0] ?? "", peopleOptions("recruit"), (id) => fix({ kind: "member.set", team: team.id, slot: "r1", person: id })))}
      {row("Recruit 2", select(team.recruits[1] ?? "", peopleOptions("recruit"), (id) => fix({ kind: "member.set", team: team.id, slot: "r2", person: id })))}
      {row("Ban", select(team.ban ?? "", poolOptions, (tag) => fix({ kind: "ban.set", team: team.id, tag }), team.ban === "" ? "— lost —" : "— none —"))}
      {[0, 1, 2].map((round) =>
        row(`Pick ${round + 1}`, select(team.picks[round] ?? "", poolOptions, (tag) => fix({ kind: "pick.set", team: team.id, round: round + 1, tag }))),
      )}
      {row(
        "Drum order",
        <button
          type="button"
          className="gg-btn"
          disabled={busy}
          onClick={() => {
            const order = window.prompt(
              "Type the team names in drum order, separated by commas:",
              state.order.map((id) => teamById(state, id)?.name).join(", "),
            );
            if (order === null) return;
            const ids = order
              .split(",")
              .map((name) => state.teams.find((entry) => entry.name.toLowerCase() === name.trim().toLowerCase())?.id)
              .filter(Boolean);
            fix({ kind: "order.set", order: ids });
          }}
        >
          Edit the captain order
        </button>,
      )}
      <Message message={message} />
    </div>
  );
}

function PeopleTab({ state, act }: { state: GGState; act: Act }) {
  const { busy, message, send } = useSend(act);
  const [replaces, setReplaces] = useState("");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<GGPerson["role"]>("recruit");
  const [channel, setChannel] = useState("");
  const replaced = person(state, replaces);
  const groups: { role: GGPerson["role"]; label: string }[] = [
    { role: "organizer", label: "Organizers" },
    { role: "captain", label: "Captains" },
    { role: "vice", label: "Vice-captains" },
    { role: "recruit", label: "Recruits" },
    { role: "caster", label: "Casters" },
  ];
  return (
    <div className="grid gap-3">
      <form
        className="grid gap-2 rounded-lg p-3"
        style={{ background: "#160d2e", border: "1px solid var(--gg-line)" }}
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
        <div className="gg-label">Replace or add someone</div>
        <select className="gg-input" value={replaces} onChange={(event) => setReplaces(event.target.value)} aria-label="Who to replace">
          <option value="">Add a new person (nobody replaced)</option>
          {state.config.people.map((entry) => (
            <option key={entry.id} value={entry.id}>
              Replace {entry.name}
              {entry.filler ? " (filler)" : ""}
            </option>
          ))}
        </select>
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
            {groups.map((group) => (
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
        <p className="text-[11.5px]" style={{ color: "var(--gg-fg-3)" }}>
          A replacement takes over the old person&apos;s team slot and nation. Right-click a name in Discord → Copy User ID.
        </p>
      </form>
      <Message message={message} />
      {groups.map((group) => (
        <div key={group.role}>
          <div className="gg-label mb-1">{group.label}</div>
          <div className="grid gap-0.5 text-[13px]">
            {state.config.people
              .filter((entry) => entry.role === group.role)
              .map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <span className="truncate">{entry.name}</span>
                  {entry.filler && <span className="text-[11px]" style={{ color: "var(--gg-pending)" }}>filler</span>}
                  <span className="gg-digit ml-auto text-[10.5px]" style={{ color: "var(--gg-fg-3)" }}>
                    {entry.id.startsWith("filler:") ? "" : entry.id}
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
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
  return (
    <div className="grid gap-4">
      <div>
        <div className="gg-label mb-1">Majors, strongest first</div>
        <p className="mb-2 text-[12px]" style={{ color: "var(--gg-fg-3)" }}>
          Bans go in this order; the draft starts from the bottom. Change it before the bans start.
        </p>
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
      <div className="grid gap-2">
        <div className="gg-label">Turn clocks</div>
        {(["ban", "pick", "assign"] as const).map((key) => (
          <div key={key} className="grid grid-cols-[70px_80px_1fr] items-center gap-2 text-[13px]">
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
        ))}
        <p className="text-[12px]" style={{ color: "var(--gg-fg-3)" }}>
          Seconds. The right column is what happens when a clock runs out.
        </p>
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

function FairnessTab({ state, reveal }: { state: GGState; reveal: () => Promise<string | null> }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3 text-[13px]">
      <p style={{ color: "var(--gg-fg-2)" }}>
        Post this code in the announcement before the draft. It seals tonight&apos;s random results: once the teams lock, revealing the seed lets anyone check that every
        draw was decided before the event, and nobody could re-roll in secret.
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
          onClick={async () => {
            if (!window.confirm("Reveal the seed now? After this every draw of the night can be checked publicly.")) return;
            const error = await reveal();
            setMessage(error ? { ok: false, text: error } : { ok: true, text: "Revealed." });
          }}
        >
          {state.phase === "locked" ? "Reveal the seed" : "Reveal the seed (after the teams lock)"}
        </button>
      )}
      <Message message={message} />
    </div>
  );
}

export default function GGControlPanel({
  state,
  act,
  reveal,
  onClose,
}: {
  state: GGState;
  act: Act;
  reveal: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("run");
  const tabs: [Tab, string][] = [
    ["run", "Run"],
    ["fix", "Fix"],
    ["people", "People"],
    ["settings", "Settings"],
    ["fairness", "Fairness"],
  ];
  return (
    <aside className="gg-panel absolute bottom-0 right-0 top-[86px] z-[1200] flex w-[min(440px,100%)] flex-col" aria-label="Organizer controls">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="gg-disp text-2xl font-black">Organizer controls</span>
        <button type="button" className="gg-btn h-8 min-h-0 px-2" onClick={onClose} aria-label="Close the controls">
          <X size={16} />
        </button>
      </div>
      <div role="tablist" className="flex gap-1 border-b px-3 pt-3" style={{ borderColor: "var(--gg-line)" }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="px-3 pb-2 text-[13px] font-semibold"
            style={{ color: tab === id ? "var(--gg-fg)" : "var(--gg-fg-3)", borderBottom: `2px solid ${tab === id ? "var(--gg-pink)" : "transparent"}` }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="gg-scroll flex-1 p-4">
        {tab === "run" && <RunTab state={state} act={act} />}
        {tab === "fix" && <FixTab state={state} act={act} />}
        {tab === "people" && <PeopleTab state={state} act={act} />}
        {tab === "settings" && <SettingsTab state={state} act={act} />}
        {tab === "fairness" && <FairnessTab state={state} reveal={reveal} />}
      </div>
    </aside>
  );
}

export { strengthOrder };
