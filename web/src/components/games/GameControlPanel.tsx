"use client";

import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  FlagTriangleRight,
  Gamepad2,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { GameControl, LifecycleAction } from "@/lib/gameControlTypes";
import type { HostProfile, ScheduleRequestStatus } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";
import { useNow, useRefreshTick } from "@/components/attendance/labels";
import { PreviewBox, ReasonField, SubmitButton } from "@/components/database/ActionPanel";
import Avatar from "@/components/database/Avatar";
import ModeIcon from "@/components/schedule/ModeIcon";
import { Spinner } from "@/components/schedule/ui";
import { submitScheduleRequest, useRequestPoller } from "@/components/schedule/useRequestPoller";
import AccessCard from "./AccessCard";
import ChatLogCard from "./ChatLogCard";
import DraftCard from "./DraftCard";
import HotJoinCard from "./HotJoinCard";
import FortunesCard from "./FortunesCard";
import CasinoFallbackCard from "./CasinoFallbackCard";
import LateJoinCard from "./LateJoinCard";
import MessagePlayersCard from "./MessagePlayersCard";
import RemindersCard from "./RemindersCard";
import RulesModsCard from "./RulesModsCard";
import StartGameForm from "./StartGameForm";
import { ACTION_LABEL, BotText, CardTitle, PhaseBadge, dateTime, duration, gameTitle } from "./labels";

/**
 * One game on the Games page: what state it's in, the start form (formerly
 * /game_start), End game (/game_end) and Cancel game (/game_cancel), the
 * bot's live progress while it works, and the roster. The cards sit in tabs:
 * Overview (start / live / end, players, cancel), Players (draft, hot-join,
 * late join), Messages, Nations and rules, Chat log.
 */

