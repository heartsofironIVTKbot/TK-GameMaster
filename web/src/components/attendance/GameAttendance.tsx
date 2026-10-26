"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceGame, AttendancePlayer, VoiceState } from "@/lib/attendanceTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { SubmitButton } from "@/components/database/ActionPanel";
import Avatar from "@/components/database/Avatar";
import { useModerationRequest } from "@/components/database/useModerationRequest";
import { GLASS, Spinner } from "@/components/schedule/ui";
import EventLog from "./EventLog";
import OverrideDialog from "./OverrideDialog";
import {
  PARTICIPATION,
  PHASE,
  VOICE_DOT,
  VOICE_LABEL,
  VOICE_SHORT,
  VOICE_TEXT,
  clockTime,
  dateTime,
  outcomeOf,
  plural,
  useNow,
  useRefreshTick,
} from "./labels";

/**
 * One game's attendance: sample progress with the next-sample countdown,
 * host actions (voice check, early sample, finalize), the roster with every
 * player's per-sample voice state and verdict, host corrections and the
 * audit timeline. Refreshes every 15 s while the game runs.
 */

type RosterFilter = "all" | "review" | "present" | "absent" | "excused" | "no_reply";

const FILTERS: { value: RosterFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "review", label: "Needs review" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
  { value: "no_reply", label: "No reply" },
];

function needsReview(player: AttendancePlayer): boolean {
  return player.projection === "at_risk" || player.chatlog_hint !== null;
}

function matchesFilter(player: AttendancePlayer, filter: RosterFilter): boolean {
  switch (filter) {
    case "review":
      return needsReview(player);
    case "present":
      return player.verdict === "present";
    case "absent":
      return player.verdict === "absent";
    case "excused":
      return player.verdict === "excused";
    case "no_reply":
      return player.participation === "no_reply";
    default:
      return true;
  }
}

