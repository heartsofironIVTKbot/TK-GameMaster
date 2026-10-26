"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/database/Avatar";
import { Spinner } from "@/components/schedule/ui";
import { modeOption } from "@/lib/scheduleOptions";
import type { ScheduleRequestStatus } from "@/lib/scheduleTypes";
import {
  FIX_ACTIONS,
  type CheckLevel,
  type DashboardGame,
  type FixOp,
  type ServerDashboard,
  type ServerLiveStatus,
  type StatusCheck,
} from "@/lib/serverDashboardTypes";
import type { HistoryEntry, SettingsIssue } from "@/lib/serverSettingsTypes";
import { UptimeBars, usePublicStatus } from "@/components/status/UptimeCard";
import { Callout, Card, Rich, type StepContext } from "./shared";

/**
 * Multi-server Stage 3: the owner dashboard (first tab once setup is done),
 * the Health tab's live checks, and the fix-it buttons (docs/server-setup.md).
 */

const LEVEL: Record<CheckLevel, { icon: string; tone: string }> = {
  ok: { icon: "✅", tone: "text-emerald-300" },
  warning: { icon: "⚠️", tone: "text-amber-300" },
  error: { icon: "⛔", tone: "text-rose-300" },
};

function when(sec: number): string {
  const diff = sec - Math.floor(Date.now() / 1000);
  const abs = Math.abs(diff);
  const unit = abs < 3_600 ? `${Math.max(1, Math.round(abs / 60))} min` : abs < 172_800 ? `${Math.round(abs / 3_600)} h` : `${Math.round(abs / 86_400)} days`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

function dateTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const modeLabel = (mode: string) => modeOption(mode)?.label ?? mode;

// --- fix-it buttons ----------------------------------------------------------

type FixState = { op: FixOp | null; message: { tone: "ok" | "error"; text: string } | null };

/** Run a fix-it action: queue it for the bot and wait for the answer. */
export function useFixAction(serverId: string, onDone: () => Promise<void> | void) {
  const [state, setState] = useState<FixState>({ op: null, message: null });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = useCallback(
    async (op: FixOp) => {
      setState({ op, message: null });
      const response = await fetch(`/api/servers/${serverId}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op }),
      }).catch(() => null);
      const queued = (await response?.json().catch(() => null)) as { request_id?: string; error?: string } | null;
      if (!response?.ok || !queued?.request_id) {
        setState({ op: null, message: { tone: "error", text: queued?.error ?? "Couldn't reach the website — try again." } });
        return;
      }
      const started = Date.now();
      while (alive.current && Date.now() - started < 90_000) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const poll = await fetch(`/api/servers/${serverId}/requests/${queued.request_id}`, { cache: "no-store" }).catch(() => null);
        const status = (await poll?.json().catch(() => null)) as ScheduleRequestStatus | null;
        if (status?.status === "done" || status?.status === "error") {
          await onDone();
          if (!alive.current) return;
          setState({
            op: null,
            message:
              status.status === "done"
                ? { tone: "ok", text: status.result?.setup?.summary ?? "Done." }
                : { tone: "error", text: (status.error ?? "GameMaster couldn't do that.").replace(/^❌\s*/, "") },
          });
          return;
        }
      }
      if (alive.current) {
        setState({ op: null, message: { tone: "error", text: "GameMaster hasn't answered yet — it may be offline. Check again in a minute." } });
      }
    },
    [serverId, onDone],
  );
  return { ...state, run };
}

export function FixToolbar({ fix, setupDone, reinvite }: { fix: ReturnType<typeof useFixAction>; setupDone: boolean; reinvite: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {FIX_ACTIONS.filter((action) => setupDone || action.op !== "sync_commands").map((action) => (
          <button
            key={action.op}
            type="button"
            title={action.hint}
            disabled={fix.op !== null}
            onClick={() => void fix.run(action.op)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-amber-300/40 hover:text-white disabled:opacity-50"
          >
            {fix.op === action.op ? <Spinner className="h-3 w-3 text-amber-300" /> : <span>{action.icon}</span>}
            {action.label}
          </button>
        ))}
        <a
          href={reinvite}
          title="Re-add GameMaster with every permission it needs (your settings stay)."
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-amber-300/40 hover:text-white"
        >
          🔑 Fix permissions
        </a>
      </div>
      {fix.op && <p className="text-[11px] text-slate-400">Waiting for GameMaster…</p>}
      {fix.message && <Callout tone={fix.message.tone === "ok" ? "ok" : "error"}>{fix.message.text}</Callout>}
    </div>
  );
}

// --- live checks --------------------------------------------------------------

function FixLink({ check, ctx, fix }: { check: StatusCheck; ctx: StepContext; fix: ReturnType<typeof useFixAction> }) {
  const target = check.fix;
  if (!target) return null;
  const className =
    "shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-bold text-amber-200 hover:border-amber-300/50 disabled:opacity-50";
  if ("op" in target) {
    const action = FIX_ACTIONS.find((entry) => entry.op === target.op);
    return (
      <button type="button" className={className} disabled={fix.op !== null} onClick={() => void fix.run(target.op)}>
        {fix.op === target.op ? "…" : (action?.label ?? "Fix")}
      </button>
    );
  }
  if ("step" in target) {
    return (
      <button type="button" className={className} onClick={() => ctx.goTo(target.step)}>
        Fix
      </button>
    );
  }
  return (
    <Link href={target.href} className={className}>
      {target.label}
    </Link>
  );
}

export function LiveChecks({ checks, ctx, fix }: { checks: StatusCheck[]; ctx: StepContext; fix: ReturnType<typeof useFixAction> }) {
  return (
    <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
      {checks.map((check) => (
        <li key={check.id} className="flex items-start gap-2.5 bg-slate-950/40 px-3 py-2.5">
          <span className="text-sm leading-5">{LEVEL[check.level].icon}</span>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-bold ${check.level === "ok" ? "text-slate-100" : LEVEL[check.level].tone}`}>{check.title}</p>
            <p className="text-[11px] text-slate-400">{check.detail}</p>
          </div>
          {check.level !== "ok" && <FixLink check={check} ctx={ctx} fix={fix} />}
        </li>
      ))}
    </ul>
  );
}

