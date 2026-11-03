"use client";

import { BellRing } from "lucide-react";
import type { GameControl, ReminderKind } from "@/lib/gameControlTypes";
import { formatRelative } from "@/lib/timeEngine";
import { Spinner } from "@/components/schedule/ui";
import { RequestResult } from "./AccessCard";
import { clockTime, dateTime, CardTitle } from "./labels";
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
    <section data-tour="games.reminders" className="gm-plate p-4 sm:p-[18px]">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <CardTitle icon={BellRing} title="Reminders" />
          <p className="mt-1 text-sm text-ink-300">{status}</p>
          {kind === "early" && (
            <p className="mt-1 text-[11px] text-ink-500">
              Each player gets the start time, their nation, the checksum, what a no-show costs and a link to unreserve on the
              website.
            </p>
          )}
          {last && (
            <p className="mt-2 text-[11px] text-ink-500">
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
            className="gm-btn gm-btn-secondary h-9 shrink-0 px-4 text-[13px]"
          >
            {request.busy && <Spinner className="h-4 w-4" />}
            {kind === "early" ? `Send early reminder (${game.players})` : "Send late reminder"}
          </button>
        )}
      </div>
      <RequestResult state={request.state} onDismiss={request.reset} />
    </section>
  );
}
