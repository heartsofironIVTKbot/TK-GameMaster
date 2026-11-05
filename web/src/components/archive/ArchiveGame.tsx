"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Archive, ArrowLeft, Check, Drama, Eye, EyeOff, Link2, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag } from "@/components/roleplay/shared";
import ModeIcon from "@/components/schedule/ModeIcon";
import { Spinner } from "@/components/schedule/ui";
import SiteHeader from "@/components/site/SiteHeader";
import { usePlayerRequest } from "@/components/usePlayerRequest";
import type { ArchiveGameDetail, ArchiveMarks, ArchiveRow } from "@/lib/archiveTypes";
import { modeOption } from "@/lib/scheduleOptions";
import { MARK, MARK_ORDER, PRESENCE, RatingBlock, StatusTag, presenceLabel, when } from "./parts";

/**
 * /archive/<game>: one game's record. The rating, count boxes like the map's
 * reservation board, then every nation grouped the way the board groups them
 * (docs/game-archive.md). A running game refreshes itself.
 */

const REFRESH_MS = 15_000;

export default function ArchiveGame() {
  const id = String(useParams<{ id: string }>().id ?? "");
  const [state, setState] = useState<{ id: string; game: ArchiveGameDetail | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/archive/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (ArchiveGameDetail & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !body?.card) setState({ id, game: null, error: body?.error ?? "This game couldn't be loaded." });
        else setState({ id, game: body, error: null });
      })
      .catch(() => {
        if (!cancelled) setState((current) => current ?? { id, game: null, error: "Can't reach the server. Check your connection." });
      });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  const game = state?.id === id ? state.game : null;
  const running = game?.card.status === "ongoing" || game?.card.status === "starting";
  const ratingOpen = game?.card.rating.open ?? false;

  // A running game (or one still being rated) keeps itself up to date.
  useEffect(() => {
    if (!running && !ratingOpen) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((value) => value + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [running, ratingOpen]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page="archive" title="Archive" subtitle={game?.card.name ?? "One game"} />
      <main className="mx-auto max-w-[1000px] space-y-3 px-4 py-5 sm:px-6">
        <Link href="/archive" className="gm-btn gm-btn-quiet -ml-2 h-[30px] px-2.5 text-[12.5px] [--cut:7px]">
          <ArrowLeft aria-hidden strokeWidth={1.75} />
          All games
        </Link>
        {!state || state.id !== id ? (
          <div className="flex items-center gap-2 px-2 py-10 text-sm text-ink-400">
            <Spinner className="h-4 w-4 text-brand-300" /> Loading the game…
          </div>
        ) : !game ? (
          <div className="gm-plate flex flex-col items-center p-10 text-center">
            <Archive aria-hidden className="h-9 w-9 text-brand-400" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold text-ink-100">{state.error}</p>
          </div>
        ) : (
          <GameView game={game} running={running} onRated={reload} />
        )}
      </main>
    </div>
  );
}

function GameView({ game, running, onRated }: { game: ArchiveGameDetail; running: boolean; onRated: () => void }) {
  const { card } = game;
  const [query, setQuery] = useState("");
  const [showOpen, setShowOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const openCount = game.sections.reduce((sum, section) => sum + section.open, 0);
  const terms = query.trim().toLowerCase();

  const sections = useMemo(
    () =>
      game.sections
        .map((section) => ({
          ...section,
          rows: section.rows.filter(
            (row) =>
              (showOpen || row.player || terms) &&
              (!terms || `${row.nation} ${row.player?.name ?? ""}`.toLowerCase().includes(terms)),
          ),
        }))
        .filter((section) => section.rows.length > 0),
    [game.sections, showOpen, terms],
  );

  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const span = game.ended_at && game.started_at ? `${when(game.started_at)} to ${new Date(game.ended_at * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : when(card.ts);
  const showRating = card.status === "ended" || card.rating.count > 0;

  const boxes: { value: number; of?: number; lead?: boolean; icon: typeof Check; tone: string; label: string }[] =
    card.status === "cancelled"
      ? []
      : [
          { value: card.counts.played, of: card.counts.reserved, lead: true, ...PRESENCE.played, label: running ? "In game" : "Played" },
          ...(running ? [] : [{ value: card.counts.no_show, ...PRESENCE.no_show }]),
          { value: card.counts.told_host, ...PRESENCE.told_host },
          { value: card.counts.late, ...PRESENCE.late },
          ...MARK_ORDER.map((key) => ({ value: card.counts[key], ...MARK[key] })),
        ];

  return (
    <>
      <section className="gm-plate p-4 sm:px-5 sm:py-[18px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`gm-tag bg-ink-800 ${card.category === "Roleplay" ? "text-violet-300" : "text-sky-300"}`}>
            <ModeIcon mode={card.mode} className="h-3 w-3" strokeWidth={1.75} />
            {modeOption(card.mode)?.label ?? card.mode}
          </span>
          <StatusTag status={card.status} />
          <span className="ml-auto text-xs text-ink-400">{span}</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="gm-title text-[34px] sm:text-[44px]">{card.name}</h1>
            <p className="mt-1 text-xs text-ink-400">
              {card.server_name}
              {card.host_name ? `, hosted by ${card.host_name}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {card.graded && (
                <Link href={`/roleplay/${card.id}`} className="gm-btn gm-btn-secondary h-[30px] px-3 text-[12.5px] [--cut:7px]">
                  <Drama aria-hidden className="text-violet-300" strokeWidth={1.75} />
                  Read the roleplay
                </Link>
              )}
              <button type="button" onClick={copy} className="gm-btn gm-btn-quiet h-[30px] px-2.5 text-[12.5px] [--cut:7px]">
                {copied ? <Check aria-hidden strokeWidth={1.75} /> : <Link2 aria-hidden strokeWidth={1.75} />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
          {showRating && <RatingBlock rating={card.rating} />}
        </div>

        {boxes.length > 0 && (
          <div
            data-tour="archive.counts"
            className={`gm-cut mt-4 grid grid-cols-3 bg-ink-950 [--cut:10px] ${running ? "sm:grid-cols-8" : "sm:grid-cols-9"}`}
          >
            {boxes.map((box, index) => {
              const Icon = box.icon;
              return (
                <div
                  key={box.label}
                  className={`px-1 pb-2 pt-2.5 text-center ${index % 3 ? "border-l border-ink-800" : ""} ${index >= 3 ? "border-t border-ink-800 sm:border-t-0" : ""} ${index ? "sm:border-l" : "sm:border-l-0"}`}
                >
                  <strong className={`block font-display text-2xl font-extrabold leading-none ${box.lead ? "text-brand-400" : "text-ink-100"}`}>
                    {box.value}
                    {box.of !== undefined && <small className="text-[15px] text-ink-500">/{box.of}</small>}
                  </strong>
                  <span className="mt-1.5 inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] text-ink-400">
                    <Icon aria-hidden className={`h-[13px] w-[13px] ${box.tone}`} strokeWidth={1.75} />
                    {box.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {game.viewer && (game.viewer.can_rate || game.viewer.stars !== null) && (
        <RateBox gameId={card.id} viewer={game.viewer} closesAt={card.rating.closes_at} onRated={onRated} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-500" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 60))}
            placeholder="Find a nation or player"
            aria-label="Find a nation or player"
            className="gm-input h-[34px] min-h-0 w-full pl-8 text-[13px]"
          />
        </label>
        {openCount > 0 && (
          <button type="button" onClick={() => setShowOpen((value) => !value)} aria-pressed={showOpen} className="gm-btn gm-btn-quiet h-[34px] px-3 text-[12.5px]">
            {showOpen ? <EyeOff aria-hidden strokeWidth={1.75} /> : <Eye aria-hidden strokeWidth={1.75} />}
            {showOpen ? "Hide" : "Show"} nations nobody played ({openCount})
          </button>
        )}
      </div>

      <section data-tour="archive.board" className="gm-plate px-2 pb-2.5 pt-1">
        {sections.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-ink-500">{terms ? "No nation or player matches that." : "Nobody reserved a nation in this game."}</p>
        ) : (
          sections.map((section, sectionIndex) => {
            const full = game.sections.find((entry) => entry.title === section.title);
            const played = full ? full.rows.filter((row) => row.player).length : 0;
            return (
              <div key={`${section.title}-${sectionIndex}`}>
                <h2 className="flex items-baseline gap-2 px-2 pb-1 pt-3 text-xs font-semibold text-ink-500">
                  {section.title}
                  <span className="ml-auto font-normal">
                    {played} of {full?.rows.length ?? section.rows.length} {card.status === "cancelled" ? "reserved" : running ? "reserved" : "played"}
                  </span>
                </h2>
                <div className="flex flex-col">
                  {section.rows.map((row, index) => (
                    <BoardRow key={`${row.nation}-${index}`} row={row} running={running} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}

function BoardRow({ row, running }: { row: ArchiveRow; running: boolean }) {
  const presence = row.presence === "none" ? null : PRESENCE[row.presence];
  const PresenceIcon = presence?.icon;
  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1 border-t border-ink-800/60 px-2 py-2 text-[13px] first:border-t-0 sm:grid-cols-[22px_180px_minmax(0,1fr)_150px_96px] sm:py-0 sm:h-[38px]">
      <Flag tag={row.tag ?? ""} className="h-3.5 w-[22px]" />
      <span className={`truncate font-semibold ${row.player ? "text-ink-100" : "text-ink-400"}`}>{row.nation}</span>
      <span className="col-start-2 row-start-2 min-w-0 sm:col-auto sm:row-auto">
        {row.player ? (
          <span className="gm-tag max-w-full bg-rose-950/80 text-rose-300">
            <span className="truncate">{row.player.name}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-500">Nobody</span>
        )}
      </span>
      <span className="row-span-2 inline-flex items-center gap-1.5 text-xs text-ink-400 sm:row-span-1">
        {presence && PresenceIcon && (
          <>
            <PresenceIcon aria-hidden className={`h-[15px] w-[15px] ${presence.tone}`} strokeWidth={1.75} />
            <span className="hidden sm:inline">{presenceLabel(row.presence as Exclude<typeof row.presence, "none">, running)}</span>
            <span className="sr-only sm:hidden">{presenceLabel(row.presence as Exclude<typeof row.presence, "none">, running)}</span>
          </>
        )}
      </span>
      <span className="row-span-2 sm:row-span-1">
        <Marks marks={row.marks} />
      </span>
    </div>
  );
}

function Marks({ marks }: { marks: ArchiveMarks }) {
  const shown = MARK_ORDER.filter((key) => marks[key] > 0);
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center justify-end gap-1">
      {shown.map((key) => {
        const { icon: Icon, tone, label, plural } = MARK[key];
        const count = marks[key];
        return (
          <span key={key} className="inline-flex items-center text-[11px] font-semibold text-ink-300" title={`${count} ${count === 1 ? label : plural}`}>
            {Array.from({ length: Math.min(count, 2) }, (_, index) => (
              <Icon key={index} aria-hidden className={`h-[14px] w-[14px] ${tone}`} strokeWidth={1.75} />
            ))}
            {count > 2 && <span className="ml-0.5">{count}</span>}
            <span className="sr-only">
              {count} {count === 1 ? label : plural}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** For players whose rating DM didn't arrive: the same rating, from the website. */
function RateBox({
  gameId,
  viewer,
  closesAt,
  onRated,
}: {
  gameId: string;
  viewer: NonNullable<ArchiveGameDetail["viewer"]>;
  closesAt: number | null;
  onRated: () => void;
}) {
  const request = usePlayerRequest(`/api/archive/${gameId}/rate`, onRated);
  const [picked, setPicked] = useState<number | null>(null);
  const done = request.state.phase === "done" ? (request.state.result as { rating?: { stars: number; first: boolean; merit: number } } | null)?.rating : undefined;
  const current = done?.stars ?? viewer.stars;

  return (
    <section
      data-tour="archive.rate"
      className="gm-plate flex flex-wrap items-center gap-x-4 gap-y-3 bg-yellow-950/30 p-4 [--line:color-mix(in_oklab,var(--color-yellow-300)_30%,var(--color-ink-800))] sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-100">
          {!viewer.can_rate
            ? `You gave it ${current} ${current === 1 ? "star" : "stars"}. Rating has closed.`
            : current
              ? `You gave it ${current} ${current === 1 ? "star" : "stars"}.`
              : "You played this game. How was it?"}
        </p>
        <p className="mt-0.5 text-xs text-ink-400">
          {done?.first && done.merit ? `+${done.merit} Merit for rating. ` : ""}
          {viewer.can_rate && closesAt ? `You can ${current ? "change it" : "rate it"} until ${when(closesAt)}. ` : ""}
          {viewer.can_rate && !current ? "Your first rating gives 1 Merit. " : ""}
          Nobody sees who gave what.
        </p>
        {request.state.phase === "error" && <p className="mt-1 text-xs text-rose-300">{request.state.message}</p>}
      </div>
      {viewer.can_rate && (
        <div className="flex gap-1" role="group" aria-label="Rate this game">
          {[1, 2, 3, 4, 5].map((stars) => {
            const on = (request.busy ? picked : current) === stars;
            return (
              <button
                key={stars}
                type="button"
                disabled={request.busy}
                onClick={() => {
                  setPicked(stars);
                  void request.submit("POST", { stars });
                }}
                aria-pressed={on}
                aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`}
                className={`gm-cut inline-flex h-[34px] items-center gap-1.5 px-3 text-[13px] font-semibold [--cut:7px] disabled:opacity-70 ${
                  on ? "bg-brand-400 text-brand-950" : "bg-ink-950 text-ink-100 shadow-[inset_0_0_0_1px_var(--color-ink-700)] hover:bg-ink-800"
                }`}
              >
                {request.busy && picked === stars ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Star aria-hidden className={`h-3.5 w-3.5 ${on ? "fill-brand-950" : "fill-yellow-300 text-yellow-300"}`} strokeWidth={1.75} />
                )}
                {stars}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
