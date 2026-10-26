"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { ROLE_SCAN_GROUPS, type RoleScanResult, type RoleScanState } from "@/lib/roleScanTypes";
import type { ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * The role check on the Database page (formerly /scan): it cross-checks
 * Trusted, Hearts of Valor, Dishonored and the database's Verified / host
 * flags. Host Management preview what would change, then apply it; it also runs
 * by itself every day at 04:00 UTC. Any host can see the last runs.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "running"; mode: "preview" | "apply" }
  | { kind: "error"; message: string };

const POLL_MS = 1500;
const TIMEOUT_MS = 10 * 60_000;

function when(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function RoleCheckCard({ onOpen }: { onOpen: (id: string) => void }) {
  const [state, setState] = useState<RoleScanState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [confirm, setConfirm] = useState(false);
  const [showLast, setShowLast] = useState(false);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/database/role-scan", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (RoleScanState & { error?: string }) | null;
        if (cancelled) return;
        if (response.ok && body) {
          setState(body);
          setLoadError(null);
        } else setLoadError(body?.error ?? "Couldn't load the role check.");
      })
      .catch(() => {
        if (!cancelled) setLoadError("Network error — try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(async (mode: "preview" | "apply") => {
    setConfirm(false);
    setPhase({ kind: "running", mode });
    let requestId: string;
    try {
      const response = await fetch("/api/schedule/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "role_scan", payload: { mode } }),
      });
      const body = (await response.json().catch(() => null)) as { request_id?: string; error?: string } | null;
      if (!response.ok || !body?.request_id) {
        setPhase({ kind: "error", message: body?.error ?? "Couldn't start the role check." });
        return;
      }
      requestId = body.request_id;
    } catch {
      setPhase({ kind: "error", message: "Network error — try again." });
      return;
    }
    const started = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(`/api/schedule/requests/${requestId}`, { cache: "no-store" });
        const status = (await response.json().catch(() => null)) as ScheduleRequestStatus | null;
        if (status?.status === "done") {
          setPhase({ kind: "idle" });
          setNonce((value) => value + 1);
          return;
        }
        if (status?.status === "error") {
          setPhase({ kind: "error", message: status.error ?? "The role check failed." });
          return;
        }
      } catch {
        // Keep polling through brief network blips.
      }
      if (Date.now() - started > TIMEOUT_MS) {
        setPhase({ kind: "error", message: "The bot hasn't finished yet — check the audit log, or reload in a minute." });
        return;
      }
      timer.current = window.setTimeout(poll, POLL_MS);
    };
    timer.current = window.setTimeout(poll, 800);
  }, []);

  const canRun = Boolean(state?.can_run);
  const preview = state?.preview ?? null;
  const last = state?.apply ?? null;
  // A preview made after the last applied run is the one to act on.
  const freshPreview = preview && (!last || preview.finished_at > last.finished_at) ? preview : null;
  const running = phase.kind === "running";

  return (
    <section className={`mb-4 rounded-3xl p-4 sm:p-5 ${GLASS}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-300">🛡️ Role check</h2>
          <p className="mt-1 text-xs text-slate-400">
            Checks Trusted (5+ commends, VIP or a Valor pick — with that game type&apos;s Verified role and no game ban), Hearts of
            Valor, Dishonored and the database&apos;s Verified / host flags. Runs by itself every day at {state?.daily_at_utc ?? "04:00"} UTC.
          </p>
          {last && (
            <p className="mt-1 text-[11px] text-slate-500">
              Last run: {when(last.finished_at)} · {last.trigger === "daily" ? "automatic" : `by ${last.by_name ?? "staff"}`} ·{" "}
              {last.total === 0 ? "nothing to change" : `${last.total} change${last.total === 1 ? "" : "s"}`}
              {last.total > 0 && (
                <button type="button" onClick={() => setShowLast((value) => !value)} className="ml-1 font-bold text-slate-300 hover:text-white">
                  {showLast ? "Hide" : "Show"}
                </button>
              )}
            </p>
          )}
        </div>
        {canRun && (
          <button
            type="button"
            onClick={() => void run("preview")}
            disabled={running}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/15 px-3.5 py-2 text-xs font-black text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
          >
            {running && phase.mode === "preview" && <Spinner className="h-3.5 w-3.5" />}🔍 Preview changes
          </button>
        )}
      </div>
      {loadError && <p className="mt-2 text-xs text-rose-300">{loadError}</p>}
      {phase.kind === "error" && (
        <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{phase.message}</p>
      )}
      {running && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-300">
          <Spinner className="h-3.5 w-3.5 text-sky-300" />
          {phase.mode === "preview"
            ? "Checking every member's roles… (nothing changes)"
            : "Applying — role changes go out one by one, this can take a few minutes…"}
        </p>
      )}

      {freshPreview && !running && (
        <div className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-500/[0.05] p-3">
          <p className="text-sm font-bold text-white">
            {freshPreview.total === 0
              ? "✅ Everything is in order — nothing would change."
              : `Preview: ${freshPreview.total} change${freshPreview.total === 1 ? "" : "s"} would be made`}
          </p>
          <p className="text-[11px] text-slate-500">
            {when(freshPreview.finished_at)} · checked {freshPreview.members_checked.toLocaleString()} members (
            {freshPreview.members_scanned.toLocaleString()} with relevant roles or stats)
          </p>
          <ChangeList run={freshPreview} onOpen={onOpen} />
          {canRun && freshPreview.total > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (confirm ? void run("apply") : setConfirm(true))}
                onBlur={() => setConfirm(false)}
                className={`rounded-xl px-4 py-2 text-xs font-black ${
                  confirm ? "bg-rose-500 text-white" : "bg-amber-400 text-slate-950 hover:bg-amber-300"
                }`}
              >
                {confirm ? `Click again — apply ${freshPreview.total} change${freshPreview.total === 1 ? "" : "s"}` : "✅ Apply these changes"}
              </button>
              <span className="text-[11px] text-slate-500">
                Apply checks everything again at that moment, so the result can differ slightly if something changed meanwhile.
              </span>
            </div>
          )}
        </div>
      )}

      {last && showLast && last.total > 0 && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-bold text-slate-200">Applied {when(last.finished_at)}</p>
          <ChangeList run={last} onOpen={onOpen} />
        </div>
      )}
    </section>
  );
}

function ChangeList({ run, onOpen }: { run: RoleScanResult; onOpen: (id: string) => void }) {
  if (run.total === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {ROLE_SCAN_GROUPS.map((group) => {
        const items = run.changes.filter((change) => group.kinds.includes(change.kind));
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className={`text-[10px] font-black uppercase tracking-wider ${group.tone}`}>
              {group.title} ({items.length})
            </p>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {items.map((change) => (
                <li key={`${change.user_id}-${change.kind}-${change.role}`} className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1 text-xs">
                  <button type="button" onClick={() => onOpen(change.user_id)} className="font-bold text-slate-100 hover:text-sky-200 hover:underline">
                    {change.name}
                  </button>
                  <span className="text-slate-400">
                    {" "}
                    {change.kind.endsWith("_add") ? "gets" : change.kind.endsWith("_remove") ? "loses" : "·"} {change.role}
                  </span>
                  <span className="block text-[10px] text-slate-500">{change.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {run.changes.length < run.total && (
        <p className="text-[11px] text-slate-500">…and {run.total - run.changes.length} more (see the audit log).</p>
      )}
      {run.errors.length > 0 && (
        <p className="text-[11px] text-amber-300">⚠️ {run.errors.length} note(s): {run.errors.slice(0, 3).join(" · ")}</p>
      )}
    </div>
  );
}
