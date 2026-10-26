"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  BanRoad,
  DishonoredRestriction,
  GameBanInfo,
  ModerationEvent,
  ModeStanding,
  PlayerPortfolio,
  PortfolioMode,
  StandingStatus,
  TrustedRoad,
} from "@/lib/playerTypes";
import { formatRelative } from "@/lib/timeEngine";

/**
 * Host-only player portfolio: the bot's /report on the web, laid out as
 * progress "roads" — attendance, mode standings, Road to Trusted, Road to
 * Valor, Road to Ban — plus Dishonored / Game Banned details (only when
 * active) and the latest 20 games. Rendered into <body> so it covers the
 * whole page regardless of where the profile card sits.
 */

// 🎖️ is reserved for Merit in the portfolio, so Historical uses ⚔️ here.
const MODE_EMOJI: Record<PortfolioMode, string> = {
  Roleplay: "🎭",
  Historical: "⚔️",
};

const STATUS_STYLE: Record<StandingStatus, { label: string; className: string }> = {
  clear: { label: "🟢 Clear", className: "text-emerald-300" },
  banned: { label: "🔴 Banned", className: "text-rose-300" },
};

function formatDate(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function percentTone(percent: number): string {
  if (percent >= 80) return "text-emerald-300";
  if (percent >= 50) return "text-amber-300";
  return "text-rose-300";
}

export default function PlayerPortfolioModal({
  userId,
  name,
  handle,
  avatarUrl,
  onClose,
}: {
  userId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  onClose: () => void;
}) {
  const [portfolio, setPortfolio] = useState<PlayerPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/players/${userId}/portfolio`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { portfolio?: PlayerPortfolio; error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok || !body?.portfolio) setError(body?.error ?? "Could not load the portfolio.");
        else setPortfolio(body.portfolio);
      })
      .catch(() => {
        if (!cancelled) setError("Network error — try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const anyBanned = (portfolio?.game_bans.length ?? 0) > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={`Portfolio of ${name}`}
        className={`gm-fade-up flex max-h-[min(90vh,880px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-slate-900 shadow-2xl ${
          anyBanned ? "border-rose-500/50" : "border-slate-700"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-800">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-black text-slate-300">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">📊 Player career report</p>
            <p className="truncate text-lg font-black text-white">{name}</p>
            {handle && <p className="truncate text-xs text-slate-400">@{handle}</p>}
          </div>
          <a
            href={`/database?player=${userId}`}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
            title="Give or take commends, warnings, bans and Dishonored"
          >
            🗂️ Moderate
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close portfolio"
            className="rounded-lg px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </header>

        <div className="roster-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!portfolio && !error && <p className="text-sm text-slate-400">Loading report…</p>}
          {error && (
            <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p>
          )}
          {portfolio && <PortfolioBody portfolio={portfolio} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The portfolio content (also shown on the Database page's player record).
 * `playerView`: the player's own profile — staff names and the private
 * host-log links are left out ("By staff").
 */
export function PortfolioBody({ portfolio, playerView = false }: { portfolio: PlayerPortfolio; playerView?: boolean }) {
  const attendancePercent =
    portfolio.attendance_tracked > 0 ? Math.round((portfolio.attended / portfolio.attendance_tracked) * 100) : null;

  return (
    <>
      {/* Career summary */}
      <section className="grid grid-cols-2 gap-2">
        <Tile label="Total games">
          <p className="text-2xl font-black text-white">{portfolio.total_games}</p>
        </Tile>
        <Tile label="Games attended">
          <p className="text-2xl font-black text-white">{portfolio.attended}</p>
          <p className="pr-14 text-[10px] text-slate-500" title="Games whose attendance has been taken">
            of {portfolio.attendance_tracked} tracked
          </p>
          <span
            className={`absolute bottom-2 right-3 text-lg font-black ${
              attendancePercent === null ? "text-slate-500" : percentTone(attendancePercent)
            }`}
            title="Attendance rate"
          >
            {attendancePercent === null ? "—" : `${attendancePercent}%`}
          </span>
        </Tile>
      </section>

      {/* Mode standings */}
      <section>
        <SectionTitle>Mode standings</SectionTitle>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          {portfolio.standings.map((standing) => (
            <StandingRow key={standing.mode} standing={standing} />
          ))}
          <div className="flex items-center gap-3 bg-slate-950/40 px-3 py-2 text-sm">
            <span className="w-28 font-bold text-slate-100">🎖️ Merit</span>
            <span className="flex-1 text-xs text-slate-400">
              {portfolio.hearts_of_valor ? "Hearts of Valor earned" : "Shared across all modes"}
            </span>
            <span className="text-xs font-semibold text-slate-300" title="Merit points">
              🎖️ {portfolio.merit_points}
            </span>
          </div>
        </div>
      </section>

      {/* Road to Trusted */}
      <RoadCard title="🛡️ Road to Trusted" hint={`${portfolio.trusted[0]?.required ?? 5} commends, Verified role, no game ban`}>
        {portfolio.trusted.map((road) => (
          <TrustedRow key={road.mode} road={road} />
        ))}
      </RoadCard>

      {/* Road to Valor */}
      <RoadCard
        title="🎖️ Road to Valor"
        hint={`${portfolio.merit_rules.valor_merit} Merit + ${portfolio.merit_rules.valor_attended} attended games · no current warning`}
        badge={portfolio.hearts_of_valor ? "Earned" : null}
      >
        <ProgressRow
          label="Merit"
          value={portfolio.merit_points}
          goal={portfolio.merit_rules.valor_merit}
          barClass="bg-amber-400"
        />
        <ProgressRow
          label="Attended games"
          value={portfolio.attended}
          goal={portfolio.merit_rules.valor_attended}
          barClass="bg-sky-400"
        />
        {!portfolio.hearts_of_valor &&
          portfolio.merit_points >= portfolio.merit_rules.valor_merit &&
          portfolio.attended >= portfolio.merit_rules.valor_attended &&
          portfolio.standings.some((standing) => standing.warns > 0) && (
            <p className="mt-1 text-[10px] font-semibold text-amber-300">
              Requirements met — held back by a current warning (they were told to open a ticket).
            </p>
          )}
      </RoadCard>

      {/* Road to Ban */}
      <RoadCard title="⚠️ Road to Ban" hint={`${portfolio.bans[0]?.limit ?? 3} warnings in a mode = automatic game ban`}>
        {portfolio.bans.map((road) => (
          <BanRow key={road.mode} road={road} />
        ))}
      </RoadCard>

      {/* Only when active */}
      {portfolio.dishonored.length > 0 && (
        <section className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5">
          <SectionTitle>⚖️ Dishonored title — active</SectionTitle>
          <div className="space-y-2.5">
            {portfolio.dishonored.map((entry) => (
              <DishonoredDetails key={entry.category} entry={entry} />
            ))}
          </div>
        </section>
      )}
      {portfolio.game_bans.length > 0 && (
        <section className="rounded-xl border border-rose-500/50 bg-rose-500/10 px-3 py-2.5">
          <SectionTitle>🔴 Game banned</SectionTitle>
          <div className="space-y-2.5">
            {portfolio.game_bans.map((ban) => (
              <GameBanDetails key={ban.mode} ban={ban} playerView={playerView} />
            ))}
          </div>
        </section>
      )}

      {/* Moderation log (moderation_events) */}
      {portfolio.events.length > 0 && (
        <section>
          <SectionTitle>📜 Moderation history (latest 20)</SectionTitle>
          <ul className="overflow-hidden rounded-xl border border-slate-800">
            {portfolio.events.map((event, index) => (
              <EventRow key={`${event.created_at}-${event.action}-${index}`} event={event} playerView={playerView} />
            ))}
          </ul>
        </section>
      )}

      {/* Recent games */}
      <section>
        <SectionTitle>🎮 Recent game history (latest 20)</SectionTitle>
        {portfolio.history.length === 0 ? (
          <p className="text-sm text-slate-500">No game history recorded.</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-slate-800">
            {portfolio.history.map((game) => (
              <li
                key={game.thread_id}
                className="flex items-center gap-2.5 border-b border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs last:border-b-0"
              >
                <span title={game.present === null ? "Attendance not taken yet" : game.present ? "Showed up" : "No-show"}>
                  {game.present === null ? "⏳" : game.present ? "✅" : "❌"}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-slate-100">{game.nation}</span>
                <span className="max-w-[40%] truncate text-slate-400">{game.mode}</span>
                <span className="w-24 shrink-0 text-right text-slate-500">{formatDate(game.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">{children}</h3>;
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function StandingRow({ standing }: { standing: ModeStanding }) {
  const status = STATUS_STYLE[standing.status];
  return (
    <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
      <span className="w-28 font-bold text-slate-100">
        {MODE_EMOJI[standing.mode]} {standing.mode}
      </span>
      <span className={`flex-1 text-xs font-bold ${status.className}`}>{status.label}</span>
      <span className="text-xs font-semibold text-slate-300" title="Commends">⭐ {standing.commends}</span>
      <span className="w-10 text-right text-xs font-semibold text-slate-300" title="Warnings">
        ⚠️ {standing.warns}
      </span>
    </div>
  );
}

function RoadCard({
  title,
  hint,
  badge = null,
  children,
}: {
  title: string;
  hint: string;
  badge?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-300">{title}</h3>
        {badge && (
          <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-300">
            {badge}
          </span>
        )}
      </div>
      <p className="mb-2 text-[10px] text-slate-500">{hint}</p>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Bar({ fraction, barClass }: { fraction: number; barClass: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${barClass}`}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
      />
    </div>
  );
}

function ProgressRow({ label, value, goal, barClass }: { label: string; value: number; goal: number; barClass: string }) {
  const done = value >= goal;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
        <span className="text-slate-300">{label}</span>
        <span className={done ? "text-emerald-300" : "text-slate-400"}>
          {done ? "✓ " : ""}
          {value}/{goal}
          {!done && <span className="text-slate-500"> · {goal - value} to go</span>}
        </span>
      </div>
      <Bar fraction={value / goal} barClass={barClass} />
    </div>
  );
}

function TrustedRow({ road }: { road: TrustedRoad }) {
  const trusted = road.has_role ?? (road.commends >= road.required && road.verified && !road.banned);
  const blockers = [
    !road.verified && "Needs the Verified role",
    road.banned && "Game banned",
  ].filter((value): value is string => Boolean(value));
  const missing = Math.max(0, road.required - road.commends);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
        <span className="text-slate-300">
          {MODE_EMOJI[road.mode]} {road.mode}
        </span>
        <span className={trusted ? "text-emerald-300" : "text-slate-400"}>
          {trusted ? (
            "✓ Trusted"
          ) : (
            <>
              ⭐ {road.commends}/{road.required}
              {missing > 0 && <span className="text-slate-500"> · {missing} to go</span>}
            </>
          )}
        </span>
      </div>
      <Bar fraction={trusted ? 1 : road.commends / road.required} barClass="bg-emerald-400" />
      {!trusted && blockers.length > 0 && (
        <p className="mt-1 text-[10px] font-semibold text-rose-300">Blocked: {blockers.join(" · ")}</p>
      )}
    </div>
  );
}

function BanRow({ road }: { road: BanRoad }) {
  const fraction = road.banned ? 1 : road.warns / road.limit;
  const barClass = road.banned || road.warns >= road.limit ? "bg-rose-500" : road.warns >= road.limit - 1 ? "bg-orange-400" : "bg-amber-300";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
        <span className="text-slate-300">
          {MODE_EMOJI[road.mode]} {road.mode}
        </span>
        <span className={road.banned ? "text-rose-300" : road.warns > 0 ? "text-orange-200" : "text-slate-400"}>
          {road.banned ? "🔴 Banned" : `⚠️ ${road.warns}/${road.limit}`}
          {!road.banned && road.warns > 0 && (
            <span className="text-slate-500"> · {road.limit - road.warns} more = ban</span>
          )}
        </span>
      </div>
      <Bar fraction={fraction} barClass={barClass} />
    </div>
  );
}

function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="text-xs text-rose-50">
      <span className="font-bold text-rose-200">{label}: </span>
      {children}
    </p>
  );
}

function DishonoredDetails({ entry }: { entry: DishonoredRestriction }) {
  const what = [
    entry.all_majors ? "all Major nations" : entry.majors.length ? `Majors — ${entry.majors.join(", ")}` : null,
    entry.minors.length ? `Minors — ${entry.minors.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <div className="space-y-0.5 rounded-lg bg-slate-950/40 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-white">
          {MODE_EMOJI[entry.category as PortfolioMode] ?? "⚖️"} {entry.category}
        </p>
        <LogLink url={entry.log_url} />
      </div>
      <DetailLine label="Banned from">{what}</DetailLine>
      <DetailLine label="Why">{entry.reason ?? "(no reason recorded)"}</DetailLine>
      <DetailLine label="Since">{entry.since ? formatDate(entry.since) : "unknown"}</DetailLine>
      <DetailLine label="Until">
        {entry.expires_at
          ? `${formatDateTime(entry.expires_at)} (${formatRelative(entry.expires_at * 1000)})`
          : "Permanent — until lifted by staff"}
      </DetailLine>
    </div>
  );
}

function LogLink({ url }: { url: string | null | undefined }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 rounded-md border border-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-sky-300 hover:border-sky-400/60 hover:text-sky-200"
      title="Open the host-log message in Discord"
    >
      Log ↗
    </a>
  );
}

function GameBanDetails({ ban, playerView }: { ban: GameBanInfo; playerView: boolean }) {
  return (
    <div className="space-y-0.5 rounded-lg bg-slate-950/40 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-white">
          {MODE_EMOJI[ban.mode]} {ban.mode}
        </p>
        <LogLink url={ban.log_url} />
      </div>
      <DetailLine label="Why">
        {ban.reason ??
          (ban.automatic
            ? `Reached ${ban.warns} warnings (automatic ban)`
            : "Issued by staff — no reason recorded")}
      </DetailLine>
      {(ban.issued_by || ban.automatic || playerView) && (
        <DetailLine label="Issued by">{ban.issued_by ?? (ban.automatic ? "GameMaster (automatic)" : "Staff")}</DetailLine>
      )}
      {ban.issued_at && <DetailLine label="Since">{formatDateTime(ban.issued_at)}</DetailLine>}
      <DetailLine label="Recorded in">
        {ban.game ? `${ban.game.nation} · ${ban.game.mode} · ${formatDate(ban.game.ts)}` : "Not tied to a game"}
      </DetailLine>
      <DetailLine label="Duration">Until lifted by staff</DetailLine>
    </div>
  );
}

const EVENT_TONE: Record<string, string> = {
  commend: "text-emerald-300",
  merit: "text-amber-300",
  valor_earned: "text-amber-300",
  warn: "text-orange-300",
  ban: "text-rose-300",
  dishonored_give: "text-rose-300",
};

function EventRow({ event, playerView }: { event: ModerationEvent; playerView: boolean }) {
  const tone = EVENT_TONE[event.action] ?? "text-slate-300";
  const title = [event.mode, event.label].filter(Boolean).join(" ");
  return (
    <li className="border-b border-slate-800 bg-slate-950/40 px-3 py-2 text-xs last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={`min-w-0 flex-1 truncate font-bold ${tone}`}>
          {title}
          {event.amount ? ` ×${event.amount}` : ""}
        </span>
        <span className="shrink-0 text-slate-500">{formatDate(event.created_at)}</span>
        <LogLink url={event.log_url} />
      </div>
      {event.reason && <p className="mt-0.5 text-slate-300">{event.reason}</p>}
      <p className="mt-0.5 text-[10px] text-slate-500">
        {event.automatic ? "Automatic" : event.issued_by ? `By ${event.issued_by}` : playerView ? "By staff" : "Issuer unknown"}
      </p>
    </li>
  );
}