export default function GameAttendance({
  gameId,
  host,
  onBack,
  onChanged,
}: {
  gameId: string;
  host: HostProfile;
  onBack: (() => void) | null;
  onChanged: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; game: AttendanceGame | null; error: string | null } | null>(null);
  const running = state?.game ? state.game.phase !== "finalized" : true;
  const [tick, refresh] = useRefreshTick(running ? 15_000 : 60_000);
  const key = `${tick}|${nonce}`;
  const now = useNow(30_000);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/attendance/games/${gameId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { game?: AttendanceGame; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.game) setState({ key, game: null, error: body?.error ?? "Couldn't load this game." });
        else setState({ key, game: body.game, error: null });
      })
      .catch(() => {
        if (!cancelled) setState((previous) => ({ key, game: previous?.game ?? null, error: "Network error — retrying." }));
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, key]);

  const onApplied = useCallback(() => {
    setNonce((value) => value + 1);
    onChanged();
  }, [onChanged]);
  const request = useModerationRequest(onApplied);
  const busy = request.state.phase === "sending" || request.state.phase === "waiting";

  const [filter, setFilter] = useState<RosterFilter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const game = state?.game ?? null;
  const roster = useMemo(() => game?.roster ?? [], [game]);
  const counts = useMemo(() => {
    const result: Record<RosterFilter, number> = { all: roster.length, review: 0, present: 0, absent: 0, excused: 0, no_reply: 0 };
    for (const player of roster) {
      for (const option of FILTERS) if (option.value !== "all" && matchesFilter(player, option.value)) result[option.value] += 1;
    }
    return result;
  }, [roster]);
  const needle = search.trim().toLowerCase();
  const shown = roster.filter(
    (player) =>
      matchesFilter(player, filter) &&
      (!needle ||
        player.name.toLowerCase().includes(needle) ||
        (player.username ?? "").toLowerCase().includes(needle) ||
        player.slots.some((slot) => slot.label.toLowerCase().includes(needle)) ||
        player.user_id === needle),
  );

  if (!game) {
    return (
      <section className={`rounded-3xl p-6 ${GLASS}`}>
        {state?.error ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{state.error}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner className="h-4 w-4 text-emerald-300" /> Loading attendance…
          </div>
        )}
      </section>
    );
  }

  const finalized = game.phase === "finalized";
  const phase = PHASE[game.phase];
  const atRisk = roster.filter((player) => player.projection === "at_risk").length;
  const warnings = finalized
    ? roster.reduce((sum, player) => sum + player.warnings_applied, 0)
    : roster.filter((player) => player.verdict === "absent").reduce((sum, player) => sum + player.penalty, 0);
  const editingPlayer = editing ? (roster.find((player) => player.user_id === editing) ?? null) : null;
  const send = (action: "att_check" | "att_sample" | "att_finalize") => {
    void request.submit({ action, payload: { game_id: game.id } });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
        <div className="flex flex-wrap items-start gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white lg:hidden"
            >
              ← Games
            </button>
          )}
          <div className="order-2 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-2xl font-black tracking-tight text-white sm:truncate">{game.name}</h1>
              <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase ${phase.className}`}>
                <span className={`h-2 w-2 rounded-full ${phase.dot}`} />
                {phase.label}
              </span>
              {state?.key !== key && <Spinner className="h-3.5 w-3.5 text-slate-400" />}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {game.mode} · hosted by <span className="font-semibold text-slate-200">{game.host_name ?? "unknown"}</span> ·{" "}
              {game.logging_mode} logging
              {game.started_at && <> · started {dateTime(game.started_at)}</>}
            </p>
            {finalized && game.finalized_at && (
              <p className="mt-0.5 text-xs text-slate-500">
                Finalized {dateTime(game.finalized_at)} {game.finalized_by ? `· ${game.finalized_by === "Automatic" ? "automatically" : `by ${game.finalized_by}`}` : ""}
                {game.early_ended && " · game ended before all samples"}
                {!game.confident && " · low confidence (too few samples — only host-marked absences were warned)"}
              </p>
            )}
          </div>
          <div className="ml-auto flex gap-2 sm:ml-0">
            <Link
              href={`/games?game=${game.id}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
              title="Start, end or cancel this game"
            >
              🎮 Game controls
            </Link>
            <button
              type="button"
              onClick={() => exportCsv(game)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-emerald-300/40 hover:text-white"
              title="Download the roster with every sample as a spreadsheet (CSV)"
            >
              ⤓ Export CSV
            </button>
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-emerald-300/40 hover:text-white"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {state?.error && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{state.error}</p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <Stat label={finalized ? "Present" : "On track"} value={`${counts.present}/${roster.length}`} tone="emerald" />
          <Stat label="At risk" value={String(atRisk)} tone="amber" hint={finalized ? "—" : "Can still be counted"} />
          <Stat label="Absent" value={String(counts.absent - atRisk)} tone="rose" />
          <Stat label="Excused" value={String(counts.excused)} tone="sky" />
          <Stat
            label={finalized ? "No-show warnings" : "Warnings if absent"}
            value={String(warnings)}
            tone="slate"
            hint={finalized ? "Given at finalize / by hosts" : "If nothing changes"}
          />
        </div>
      </section>

      {/* Samples + actions */}
      <section className={`grid gap-5 rounded-3xl p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_320px] ${GLASS}`}>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Voice samples</p>
          <p className="mt-1 text-sm text-slate-400">
            The bot checks voice every <b className="text-slate-200">{game.interval_minutes} min</b>. Seen in{" "}
            <b className="text-slate-200">
              {game.required} of {game.sample_count}
            </b>{" "}
            samples (in a game VC with the Gamer Pass) = present. VIPs never get no-show warnings.
          </p>
          <SampleTrack game={game} />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Host actions</p>
          {!finalized && (
            <ActionButton
              icon="🎧"
              label="Check voice now"
              text="See who's in voice right now. Doesn't count as a sample."
              disabled={busy}
              onClick={() => send("att_check")}
            />
          )}
          {game.can_edit && game.phase === "live" && game.samples_done < game.sample_count && (
            <ActionButton
              icon="📸"
              label="Take sample now"
              text="Counts as the next sample; the one after is due one interval later."
              disabled={busy}
              onClick={() => send("att_sample")}
            />
          )}
          {game.can_edit && !finalized && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-2 text-[11px] leading-snug text-slate-400">
                <b className="text-slate-200">Finalize now</b> — stop sampling and give no-show warnings from the{" "}
                {plural(game.samples_done, "sample")} taken. Use it when the game ended early.
              </p>
              <SubmitButton
                label="✅ Finalize attendance"
                danger
                busy={busy}
                disabled={game.samples_done < game.required}
                onConfirm={() => send("att_finalize")}
              />
              {game.samples_done < game.required && (
                <p className="mt-1.5 text-[11px] text-slate-500">Needs at least {game.required} samples (or end the game on the Games page).</p>
              )}
            </div>
          )}
          {finalized && game.can_edit && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-snug text-slate-400">
              Attendance is final. Use <b className="text-slate-200">Change</b> on a player to correct it — warnings,
              attended games and bans are adjusted and the player is DMed.
            </p>
          )}
          {!game.can_edit && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-snug text-slate-400">
              Only {game.host_name ?? "the game's host"} or staff can change this game&apos;s attendance. You can follow it and
              run voice checks.
            </p>
          )}
          <RequestBanner state={request.state} onDismiss={request.reset} />
        </div>
      </section>

      {/* Roster */}
      <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Roster</p>
          {game.live_check && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300">
              🎧 Voice check {formatRelative(Math.min(game.live_check.ts * 1000, now), now)}
              {game.live_check.by_name ? ` by ${game.live_check.by_name}` : ""}:{" "}
              <b className="text-white">
                {game.live_check.in_voice}/{roster.length}
              </b>{" "}
              in voice
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((option) => {
            const active = option.value === filter;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  active
                    ? "border-emerald-300 bg-emerald-400 text-slate-950"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
                }`}
              >
                {option.label}
                <span className={active ? "ml-1 opacity-70" : "ml-1 text-slate-500"}>{counts[option.value]}</span>
              </button>
            );
          })}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value.slice(0, 64))}
            placeholder="Find player or nation"
            aria-label="Find a player or nation"
            className="ml-auto w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-emerald-300/60 focus:outline-none sm:w-56"
          />
        </div>

        <div className="roster-scroll -mx-4 mt-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Nation</th>
                <th className="py-2 pr-3" title="Reply to the participation DM">
                  Reply
                </th>
                <th className="py-2 pr-3">Samples</th>
                <th className="py-2 pr-3">Seen</th>
                <th className="py-2 pr-3" title="Latest voice check">
                  Now
                </th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Warnings</th>
                {game.can_edit && <th className="py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((player) => (
                <RosterRow
                  key={player.user_id}
                  player={player}
                  game={game}
                  busy={busy}
                  onEdit={() => setEditing(player.user_id)}
                />
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No players match.</p>}
        </div>
        <Legend />
      </section>

      <EventLog events={game.events} now={now} />

      {editingPlayer && (
        <OverrideDialog
          game={game}
          player={editingPlayer}
          busy={busy}
          onClose={() => setEditing(null)}
          onSubmit={(verdict, reason) => {
            setEditing(null);
            void request.submit({
              action: "att_override",
              payload: { game_id: game.id, user_id: editingPlayer.user_id, verdict, reason },
            });
          }}
        />
      )}
      {host.demo && (
        <p className="text-center text-[11px] text-slate-500">
          Preview mode: the bot is simulated — voice checks and samples use made-up voice states.
        </p>
      )}
    </div>
  );
}

const TONES = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  sky: "text-sky-300",
  slate: "text-slate-200",
} as const;

function Stat({ label, value, tone, hint }: { label: string; value: string; tone: keyof typeof TONES; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-black ${TONES[tone]}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  text,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  text: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-emerald-300/40 hover:bg-emerald-400/5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-lg">{icon}</span>
      <span>
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="block text-[11px] leading-snug text-slate-400">{text}</span>
      </span>
    </button>
  );
}

function Countdown({ at }: { at: number }) {
  const now = useNow(1000);
  const left = Math.round(at - now / 1000);
  if (left <= 0) return <span className="font-black text-amber-200">due now</span>;
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return (
    <span className="font-black tabular-nums text-white">
      in {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function SampleTrack({ game }: { game: AttendanceGame }) {
  const finalized = game.phase === "finalized";
  return (
    <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {Array.from({ length: game.sample_count }, (_, index) => {
        const sample = game.samples[index];
        const isNext = !sample && index === game.samples.length;
        if (sample) {
          return (
            <li key={index} className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Sample {sample.index}</p>
              <p className="mt-0.5 text-lg font-black text-white">
                {sample.count}
                <span className="text-xs font-semibold text-slate-400"> in voice</span>
              </p>
              <p className="text-[11px] text-slate-400">
                {clockTime(sample.ts)}
                {sample.manual && <span className="text-amber-200"> · early{sample.by_name ? ` by ${sample.by_name}` : ""}</span>}
                {sample.final_bonus && <span className="text-sky-200"> · end scan</span>}
              </p>
            </li>
          );
        }
        if (isNext && game.next_sample_at) {
          return (
            <li key={index} className="rounded-xl border border-dashed border-amber-300/50 bg-amber-400/5 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">Sample {index + 1} · next</p>
              <p className="mt-0.5 text-sm">
                <Countdown at={game.next_sample_at} />
              </p>
              <p className="text-[11px] text-slate-400">at {clockTime(game.next_sample_at)}</p>
            </li>
          );
        }
        const eta =
          game.next_sample_at && !finalized ? game.next_sample_at + (index - game.samples.length) * game.interval_minutes * 60 : null;
        return (
          <li key={index} className="rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-slate-500">
            <p className="text-[10px] font-black uppercase tracking-wider">Sample {index + 1}</p>
            <p className="mt-0.5 text-sm font-semibold">
              {finalized ? "Not taken" : game.phase === "ending" ? "Skipped" : eta ? `~${clockTime(eta)}` : "Pending"}
            </p>
            <p className="text-[11px]">{finalized ? "finalized early" : game.phase === "ending" ? "game ended" : "planned"}</p>
          </li>
        );
      })}
    </ol>
  );
}

function SampleDots({ player, game }: { player: AttendancePlayer; game: AttendanceGame }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: game.sample_count }, (_, index) => {
        const sample = game.samples[index];
        if (!sample) {
          return (
            <span
              key={index}
              title={`Sample ${index + 1} · not taken yet`}
              className="h-3.5 w-3.5 rounded-full border border-dashed border-white/20"
            />
          );
        }
        const state: VoiceState | null = player.samples[index] ?? null;
        return (
          <span
            key={index}
            title={`Sample ${sample.index} · ${clockTime(sample.ts)} — ${state ? VOICE_LABEL[state] : "Not seen"}`}
            className={`h-3.5 w-3.5 rounded-full border ${state ? VOICE_DOT[state] : "border-white/20 bg-white/10"}`}
          />
        );
      })}
    </span>
  );
}

function RosterRow({
  player,
  game,
  busy,
  onEdit,
}: {
  player: AttendancePlayer;
  game: AttendanceGame;
  busy: boolean;
  onEdit: () => void;
}) {
  const outcome = outcomeOf(player);
  const reply = PARTICIPATION[player.participation];
  const enough = player.hits >= game.required;
  return (
    <tr className={needsReview(player) ? "bg-amber-400/[0.04]" : undefined}>
      <td className="py-2.5 pr-3">
        <span className="flex items-center gap-2.5">
          <Avatar url={player.avatar_url} name={player.name} size={32} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-bold text-white">{player.name}</span>
              {player.vip && (
                <span className="rounded bg-fuchsia-500/20 px-1 text-[9px] font-black uppercase text-fuchsia-200" title="VIP — never gets no-show warnings">
                  VIP
                </span>
              )}
              {player.late_join && (
                <span className="rounded bg-sky-500/20 px-1 text-[9px] font-black uppercase text-sky-200" title="Joined after the game started">
                  Late join
                </span>
              )}
              {player.chatlog_hint && (
                <span
                  className="rounded bg-amber-500/20 px-1 text-[9px] font-black uppercase text-amber-200"
                  title={`The game's chat log shows the ${player.chatlog_hint.tag} tag (${player.chatlog_hint.nation}) — they may have played without being in voice`}
                >
                  Chat log: {player.chatlog_hint.tag}
                </span>
              )}
            </span>
            {player.username && <span className="block truncate text-[11px] text-slate-500">@{player.username}</span>}
          </span>
        </span>
      </td>
      <td className="py-2.5 pr-3 text-slate-200">
        {player.slots.map((slot) => (
          <span key={slot.key} className="block whitespace-nowrap">
            {slot.label}
            {slot.penalty > 1 && (
              <span className="ml-1 text-[10px] font-bold text-slate-500" title={`A no-show here gives ${slot.penalty} warnings (Major)`}>
                ×{slot.penalty}
              </span>
            )}
          </span>
        ))}
      </td>
      <td className={`py-2.5 pr-3 text-xs font-semibold ${reply.className}`} title={player.drop_reason ? `${reply.title}: “${player.drop_reason}”` : reply.title}>
        {reply.label}
        {player.drop_reason && <span className="ml-1 cursor-help text-slate-500">💬</span>}
      </td>
      <td className="py-2.5 pr-3">
        <SampleDots player={player} game={game} />
      </td>
      <td className={`py-2.5 pr-3 text-xs font-black tabular-nums ${enough ? "text-emerald-300" : "text-slate-400"}`}>
        {player.hits}/{game.samples.length || game.sample_count}
      </td>
      <td className="py-2.5 pr-3 text-xs">
        {player.live ? (
          <span className={VOICE_TEXT[player.live.state]} title={VOICE_LABEL[player.live.state]}>
            {VOICE_SHORT[player.live.state]}
            {player.live.vc && player.live.state === "no_pass" && <span className="text-slate-500"> · {player.live.vc}</span>}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-black ${outcome.className}`} title={outcome.title}>
          {outcome.label}
        </span>
        {player.override && (
          <span
            className="mt-1 block text-[10px] text-slate-400"
            title={`“${player.override.reason}”${player.override.by_name ? ` — ${player.override.by_name}` : ""}`}
          >
            ✎ set by {player.override.by_name ?? "a host"}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-xs">
        {player.warnings_applied > 0 ? (
          <span className="font-black text-rose-300">+{player.warnings_applied}</span>
        ) : player.vip ? (
          <span className="text-slate-500">VIP</span>
        ) : game.phase !== "finalized" && player.verdict === "absent" && player.penalty > 0 ? (
          <span className="text-slate-400" title="What they'd get if they stay absent">
            +{player.penalty} if absent
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      {game.can_edit && (
        <td className="py-2.5 text-right">
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:border-emerald-300/50 hover:text-white disabled:opacity-40"
          >
            Change
          </button>
        </td>
      )}
    </tr>
  );
}

function Legend() {
  const states: VoiceState[] = ["present", "lobby", "no_pass", "no_voice", "unknown", "dropped"];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-[11px] text-slate-500">
      {states.map((state) => (
        <span key={state} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full border ${VOICE_DOT[state]}`} />
          {VOICE_LABEL[state]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-white/20" />
        Not taken yet
      </span>
    </div>
  );
}

