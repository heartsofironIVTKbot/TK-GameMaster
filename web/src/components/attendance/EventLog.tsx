"use client";

import { useState, type ReactNode } from "react";
import type { AttendanceEvent } from "@/lib/attendanceTypes";
import { GLASS } from "@/components/schedule/ui";
import { formatRelative } from "@/lib/timeEngine";
import { dateTime, plural } from "./labels";

/**
 * The game's attendance audit trail (attendance_events, written by the bot):
 * game start, every sample, participation replies, late joins, voice checks,
 * host changes with their reason, warnings given or reverted, finalize and
 * chat-log hints — newest first.
 */

type Group = "all" | "changes" | "samples" | "players";

const GROUPS: { value: Group; label: string; kinds: string[] | null }[] = [
  { value: "all", label: "Everything", kinds: null },
  { value: "changes", label: "Host changes & warnings", kinds: ["override", "warning_reverted", "no_show_warning", "finalized"] },
  {
    value: "samples",
    label: "Samples & checks",
    kinds: ["game_started", "sample", "live_check", "finalized", "game_ended", "game_cancelled"],
  },
  { value: "players", label: "Player replies", kinds: ["participation_yes", "participation_no", "late_join", "chatlog_hint"] },
];

const ICON: Record<string, string> = {
  game_started: "🚀",
  sample: "📸",
  live_check: "🎧",
  participation_yes: "✅",
  participation_no: "🙅",
  late_join: "➕",
  override: "✎",
  warning_reverted: "↩️",
  no_show_warning: "⚠️",
  finalized: "🏁",
  chatlog_hint: "💬",
  game_ended: "🏁",
  game_cancelled: "🗑️",
};

const VERDICT: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
  auto: "Automatic",
};

const str = (value: unknown): string => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Slot keys in event details ("_FILL_Filler", "Italy_coop") as people say them. */
function prettySlotLabel(key: string): string {
  if (key.startsWith("_FILL_")) return "Filler";
  return key.replace(/_coop.*$/, " (Co-op)");
}

function Who({ children }: { children: ReactNode }) {
  return <b className="font-bold text-white">{children}</b>;
}

function describe(event: AttendanceEvent): { text: ReactNode; quote: string | null } {
  const d = event.details;
  const user = <Who>{event.user_name ?? "A player"}</Who>;
  const nation = str(d.nation) ? prettySlotLabel(str(d.nation)) : "";
  switch (event.kind) {
    case "game_started":
      return {
        text: (
          <>
            Game started — a sample every {num(d.interval_minutes) || "?"} min, {num(d.samples) || 5} samples, present at{" "}
            {num(d.required) || 2}+ · {plural(num(d.players), "player")} · {str(d.logging_mode) || "Strict"} logging
          </>
        ),
        quote: null,
      };
    case "sample":
      return {
        text: (
          <>
            Sample {num(d.index)}: <Who>{num(d.count)}</Who> in voice{d.manual ? " — taken early from the web" : ""}
          </>
        ),
        quote: null,
      };
    case "live_check":
      return {
        text: (
          <>
            Voice check: <Who>{num(d.in_voice)}</Who> of {num(d.players)} in voice
          </>
        ),
        quote: null,
      };
    case "participation_yes":
      return { text: <>{user} confirmed they&apos;re playing{nation ? ` ${nation}` : ""}</>, quote: null };
    case "participation_no":
      return {
        text: (
          <>
            {user} can&apos;t play{nation ? ` ${nation}` : ""} —{" "}
            {str(d.outcome) === "excused" ? "excused, no warning" : "not excused (Major or Strict logging)"}
          </>
        ),
        quote: str(d.reason) || null,
      };
    case "late_join":
      return { text: <>{user} joined late as {nation || "a nation"}{str(d.kind) ? ` (${str(d.kind)})` : ""}</>, quote: null };
    case "override": {
      const to = VERDICT[str(d.to)] ?? str(d.to);
      const from = VERDICT[str(d.from)] ?? str(d.from);
      return {
        text: d.finalized ? (
          <>
            {user}: {from} → <Who>{to}</Who>
          </>
        ) : (
          <>
            {user} set to <Who>{to}</Who> (applies at finalize)
          </>
        ),
        quote: str(d.reason) || null,
      };
    }
    case "warning_reverted":
      return { text: <>{user}&apos;s {plural(num(d.amount), "no-show warning")} removed</>, quote: null };
    case "no_show_warning":
      return {
        text: (
          <>
            {user} got <Who>{plural(num(d.amount), "no-show warning")}</Who>
            {nation ? ` (${nation})` : ""}
            {d.auto_banned ? " — automatic game ban" : ""}
          </>
        ),
        quote: str(d.reason) || null,
      };
    case "finalized":
      return {
        text: (
          <>
            Attendance finalized: <Who>{num(d.present)} present</Who>, {num(d.absent)} absent from {plural(num(d.samples), "sample")} ·{" "}
            {plural(num(d.warnings), "warning")}
            {str(d.how) === "early" ? " · game ended early" : str(d.how) === "web" ? " · finalized from the web" : ""}
            {d.confident === false ? " · low confidence" : ""}
          </>
        ),
        quote: null,
      };
    case "chatlog_hint":
      return {
        text: (
          <>
            The chat log shows {user}&apos;s tag <Who>{str(d.tag)}</Who>
            {nation ? ` (${nation})` : ""} although they weren&apos;t counted present
          </>
        ),
        quote: null,
      };
    case "game_ended":
      return {
        text: (
          <>
            Game ended — <Who>{num(d.present)}</Who> of {plural(num(d.players), "player")} counted present
          </>
        ),
        quote: null,
      };
    case "game_cancelled":
      return { text: <>Game cancelled — no penalties</>, quote: str(d.reason) || null };
    default:
      return { text: <>{event.kind.replace(/_/g, " ")}</>, quote: null };
  }
}

export default function EventLog({ events, now }: { events: AttendanceEvent[]; now: number }) {
  const [group, setGroup] = useState<Group>("all");
  const kinds = GROUPS.find((option) => option.value === group)?.kinds ?? null;
  const shown = kinds ? events.filter((event) => kinds.includes(event.kind)) : events;
  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Audit log</p>
          <p className="mt-0.5 text-xs text-slate-400">Everything that happened to this game&apos;s attendance, and who did it.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGroup(option.value)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                option.value === group
                  ? "border-emerald-300 bg-emerald-400 text-slate-950"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="mt-5 text-xs text-slate-500">
          {events.length === 0
            ? "Nothing logged yet. Games started before this update have no audit log."
            : "Nothing of this kind yet."}
        </p>
      ) : (
        <ol className="mt-4 divide-y divide-white/5">
          {shown.map((event) => {
            const { text, quote } = describe(event);
            return (
              <li key={event.id} className="flex gap-3 py-2.5">
                <span className="mt-0.5 w-6 shrink-0 text-center text-base">{ICON[event.kind] ?? "•"}</span>
                <div className="min-w-0 flex-1 text-sm text-slate-300">
                  <p>{text}</p>
                  {quote && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">“{quote}”</p>}
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {event.actor_name
                      ? `by ${event.actor_name}`
                      : event.kind.startsWith("participation_")
                        ? "💬 Player's reply to the DM"
                        : event.kind === "late_join"
                          ? "➕ Hot join"
                          : "🤖 Automatic"}{" "}
                    ·{" "}
                    <span title={dateTime(event.created_at)}>
                      {formatRelative(Math.min(event.created_at * 1000, now), now)}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
