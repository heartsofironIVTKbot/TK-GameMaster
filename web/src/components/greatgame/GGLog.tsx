"use client";

import { Undo2, X } from "lucide-react";
import { useState } from "react";
import { PHASE_LABEL, type GGAction, type GGPerson, type GGPhase, type GGState } from "@/lib/greatGame/model";
import { nationName, person, teamById } from "./ggUi";

/**
 * The public log: every action of the night in plain words, newest first,
 * with who did it and when. Organizer fixes are marked with their reason, and
 * organizers can undo an action from here (the undo is logged too).
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

export function describe(state: GGState, action: GGAction): string {
  const p = action.payload;
  const team = teamById(state, typeof p.team === "string" ? p.team : null)?.name ?? "A team";
  const who = (id: unknown) => person(state, typeof id === "string" ? id : null)?.name ?? "someone";
  const nation = (tag: unknown) => nationName(state, typeof tag === "string" ? tag : null);
  switch (action.kind) {
    case "team.set": {
      const parts = [];
      if (typeof p.name === "string") parts.push(`named "${p.name}"`);
      if (typeof p.color === "string") parts.push(`coloured ${p.color}`);
      if (typeof p.approved === "boolean") parts.push(p.approved ? "approved" : "un-approved");
      return `${team} ${parts.join(", ")}`;
    }
    case "phase.set":
      return `Step: ${PHASE_LABEL[p.phase as GGPhase] ?? p.phase}`;
    case "pause.set":
      return p.on ? "Paused" : "Resumed";
    case "drum.draw":
      return `Drum: ${team} drawn`;
    case "order.set":
      return "Captain order changed";
    case "wheel.spin":
      return `Wheel: ${team} rolled ${nation(p.tag)}`;
    case "major.set":
      return p.tag ? `${team}'s major set to ${nation(p.tag)}` : `${team}'s major cleared`;
    case "vice.draw":
      return `${team} scratched ${who(p.person)} (vice-captain)`;
    case "recruit.draw":
      return `${team} flipped ${who(p.person)} (recruit)`;
    case "member.set":
      return p.person ? `${who(p.person)} put in ${team} (${String(p.slot)})` : `${team}'s ${String(p.slot)} slot emptied`;
    case "person.set": {
      const incoming = p.person as GGPerson;
      return p.replaces ? `${incoming.name} replaces ${who(p.replaces)}` : `${incoming.name} added as ${incoming.role}`;
    }
    case "config.set":
      return "Settings changed";
    case "ban.set":
      return p.tag ? `${team} banned ${nation(p.tag)}` : `${team}'s ban is lost`;
    case "pick.set":
      return p.tag ? `${team} picked ${nation(p.tag)} (round ${String(p.round)})` : `${team}'s round ${String(p.round)} pick cleared`;
    case "assign.set":
      return p.tag ? `${who(p.person)} plays ${nation(p.tag)} for ${team}` : `${who(p.person)} unplaced`;
    case "assign.auto":
      return `${(p.placements as unknown[])?.length ?? 0} players placed at random`;
    case "undo": {
      const target = state.log.find((entry) => entry.seq === Number(p.seq));
      return `Undid: ${target ? describe(state, target) : `#${String(p.seq)}`}`;
    }
    default:
      return action.kind;
  }
}

export default function GGLog({ state, organizer, act, onClose }: { state: GGState; organizer: boolean; act: Act; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const undone = new Set(state.log.filter((a) => a.kind === "undo").map((a) => Number(a.payload.seq)));
  const byName = (id: string) => (id === "system" ? "Clock" : (person(state, id)?.name ?? "Organizer"));
  return (
    <aside className="gg-panel absolute bottom-0 right-0 top-[86px] z-[1200] flex w-[min(420px,100%)] flex-col" aria-label="Event log">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="gg-disp text-2xl font-black">Log</span>
        <button type="button" className="gg-btn h-8 min-h-0 px-2" onClick={onClose} aria-label="Close the log">
          <X size={16} />
        </button>
      </div>
      <p className="px-4 pt-1 text-[12px]" style={{ color: "var(--gg-fg-3)" }}>
        Everything that happened, newest first. Fixes by organizers are marked with their reason.
      </p>
      {error && (
        <p role="alert" className="px-4 pt-2 text-xs" style={{ color: "#ff9b9b" }}>
          {error}
        </p>
      )}
      <ol className="gg-scroll mt-2 flex-1 px-4 pb-4">
        {[...state.log].reverse().map((action) => {
          const isUndone = undone.has(action.seq);
          return (
            <li key={action.seq} className="border-b py-2 text-[13px]" style={{ borderColor: "#22173f", opacity: isUndone ? 0.45 : 1 }}>
              <div className="flex items-start gap-2">
                <span className="gg-digit w-8 shrink-0 text-[10.5px]" style={{ color: "var(--gg-fg-3)" }}>
                  #{action.seq}
                </span>
                <span className="min-w-0 flex-1" style={{ textDecoration: isUndone ? "line-through" : undefined }}>
                  {describe(state, action)}
                </span>
                {organizer && !isUndone && action.kind !== "undo" && (
                  <button
                    type="button"
                    className="gg-btn h-7 min-h-0 px-2"
                    title="Undo this"
                    aria-label={`Undo #${action.seq}`}
                    onClick={async () => {
                      const reason = window.prompt("Why undo this? (goes into the log)", "Misclick");
                      if (reason === null) return;
                      setError(await act({ kind: "undo", seq: action.seq, reason }));
                    }}
                  >
                    <Undo2 size={14} />
                  </button>
                )}
              </div>
              <div className="ml-10 text-[11px]" style={{ color: "var(--gg-fg-3)" }}>
                {new Date(action.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {byName(action.by)}
                {action.override && <b style={{ color: "var(--gg-pending)" }}> · fix{action.reason ? `: ${action.reason}` : ""}</b>}
                {!action.override && action.reason && <span> · {action.reason}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
