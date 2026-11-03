"use client";

import Link from "next/link";
import {
  AudioLines,
  Camera,
  ChevronLeft,
  ClipboardList,
  Clock,
  Download,
  Gamepad2,
  Headphones,
  MessageSquare,
  Pencil,
  RefreshCw,
  Search,
  UserRound,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceGame, AttendancePlayer, VoiceState } from "@/lib/attendanceTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { SubmitButton } from "@/components/database/ActionPanel";
import Avatar from "@/components/database/Avatar";
import { useModerationRequest } from "@/components/database/useModerationRequest";
import { Spinner } from "@/components/schedule/ui";
import { CardTitle } from "@/components/games/labels";
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
      <section className="gm-plate p-6">
        {state?.error ? (
          <p className="gm-cut bg-rose-950 px-3 py-2 text-sm text-rose-200 [--cut:8px]">{state.error}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-ink-400">
            <Spinner className="h-4 w-4 text-brand-300" /> Loading attendance…
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
    <div className="space-y-4">
      {/* Header */}
      <section data-tour="attendance.header" className="gm-plate p-4 sm:p-[18px]">
        {onBack && (
          <button type="button" onClick={onBack} className="gm-btn gm-btn-quiet -ml-2 mb-1 h-7 px-2 text-xs lg:hidden">
            <ChevronLeft aria-hidden />
            Games
          </button>
        )}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="gm-title min-w-0 break-words text-2xl sm:text-[32px]">{game.name}</h1>
              <span data-game-state={phase.state} className="gm-tag gm-tag-dot gm-state-tag">
                {phase.label}
              </span>
              {state?.key !== key && <Spinner className="h-3.5 w-3.5 text-ink-400" />}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-400">
              <span className="inline-flex items-center gap-1.5">
                <UserRound aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                Hosted by <b className="font-semibold text-ink-100">{game.host_name ?? "unknown"}</b>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClipboardList aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                {game.mode}, {game.logging_mode} logging
              </span>
              {game.started_at && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                  Started {dateTime(game.started_at)}
                </span>
              )}
            </div>
            {finalized && game.finalized_at && (
              <p className="mt-1 text-xs text-ink-500">
                Finalized {dateTime(game.finalized_at)}
                {game.finalized_by ? (game.finalized_by === "Automatic" ? ", automatically" : ` by ${game.finalized_by}`) : ""}
                {game.early_ended && ". The game ended before all samples."}
                {!game.confident && " Low confidence (too few samples): only host-marked absences were warned."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link href={`/games?game=${game.id}`} className="gm-btn gm-btn-secondary h-[34px] px-3 text-[13px]" title="Start, end or cancel this game">
              <Gamepad2 aria-hidden />
              Game controls
            </Link>
            <button
              type="button"
              onClick={() => exportCsv(game)}
              className="gm-btn gm-btn-secondary h-[34px] px-3 text-[13px]"
              title="Download the roster with every sample as a spreadsheet (CSV)"
            >
              <Download aria-hidden />
              Export CSV
            </button>
            <button type="button" onClick={refresh} className="gm-btn gm-btn-quiet h-[34px] w-[34px] p-0" aria-label="Refresh" title="Refresh">
              <RefreshCw aria-hidden />
            </button>
          </div>
        </div>

        {state?.error && <p className="gm-cut mt-3 bg-yellow-950 px-3 py-2 text-xs text-yellow-200 [--cut:8px]">{state.error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <Stat label={finalized ? "Present" : "On track"} value={String(counts.present)} of={roster.length} tone="present" />
          <Stat label="At risk" value={String(atRisk)} tone="risk" hint={finalized ? undefined : "Can still be counted"} />
          <Stat label="Absent" value={String(counts.absent - atRisk)} tone="absent" />
          <Stat label="Excused" value={String(counts.excused)} tone="excused" />
          <Stat
            label={finalized ? "No-show warnings" : "Warnings if absent"}
            value={String(warnings)}
            tone="plain"
            hint={finalized ? "Given at finalize or by hosts" : "If nothing changes"}
          />
        </div>
      </section>

      {/* Samples + actions */}
      <section data-tour="attendance.samples" className="gm-plate grid gap-5 p-4 sm:p-[18px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <CardTitle icon={AudioLines} title="Voice samples" />
          <p className="text-[13px] text-ink-400">
            The bot checks voice every <b className="font-semibold text-ink-100">{game.interval_minutes} min</b>. Seen in{" "}
            <b className="font-semibold text-ink-100">
              {game.required} of {game.sample_count}
            </b>{" "}
            samples (in a game voice channel with the Gamer Pass) counts as present. VIPs never get no-show warnings.
          </p>
          <SampleTrack game={game} />
        </div>

        <div className="space-y-2">
          <CardTitle icon={Wrench} title="Host actions" />
          {!finalized && (
            <ActionButton
              icon={Headphones}
              label="Check voice now"
              text="See who's in voice right now. Doesn't count as a sample."
              disabled={busy}
              onClick={() => send("att_check")}
            />
          )}
          {game.can_edit && game.phase === "live" && game.samples_done < game.sample_count && (
            <ActionButton
              icon={Camera}
              label="Take sample now"
              text="Counts as the next sample; the one after is due one interval later."
              disabled={busy}
              onClick={() => send("att_sample")}
            />
          )}
          {game.can_edit && !finalized && (
            <div className="gm-cut bg-ink-950 p-3 [--cut:10px]">
              <p className="mb-2 text-[12.5px] leading-snug text-ink-400">
                <b className="font-semibold text-ink-100">Finalize now</b>: stop sampling and give no-show warnings from the{" "}
                {plural(game.samples_done, "sample")} taken. Use it when the game ended early.
              </p>
              <SubmitButton
                label="Finalize attendance"
                danger
                busy={busy}
                disabled={game.samples_done < game.required}
                onConfirm={() => send("att_finalize")}
              />
              {game.samples_done < game.required && (
                <p className="mt-1.5 text-xs text-ink-500">Needs at least {game.required} samples (or end the game on the Games page).</p>
              )}
            </div>
          )}
          {finalized && game.can_edit && (
            <p className="gm-cut bg-ink-950 p-3 text-[12.5px] leading-snug text-ink-400 [--cut:10px]">
              Attendance is final. Use <b className="font-semibold text-ink-100">Change</b> on a player to correct it. Warnings,
              attended games and bans are adjusted and the player gets a DM.
            </p>
          )}
          {!game.can_edit && (
            <p className="gm-cut bg-ink-950 p-3 text-[12.5px] leading-snug text-ink-400 [--cut:10px]">
              Only {game.host_name ?? "the game's host"} or staff can change this game&apos;s attendance. You can follow it and run
              voice checks.
            </p>
          )}
          <RequestBanner state={request.state} onDismiss={request.reset} />
        </div>
      </section>

      {/* Roster */}
      <section data-tour="attendance.roster" className="gm-plate p-4 sm:p-[18px]">
        <CardTitle icon={Users} title="Roster">
          {game.live_check && (
            <span className="gm-tag hidden bg-ink-800 text-ink-300 sm:inline-flex">
              <Headphones aria-hidden className="h-3 w-3" />
              Voice check {formatRelative(Math.min(game.live_check.ts * 1000, now), now)}
              {game.live_check.by_name ? ` by ${game.live_check.by_name}` : ""}: {game.live_check.in_voice}/{roster.length} in voice
            </span>
          )}
        </CardTitle>
        <div className="mt-2.5 flex flex-wrap items-center gap-[5px]">
          {FILTERS.map((option) => {
            const active = option.value === filter;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={active}
                className={`gm-cut flex h-[26px] items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors [--cut:6px] ${
                  active
                    ? "bg-brand-400 text-brand-950"
                    : "bg-ink-950 text-ink-300 shadow-[inset_0_0_0_1px_var(--color-ink-800)] hover:text-ink-100"
                }`}
              >
                {option.label}
                <span className={active ? "opacity-70" : "font-medium text-ink-500"}>{counts[option.value]}</span>
              </button>
            );
          })}
          <label className="gm-field ml-auto h-8 w-full sm:w-56">
            <Search aria-hidden className="h-4 w-4 shrink-0" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value.slice(0, 64))}
              placeholder="Find player or nation"
              aria-label="Find a player or nation"
              className="text-[13px]"
            />
          </label>
        </div>

        {/* Phones: one card per player. */}
        <ul className="mt-3 space-y-1.5 md:hidden">
          {shown.map((player) => (
            <RosterCard key={player.user_id} player={player} game={game} busy={busy} onEdit={() => setEditing(player.user_id)} />
          ))}
        </ul>
        <div className="roster-scroll -mx-4 mt-3 hidden overflow-x-auto px-4 sm:-mx-[18px] sm:px-[18px] md:block">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-800 text-xs font-semibold text-ink-500">
                <th className="py-2 pr-3 font-semibold">Player</th>
                <th className="py-2 pr-3 font-semibold">Nation</th>
                <th className="py-2 pr-3 font-semibold" title="Reply to the participation DM">
                  Reply
                </th>
                <th className="py-2 pr-3 font-semibold">Samples</th>
                <th className="py-2 pr-3 font-semibold">Seen</th>
                <th className="py-2 pr-3 font-semibold" title="Latest voice check">
                  Now
                </th>
                <th className="py-2 pr-3 font-semibold">Result</th>
                <th className="py-2 pr-3 font-semibold">Warnings</th>
                {game.can_edit && <th className="py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {shown.map((player) => (
                <RosterRow key={player.user_id} player={player} game={game} busy={busy} onEdit={() => setEditing(player.user_id)} />
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="py-8 text-center text-xs text-ink-500">No players match.</p>}
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
        <p className="text-center text-xs text-ink-500">
          Preview mode: the bot is simulated. Voice checks and samples use made-up voice states.
        </p>
      )}
    </div>
  );
}