/** The Health tab's top half: live checks + fix-it buttons. */
export function HealthLive({ ctx, reinvite }: { ctx: StepContext; reinvite: string }) {
  const [status, setStatus] = useState<ServerLiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/servers/${ctx.serverId}/dashboard?only=status`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { status?: ServerLiveStatus; error?: string } | null;
    if (body?.status) {
      setStatus(body.status);
      setError(null);
    } else setError(body?.error ?? "Couldn't load the live checks.");
  }, [ctx.serverId]);
  const refreshAll = useCallback(async () => {
    await Promise.all([load(), ctx.refreshSnapshot()]);
  }, [load, ctx]);
  const fix = useFixAction(ctx.serverId, refreshAll);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/servers/${ctx.serverId}/dashboard?only=status`, { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { status?: ServerLiveStatus; error?: string } | null;
      if (cancelled) return;
      if (body?.status) setStatus(body.status);
      else setError(body?.error ?? "Couldn't load the live checks.");
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx.serverId]);

  return (
    <div className="space-y-4">
      <Card icon="🩺" title="Live checks" subtitle="Is GameMaster online and working in this server right now?">
        {error && <Callout tone="error">{error}</Callout>}
        {!status && !error && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Spinner className="h-3.5 w-3.5 text-amber-300" /> Checking…
          </p>
        )}
        {status && <LiveChecks checks={status.checks} ctx={ctx} fix={fix} />}
        <FixToolbar fix={fix} setupDone={ctx.setupDone} reinvite={reinvite} />
      </Card>
      <UptimeHealthCard />
    </div>
  );
}

/** GameMaster's 30-day uptime bars (the same as the public status page). */
function UptimeHealthCard() {
  const { status, error } = usePublicStatus();
  return (
    <Card icon="📡" title="Uptime" subtitle="How much of each day GameMaster was online (all servers share one bot).">
      {status ? (
        <UptimeBars status={status} />
      ) : error ? (
        <Callout tone="error">{error}</Callout>
      ) : (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Spinner className="h-3.5 w-3.5 text-amber-300" /> Loading…
        </p>
      )}
      <a href="/status" target="_blank" rel="noreferrer" className="text-[11px] font-bold text-sky-300 hover:text-sky-200">
        Public status page ↗
      </a>
    </Card>
  );
}

