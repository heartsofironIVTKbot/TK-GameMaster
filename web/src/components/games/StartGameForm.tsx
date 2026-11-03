"use client";

import { useState } from "react";
import { GAME_START_INTERVALS, type GameControl, type GameStartInterval } from "@/lib/gameControlTypes";
import { formatRelative } from "@/lib/timeEngine";
import { Field, PreviewBox } from "@/components/database/ActionPanel";
import { CircleAlert, CircleCheck, Eye, EyeOff, OctagonX, Play } from "lucide-react";
import { Segmented, Spinner } from "@/components/schedule/ui";
import { CardTitle, clockTime } from "./labels";

/**
 * Start a game (formerly /game_start): the in-game server details, the
 * attendance interval, a readiness checklist and exactly what the bot will do.
 */

type Check = { ok: boolean | "warn"; text: string };

const INPUT = "gm-input w-full";

export default function StartGameForm({
  game,
  now,
  canStart,
  busy,
  sending,
  onStart,
}: {
  game: GameControl;
  now: number;
  canStart: boolean;
  busy: boolean;
  sending: boolean;
  onStart: (payload: { server_id: string; password: string; checksum: string; interval_minutes: GameStartInterval }) => void;
}) {
  const [serverId, setServerId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checksum, setChecksum] = useState(game.scheduled_checksum ?? "");
  const [interval, setIntervalMinutes] = useState<GameStartInterval>(30);

  const checksumOk = /^[A-Z0-9]{4}$/.test(checksum);
  const draftBlocked = Boolean(game.draft && !game.draft.complete);
  const minutesEarly = game.scheduled_at ? Math.round((game.scheduled_at - now / 1000) / 60) : 0;

  const checks: Check[] = [
    game.players > 0
      ? { ok: true, text: `${game.players} player(s) reserved` }
      : { ok: "warn", text: "Nobody has reserved a nation yet" },
    ...(game.draft
      ? [
          game.draft.complete
            ? { ok: true, text: "Draft finished" }
            : { ok: false, text: `Draft not finished — ${game.draft.pool_left} player(s) still in the pool (finish it or clear the pool first)` },
        ]
      : []),
    game.scheduled_at
      ? minutesEarly > 60
        ? { ok: "warn" as const, text: `Scheduled for ${clockTime(game.scheduled_at)} — that's ${formatRelative(game.scheduled_at * 1000, now)}` }
        : { ok: true, text: `Scheduled for ${clockTime(game.scheduled_at)} (${formatRelative(game.scheduled_at * 1000, now)})` }
      : { ok: "warn", text: "No scheduled time on record" },
    game.scheduled_checksum
      ? checksum === game.scheduled_checksum || !checksumOk
        ? { ok: true, text: `Checksum ${game.scheduled_checksum} from the schedule` }
        : { ok: "warn", text: `The scheduled checksum was ${game.scheduled_checksum} — it will be updated to ${checksum}` }
      : { ok: "warn", text: "No checksum was scheduled — enter the game's checksum" },
  ];

  const ready = canStart && !busy && !draftBlocked && serverId.trim() !== "" && password.trim() !== "" && checksumOk;
  const missing = !serverId.trim() ? "Enter the server ID" : !password.trim() ? "Enter the password" : !checksumOk ? "Enter a 4-character checksum" : null;

  return (
    <section data-tour="games.start" className="gm-plate grid gap-5 p-4 sm:p-[18px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div>
          <CardTitle icon={Play} title="Start the game" />
          <p className="text-[13px] text-ink-400">
            Fill in the in-game server details when everyone is in the lobby. The bot does the rest in Discord.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="In-game server ID">
            <input
              value={serverId}
              onChange={(event) => setServerId(event.target.value.slice(0, 64))}
              placeholder="e.g. 4815162342"
              aria-label="In-game server ID"
              autoComplete="off"
              className={INPUT}
              disabled={!canStart}
            />
          </Field>
          <Field label="Server password">
            <div className="flex gap-1.5">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value.slice(0, 64))}
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                placeholder="Players get it in the game-info channel"
                aria-label="Server password"
                className={INPUT}
                disabled={!canStart}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="gm-btn gm-btn-secondary h-9 w-9 shrink-0 p-0"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </button>
            </div>
          </Field>
          <Field label="Checksum" hint="Four letters or digits, shown in the game lobby.">
            <input
              value={checksum}
              onChange={(event) => setChecksum(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              placeholder="ABCD"
              aria-label="Checksum"
              autoComplete="off"
              className={`${INPUT} font-mono tracking-[0.3em]`}
              disabled={!canStart}
            />
          </Field>
          <Field label="Attendance check every" hint={`5 voice samples — the last one about ${interval * 5} min after the start.`}>
            <Segmented<string>
              ariaLabel="Attendance interval"
              size="sm"
              value={String(interval)}
              onChange={(value) => setIntervalMinutes(Number(value) as GameStartInterval)}
              options={GAME_START_INTERVALS.map((minutes) => ({ value: String(minutes), label: `${minutes} min` }))}
            />
          </Field>
        </div>
        <ul className="gm-cut space-y-1 bg-ink-950 px-3.5 py-3 text-[12.5px] [--cut:10px]">
          {checks.map((check) => {
            const Icon = check.ok === true ? CircleCheck : check.ok === "warn" ? CircleAlert : OctagonX;
            return (
              <li
                key={check.text}
                className={`grid grid-cols-[16px_minmax(0,1fr)] gap-2 ${
                  check.ok === true ? "text-ink-300" : check.ok === "warn" ? "text-yellow-200" : "font-semibold text-rose-200"
                }`}
              >
                <Icon
                  aria-hidden
                  className={`mt-0.5 h-4 w-4 ${check.ok === true ? "text-emerald-300" : check.ok === "warn" ? "text-yellow-300" : "text-rose-300"}`}
                />
                {check.text}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3">
        <PreviewBox
          preview={{
            lines: [
              "Creates the voice channels and a Gamer Pass role",
              "Posts the server ID, password and checksum in the game-info channel (Gamer Pass holders only)",
              `DMs all ${game.players} player(s) to confirm — confirming gives them the Gamer Pass`,
              `Attendance: a voice sample every ${interval} min; present = seen in 2 of 5`,
              "Locks reservations; players can then ask to hot-join on the map and send crash logs on the website",
            ],
            danger: false,
            error: null,
          }}
        />
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            onStart({ server_id: serverId.trim(), password: password.trim(), checksum, interval_minutes: interval })
          }
          className="gm-btn gm-btn-primary h-12 w-full font-display text-[21px] font-extrabold uppercase tracking-[0.02em] [--cut:11px]"
        >
          {sending && <Spinner className="h-4 w-4" />}Start game
        </button>
        {canStart && !busy && (draftBlocked || missing) && (
          <p className="text-center text-xs text-ink-500">{draftBlocked ? "Finish the draft first." : missing}</p>
        )}
        {!canStart && <p className="text-center text-xs text-ink-500">Only the game&apos;s host or Host Management can start it.</p>}
      </div>
    </section>
  );
}
