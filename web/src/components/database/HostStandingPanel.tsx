"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { HostBranch } from "@/lib/hostBranches";
import {
  HOST_RATING_MAX_AMOUNT,
  HOST_RATING_RULES,
  MIN_REASON_LENGTH,
  type HostBranchStanding,
  type HostRatingKind,
  type HostStanding,
} from "@/lib/moderationTypes";
import { Segmented } from "@/components/schedule/ui";
import {
  AmountStepper,
  Field,
  PreviewBox,
  ReasonField,
  ResultBox,
  SubmitButton,
  type Preview,
} from "./ActionPanel";
import { useModerationRequest } from "./useModerationRequest";

/**
 * Host standing on a host's Database record, per branch (RP hosts Roleplay
 * games, HIST hosts Historical games): rank, Acclamations and Violations.
 * Senior Hosts of a branch and Host Management give that
 * branch's ratings here (this replaced /give_host and /take_host;
 * apply_host_rating in bot.py.py): Acclamations promote (2 → Full, 4 →
 * Senior), Violations demote (3 → that branch's rank is stripped), and giving
 * one first cancels the other — all within the one branch.
 */

type Op = "give" | "take";

const QUICK_REASONS: Record<string, string[]> = {
  "give:acclamation": ["Excellent hosting", "Great event organisation", "Helped other hosts"],
  "give:violation": ["Didn't show up to host", "Broke hosting rules", "Unprofessional conduct"],
  take: ["Issued by mistake", "Appeal accepted", "Correction"],
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function nextRank(standing: HostBranchStanding): string {
  if (standing.rank === "Assistant") return `${Math.max(0, HOST_RATING_RULES.full_at - standing.acclamations)} more to Full`;
  if (standing.rank === "Full") return `${Math.max(0, HOST_RATING_RULES.senior_at - standing.acclamations)} more to Senior`;
  if (standing.rank === "Senior") return "Top rank";
  return "Not in this branch";
}

function employment(standing: HostBranchStanding): { label: string; className: string } {
  if (standing.violations >= HOST_RATING_RULES.terminate_at) return { label: "🔴 Terminated", className: "text-rose-300" };
  if (standing.violations === HOST_RATING_RULES.terminate_at - 1) return { label: "🟠 Final warning", className: "text-orange-300" };
  return { label: "🟢 Active", className: "text-emerald-300" };
}

/** Mirrors apply_host_rating (bot.py.py) so the rater sees what will happen. */
function hostRatingPreview(op: Op, kind: HostRatingKind, amount: number, standing: HostBranchStanding): Preview {
  const lines: string[] = [];
  const { acclamations: a, violations: v, rank, branch } = standing;
  // Like commends and warnings: the two counts never cancel each other.
  if (op === "take") {
    const have = kind === "acclamation" ? a : v;
    if (amount > have) return { lines, error: `They only have ${plural(have, `${branch} ${kind}`)}.`, danger: false };
    if (kind === "acclamation") {
      const left = a - amount;
      lines.push(`${branch} Acclamations ${a} → ${left}`);
      if (rank === "Senior" && left < HOST_RATING_RULES.senior_at) lines.push(`📉 Back to Full ${branch} Host (below ${HOST_RATING_RULES.senior_at})`);
      else if (rank === "Full" && left < HOST_RATING_RULES.full_at) lines.push(`📉 Back to Assistant ${branch} Host (below ${HOST_RATING_RULES.full_at}), if Assistant hosts are used`);
    } else {
      const left = v - amount;
      lines.push(`${branch} Violations ${v} → ${left}`);
      if (!rank && v >= HOST_RATING_RULES.terminate_at && left < HOST_RATING_RULES.terminate_at) {
        lines.push(`↩️ Below ${HOST_RATING_RULES.terminate_at} — the ${branch} rank stripped by Violations comes back`);
      }
    }
    lines.push(`Only the ${branch} branch — their other branch doesn't change`);
    return { lines, error: null, danger: false };
  }
  if (kind === "acclamation") {
    const total = a + amount;
    lines.push(`${branch} Acclamations ${a} → ${total} (Violations stay at ${v})`);
    if (total >= HOST_RATING_RULES.senior_at && rank === "Full") lines.push(`🎊 Promoted to Senior ${branch} Host, if Senior hosts are used`);
    else if (total >= HOST_RATING_RULES.full_at && rank === "Assistant") lines.push(`🎊 Promoted to Full ${branch} Host`);
    lines.push(`Only the ${branch} branch — their other branch doesn't change`);
    return { lines, error: null, danger: false };
  }
  lines.push(`${branch} Violations ${v} → ${v + amount} (Acclamations stay at ${a})`);
  if (v + amount >= HOST_RATING_RULES.terminate_at && rank) lines.push(`🚫 ${HOST_RATING_RULES.terminate_at} reached — the ${branch} rank is stripped`);
  lines.push(`Only the ${branch} branch — their other branch doesn't change`);
  return { lines, error: null, danger: true };
}

export default function HostStandingPanel({
  playerId,
  playerName,
  standing,
  rateBranches,
  canTake,
  isSelf,
  onApplied,
}: {
  playerId: string;
  playerName: string;
  standing: HostStanding;
  /** Branches the viewer may rate (staff: both; a Senior Host: their branch). */
  rateBranches: HostBranch[];
  /** Host Management: may take Acclamations / Violations back. */
  canTake: boolean;
  isSelf: boolean;
  onApplied: () => void;
}) {
  return (
    <section className="rounded-2xl border border-sky-400/25 bg-slate-950/70 p-4 shadow-xl shadow-black/30">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-300">🎖️ Host standing</h2>
        <span className="text-[11px] text-slate-400">Hosted {standing.hosted_games}</span>
      </div>
      <div className="space-y-2">
        {standing.branches.map((branch) => {
          const status = employment(branch);
          return (
            <div key={branch.branch} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-11 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-center text-[10px] font-black text-slate-200">
                  {branch.branch}
                </span>
                <span className={`text-sm font-bold ${branch.rank ? "text-white" : "text-slate-400"}`}>
                  {branch.rank ? `${branch.rank} ${branch.branch} Host` : "Not in this branch"}
                </span>
                <span className={`ml-auto text-[11px] font-semibold ${status.className}`}>{status.label}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Stat label="Acclamations" hint={nextRank(branch)}>
                  ⭐ {branch.acclamations}
                </Stat>
                <Stat label="Violations" hint={`${HOST_RATING_RULES.terminate_at} = rank stripped`}>
                  ⚠️ {branch.violations}
                </Stat>
              </div>
            </div>
          );
        })}
      </div>

      {rateBranches.length > 0 && !isSelf ? (
        <HostRatingForm
          playerId={playerId}
          playerName={playerName}
          standing={standing}
          rateBranches={rateBranches}
          canTake={canTake}
          onApplied={onApplied}
        />
      ) : (
        <p className="mt-3 text-[11px] text-slate-500">
          {isSelf ? "You can't rate yourself." : "Senior Hosts of that branch and Host Management give these; only Host Management takes them back."}
        </p>
      )}
    </section>
  );
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-950/40 px-2.5 py-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-base font-black text-white">{children}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function HostRatingForm({
  playerId,
  playerName,
  standing,
  rateBranches,
  canTake,
  onApplied,
}: {
  playerId: string;
  playerName: string;
  standing: HostStanding;
  rateBranches: HostBranch[];
  canTake: boolean;
  onApplied: () => void;
}) {
  // Start on the branch they're actually in (when the rater may rate it).
  const firstBranch =
    rateBranches.find((branch) => standing.branches.find((entry) => entry.branch === branch)?.rank) ?? rateBranches[0];
  const [branch, setBranch] = useState<HostBranch>(firstBranch);
  const [op, setOp] = useState<Op>("give");
  const [kind, setKind] = useState<HostRatingKind>("acclamation");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [applied, setApplied] = useState(0);
  const { state, submit, reset } = useModerationRequest(() => {
    setApplied((value) => value + 1);
    onApplied();
  });
  // Clear the entry once an action lands (kept when the bot refuses).
  const [seenApplied, setSeenApplied] = useState(applied);
  if (seenApplied !== applied) {
    setSeenApplied(applied);
    setAmount(1);
    setReason("");
  }
  const busy = state.phase === "sending" || state.phase === "waiting";
  const current = useMemo<HostBranchStanding>(
    () => standing.branches.find((entry) => entry.branch === branch) ?? { branch, rank: null, acclamations: 0, violations: 0 },
    [standing, branch],
  );
  const max = op === "take" ? Math.max(1, kind === "acclamation" ? current.acclamations : current.violations) : HOST_RATING_MAX_AMOUNT;
  const count = Math.max(1, Math.min(amount, max));
  const preview = useMemo(() => hostRatingPreview(op, kind, count, current), [op, kind, count, current]);
  const noun = kind === "acclamation" ? "Acclamation" : "Violation";
  const label = `${op === "give" ? "Give" : "Take"} ${count} ${branch} ${noun}${count === 1 ? "" : "s"}`;

  return (
    <div className="mt-4 space-y-3.5 border-t border-white/10 pt-4">
      {rateBranches.length > 1 && (
        <Field label="Branch">
          <Segmented<HostBranch>
            ariaLabel="Host branch"
            size="sm"
            value={branch}
            onChange={(next) => {
              setBranch(next);
              if (state.phase === "error") reset();
            }}
            options={rateBranches.map((value) => ({ value, label: value === "RP" ? "🎭 RP" : "⚔️ HIST" }))}
          />
        </Field>
      )}
      {canTake && (
        <Segmented<Op>
          ariaLabel="Host rating action"
          size="sm"
          value={op}
          onChange={(next) => {
            setOp(next);
            if (state.phase === "error") reset();
          }}
          options={[
            { value: "give", label: "➕ Give" },
            { value: "take", label: "➖ Take back" },
          ]}
        />
      )}
      <Field label="Type">
        <div className="grid grid-cols-2 gap-1">
          {(["acclamation", "violation"] as HostRatingKind[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                kind === value
                  ? "border-sky-300 bg-sky-400/15 text-sky-100"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
              }`}
            >
              {value === "acclamation" ? "⭐ Acclamation" : "⚠️ Violation"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Amount">
        <AmountStepper value={count} max={max} onChange={setAmount} />
      </Field>
      <ReasonField
        label="Reason (shown to the host and in the log)"
        value={reason}
        onChange={setReason}
        quick={op === "give" ? QUICK_REASONS[`give:${kind}`] : QUICK_REASONS.take}
      />
      <PreviewBox preview={preview} />
      <SubmitButton
        label={label}
        busy={busy}
        danger={preview.danger}
        disabled={Boolean(preview.error) || reason.trim().length < MIN_REASON_LENGTH}
        onConfirm={() => {
          void submit({
            action: "host_rating",
            payload: { user_id: playerId, op, kind, amount: count, reason: reason.trim(), branch },
          });
        }}
      />
      <ResultBox state={state} playerName={playerName} undo={null} onUndo={() => {}} onDismiss={reset} />
    </div>
  );
}