type GameTab = "overview" | "players" | "messages" | "setup" | "log";

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
  const [tab, setTab] = useState<GameTab>("overview");
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
      <section className="gm-plate p-6">
        {state?.error ? (
          <p className="gm-cut bg-rose-950 px-3 py-2 text-sm text-rose-200 [--cut:8px]">{state.error}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-ink-400">
            <Spinner className="h-4 w-4 text-brand-300" /> Loading the game…
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
  const open = game.phase === "announced" || game.phase === "live";
  const waitingHotJoins = game.hotjoin.filter((request) => request.status === "pending").length;

  // The tabs this game has (a finished game keeps Overview, Messages and the chat log).
  const tabs: { id: GameTab; label: string; icon: LucideIcon; count?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    ...(game.phase === "live" || (game.draft && game.phase === "announced")
      ? [{ id: "players" as const, label: "Players", icon: Users, count: waitingHotJoins }]
      : []),
    { id: "messages", label: "Messages", icon: Send },
    ...(open ? [{ id: "setup" as const, label: "Nations and rules", icon: Lock }] : []),
    ...(game.phase === "live" || game.phase === "ending" || game.phase === "ended"
      ? [{ id: "log" as const, label: "Chat log", icon: FileText }]
      : []),
  ];
  const current = tabs.some((entry) => entry.id === tab) ? tab : "overview";
  const busyNote = (
    <p className="gm-plate flex items-center gap-2 p-4 text-sm text-ink-400 [--cut:12px]">
      <Spinner className="h-4 w-4" /> Available again once the bot has finished.
    </p>
  );

  return (
    <div className="space-y-4">
      {/* Header and tabs */}
      <section data-tour="games.header" className="gm-plate">
        <div className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3 p-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:gap-3.5 sm:p-[18px]">
          <span className="gm-cut flex h-10 w-10 items-center justify-center bg-ink-800 text-ink-100 [--cut:9px] sm:h-12 sm:w-12 sm:[--cut:10px]">
            <ModeIcon mode={game.mode} className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            {onBack && (
              <button type="button" onClick={onBack} className="gm-btn gm-btn-quiet -ml-2 mb-1 h-7 px-2 text-xs lg:hidden">
                <ChevronLeft aria-hidden />
                Games
              </button>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="gm-title min-w-0 break-words text-2xl sm:text-[32px]">{gameTitle(game.name)}</h1>
              <PhaseBadge phase={game.phase} />
              {state?.key !== key && <Spinner className="h-3.5 w-3.5 text-ink-400" />}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-400">
              <span className="inline-flex items-center gap-1.5">
                <UserRound aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                Hosted by <b className="font-semibold text-ink-100">{game.host_name ?? "unknown"}</b>
                {game.mine && <span className="gm-tag h-[19px] bg-brand-950 px-2 text-[11px] text-brand-400">You</span>}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Gamepad2 aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                {game.mode}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClipboardList aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                {game.logging_mode} logging
              </span>
              {game.add_on && <span className="gm-tag gm-addon-tag h-[19px] px-2.5 text-[11px]">{game.add_on}</span>}
              {game.scheduled_at && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                  {dateTime(game.scheduled_at)} ({formatRelative(game.scheduled_at * 1000, now)})
                </span>
              )}
            </div>
            {game.preset && (
              <p
                className="gm-tag mt-2 h-[22px] bg-ink-800 text-ink-300"
                title={game.preset.not_playable.length ? `Not playable: ${game.preset.not_playable.join(", ")}` : undefined}
              >
                <Layers aria-hidden className="h-3 w-3" />
                Preset: {game.preset.name ?? "custom groups"}
                {game.preset.groups && <span className="text-ink-400">({game.preset.groups.map((group) => group.name).join(", ")})</span>}
                {game.preset.not_playable.length > 0 && (
                  <span className="text-ink-400">, {game.preset.not_playable.length} nations not playable</span>
                )}
              </p>
            )}
          </div>
          <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1">
            {game.discord_url && (
              <a href={game.discord_url} target="_blank" rel="noreferrer" className="gm-btn gm-btn-secondary h-[34px] px-3 text-[13px]">
                <MessageSquare aria-hidden />
                {game.has_thread ? "Discord thread" : "Discord post"}
              </a>
            )}
            {(started || game.samples_done > 0) && (
              <Link href={`/attendance?game=${game.id}`} className="gm-btn gm-btn-secondary h-[34px] px-3 text-[13px]">
                <ClipboardCheck aria-hidden />
                Attendance
              </Link>
            )}
            <button type="button" onClick={refresh} className="gm-btn gm-btn-quiet h-[34px] w-[34px] p-0" aria-label="Refresh" title="Refresh">
              <RefreshCw aria-hidden />
            </button>
          </div>
        </div>
        {(state?.error || !game.can_manage || otherHostWorking) && (
          <div className="space-y-2 px-4 pb-3 sm:px-[18px]">
            {state?.error && <p className="gm-cut bg-yellow-950 px-3 py-2 text-xs text-yellow-200 [--cut:8px]">{state.error}</p>}
            {!game.can_manage && (
              <p className="gm-cut bg-ink-950 px-3 py-2 text-xs text-ink-400 [--cut:8px]">
                Only {game.host_name ?? "the game's host"} or Host Management can start, end or cancel this game. You can follow it here.
              </p>
            )}
            {otherHostWorking && (
              <p className="gm-cut flex items-center gap-2 bg-sky-950 px-3 py-2 text-xs text-sky-200 [--cut:8px]">
                <Spinner className="h-3.5 w-3.5" /> {ACTION_LABEL[inFlight.action].running}: sent by another host. This page updates when
                it&apos;s done.
              </p>
            )}
          </div>
        )}
        <nav data-tour="games.tabs" className="roster-scroll mx-2 flex overflow-x-auto border-t border-ink-800 sm:mx-[18px] sm:border-t-0 sm:border-b-0" aria-label="Game sections">
          {tabs.map((entry) => {
            const Icon = entry.icon;
            const on = entry.id === current;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-current={on ? "page" : undefined}
                className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-[13.5px] font-semibold transition-colors ${
                  on ? "text-ink-100 shadow-[inset_0_-2px_0_var(--color-brand-400)]" : "text-ink-400 hover:text-ink-100"
                }`}
              >
                <Icon aria-hidden className={`h-4 w-4 ${on ? "text-brand-400" : ""}`} strokeWidth={1.75} />
                {entry.label}
                {entry.count ? (
                  <span className="gm-cut grid h-[18px] min-w-[18px] place-items-center bg-yellow-300 px-1 text-[11px] font-bold text-ink-950 [--cut:4px]">
                    {entry.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
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
        <div className="gm-cut flex items-start gap-2 bg-rose-950 px-4 py-3 text-sm text-rose-200 [--cut:10px]">
          <span className="flex-1">{submitError}</span>
          <button type="button" onClick={() => setSubmitError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      )}

      {current === "overview" && (
        <>
          {game.phase === "announced" && (game.add_on === "randomizer" || game.add_on === "fortunes") && (
            <CasinoFallbackCard game={game} onChanged={refreshAll} />
          )}
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
            <Notice tone="busy" icon={Play} title="The bot is starting this game">
              A start began less than 10 minutes ago. If it got stuck (for example the bot restarted), you can try again once those 10
              minutes are up.
            </Notice>
          )}
          {(game.phase === "live" || game.phase === "ending") && (
            <LiveCard game={game} now={now} canEnd={showControls} busy={working} onEnd={() => void submit("game_end", {})} />
          )}
          {game.phase === "ended" && (
            <Notice tone="plain" icon={Flag} title="This game has ended">
              {game.ended_at ? `Ended ${dateTime(game.ended_at)}. ` : ""}
              {game.present} of {game.players} player(s) were counted present. Corrections go through the{" "}
              <Link href={`/attendance?game=${game.id}`} className="font-semibold text-brand-400 hover:underline">
                Attendance page
              </Link>
              .
              {game.rating && (
                <span className="mt-1.5 block">
                  {game.rating.count === 0
                    ? "Nobody has rated it yet."
                    : `Rated ${(game.rating.average ?? 0).toFixed(1)} out of 5 by ${game.rating.count} ${game.rating.count === 1 ? "player" : "players"}.`}{" "}
                  {game.rating.open && game.rating.closes_at
                    ? `Players rate it from their end-of-game DM until ${dateTime(game.rating.closes_at)}; then the hosting is judged (3.0 or more is successful). `
                    : game.rating.result === "successful"
                      ? "Successful hosting. "
                      : game.rating.result === "unsuccessful"
                        ? "Not successful hosting (under 3.0). "
                        : ""}
                  <Link href={`/archive/${game.id}`} className="font-semibold text-brand-400 hover:underline">
                    Open it in the archive
                  </Link>
                  .
                </span>
              )}
            </Notice>
          )}
          {game.phase === "cancelled" && (
            <Notice tone="danger" icon={Trash2} title="This game was cancelled">
              {game.cancelled_at ? `Cancelled ${dateTime(game.cancelled_at)}` : "Cancelled"}
              {game.cancelled_by ? ` by ${game.cancelled_by}` : ""}.
              {game.cancel_reason && <span className="mt-1 block text-ink-300">“{game.cancel_reason}”</span>}
            </Notice>
          )}
          <RosterCard game={game} />
          {(game.phase === "announced" || game.phase === "starting" || game.phase === "live") && showControls && (
            <CancelCard game={game} busy={working} onCancel={(reason) => void submit("game_cancel", { reason })} />
          )}
        </>
      )}

      {current === "players" &&
        (working ? (
          busyNote
        ) : (
          <>
            {game.add_on === "fortunes" && <FortunesCard game={game} />}
            {game.draft && game.phase === "announced" && <DraftCard game={game} now={now} onChanged={refreshAll} />}
            {game.phase === "live" && <HotJoinCard game={game} onChanged={refreshAll} />}
            {game.phase === "live" && showControls && <LateJoinCard game={game} onChanged={refreshAll} />}
          </>
        ))}

      {current === "messages" &&
        (working ? (
          busyNote
        ) : (
          <>
            {open && <RemindersCard game={game} now={now} onChanged={refreshAll} />}
            <MessagePlayersCard game={game} onChanged={refreshAll} />
          </>
        ))}

      {current === "setup" &&
        (working ? (
          busyNote
        ) : (
          <>
            <AccessCard game={game} onChanged={refreshAll} />
            <RulesModsCard game={game} onChanged={refreshAll} />
          </>
        ))}

      {current === "log" && (working ? busyNote : <ChatLogCard game={game} onChanged={refreshAll} />)}

      {host.demo && (
        <p className="text-center text-xs text-ink-500">
          Preview mode: the bot is simulated. Starting, ending and cancelling take a few seconds and change nothing in Discord.
        </p>
      )}
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "busy" | "plain" | "danger";
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const tones = {
    busy: { box: "bg-sky-950/60", icon: "text-sky-300" },
    plain: { box: "", icon: "text-ink-300" },
    danger: { box: "bg-rose-950/50", icon: "text-rose-300" },
  };
  return (
    <section className={`gm-plate p-4 text-sm text-ink-300 sm:p-[18px] ${tones[tone].box}`}>
      <p className="flex items-center gap-2">
        <Icon aria-hidden className={`h-[18px] w-[18px] ${tones[tone].icon}`} strokeWidth={1.75} />
        <span className="gm-title text-[22px]">{title}</span>
      </p>
      <div className="mt-1.5 leading-relaxed">{children}</div>
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
  const Icon = label.icon;
  const life = status?.result?.lifecycle;
  const steps = life?.steps ?? [];
  const phase = !status || status.status === "pending" ? "queued" : status.status === "running" ? "running" : status.status;
  const finished = phase === "done" || phase === "error";
  const tone =
    phase === "done"
      ? { box: "bg-emerald-950/60", icon: "text-emerald-300" }
      : phase === "error"
        ? { box: "bg-rose-950/60", icon: "text-rose-300" }
        : { box: "bg-sky-950/60", icon: "text-sky-300" };
  return (
    <section className={`gm-plate gm-fade-up p-4 sm:p-[18px] ${tone.box}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="gm-title text-[22px]">
            {phase === "done" ? (life?.title ?? label.done) : phase === "error" ? `${label.running} failed` : `${label.running}…`}
          </p>
          {phase === "queued" && (
            <p className="mt-1 text-sm text-ink-300">
              Waiting for the bot to pick it up{waitedSec > 3 ? ` (${waitedSec}s)` : ""}…
              {waitedSec > 45 && " It checks every few seconds. If this takes much longer, the bot may be offline."}
            </p>
          )}
          {phase === "done" && life?.summary && <p className="mt-1 text-sm text-emerald-100">{life.summary}</p>}
          {phase === "error" && status?.error && (
            <p className="mt-1 text-sm text-rose-200">
              <BotText text={status.error} />
            </p>
          )}
        </div>
        {finished && (
          <button type="button" onClick={onDismiss} className="gm-btn gm-btn-quiet h-7 w-7 p-0" aria-label="Dismiss">
            <X aria-hidden />
          </button>
        )}
      </div>
      {steps.length > 0 && (
        <ol className="mt-3.5 space-y-1.5 border-t border-ink-800 pt-3 text-sm">
          {steps.map((step, index) => {
            const now = phase === "running" && index === steps.length - 1;
            return (
              <li key={`${step.ts}-${index}`} className="flex items-start gap-2 text-ink-300">
                <span className="mt-0.5 w-4 shrink-0">
                  {now ? <Spinner className="h-3.5 w-3.5 text-sky-300" /> : <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2.5} />}
                </span>
                <span className="min-w-0 flex-1">
                  <BotText text={step.text} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {phase === "done" && life?.notes && life.notes.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-emerald-100/90">
          {life.notes.map((note) => (
            <li key={note}>{note}</li>
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
    <section data-tour="games.live" className="gm-plate grid gap-5 p-4 sm:p-[18px] xl:grid-cols-[minmax(0,1fr)_330px]">
      <div>
        <CardTitle icon={Radio} title={ending ? "Ending" : "Live game"} />
        <p className="mb-3.5 text-[13px] text-ink-400">
          Follow who&apos;s in voice and fix mistakes on the{" "}
          <Link href={`/attendance?game=${game.id}`} className="font-semibold text-brand-400 hover:underline">
            Attendance page
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Running for" value={game.started_at ? duration(now / 1000 - game.started_at) : "—"} />
          <Stat label="Confirmed" value={String(confirmed)} of={game.players} hint="Answered Yes to the DM" />
          <Stat label="Samples" value={String(game.samples_done)} of={5} hint={game.interval_minutes ? `Every ${game.interval_minutes} min` : undefined} />
          <Stat label="Present so far" value={String(game.present)} hint="Seen in 2+ samples" />
        </div>
      </div>
      <div className="space-y-2.5">
        <CardTitle icon={FlagTriangleRight} title={ending ? "Finish ending" : "End the game"} tone="danger" />
        {ending && (
          <p className="text-xs leading-snug text-yellow-200">
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
          <SubmitButton label={ending ? "Finish ending the game" : "End game"} danger busy={busy} disabled={busy} onConfirm={onEnd} />
        ) : (
          <p className="text-xs text-ink-500">Only the game&apos;s host or Host Management can end it.</p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, of, hint }: { label: string; value: string; of?: number; hint?: string }) {
  return (
    <div className="gm-cut bg-ink-950 px-3 py-2.5 [--cut:10px]">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-1 font-display text-[30px] font-extrabold leading-none text-ink-100">
        {value}
        {of !== undefined && <span className="text-xl text-ink-500">/{of}</span>}
      </p>
      {hint && <p className="mt-1 text-[11.5px] text-ink-500">{hint}</p>}
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
        <button type="button" onClick={() => setOpen(true)} disabled={busy} className="gm-btn gm-btn-danger h-[34px] px-3 text-[13px]">
          <Trash2 aria-hidden />
          Cancel this game
        </button>
      </div>
    );
  }
  return (
    <section data-tour="games.cancel" className="gm-plate gm-fade-up bg-rose-950/40 p-4 [--line:color-mix(in_oklab,var(--color-rose-400)_35%,transparent)] sm:p-[18px]">
      <CardTitle icon={Trash2} title="Cancel the game" tone="danger">
        <button type="button" onClick={() => setOpen(false)} className="gm-btn gm-btn-quiet h-7 w-7 p-0" aria-label="Close">
          <X aria-hidden />
        </button>
      </CardTitle>
      <p className="text-[13px] text-ink-400">No penalties for anyone. Use it when the game can&apos;t happen.</p>
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
          <SubmitButton label="Cancel game" danger busy={busy} disabled={busy || reason.trim().length < 3} onConfirm={() => onCancel(reason.trim())} />
        </div>
      </div>
    </section>
  );
}

function RosterCard({ game }: { game: GameControl }) {
  const started = game.roster.some((player) => player.confirmed !== null);
  return (
    <section data-tour="games.roster" className="gm-plate p-4 sm:p-[18px]">
      <CardTitle icon={Users} title="Reserved players">
        <span className="text-xs text-ink-400">
          {game.players} {game.players === 1 ? "player" : "players"}
        </span>
      </CardTitle>
      {game.roster.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">Nobody has reserved a nation yet.</p>
      ) : (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {game.roster.map((player) => (
            <li key={player.user_id} className="gm-cut flex items-center gap-2.5 bg-ink-950 py-[7px] pl-2 pr-2.5 [--cut:8px]">
              <Avatar url={player.avatar_url} name={player.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink-100">{player.name}</span>
                <span className="block truncate text-xs text-ink-400">{player.slot}</span>
              </span>
              {started &&
                (player.confirmed ? (
                  <span className="gm-tag gm-tag-dot h-[19px] bg-emerald-950 px-2 text-[10.5px] text-emerald-300" title="Answered Yes to the participation DM">
                    Yes
                  </span>
                ) : (
                  <span className="gm-tag h-[19px] bg-ink-800 px-2 text-[10.5px] text-ink-400" title="Hasn't confirmed yet">
                    No reply
                  </span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
