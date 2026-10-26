"use client";

import type { GameControl, ReminderKind } from "@/lib/gameControlTypes";
import { formatRelative } from "@/lib/timeEngine";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { RequestResult } from "./AccessCard";
import { clockTime, dateTime } from "./labels";
import { useBotRequest } from "./useBotRequest";

/**
 * Reminder DMs (formerly /remind): before the start an early reminder to every
 * reserved player (counts as the automatic one-hour reminder), after the
 * start a late reminder to whoever isn't in voice with the Gamer Pass yet.
 */
export default function RemindersCard({ game, now, onChanged }: { game: GameControl; now: number; onChanged: () => void }) {
  const request = useBotRequest(onChanged);
  const kind: ReminderKind = game.phase === "announced" ? "early" : "late";
  const { automatic, automatic_sent_at: sentAt, last } = game.reminders;
  const remindAt = game.scheduled_at ? game.scheduled_at - 3600 : null;

  let status: string;
  if (kind === "late") {
    status = "DMs the players who aren't in a game voice channel with the Gamer Pass yet.";
  } else if (sentAt) {
    status = `A reminder already went out ${formatRelative(Math.min(sentAt * 1000, now), now)} — you can send another.`;
  } else if (automatic && remindAt) {
    status = `The automatic reminder goes out 1 hour before the start (${clockTime(remindAt)}). Send one now if you want it earlier.`;
  } else {
    status = "The automatic reminder is off for this game — send one so players know when to be there.";
  }

  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Reminders</p>
          <p className="mt-1 text-sm text-slate-300">{status}</p>
          {kind === "early" && (
            <p className="mt-1 text-[11px] text-slate-500">
              Each player gets the start time, their nation, the checksum, what a no-show costs and a link to unreserve on the
              website.
            </p>
          )}
          {last && (
            <p className="mt-2 text-[11px] text-slate-500">
              Last: {last.kind === "early" ? "early" : "late"} reminder {dateTime(last.ts)}
              {last.by_name ? ` by ${last.by_name}` : ""} — {last.sent} DMed{last.failed ? `, ${last.failed} unreachable` : ""}.
            </p>
          )}
        </div>
        {game.can_manage && (
          <button
            type="button"
            disabled={request.busy || game.players === 0}
            onClick={() => void request.submit({ action: "game_remind", payload: { thread_id: game.id, kind } })}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-400/15 px-4 py-2.5 text-sm font-black text-amber-100 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {request.busy && <Spinner className="h-4 w-4" />}
            {kind === "early" ? `⏰ Send early reminder (${game.players})` : "🔔 Send late reminder"}
          </button>
        )}
      </div>
      <RequestResult state={request.state} onDismiss={request.reset} />
    </section>
  );
}