// --- the dashboard -------------------------------------------------------------

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-black text-white">{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function GameList({ games, empty, upcoming }: { games: DashboardGame[]; empty: string; upcoming?: boolean }) {
  if (games.length === 0) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
      {games.map((game) => (
        <li key={game.id} className="flex items-center gap-2 bg-slate-950/40 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-slate-100">{upcoming ? modeLabel(game.mode) : game.name}</span>
            <span className="block truncate text-[11px] text-slate-500">
              {dateTime(game.ts)} · {when(game.ts)}
              {game.host_name ? ` · ${game.host_name}` : ""}
            </span>
          </span>
          {game.players !== null && <span className="shrink-0 text-slate-400">👥 {game.players}</span>}
          {game.url && (
            <a href={game.url} className="shrink-0 text-[11px] font-bold text-sky-300 hover:text-sky-200">
              Attendance →
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProblemList({
  issues,
  checks,
  ctx,
  fix,
  reinvite,
}: {
  issues: SettingsIssue[];
  checks: StatusCheck[];
  ctx: StepContext;
  fix: ReturnType<typeof useFixAction>;
  reinvite: string;
}) {
  const live = checks.filter((check) => check.level !== "ok");
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  if (live.length === 0 && sorted.length === 0) {
    return <Callout tone="ok" title="Nothing to fix">GameMaster is online and every setting checks out.</Callout>;
  }
  const shown = sorted.slice(0, 8);
  return (
    <div className="space-y-2">
      {live.length > 0 && <LiveChecks checks={live} ctx={ctx} fix={fix} />}
      {shown.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {shown.map((issue, index) => (
            <li key={`${issue.path}-${index}`} className="flex items-start gap-2.5 bg-slate-950/40 px-3 py-2.5">
              <span className="text-sm leading-5">{LEVEL[issue.level].icon}</span>
              <p className={`min-w-0 flex-1 text-xs ${issue.level === "error" ? "text-rose-100" : "text-amber-100"}`}>
                <Rich text={issue.message} />
              </p>
              {issue.path.startsWith("perm.") || issue.path === "bot" ? (
                <a
                  href={reinvite}
                  className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-bold text-amber-200 hover:border-amber-300/50"
                >
                  Fix
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => ctx.goTo(issue.step)}
                  className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-bold text-amber-200 hover:border-amber-300/50"
                >
                  Fix
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sorted.length > shown.length && (
        <p className="text-[11px] text-slate-500">…and {sorted.length - shown.length} more — each step&apos;s tab shows its own.</p>
      )}
    </div>
  );
}

export function DashboardPanel({ ctx, history, reinvite }: { ctx: StepContext; history: HistoryEntry[]; reinvite: string }) {
  const [data, setData] = useState<ServerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useCallback(async () => {
    const response = await fetch(`/api/servers/${ctx.serverId}/dashboard`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as (ServerDashboard & { error?: string }) | null;
    return body?.usage ? body : (body?.error ?? "Couldn't load the dashboard.");
  }, [ctx.serverId]);
  const reload = useCallback(async () => {
    const [result] = await Promise.all([fetchData(), ctx.refreshSnapshot()]);
    if (typeof result === "string") setError(result);
    else {
      setData(result);
      setError(null);
    }
  }, [fetchData, ctx]);
  const fix = useFixAction(ctx.serverId, reload);
  useEffect(() => {
    let cancelled = false;
    void fetchData().then((result) => {
      if (cancelled) return;
      if (typeof result === "string") setError(result);
      else setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  if (error && !data) return <Callout tone="error">{error}</Callout>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Spinner className="h-4 w-4 text-amber-300" /> Loading the dashboard…
      </p>
    );
  }
  const { usage, status } = data;
  const online = status.bot_online;
  const errors = ctx.issues.filter((issue) => issue.level === "error").length + status.checks.filter((check) => check.level === "error").length;
  const warnings = ctx.issues.filter((issue) => issue.level === "warning").length + status.checks.filter((check) => check.level === "warning").length;
  const maxMode = Math.max(1, ...usage.modes.map((mode) => mode.games));

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div
          className={`rounded-xl border px-3 py-2.5 ${
            online === false ? "border-rose-400/40 bg-rose-500/10" : online ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-slate-950/40"
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">GameMaster</p>
          <p className="mt-0.5 text-lg font-black text-white">{online === null ? "No status yet" : online ? "🟢 Online" : "🔴 Offline"}</p>
          <p className="text-[10px] text-slate-400">
            {status.last_beat ? `Last heartbeat ${when(status.last_beat)}` : "Waiting for the first heartbeat"} ·{" "}
            <Link href="/status" className="underline hover:text-white">
              status page
            </Link>
          </p>
        </div>
        <div
          className={`rounded-xl border px-3 py-2.5 ${
            errors ? "border-rose-400/40 bg-rose-500/10" : warnings ? "border-amber-400/30 bg-amber-500/10" : "border-emerald-400/30 bg-emerald-500/10"
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Problems</p>
          <p className="mt-0.5 text-lg font-black text-white">{errors === 0 && warnings === 0 ? "✅ None" : `${errors} to fix · ${warnings} warnings`}</p>
          <p className="text-[10px] text-slate-400">Settings and live checks</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Roles & channels</p>
          <p className="mt-0.5 text-lg font-black text-white">{status.snapshot_at ? `Read ${when(status.snapshot_at)}` : "Not read yet"}</p>
          <p className="text-[10px] text-slate-400">
            {status.commands?.count != null ? `${status.commands.count} slash commands` : "Slash commands: —"}
          </p>
        </div>
      </div>

      <Card icon="🛠️" title="Problems to fix" subtitle="Everything wrong right now, with a fix for each.">
        <ProblemList issues={ctx.issues} checks={status.checks} ctx={ctx} fix={fix} reinvite={reinvite} />
        <FixToolbar fix={fix} setupDone={ctx.setupDone} reinvite={reinvite} />
      </Card>

      <Card icon="📈" title={`Last ${usage.days} days`} subtitle="Games that started in this server.">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile label="Games hosted" value={String(usage.games_hosted)} />
          <Tile label="Players" value={String(usage.players)} hint="Different people who reserved" />
          <Tile label="Active hosts" value={String(usage.hosts)} />
          <Tile
            label="Attendance"
            value={usage.attendance_rate === null ? "—" : `${Math.round(usage.attendance_rate * 100)}%`}
            hint="Reserved players who showed up"
          />
        </div>
        {usage.modes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Busiest modes</p>
            {usage.modes.map((mode) => (
              <div key={mode.mode} className="flex items-center gap-2 text-xs">
                <span className="w-36 shrink-0 truncate text-slate-300">{modeLabel(mode.mode)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(mode.games / maxMode) * 100}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right font-bold text-slate-200">{mode.games}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card icon="🗓️" title="Upcoming games" subtitle="Next on the calendar.">
          <GameList games={data.upcoming} empty="Nothing scheduled yet." upcoming />
        </Card>
        <Card icon="🏁" title="Recently finished" subtitle="The latest ended games.">
          <GameList games={data.recent} empty="No finished games yet." />
        </Card>
      </div>

      <Card icon="👥" title="Staff activity" subtitle={`Top hosts (last ${usage.days} days), recent moderation and settings changes.`}>
        <div className="grid gap-4 xl:grid-cols-3">
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">Top hosts</p>
            {data.staff.top_hosts.length === 0 ? (
              <p className="text-xs text-slate-500">No games hosted yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.staff.top_hosts.map((host) => (
                  <li key={host.id} className="flex items-center gap-2 text-xs">
                    <Avatar url={host.avatar_url} name={host.name} size={22} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">{host.name}</span>
                    <span className="text-slate-400">{host.games} games</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">Recent moderation</p>
            {data.staff.moderation.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.staff.moderation.map((item, index) => (
                  <li key={`${item.created_at}-${index}`} className="text-xs">
                    <span className="font-semibold text-slate-200">{item.label}</span>
                    {item.mode ? <span className="text-slate-400"> · {item.mode}</span> : null}
                    <span className="text-slate-400"> → {item.target_name}</span>
                    <span className="block text-[10px] text-slate-500">
                      {item.automatic ? "Automatic" : (item.issued_by ?? "Staff")} · {when(item.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">Settings changes</p>
            {history.length === 0 ? (
              <p className="text-xs text-slate-500">No changes yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.slice(0, 4).map((entry) => (
                  <li key={`${entry.version}-${entry.created_at}`} className="text-xs">
                    <span className="text-slate-200">{entry.summary ?? "Changed settings"}</span>
                    <span className="block text-[10px] text-slate-500">
                      {entry.actor_name ?? "Someone"} · {when(entry.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => ctx.goTo("review")} className="mt-2 text-[11px] font-bold text-sky-300 hover:text-sky-200">
              All settings →
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