function RequestBanner({
  state,
  onDismiss,
}: {
  state: ReturnType<typeof useModerationRequest>["state"];
  onDismiss: () => void;
}) {
  if (state.phase === "idle") return null;
  if (state.phase === "sending" || state.phase === "waiting") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-slate-300">
        <Spinner className="h-4 w-4 text-emerald-300" />
        {state.phase === "sending" ? "Sending…" : "The bot is on it (scanning voice / applying)…"}
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-100">
        <span className="flex-1">{state.message}</span>
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }
  return (
    <div className="gm-fade-up rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-50">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-black">
            {state.outcome.title} — {state.outcome.summary}
          </p>
          {state.outcome.notes.length > 0 && (
            <ul className="mt-1 space-y-0.5 opacity-90">
              {state.outcome.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

/** Spreadsheet export (text cells starting with = + - @ are quoted so Excel won't run them). */
function exportCsv(game: AttendanceGame) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = [
    "Player",
    "Username",
    "Discord ID",
    "Nation",
    "Reply",
    ...game.samples.map((sample) => `Sample ${sample.index} (${clockTime(sample.ts)})`),
    "Seen",
    "Result",
    "Set by host",
    "Host reason",
    "No-show warnings",
  ];
  const rows = game.roster.map((player) => [
    player.name,
    player.username ?? "",
    player.user_id,
    player.slots.map((slot) => slot.label).join(" + "),
    PARTICIPATION[player.participation].label,
    ...game.samples.map((_, index) => {
      const state = player.samples[index];
      return state ? VOICE_SHORT[state] : "Not seen";
    }),
    `${player.hits}/${game.samples.length}`,
    outcomeOf(player).label,
    player.override ? (player.override.by_name ?? "host") : "",
    player.override?.reason ?? "",
    player.warnings_applied,
  ]);
  const csv = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${game.name.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase()}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
