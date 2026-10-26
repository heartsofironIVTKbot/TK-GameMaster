"use client";

import { useState } from "react";
import { GAME_START_INTERVALS, type GameControl, type GameStartInterval } from "@/lib/gameControlTypes";
import { formatRelative } from "@/lib/timeEngine";
import { Field, PreviewBox } from "@/components/database/ActionPanel";
import { GLASS, Segmented, Spinner } from "@/components/schedule/ui";
import { clockTime } from "./labels";

/**
 * Start a game (formerly /game_start): the in-game server details, the
 * attendance interval, a readiness checklist and exactly what the bot will do.
 */

type Check = { ok: boolean | "warn"; text: string };

const INPUT =
  "w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none";

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
    <section className={`grid gap-5 rounded-3xl p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_360px] ${GLASS}`}>
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Start the game</p>
          <p className="mt-1 text-sm text-slate-400">
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
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-bold text-slate-300 hover:text-white"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
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
        <ul className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          {checks.map((check) => (
            <li
              key={check.text}
              className={check.ok === true ? "text-slate-300" : check.ok === "warn" ? "text-amber-200" : "font-bold text-rose-200"}
            >
              {check.ok === true ? "✅" : check.ok === "warn" ? "⚠️" : "⛔"} {check.text}
            </li>
          ))}
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
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending && <Spinner className="h-4 w-4" />}🎮 Start game
        </button>
        {canStart && !busy && (draftBlocked || missing) && (
          <p className="text-center text-[11px] text-slate-500">{draftBlocked ? "Finish the draft first." : missing}</p>
        )}
        {!canStart && <p className="text-center text-[11px] text-slate-500">Only the game&apos;s host or Host Management can start it.</p>}
      </div>
    </section>
  );
}
