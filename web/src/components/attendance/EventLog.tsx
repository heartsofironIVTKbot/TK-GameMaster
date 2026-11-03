"use client";

import { Camera, Check, Flag, Headphones, History, MessageSquare, Pencil, Play, Trash2, TriangleAlert, Undo2, UserPlus, X, type LucideIcon } from "lucide-react";
import { CardTitle } from "@/components/games/labels";
import { useState, type ReactNode } from "react";
import type { AttendanceEvent } from "@/lib/attendanceTypes";
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

/** Each event's icon and colour: mint good, yellow worth a look, red a warning, grey the rest. */
const ICON: Record<string, [LucideIcon, string]> = {
  game_started: [Play, "bg-sky-950 text-sky-300"],
  sample: [Camera, "bg-emerald-950 text-emerald-300"],
  live_check: [Headphones, "bg-ink-800 text-ink-300"],
  participation_yes: [Check, "bg-emerald-950 text-emerald-300"],
  participation_no: [X, "bg-ink-800 text-ink-300"],
  late_join: [UserPlus, "bg-sky-950 text-sky-300"],
  override: [Pencil, "bg-yellow-950 text-yellow-300"],
  warning_reverted: [Undo2, "bg-ink-800 text-ink-300"],
  no_show_warning: [TriangleAlert, "bg-rose-950 text-rose-300"],
  finalized: [Flag, "bg-ink-800 text-ink-300"],
  chatlog_hint: [MessageSquare, "bg-yellow-950 text-yellow-300"],
  game_ended: [Flag, "bg-ink-800 text-ink-300"],
  game_cancelled: [Trash2, "bg-rose-950 text-rose-300"],
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
  return <b className="font-bold text-ink-100">{children}</b>;
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
    <section data-tour="attendance.log" className="gm-plate p-4 sm:p-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <CardTitle icon={History} title="Event log" />
          <p className="text-[13px] text-ink-400">Everything that happened to this game&apos;s attendance, and who did it.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGroup(option.value)}
              className={`gm-cut [--cut:7px] border px-2 py-1 text-[11px] font-bold transition ${ option.value === group ? "border-brand-400 bg-brand-400 text-brand-950" : "border-ink-800 bg-ink-950 text-ink-300 hover:border-ink-600 hover:text-ink-100" }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="mt-5 text-xs text-ink-500">
          {events.length === 0
            ? "Nothing logged yet. Games started before this update have no audit log."
            : "Nothing of this kind yet."}
        </p>
      ) : (
        <ol className="mt-4 divide-y divide-ink-800">
          {shown.map((event) => {
            const { text, quote } = describe(event);
            return (
              <li key={event.id} className="flex gap-3 py-2.5">
                <EventIcon kind={event.kind} />
                <div className="min-w-0 flex-1 text-sm text-ink-300">
                  <p>{text}</p>
                  {quote && <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">“{quote}”</p>}
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {event.actor_name
                      ? `by ${event.actor_name}`
                      : event.kind.startsWith("participation_")
                        ? "Player's reply to the DM"
                        : event.kind === "late_join"
                          ? "Hot join"
                          : "Automatic"}
                    {", "}
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

function EventIcon({ kind }: { kind: string }) {
  const [Icon, tone] = ICON[kind] ?? [History, "bg-ink-800 text-ink-300"];
  return (
    <span className={`gm-cut mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center [--cut:6px] ${tone}`}>
      <Icon aria-hidden className="h-[15px] w-[15px]" strokeWidth={1.75} />
    </span>
  );
}
