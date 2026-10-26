"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { GameControl, LifecycleAction } from "@/lib/gameControlTypes";
import type { HostProfile, ScheduleRequestStatus } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { useNow, useRefreshTick } from "@/components/attendance/labels";
import { PreviewBox, ReasonField, SubmitButton } from "@/components/database/ActionPanel";
import Avatar from "@/components/database/Avatar";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { submitScheduleRequest, useRequestPoller } from "@/components/schedule/useRequestPoller";
import AccessCard from "./AccessCard";
import ChatLogCard from "./ChatLogCard";
import DraftCard from "./DraftCard";
import HotJoinCard from "./HotJoinCard";
import LateJoinCard from "./LateJoinCard";
import MessagePlayersCard from "./MessagePlayersCard";
import RemindersCard from "./RemindersCard";
import RulesModsCard from "./RulesModsCard";
import StartGameForm from "./StartGameForm";
import { ACTION_LABEL, BotText, PhaseBadge, dateTime, duration } from "./labels";

/**
 * One game on the Games page: what state it's in, the start form (formerly
 * /game_start), End game (/game_end) and Cancel game (/game_cancel), the
 * bot's live progress while it works, and the roster.
 */

const CANCEL_REASONS = ["Not enough players", "Host unavailable", "Server / technical problems", "Rescheduled to another day"];

