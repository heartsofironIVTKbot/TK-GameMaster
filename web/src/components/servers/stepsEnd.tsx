"use client";

import { Check, CircleAlert, Flag, History, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { BRANCHES, MODE_CATALOG, RANKS, STEPS, type HistoryEntry, type StepId } from "@/lib/serverSettingsTypes";
import { Spinner } from "@/components/schedule/ui";
import { Callout, Card, Rich, STEP_ICON, describePath, describeValue, roleById, type StepContext } from "./shared";

function StepIssues({ ctx, step }: { ctx: StepContext; step: StepId }) {
  const issues = ctx.issues.filter((issue) => issue.step === step);
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2} /> All good
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {issues.map((issue) => (
        <li key={issue.path + issue.message} className={`flex gap-1.5 text-xs ${issue.level === "error" ? "text-rose-200" : "text-yellow-200"}`}>
          {issue.level === "error" ? (
            <CircleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          ) : (
            <TriangleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          )}
          <span>
            <Rich text={issue.message} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReviewStep({
  ctx,
  finishing,
  finishError,
  onFinish,
}: {
  ctx: StepContext;
  finishing: boolean;
  finishError: string | null;
  onFinish: () => void;
}) {
  const { draft, snapshot } = ctx;
  const errors = ctx.issues.filter((issue) => issue.level === "error");
  const warnings = ctx.issues.filter((issue) => issue.level === "warning");
  const roleName = (id: string | null) => (id ? (roleById(snapshot, id)?.name ?? "deleted role") : "—");
  const branches = BRANCHES.filter((branch) => draft.branches[branch].enabled);
  const modes = MODE_CATALOG.filter((mode) => draft.branches[mode.branch].enabled && draft.modes[mode.key]?.enabled);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="gm-cut [--cut:12px] border border-ink-800 bg-ink-950/40 p-3 text-center">
          <p className="text-2xl font-bold text-ink-100">{branches.length}</p>
          <p className="text-[11px] text-ink-400">host branch{branches.length === 1 ? "" : "es"}: {branches.join(" + ")}</p>
        </div>
        <div className="gm-cut [--cut:12px] border border-ink-800 bg-ink-950/40 p-3 text-center">
          <p className="text-2xl font-bold text-ink-100">{modes.length}</p>
          <p className="text-[11px] text-ink-400">game mode{modes.length === 1 ? "" : "s"} on</p>
        </div>
        <div className={`gm-cut [--cut:12px] border p-3 text-center ${errors.length ? "border-rose-400/40 bg-rose-500/10" : "border-emerald-400/40 bg-emerald-500/10"}`}>
          <p className="text-2xl font-bold text-ink-100">{errors.length}</p>
          <p className="text-[11px] text-ink-300">
            problem{errors.length === 1 ? "" : "s"} to fix · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {STEPS.filter((step) => step.id !== "review").map((step) => (
        <Card
          key={step.id}
          icon={STEP_ICON[step.id]}
          title={step.label}
          right={
            <button
              type="button"
              onClick={() => ctx.goTo(step.id)}
              className="gm-cut [--cut:7px] border border-ink-800 px-2.5 py-1 text-xs font-bold text-ink-300 hover:border-brand-300/40 hover:text-ink-100"
            >
              Edit
            </button>
          }
        >
          {step.id === "branches" && (
            <ul className="space-y-0.5 text-xs text-ink-300">
              {branches.map((branch) => (
                <li key={branch}>
                  <strong>{branch}</strong>: {RANKS.map((rank) => roleName(draft.branches[branch].ranks[rank])).join(" → ")}
                </li>
              ))}
            </ul>
          )}
          {step.id === "staff" && (
            <p className="text-xs text-ink-300">
              Host Management: {draft.access.senior_staff_roles.map(roleName).join(", ") || "admins only"} · Staff can edit settings:{" "}
              {draft.access.staff_can_edit_settings ? "yes" : "no"}
            </p>
          )}
          {step.id === "modes" && (
            <p className="text-xs text-ink-300">{modes.map((mode) => mode.label).join(", ") || "None"}</p>
          )}
          <StepIssues ctx={ctx} step={step.id} />
        </Card>
      ))}

      {ctx.setupDone ? (
        <Callout tone="ok" title="Setup is finished">
          Change anything with the steps on the left. Each save is checked and logged.
        </Callout>
      ) : (
        <div className="gm-cut [--cut:12px] border border-brand-300/30 bg-brand-400/[0.07] p-4">
          <p className="text-sm font-bold text-ink-100">Ready?</p>
          <p className="mt-1 text-xs text-ink-300">
            {errors.length
              ? "Fix the problems in red first. Warnings don't block finishing."
              : ctx.isHome
                ? "GameMaster applies these settings within 30 seconds and posts what changed to the audit log."
                : "Your settings are saved, and GameMaster will use them as soon as multi-server hosting is switched on."}
          </p>
          {finishError && <p className="mt-2 text-xs font-semibold text-rose-300">{finishError}</p>}
          <button
            type="button"
            disabled={errors.length > 0 || finishing}
            onClick={onFinish}
            className="mt-3 gm-btn gm-btn-primary h-9 px-4 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {finishing ? <Spinner className="h-4 w-4" /> : <Flag aria-hidden strokeWidth={1.75} />}Finish setup
          </button>
        </div>
      )}
    </div>
  );
}

function when(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function HistoryRow({ ctx, entry }: { ctx: StepContext; entry: HistoryEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="gm-cut [--cut:9px] border border-ink-800 bg-ink-950 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="gm-cut [--cut:4px] bg-ink-800 px-1.5 py-px text-[10px] font-bold text-ink-300">v{entry.version}</span>
        <span className="font-bold text-ink-100">{entry.actor_name ?? "Someone"}</span>
        <span className="text-ink-500">{when(entry.created_at)}</span>
        {entry.changes.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="ml-auto gm-cut [--cut:5px] px-2 py-0.5 text-[11px] font-bold text-ink-400 hover:bg-ink-900 hover:text-ink-100"
          >
            {open ? "Hide" : `${entry.changes.length} change${entry.changes.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-ink-300">{entry.summary}</p>
      {open && (
        <ul className="mt-2 space-y-1 border-t border-ink-800 pt-2">
          {entry.changes.map((change) => (
            <li key={change.path} className="grid gap-1 text-[11px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <span className="truncate font-semibold capitalize text-ink-400">{describePath(change.path)}</span>
              <span className="min-w-0 text-ink-300">
                <span className="text-rose-300/80 line-through">{describeValue(change.before, ctx.snapshot)}</span>
                {" → "}
                <span className="text-emerald-200">{describeValue(change.after, ctx.snapshot)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function HistoryPanel({ ctx, history }: { ctx: StepContext; history: HistoryEntry[] }) {
  return (
    <Card icon={History} title="Change history" subtitle="Every settings change: who made it, when, and exactly what changed.">
      {history.length === 0 ? (
        <p className="text-xs text-ink-500">No changes yet.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <HistoryRow key={`${entry.version}-${entry.created_at}`} ctx={ctx} entry={entry} />
          ))}
        </ul>
      )}
    </Card>
  );
}