const TONES = {
  present: { text: "text-emerald-300", line: "shadow-[inset_0_2px_0_var(--color-emerald-300)]" },
  risk: { text: "text-yellow-300", line: "shadow-[inset_0_2px_0_var(--color-yellow-300)]" },
  absent: { text: "text-rose-300", line: "shadow-[inset_0_2px_0_var(--color-rose-400)]" },
  excused: { text: "text-sky-300", line: "shadow-[inset_0_2px_0_var(--color-sky-300)]" },
  plain: { text: "text-ink-100", line: "" },
} as const;

function Stat({ label, value, of, tone, hint }: { label: string; value: string; of?: number; tone: keyof typeof TONES; hint?: string }) {
  return (
    <div className={`gm-cut bg-ink-950 px-3 py-2.5 [--cut:10px] ${TONES[tone].line}`}>
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-1 font-display text-[30px] font-extrabold leading-none ${TONES[tone].text}`}>
        {value}
        {of !== undefined && <span className="text-xl text-ink-500">/{of}</span>}
      </p>
      {hint && <p className="mt-1 text-[11.5px] text-ink-500">{hint}</p>}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  text,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
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
      className="gm-cut grid w-full grid-cols-[30px_minmax(0,1fr)] items-start gap-2.5 bg-ink-950 p-2.5 text-left transition-colors [--cut:10px] hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="gm-cut flex h-[30px] w-[30px] items-center justify-center bg-ink-800 text-ink-100 [--cut:6px]">
        <Icon aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold text-ink-100">{label}</span>
        <span className="block text-xs leading-snug text-ink-400">{text}</span>
      </span>
    </button>
  );
}

function Countdown({ at }: { at: number }) {
  const now = useNow(1000);
  const left = Math.round(at - now / 1000);
  if (left <= 0) return <span className="text-yellow-300">due now</span>;
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return (
    <span className="tabular-nums text-yellow-300">
      in {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function SampleTrack({ game }: { game: AttendanceGame }) {
  const finalized = game.phase === "finalized";
  return (
    <ol className="mt-3.5 grid grid-cols-2 gap-[7px] sm:grid-cols-5">
      {Array.from({ length: game.sample_count }, (_, index) => {
        const sample = game.samples[index];
        const isNext = !sample && index === game.samples.length;
        if (sample) {
          return (
            <li
              key={index}
              className="gm-cut bg-[color-mix(in_oklab,var(--color-emerald-300)_10%,var(--color-ink-950))] px-3 py-2.5 shadow-[inset_0_2px_0_var(--color-emerald-300)] [--cut:9px]"
            >
              <p className="text-xs text-ink-400">Sample {sample.index}</p>
              <p className="mt-1 font-display text-[26px] font-extrabold leading-none text-ink-100">
                {sample.count}
                <span className="ml-1 font-sans text-xs font-medium text-ink-400">in voice</span>
              </p>
              <p className="mt-1 text-[11.5px] text-ink-500">
                {clockTime(sample.ts)}
                {sample.manual && <span className="text-yellow-200">, early{sample.by_name ? ` by ${sample.by_name}` : ""}</span>}
                {sample.final_bonus && <span className="text-sky-200">, end scan</span>}
              </p>
            </li>
          );
        }
        if (isNext && game.next_sample_at) {
          return (
            <li key={index} className="gm-cut bg-ink-950 px-3 py-2.5 shadow-[inset_0_2px_0_var(--color-yellow-300)] [--cut:9px]">
              <p className="text-xs text-ink-400">Sample {index + 1}, next</p>
              <p className="mt-1 font-display text-[22px] font-extrabold leading-none">
                <Countdown at={game.next_sample_at} />
              </p>
              <p className="mt-1 text-[11.5px] text-ink-500">at {clockTime(game.next_sample_at)}</p>
            </li>
          );
        }
        const eta =
          game.next_sample_at && !finalized ? game.next_sample_at + (index - game.samples.length) * game.interval_minutes * 60 : null;
        return (
          <li key={index} className="gm-cut px-3 py-2.5 text-ink-500 shadow-[inset_0_0_0_1px_var(--color-ink-800)] [--cut:9px]">
            <p className="text-xs">Sample {index + 1}</p>
            <p className="mt-1 font-display text-xl font-extrabold leading-none">
              {finalized ? "Not taken" : game.phase === "ending" ? "Skipped" : eta ? `~${clockTime(eta)}` : "Pending"}
            </p>
            <p className="mt-1 text-[11.5px]">{finalized ? "finalized early" : game.phase === "ending" ? "game ended" : "planned"}</p>
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
              title={`Sample ${index + 1}: not taken yet`}
              className="h-3.5 w-3.5 rounded-full border border-dashed border-ink-600"
            />
          );
        }
        const state: VoiceState | null = player.samples[index] ?? null;
        return (
          <span
            key={index}
            title={`Sample ${sample.index}, ${clockTime(sample.ts)}: ${state ? VOICE_LABEL[state] : "Not seen"}`}
            className={`h-3.5 w-3.5 rounded-full ${state ? VOICE_DOT[state] : "bg-ink-800 shadow-[inset_0_0_0_1px_var(--color-ink-600)]"}`}
          />
        );
      })}
    </span>
  );
}

/** A player's name with their VIP / Late join / chat-log tags. */
function PlayerName({ player }: { player: AttendancePlayer }) {
  const mini = "gm-cut inline-flex h-[17px] items-center px-1.5 text-[10.5px] font-bold [--cut:4px]";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="truncate font-semibold text-ink-100">{player.name}</span>
      {player.vip && (
        <span className={`${mini} bg-fuchsia-500/20 text-fuchsia-200`} title="VIP: never gets no-show warnings">
          VIP
        </span>
      )}
      {player.late_join && (
        <span className={`${mini} bg-sky-950 text-sky-300`} title="Joined after the game started">
          Late join
        </span>
      )}
      {player.chatlog_hint && (
        <span
          className={`${mini} bg-yellow-950 text-yellow-300`}
          title={`The game's chat log shows the ${player.chatlog_hint.tag} tag (${player.chatlog_hint.nation}): they may have played without being in voice`}
        >
          Chat log: {player.chatlog_hint.tag}
        </span>
      )}
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
    <tr className={needsReview(player) ? "bg-yellow-300/[0.04]" : undefined}>
      <td className="py-2.5 pr-3">
        <span className="flex items-center gap-2.5">
          <Avatar url={player.avatar_url} name={player.name} size={32} />
          <span className="min-w-0">
            <PlayerName player={player} />
            {player.username && <span className="block truncate text-xs text-ink-500">@{player.username}</span>}
          </span>
        </span>
      </td>
      <td className="py-2.5 pr-3 text-ink-100">
        {player.slots.map((slot) => (
          <span key={slot.key} className="block whitespace-nowrap">
            {slot.label}
            {slot.penalty > 1 && (
              <span className="ml-1 text-[11px] font-semibold text-ink-500" title={`A no-show here gives ${slot.penalty} warnings (Major)`}>
                ×{slot.penalty}
              </span>
            )}
          </span>
        ))}
      </td>
      <td className={`py-2.5 pr-3 text-xs font-semibold ${reply.className}`} title={player.drop_reason ? `${reply.title}: “${player.drop_reason}”` : reply.title}>
        <span className="inline-flex items-center gap-1">
          {reply.label}
          {player.drop_reason && <MessageSquare aria-label="Has a reason" className="h-3.5 w-3.5 cursor-help text-ink-500" />}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <SampleDots player={player} game={game} />
      </td>
      <td className={`py-2.5 pr-3 text-xs font-semibold tabular-nums ${enough ? "text-emerald-300" : "text-ink-400"}`}>
        {player.hits}/{game.samples.length || game.sample_count}
      </td>
      <td className="py-2.5 pr-3 text-xs">
        {player.live ? (
          <span className={VOICE_TEXT[player.live.state]} title={VOICE_LABEL[player.live.state]}>
            {VOICE_SHORT[player.live.state]}
            {player.live.vc && player.live.state === "no_pass" && <span className="text-ink-500">, {player.live.vc}</span>}
          </span>
        ) : (
          <span className="text-ink-600">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        <span className={`gm-tag ${outcome.className}`} title={outcome.title}>
          {outcome.label}
        </span>
        {player.override && (
          <span
            className="mt-1 flex items-center gap-1 text-[11px] text-ink-400"
            title={`“${player.override.reason}”${player.override.by_name ? `, ${player.override.by_name}` : ""}`}
          >
            <Pencil aria-hidden className="h-3 w-3" />
            set by {player.override.by_name ?? "a host"}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-xs">
        <Warnings player={player} game={game} />
      </td>
      {game.can_edit && (
        <td className="py-2.5 text-right">
          <button type="button" disabled={busy} onClick={onEdit} className="gm-btn gm-btn-secondary h-7 px-2.5 text-xs [--cut:6px]">
            Change
          </button>
        </td>
      )}
    </tr>
  );
}

function Warnings({ player, game }: { player: AttendancePlayer; game: AttendanceGame }) {
  if (player.warnings_applied > 0) return <span className="font-semibold text-rose-300">+{player.warnings_applied}</span>;
  if (player.vip) return <span className="text-ink-500">VIP</span>;
  if (game.phase !== "finalized" && player.verdict === "absent" && player.penalty > 0) {
    return (
      <span className="text-ink-400" title="What they'd get if they stay absent">
        +{player.penalty} if absent
      </span>
    );
  }
  return <span className="text-ink-600">—</span>;
}

/** Phones: the same facts as a table row, as a small card. */
function RosterCard({
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
  return (
    <li
      className={`gm-cut bg-ink-950 px-3 py-2.5 text-[13px] [--cut:10px] ${
        needsReview(player) ? "shadow-[inset_3px_0_0_var(--color-yellow-300)]" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Avatar url={player.avatar_url} name={player.name} size={30} />
        <span className="min-w-0 flex-1">
          <PlayerName player={player} />
          <span className="block truncate text-xs text-ink-400">{player.slots.map((slot) => slot.label).join(", ")}</span>
        </span>
        <span className={`gm-tag shrink-0 ${outcome.className}`} title={outcome.title}>
          {outcome.label}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-400">
        <SampleDots player={player} game={game} />
        <span>
          {player.hits}/{game.samples.length || game.sample_count} seen
        </span>
        <span className={`font-semibold ${reply.className}`} title={reply.title}>
          {reply.label}
        </span>
        <Warnings player={player} game={game} />
        {game.can_edit && (
          <button type="button" disabled={busy} onClick={onEdit} className="gm-btn gm-btn-secondary ml-auto h-7 px-2.5 text-xs [--cut:6px]">
            Change
          </button>
        )}
      </div>
    </li>
  );
}

function Legend() {
  const states: VoiceState[] = ["present", "lobby", "no_pass", "no_voice", "dropped", "unknown"];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-800 pt-3 text-xs text-ink-400">
      {states.map((state) => (
        <span key={state} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${VOICE_DOT[state]}`} />
          {VOICE_LABEL[state]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-600" />
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
      <div className="gm-cut flex items-center gap-2 bg-ink-950 px-3 py-2.5 text-xs text-ink-300 [--cut:8px]">
        <Spinner className="h-4 w-4 text-sky-300" />
        {state.phase === "sending" ? "Sending…" : "The bot is on it (scanning voice / applying)…"}
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="gm-cut flex items-start gap-2 bg-rose-950 px-3 py-2.5 text-xs text-rose-200 [--cut:8px]">
        <span className="flex-1">{state.message}</span>
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="gm-cut gm-fade-up bg-emerald-950 px-3 py-2.5 text-xs text-emerald-100 [--cut:8px]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {state.outcome.title}: {state.outcome.summary}
          </p>
          {state.outcome.notes.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-90">
              {state.outcome.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          <X aria-hidden className="h-3.5 w-3.5" />
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