export default function GameControlPanel({
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
  const [state, setState] = useState<{ key: string; game: GameControl | null; error: string | null } | null>(null);
  const [localRequest, setLocalRequest] = useState<{ id: string; action: LifecycleAction } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [sending, setSending] = useState<LifecycleAction | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const game = state?.game ?? null;

  // A start / end / cancel this viewer sent earlier (even from another tab) is followed too.
  const inFlight = game?.in_flight_request ?? null;
  const tracked = localRequest ?? (inFlight?.mine ? { id: inFlight.request_id, action: inFlight.action } : null);
  const trackedId = tracked && tracked.id !== dismissed ? tracked.id : null;
  const { status, waitedSec } = useRequestPoller(trackedId);
  const working =
    sending !== null || (trackedId !== null && (!status || status.status === "pending" || status.status === "running"));

  const active = Boolean(inFlight) || working || game?.phase === "live" || game?.phase === "starting" || game?.phase === "ending";
  const [tick, refresh] = useRefreshTick(active ? 5_000 : 30_000);
  const key = `${tick}|${nonce}`;
  const now = useNow(15_000);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/control/games/${gameId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { game?: GameControl; error?: string } | null;
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

  // When the bot finishes, reload this game (render-time) and the list (effect).
  const finishedId = status && (status.status === "done" || status.status === "error") ? status.request_id : null;
  const [handledFinish, setHandledFinish] = useState<string | null>(null);
  if (finishedId && finishedId !== handledFinish) {
    setHandledFinish(finishedId);
    setNonce((value) => value + 1);
  }
  useEffect(() => {
    if (finishedId) onChanged();
  }, [finishedId, onChanged]);
  // After an access change or late join: reload this game and the list.
  const refreshAll = useCallback(() => {
    refresh();
    onChanged();
  }, [refresh, onChanged]);

  if (!game) {
    return (
      <section className={`rounded-3xl p-6 ${GLASS}`}>
        {state?.error ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{state.error}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner className="h-4 w-4 text-amber-300" /> Loading the game…
          </div>
        )}
      </section>
    );
  }

  const submit = async (action: LifecycleAction, payload: Record<string, unknown>) => {
    setSending(action);
    setSubmitError(null);
    const result = await submitScheduleRequest({ action, payload: { thread_id: game.id, ...payload } });
    setSending(null);
    if (result.ok) {
      setLocalRequest({ id: result.requestId, action });
      refresh();
      onChanged(); // the list shows it in progress
    } else {
      setSubmitError(result.error);
    }
  };

  const otherHostWorking = inFlight && !inFlight.mine;
  const started = game.phase === "live" || game.phase === "ending" || game.phase === "ended";
  const showControls = game.can_manage && !otherHostWorking;

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
              <h1 className="min-w-0 break-words text-2xl font-black tracking-tight text-white">{game.name}</h1>
              <PhaseBadge phase={game.phase} size="md" />
              {state?.key !== key && <Spinner className="h-3.5 w-3.5 text-slate-400" />}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {game.mode} · hosted by <span className="font-semibold text-slate-200">{game.host_name ?? "unknown"}</span>
              {game.mine && <span className="ml-1.5 rounded bg-amber-400/20 px-1.5 text-xs font-bold text-amber-200">You</span>} ·{" "}
              {game.logging_mode} logging
              {game.add_on && <> · add-on: {game.add_on}</>}
            </p>
            {game.scheduled_at && (
              <p className="mt-0.5 text-xs text-slate-500">
                Scheduled {dateTime(game.scheduled_at)} ({formatRelative(game.scheduled_at * 1000, now)})
              </p>
            )}
            {game.preset && (
              <p
                className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-teal-400/30 bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-100"
                title={game.preset.not_playable.length ? `Not playable: ${game.preset.not_playable.join(", ")}` : undefined}
              >
                🧩 Preset: {game.preset.name ?? "custom groups"}
                {game.preset.groups && <span className="text-teal-200/70">· {game.preset.groups.map((group) => group.name).join(", ")}</span>}
                {game.preset.not_playable.length > 0 && (
                  <span className="text-teal-200/70">· {game.preset.not_playable.length} nations not playable</span>
                )}
              </p>
            )}
          </div>
          <div className="ml-auto flex flex-wrap gap-2 sm:ml-0">
            {game.discord_url && (
              <a
                href={game.discord_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-indigo-300/50 hover:text-white"
              >
                {game.has_thread ? "Discord thread ↗" : "Discord post ↗"}
              </a>
            )}
            {(started || game.samples_done > 0) && (
              <Link
                href={`/attendance?game=${game.id}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-emerald-300/50 hover:text-white"
              >
                🎯 Attendance
              </Link>
            )}
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        {state?.error && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{state.error}</p>
        )}
        {!game.can_manage && (
          <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
            Only {game.host_name ?? "the game's host"} or Host Management can start, end or cancel this game. You can follow it here.
          </p>
        )}
        {otherHostWorking && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <Spinner className="h-3.5 w-3.5" /> {ACTION_LABEL[inFlight.action].running} — sent by another host. This page updates when
            it&apos;s done.
          </p>
        )}
      </section>

      {/* The bot at work */}
      {tracked && trackedId && (
        <ProgressCard
          action={tracked.action}
          status={status}
          waitedSec={waitedSec}
          onDismiss={() => {
            setDismissed(tracked.id);
            setLocalRequest(null);
          }}
        />
      )}
      {submitError && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <span className="flex-1">{submitError}</span>
          <button type="button" onClick={() => setSubmitError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* What can happen next */}
      {game.draft && game.phase === "announced" && <DraftCard game={game} now={now} onChanged={refreshAll} />}
      {game.phase === "announced" && (
        <StartGameForm
          game={game}
          now={now}
          canStart={showControls}
          busy={working}
          sending={sending === "game_start"}
          onStart={(payload) => void submit("game_start", payload)}
        />
      )}
      {game.phase === "starting" && !working && (
        <Notice tone="amber" title="The bot is starting this game">
          A start began less than 10 minutes ago. If it got stuck (for example the bot restarted), you can try again once those 10
          minutes are up.
        </Notice>
      )}
      {(game.phase === "live" || game.phase === "ending") && (
        <LiveCard game={game} now={now} canEnd={showControls} busy={working} onEnd={() => void submit("game_end", {})} />
      )}
      {(game.phase === "announced" || game.phase === "live") && !working && (
        <RemindersCard game={game} now={now} onChanged={refreshAll} />
      )}
      {(game.phase === "announced" || game.phase === "live") && !working && (
        <MessagePlayersCard game={game} onChanged={refreshAll} />
      )}
      {game.phase === "live" && !working && <HotJoinCard game={game} onChanged={refreshAll} />}
      {game.phase === "live" && showControls && !working && <LateJoinCard game={game} onChanged={refreshAll} />}
      {(game.phase === "announced" || game.phase === "live") && !working && <AccessCard game={game} onChanged={refreshAll} />}
      {(game.phase === "announced" || game.phase === "live") && !working && <RulesModsCard game={game} onChanged={refreshAll} />}
      {(game.phase === "announced" || game.phase === "starting" || game.phase === "live") && showControls && (
        <CancelCard game={game} busy={working} onCancel={(reason) => void submit("game_cancel", { reason })} />
      )}
      {game.phase === "ended" && (
        <Notice tone="slate" title="🏁 This game has ended">
          {game.ended_at ? `Ended ${dateTime(game.ended_at)}. ` : ""}
          {game.present} of {game.players} player(s) were counted present. Corrections go through the{" "}
          <Link href={`/attendance?game=${game.id}`} className="font-bold text-emerald-300 hover:underline">
            Attendance page
          </Link>
          .
        </Notice>
      )}
      {game.phase === "cancelled" && (
        <Notice tone="rose" title="🗑️ This game was cancelled">
          {game.cancelled_at ? `Cancelled ${dateTime(game.cancelled_at)}` : "Cancelled"}
          {game.cancelled_by ? ` by ${game.cancelled_by}` : ""}.
          {game.cancel_reason && <span className="mt-1 block text-slate-300">“{game.cancel_reason}”</span>}
        </Notice>
      )}
      {/* Played games: the chat log + AI analysis (formerly the Host Control Center). */}
      {(game.phase === "live" || game.phase === "ending" || game.phase === "ended") && !working && (
        <ChatLogCard game={game} onChanged={refreshAll} />
      )}
      {/* Finished games: still reachable (a thank-you, a rematch, a correction). */}
      {(game.phase === "ended" || game.phase === "cancelled") && <MessagePlayersCard game={game} onChanged={refreshAll} />}

      <RosterCard game={game} />
      {host.demo && (
        <p className="text-center text-[11px] text-slate-500">
          Preview mode: the bot is simulated — starting, ending and cancelling take a few seconds and change nothing in Discord.
        </p>
      )}
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "amber" | "slate" | "rose"; title: string; children: ReactNode }) {
  const tones = {
    amber: "border-amber-400/40 bg-amber-500/10",
    slate: "border-white/10 bg-white/[0.03]",
    rose: "border-rose-400/30 bg-rose-500/5",
  };
  return (
    <section className={`rounded-3xl border p-4 text-sm text-slate-300 sm:p-6 ${tones[tone]}`}>
      <p className="font-black text-white">{title}</p>
      <div className="mt-1 leading-relaxed">{children}</div>
    </section>
  );
}

function ProgressCard({
  action,
  status,
  waitedSec,
  onDismiss,
}: {
  action: LifecycleAction;
  status: ScheduleRequestStatus | null;
  waitedSec: number;
  onDismiss: () => void;
}) {
  const label = ACTION_LABEL[action];
  const life = status?.result?.lifecycle;
  const steps = life?.steps ?? [];
  const phase = !status || status.status === "pending" ? "queued" : status.status === "running" ? "running" : status.status;
  const finished = phase === "done" || phase === "error";
  const border =
    phase === "done" ? "border-emerald-400/40 bg-emerald-500/10" : phase === "error" ? "border-rose-400/40 bg-rose-500/10" : "border-amber-400/40 bg-amber-500/10";
  return (
    <section className={`gm-fade-up rounded-3xl border p-4 sm:p-6 ${border}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{label.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-white">
            {phase === "done" ? (life?.title ?? label.done) : phase === "error" ? `${label.running} failed` : `${label.running}…`}
          </p>
          {phase === "queued" && (
            <p className="mt-1 text-sm text-slate-300">
              Waiting for the bot to pick it up{waitedSec > 3 ? ` (${waitedSec}s)` : ""}…
              {waitedSec > 45 && " It checks every few seconds — if this takes much longer, the bot may be offline."}
            </p>
          )}
          {phase === "done" && life?.summary && <p className="mt-1 text-sm text-emerald-50">{life.summary}</p>}
          {phase === "error" && status?.error && (
            <p className="mt-1 text-sm text-rose-100">
              <BotText text={status.error} />
            </p>
          )}
        </div>
        {finished && (
          <button type="button" onClick={onDismiss} className="text-slate-300 opacity-70 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>
      {steps.length > 0 && (
        <ol className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-sm">
          {steps.map((step, index) => {
            const current = phase === "running" && index === steps.length - 1;
            return (
              <li key={`${step.ts}-${index}`} className="flex items-start gap-2 text-slate-200">
                <span className="mt-0.5 w-4 shrink-0 text-center text-xs">{current ? <Spinner className="h-3.5 w-3.5 text-amber-300" /> : "✓"}</span>
                <span className="min-w-0 flex-1">
                  <BotText text={step.text} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {phase === "done" && life?.notes && life.notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-emerald-50/90">
          {life.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LiveCard({
  game,
  now,
  canEnd,
  busy,
  onEnd,
}: {
  game: GameControl;
  now: number;
  canEnd: boolean;
  busy: boolean;
  onEnd: () => void;
}) {
  const ending = game.phase === "ending";
  const confirmed = game.roster.filter((player) => player.confirmed).length;
  return (
    <section className={`grid gap-5 rounded-3xl p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_340px] ${GLASS}`}>
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">{ending ? "Ending" : "Live game"}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Running for" value={game.started_at ? duration(now / 1000 - game.started_at) : "—"} />
          <Stat label="Confirmed" value={`${confirmed}/${game.players}`} hint="Answered Yes to the DM" />
          <Stat label="Samples" value={`${game.samples_done}/5`} hint={game.interval_minutes ? `every ${game.interval_minutes} min` : undefined} />
          <Stat label="Present so far" value={String(game.present)} hint="Seen in 2+ samples" />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Follow who&apos;s in voice, fix mistakes and see the full log on the{" "}
          <Link href={`/attendance?game=${game.id}`} className="font-bold text-emerald-300 hover:underline">
            Attendance page
          </Link>
          .
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{ending ? "Finish ending" : "End the game"}</p>
        {ending && (
          <p className="text-[11px] leading-snug text-amber-100">
            The last end didn&apos;t finish (the bot may have restarted). Ending again picks up where it stopped.
          </p>
        )}
        <PreviewBox
          preview={{
            lines: [
              "Finalizes attendance (one last voice scan) and the public log",
              "Removes the voice channels and the Gamer Pass role; clears the game-info channel",
              "Posts the 1–5 rating poll and DMs the players who were present",
              game.has_thread ? "Deletes the announcement, mods and rules posts and the reservation thread" : "Deletes the announcement, mods and rules posts",
              "DMs you a link to the game's attendance for corrections",
            ],
            danger: false,
            error: null,
          }}
        />
        {canEnd ? (
          <SubmitButton label={ending ? "🏁 Finish ending the game" : "🏁 End game"} danger busy={busy} disabled={busy} onConfirm={onEnd} />
        ) : (
          <p className="text-[11px] text-slate-500">Only the game&apos;s host or Host Management can end it.</p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-black text-white">{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function CancelCard({ game, busy, onCancel }: { game: GameControl; busy: boolean; onCancel: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const started = game.phase === "live" || game.phase === "starting";
  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-40"
        >
          Cancel this game…
        </button>
      </div>
    );
  }
  return (
    <section className="gm-fade-up rounded-3xl border border-rose-400/30 bg-rose-500/5 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">Cancel the game</p>
          <p className="mt-1 text-sm text-slate-300">No penalties for anyone — use it when the game can&apos;t happen.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ReasonField value={reason} onChange={setReason} quick={CANCEL_REASONS} label="Reason (DMed to every reserved player)" />
        <div className="space-y-3">
          <PreviewBox
            preview={{
              lines: [
                `Every reserved player (${game.players}) gets a DM with your reason`,
                ...(started
                  ? ["No-show warnings from this game are reverted and spent commends refunded", "Removes the voice channels and the Gamer Pass role"]
                  : []),
                game.has_thread ? "Deletes the announcement, mods and rules posts and the reservation thread" : "Deletes the announcement, mods and rules posts",
                "Shows as cancelled on the calendar and is logged in the audit log",
              ],
              danger: true,
              error: null,
            }}
          />
          <SubmitButton
            label="🗑️ Cancel game"
            danger
            busy={busy}
            disabled={busy || reason.trim().length < 3}
            onConfirm={() => onCancel(reason.trim())}
          />
        </div>
      </div>
    </section>
  );
}

function RosterCard({ game }: { game: GameControl }) {
  const started = game.roster.some((player) => player.confirmed !== null);
  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Reserved players</p>
        <p className="text-xs text-slate-400">{game.players} player(s)</p>
      </div>
      {game.roster.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nobody has reserved a nation yet.</p>
      ) : (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {game.roster.map((player) => (
            <li key={player.user_id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2">
              <Avatar url={player.avatar_url} name={player.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{player.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{player.slot}</span>
              </span>
              {started && (
                <span
                  className={`shrink-0 text-[10px] font-black uppercase ${player.confirmed ? "text-emerald-300" : "text-slate-500"}`}
                  title={player.confirmed ? "Answered Yes to the participation DM" : "Hasn't confirmed yet"}
                >
                  {player.confirmed ? "✓ Yes" : "No reply"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
