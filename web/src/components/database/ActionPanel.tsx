"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DISHONORED_MAX_DAYS,
  DISHONORED_MIN_DAYS,
  DISHONORED_SLIDER_MAX_DAYS,
  MIN_REASON_LENGTH,
  MODERATION_MAX_AMOUNT,
  type ModerationKind,
  type ModerationOp,
  type ModerationOptions,
} from "@/lib/moderationTypes";
import {
  MERIT_RULES,
  TRUSTED_COMMENDS,
  WARN_BAN_LIMIT,
  type DishonoredRestriction,
  type PlayerPortfolio,
  type PortfolioGame,
  type PortfolioMode,
} from "@/lib/playerTypes";
import { categoryOfMode } from "@/lib/scheduleOptions";
import { Segmented, Slider, Spinner, Toggle } from "@/components/schedule/ui";
import { useModerationRequest, type ModerationRequest } from "./useModerationRequest";

/**
 * Database page action panel — replaces Discord's /give, /take and /sentence.
 *
 *  Give / Take   Commend · Merit · Warning · Game ban · Dishonor
 *  Redeem        spend commends to clear warnings (the ONLY way commends
 *                reduce warnings — they never cancel each other on their own)
 *
 * A game ban resets the banned mode's commends and all Merit to 0 and removes
 * Trusted + Hearts of Valor; Dishonor is a time-out that leaves stats and
 * roles alone. Every form shows what will happen before it's sent, asks
 * twice for bans and Dishonor, and offers Undo for ten minutes after.
 */

type Tab = "give" | "take" | "redeem";
type ActionType = ModerationKind | "dishonored";

const TYPE_LABEL: Record<ActionType, { label: string; icon: string; noun: string }> = {
  commend: { label: "Commend", icon: "⭐", noun: "commend" },
  merit: { label: "Merit", icon: "🎖️", noun: "Merit" },
  warn: { label: "Warning", icon: "⚠️", noun: "warning" },
  dishonored: { label: "Dishonor", icon: "⚖️", noun: "Dishonored" },
  ban: { label: "Game ban", icon: "🔴", noun: "game ban" },
};

const QUICK_REASONS: Record<string, string[]> = {
  "give:commend": ["Great roleplay", "Helped new players", "Excellent teamwork", "Played to the end"],
  "give:merit": ["Helped new players", "Community contribution", "Event help"],
  "give:warn": ["No-show", "Left the game early", "Ignored host instructions", "Toxic behaviour", "Broke game rules"],
  "give:ban": ["Repeated rule breaking", "Toxic behaviour", "Cheating / exploits"],
  "give:dishonored": ["Left Major games early", "Repeatedly abandoned Majors", "Griefed as a Major"],
  "take:dishonored": ["Appeal accepted", "Served enough time", "Issued by mistake"],
  take: ["Appeal accepted", "Warning was unjustified", "Issued by mistake"],
  redeem: ["Redeemed with commends after good conduct"],
};

const UNDO_WINDOW_MS = 10 * 60 * 1000;
/** Dishonor is usually 1 week – 3 months. */
const DAY_PRESETS: { days: number; label: string }[] = [
  { days: 7, label: "1 wk" },
  { days: 14, label: "2 wk" },
  { days: 21, label: "3 wk" },
  { days: 30, label: "1 mo" },
  { days: 45, label: "6 wk" },
  { days: 60, label: "2 mo" },
  { days: 90, label: "3 mo" },
];

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export interface Preview {
  lines: string[];
  error: string | null;
  danger: boolean;
}

/** What every game ban does on top of the ban (the bot's _apply_game_ban_wipe). */
function banWipeLines(mode: PortfolioMode, commends: number, merit: number): string[] {
  return [
    `Resets ${mode} commends ${commends} → 0 and Merit ${merit} → 0`,
    "Removes Trusted (RP + MP) and Hearts of Valor — none come back while banned",
  ];
}

function previewFor(
  op: ModerationOp,
  kind: ModerationKind,
  mode: PortfolioMode,
  amount: number,
  portfolio: PlayerPortfolio,
): Preview {
  const standing = portfolio.standings.find((entry) => entry.mode === mode);
  const trusted = portfolio.trusted.find((entry) => entry.mode === mode);
  const ban = portfolio.bans.find((entry) => entry.mode === mode);
  const commends = standing?.commends ?? 0;
  const warns = standing?.warns ?? 0;
  const banned = ban?.banned ?? false;
  const bannedAnywhere = portfolio.bans.some((entry) => entry.banned);
  const merit = portfolio.merit_points;
  const lines: string[] = [];
  let danger = false;
  const fail = (error: string): Preview => ({ lines, error, danger });

  if (op === "redeem") {
    if (warns === 0) return fail(`No ${mode} warnings to clear.`);
    if (commends === 0) return fail(`No ${mode} commends to spend.`);
    if (amount > warns) return fail(`Only ${plural(warns, "warning")} to clear.`);
    if (amount > commends) return fail(`Only ${plural(commends, "commend")} to spend.`);
    lines.push(`${mode} commends ${commends} → ${commends - amount}`, `${mode} warnings ${warns} → ${warns - amount}`);
    if (banned && warns >= WARN_BAN_LIMIT && warns - amount < WARN_BAN_LIMIT) lines.push("✅ Lifts the automatic game ban");
    if (commends >= TRUSTED_COMMENDS && commends - amount < TRUSTED_COMMENDS && trusted?.has_role) {
      lines.push(`Drops below ${TRUSTED_COMMENDS} commends — loses ${mode} Trusted${mode === "Roleplay" ? " (unless VIP / Valor)" : ""}`);
    }
    return { lines, error: null, danger };
  }

  if (kind === "merit") {
    if (op === "take" && amount > merit) return fail(`Only ${merit} Merit.`);
    const next = op === "give" ? merit + amount : merit - amount;
    lines.push(`Merit ${merit} → ${next}`);
    // Same checks as the bot's _sync_valor_role(): 25 Merit + 50 attended
    // games; a game ban blocks it, a current warning holds it back.
    const valorNow = portfolio.hearts_of_valor;
    const valorNext = next >= MERIT_RULES.valor_merit && portfolio.attended >= MERIT_RULES.valor_attended;
    const warned = portfolio.standings.some((entry) => entry.warns > 0);
    if (!valorNow && valorNext) {
      lines.push(
        bannedAnywhere
          ? "Meets Hearts of Valor, but not while game banned"
          : warned
            ? "Meets Hearts of Valor, but a current warning holds it back — they'll be told to open a ticket"
            : "🎖️ Unlocks Hearts of Valor — they get the perks DM and pick a Trusted role for the host team to approve",
      );
    }
    if (valorNow && !valorNext) lines.push("Loses Hearts of Valor (and the Trusted role it came with)");
    return { lines, error: null, danger };
  }

  if (op === "give") {
    if (kind === "commend") {
      lines.push(`${mode} commends ${commends} → ${commends + amount}`);
      // Same checks as the bot's trusted_after_commends().
      if (commends < TRUSTED_COMMENDS && commends + amount >= TRUSTED_COMMENDS && !trusted?.has_role) {
        lines.push(
          bannedAnywhere
            ? `Reaches ${TRUSTED_COMMENDS}, but game-banned players can't get Trusted`
            : trusted?.verified
              ? `🛡️ Reaches ${TRUSTED_COMMENDS} — ${mode} Trusted will be granted`
              : `Reaches ${TRUSTED_COMMENDS}, but Trusted needs the Verified role`,
        );
      }
      if (warns > 0) lines.push(`Warnings stay at ${warns} — use Redeem to clear them`);
    } else if (kind === "warn") {
      lines.push(`${mode} warnings ${warns} → ${warns + amount}`);
      if (!banned && warns + amount >= WARN_BAN_LIMIT) {
        lines.push(`🔴 Reaches ${WARN_BAN_LIMIT} — automatic ${mode} game ban`, ...banWipeLines(mode, commends, merit));
        danger = true;
      } else if (commends > 0) {
        lines.push(`Commends stay at ${commends}`);
      }
    } else if (kind === "ban") {
      if (banned) return fail(`Already ${mode} game banned.`);
      lines.push(`🔴 ${mode} game ban — lasts until lifted`, ...banWipeLines(mode, commends, merit));
      danger = true;
    }
    return { lines, error: null, danger };
  }

  // take
  if (kind === "commend") {
    if (amount > commends) return fail(`Only ${plural(commends, "commend")}.`);
    lines.push(`${mode} commends ${commends} → ${commends - amount}`);
    if (commends >= TRUSTED_COMMENDS && commends - amount < TRUSTED_COMMENDS && trusted?.has_role) {
      lines.push(`Drops below ${TRUSTED_COMMENDS} — loses ${mode} Trusted${mode === "Roleplay" ? " (unless VIP / Valor)" : ""}`);
    }
  } else if (kind === "warn") {
    if (amount > warns) return fail(`Only ${plural(warns, "warning")}.`);
    lines.push(`${mode} warnings ${warns} → ${warns - amount} (free — no commends spent)`);
    if (banned && warns >= WARN_BAN_LIMIT && warns - amount < WARN_BAN_LIMIT) lines.push("✅ Lifts the automatic game ban");
    if (banned && warns < WARN_BAN_LIMIT) lines.push("The manual game ban stays — remove it with Take → Game ban");
  } else if (kind === "ban") {
    if (!banned) return fail(`Not ${mode} game banned.`);
    lines.push(`✅ Lifts the ${mode} game ban`, "Wiped commends and Merit don't come back");
    if (warns >= WARN_BAN_LIMIT) lines.push(`Still has ${warns} warnings — consider clearing some too`);
  }
  return { lines, error: null, danger };
}

function endedGames(portfolio: PlayerPortfolio, mode: PortfolioMode | null): PortfolioGame[] {
  // Attendance taken = the game has run; the bot re-checks it really ended.
  return portfolio.history.filter((game) => game.present !== null && (mode === null || categoryOfMode(game.mode) === mode));
}

function formatDate(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function restrictionText(entry: Pick<DishonoredRestriction, "all_majors" | "majors" | "minors">): string {
  return (
    [
      entry.all_majors ? "all Major nations" : entry.majors.length ? `Majors — ${entry.majors.join(", ")}` : null,
      entry.minors.length ? `Minors — ${entry.minors.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ") || "—"
  );
}

type Send = (request: ModerationRequest, inverse: ModerationRequest | null, inverseLabel: string) => void;

export default function ActionPanel({
  playerId,
  playerName,
  portfolio,
  options,
  isSelf,
  onApplied,
}: {
  playerId: string;
  playerName: string;
  portfolio: PlayerPortfolio;
  options: ModerationOptions | null;
  isSelf: boolean;
  onApplied: () => void;
}) {
  const [tab, setTab] = useState<Tab>("give");
  const [type, setType] = useState<ActionType>("commend");
  // Counts finished actions: the forms clear themselves when it changes.
  const [applied, setApplied] = useState(0);
  const handleApplied = useCallback(() => {
    setApplied((value) => value + 1);
    onApplied();
  }, [onApplied]);
  const { state, submit, reset } = useModerationRequest(handleApplied);
  const [undo, setUndo] = useState<{ request: ModerationRequest; label: string; until: number } | null>(null);
  const busy = state.phase === "sending" || state.phase === "waiting";
  const resultRef = useRef<HTMLDivElement>(null);

  // Keep the progress / result box in view after a submit.
  useEffect(() => {
    if (state.phase !== "idle") resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.phase]);

  // Undo expires after UNDO_WINDOW_MS.
  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undo]);

  // (The page remounts this panel per player: key={playerId}.)
  const send: Send = (request, inverse, inverseLabel) => {
    void submit(request);
    setUndo(inverse ? { request: inverse, label: inverseLabel, until: Date.now() + UNDO_WINDOW_MS } : null);
  };

  if (isSelf) {
    return (
      <PanelShell>
        <p className="text-sm text-slate-300">🪞 This is your own record — another host has to moderate you.</p>
      </PanelShell>
    );
  }

  const common = { playerId, portfolio, busy, applied, onSend: send };
  let body: ReactNode;
  if (tab === "redeem") {
    body = <StatForm key={`${playerId}-redeem`} op="redeem" kind="warn" {...common} />;
  } else if (type === "dishonored") {
    body =
      tab === "give" ? (
        <DishonorForm key={`${playerId}-dishonor`} options={options} {...common} />
      ) : (
        <LiftDishonorForm key={`${playerId}-lift`} {...common} />
      );
  } else {
    body = <StatForm key={`${playerId}-${tab}-${type}`} op={tab} kind={type} {...common} />;
  }

  return (
    <PanelShell>
      <Segmented<Tab>
        ariaLabel="Action"
        size="sm"
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (state.phase === "error") reset();
        }}
        options={[
          { value: "give", label: "➕ Give" },
          { value: "take", label: "➖ Take" },
          { value: "redeem", label: "♻️ Redeem" },
        ]}
      />

      {tab !== "redeem" && (
        <div className="mt-4">
          <Field label="Type">
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(TYPE_LABEL) as ActionType[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                  className={`rounded-lg border px-1 py-2 text-center text-[11px] font-bold transition ${
                    type === value
                      ? "border-amber-300 bg-amber-400/15 text-amber-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                  }`}
                >
                  <span className="block text-base">{TYPE_LABEL[value].icon}</span>
                  {TYPE_LABEL[value].label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}

      <div className="mt-4">{body}</div>

      <div ref={resultRef} className="scroll-mb-4">
        <ResultBox
          state={state}
          playerName={playerName}
          undo={state.phase === "done" ? undo : null}
          onUndo={() => {
            if (!undo) return;
            const request = undo.request;
            setUndo(null);
            void submit(request);
          }}
          onDismiss={reset}
        />
      </div>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-amber-400/25 bg-slate-950/70 p-4 shadow-xl shadow-black/30">
      <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">🛠️ Moderate</h2>
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function AmountStepper({ value, max, onChange }: { value: number; max: number; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.max(1, Math.min(Math.max(1, max), next));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-lg text-slate-200 hover:border-amber-300/50"
        aria-label="Less"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value) || 1))}
        className="h-9 w-16 rounded-lg border border-white/10 bg-slate-900/80 text-center text-sm font-bold text-white [color-scheme:dark] focus:border-amber-300/50 focus:outline-none"
        aria-label="Amount"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-lg text-slate-200 hover:border-amber-300/50"
        aria-label="More"
      >
        +
      </button>
    </div>
  );
}

export function ReasonField({
  value,
  onChange,
  quick,
  label = "Reason (shown to the player and in the log)",
}: {
  value: string;
  onChange: (value: string) => void;
  quick: string[];
  label?: string;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 1000))}
        rows={3}
        placeholder="What happened?"
        className="w-full resize-y rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
      />
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {quick.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onChange(value.trim() ? `${value.trim()} — ${text}` : text)}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:border-amber-300/40 hover:text-white"
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

function GameSelect({
  games,
  value,
  onChange,
}: {
  games: PortfolioGame[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Field label="Game" hint="Tie it to a game so it shows on that game's archive.">
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 [color-scheme:dark] focus:border-amber-300/50 focus:outline-none"
      >
        <option value="">Not game related</option>
        {games.map((game) => (
          <option key={game.thread_id} value={game.thread_id}>
            {game.nation} · {game.mode} · {formatDate(game.ts)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ModePicker({ value, onChange }: { value: PortfolioMode; onChange: (mode: PortfolioMode) => void }) {
  return (
    <Field label="Mode">
      <Segmented<PortfolioMode>
        ariaLabel="Mode"
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          { value: "Roleplay", label: "🎭 Roleplay" },
          { value: "Historical", label: "⚔️ Historical" },
        ]}
      />
    </Field>
  );
}

export function SubmitButton({
  label,
  disabled,
  danger,
  busy,
  onConfirm,
}: {
  label: string;
  disabled: boolean;
  danger: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  // Armed for one exact action: changing anything (the label) disarms it.
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const armed = armedFor === label && !disabled;
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => {
        if (danger && !armed) {
          setArmedFor(label);
          return;
        }
        setArmedFor(null);
        onConfirm();
      }}
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
        armed
          ? "animate-pulse bg-rose-500 text-white"
          : danger
            ? "bg-rose-500/90 text-white hover:bg-rose-500"
            : "bg-amber-400 text-slate-950 hover:bg-amber-300"
      }`}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {armed ? `Click again to confirm: ${label}` : label}
    </button>
  );
}

export function PreviewBox({ preview }: { preview: Preview }) {
  if (preview.error) {
    return <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100">{preview.error}</p>;
  }
  if (preview.lines.length === 0) return null;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        preview.danger ? "border-rose-400/40 bg-rose-500/10 text-rose-50" : "border-white/10 bg-white/[0.03] text-slate-200"
      }`}
    >
      <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">What will happen</p>
      <ul className="space-y-0.5">
        {preview.lines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
    </div>
  );
}

function StatForm({
  op,
  kind,
  playerId,
  portfolio,
  busy,
  applied,
  onSend,
}: {
  op: ModerationOp;
  kind: ModerationKind;
  playerId: string;
  portfolio: PlayerPortfolio;
  busy: boolean;
  applied: number;
  onSend: Send;
}) {
  const [mode, setMode] = useState<PortfolioMode>("Roleplay");
  const [amount, setAmount] = useState(1);
  const [gameId, setGameId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Clear the entry once an action lands (kept when the bot refuses, so nothing is retyped).
  const [seenApplied, setSeenApplied] = useState(applied);
  if (seenApplied !== applied) {
    setSeenApplied(applied);
    setAmount(1);
    setGameId(null);
    setReason("");
  }
  const counted = kind === "commend" || kind === "merit" || kind === "warn";
  const games = useMemo(() => endedGames(portfolio, kind === "merit" ? null : mode), [portfolio, kind, mode]);

  const standing = portfolio.standings.find((entry) => entry.mode === mode);
  const maxAmount =
    op === "redeem"
      ? Math.min(standing?.warns ?? 0, standing?.commends ?? 0) || 1
      : op === "take" && kind === "warn"
        ? standing?.warns || 1
        : op === "take" && kind === "commend"
          ? standing?.commends || 1
          : op === "take" && kind === "merit"
            ? portfolio.merit_points || 1
            : MODERATION_MAX_AMOUNT;
  const count = counted ? Math.max(1, Math.min(amount, maxAmount)) : 1;
  const preview = useMemo(() => previewFor(op, kind, mode, count, portfolio), [op, kind, mode, count, portfolio]);
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;
  const typeInfo = TYPE_LABEL[kind];
  const modeLabel = kind === "merit" ? "" : `${mode} `;
  const label =
    op === "redeem"
      ? `Redeem ${plural(count, "warning")} for ${plural(count, `${mode} commend`)}`
      : counted
        ? `${op === "give" ? "Give" : "Take"} ${count} ${modeLabel}${count === 1 ? typeInfo.noun : `${typeInfo.noun}s`}`
        : `${op === "give" ? "Apply" : "Lift"} ${modeLabel}${typeInfo.noun}`;

  const quick = op === "give" ? QUICK_REASONS[`give:${kind}`] ?? [] : QUICK_REASONS[op];

  return (
    <div className="space-y-3.5">
      {op === "redeem" && (
        <p className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Commends never cancel warnings on their own. Redeem spends a player&apos;s commends to clear the same number of
          warnings in that mode. To remove an <b>unjustified</b> warning for free, use <b>Take → Warning</b>.
        </p>
      )}
      {op === "give" && kind === "ban" && (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          A game ban resets this mode&apos;s commends and all Merit to 0 and removes every positive role (Trusted, Hearts of
          Valor). For a temporary time-out that keeps their stats, use <b>Dishonor</b> instead.
        </p>
      )}

      {kind === "merit" ? (
        <p className="text-[11px] text-slate-500">Merit is one pool for every mode. 25 Merit + 50 attended games = Hearts of Valor.</p>
      ) : (
        <ModePicker
          value={mode}
          onChange={(next) => {
            setMode(next);
            setGameId(null);
          }}
        />
      )}

      {counted && (
        <Field label="Amount">
          <AmountStepper value={count} max={maxAmount} onChange={setAmount} />
        </Field>
      )}

      {op !== "redeem" && <GameSelect games={games} value={gameId} onChange={setGameId} />}

      <ReasonField value={reason} onChange={setReason} quick={quick} />

      <PreviewBox preview={preview} />

      <SubmitButton
        label={label}
        busy={busy}
        danger={preview.danger || (op === "give" && kind === "ban")}
        disabled={Boolean(preview.error) || !reasonOk}
        onConfirm={() => {
          const payload = {
            user_id: playerId,
            op,
            kind,
            mode: kind === "merit" ? null : mode,
            amount: count,
            reason: reason.trim(),
            game_id: op === "redeem" ? null : gameId,
          };
          // Undo = the opposite action (not offered for Redeem).
          const inverse: ModerationRequest | null =
            op === "redeem"
              ? null
              : {
                  action: "moderation",
                  payload: { ...payload, op: op === "give" ? "take" : "give", reason: `Undo: ${payload.reason}`.slice(0, 1000) },
                };
          onSend({ action: "moderation", payload }, inverse, op === "give" ? `Take it back` : `Give it back`);
        }}
      />
      {op === "give" && kind === "ban" && (
        <p className="text-[11px] text-slate-500">Undo lifts the ban but can&apos;t bring back the commends and Merit it reset.</p>
      )}
    </div>
  );
}

function DishonorForm({
  playerId,
  portfolio,
  options,
  busy,
  applied,
  onSend,
}: {
  playerId: string;
  portfolio: PlayerPortfolio;
  options: ModerationOptions | null;
  busy: boolean;
  applied: number;
  onSend: Send;
}) {
  const [mode, setMode] = useState<PortfolioMode>("Roleplay");
  const [allMajors, setAllMajors] = useState(false);
  const [majors, setMajors] = useState<string[]>([]);
  const [minors, setMinors] = useState<string[]>([]);
  const [minorQuery, setMinorQuery] = useState("");
  const [days, setDays] = useState(14);
  const [replace, setReplace] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // "Until <date>" preview: day precision, so the time the form opened is enough.
  const [openedAt] = useState(() => Date.now());

  const clearSentence = () => {
    setMajors([]);
    setMinors([]);
    setAllMajors(false);
    setGameId(null);
    setReplace(false);
  };
  const changeMode = (next: PortfolioMode) => {
    setMode(next);
    clearSentence();
  };
  // Clear the entry once an action lands (kept when the bot refuses).
  const [seenApplied, setSeenApplied] = useState(applied);
  if (seenApplied !== applied) {
    setSeenApplied(applied);
    clearSentence();
    setReason("");
  }

  const pool = options?.nations[mode] ?? { majors: [], minors: [] };
  const active = portfolio.dishonored.find((entry) => entry.category === mode) ?? null;
  const games = useMemo(() => endedGames(portfolio, mode), [portfolio, mode]);
  const minorMatches = useMemo(() => {
    const needle = minorQuery.trim().toLowerCase();
    return pool.minors.filter((name) => !minors.includes(name) && (!needle || name.toLowerCase().includes(needle))).slice(0, 40);
  }, [pool.minors, minors, minorQuery]);
  const until = Math.floor(openedAt / 1000) + days * 86_400;
  const hasRestriction = allMajors || majors.length > 0 || minors.length > 0;
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;
  const setDaysClamped = (value: number) =>
    setDays(Math.max(DISHONORED_MIN_DAYS, Math.min(DISHONORED_MAX_DAYS, Math.round(value) || DISHONORED_MIN_DAYS)));

  const toggle = (list: string[], name: string) => (list.includes(name) ? list.filter((entry) => entry !== name) : [...list, name]);

  const previewLines = [
    `Can't reserve: ${restrictionText({ all_majors: allMajors, majors, minors })}`,
    `For ${plural(days, "day")} — until ${formatDate(until)}`,
  ];
  if (active && !replace) previewLines.push("Adds to the current restriction (and resets its timer)");
  if (active && replace) previewLines.push("Replaces the current restriction");
  previewLines.push("A time-out only: commends, Merit, warnings and roles stay untouched");

  return (
    <div className="space-y-3.5">
      <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
        ⚖️ A time-out: blocks the chosen nations for a while and leaves all stats and roles untouched.
      </p>

      <ModePicker value={mode} onChange={changeMode} />

      {active && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-50">
          <p className="font-black">Already Dishonored in {mode}</p>
          <p className="opacity-90">
            {restrictionText(active)}
            {active.expires_at ? ` · until ${formatDate(active.expires_at)}` : ""}
          </p>
        </div>
      )}

      {!options && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          The bot hasn&apos;t published its nation lists yet (restart it with the latest code). You can still Dishonor from
          <b> All Majors</b>.
        </p>
      )}

      <Toggle checked={allMajors} onChange={setAllMajors} label="All Major nations" description="Bans every Major in this mode." />

      {!allMajors && pool.majors.length > 0 && (
        <Field label="Majors">
          <div className="flex flex-wrap gap-1">
            {pool.majors.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setMajors((current) => toggle(current, name))}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                  majors.includes(name)
                    ? "border-rose-300 bg-rose-500/25 text-rose-50"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {pool.minors.length > 0 && (
        <Field label="Minors">
          {minors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {minors.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setMinors((current) => current.filter((entry) => entry !== name))}
                  className="rounded-md border border-rose-300 bg-rose-500/25 px-2 py-1 text-[11px] font-semibold text-rose-50"
                  title="Remove"
                >
                  {name} ✕
                </button>
              ))}
            </div>
          )}
          <input
            value={minorQuery}
            onChange={(event) => setMinorQuery(event.target.value)}
            placeholder="🔎 Find a minor nation"
            className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
          />
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {minorMatches.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setMinors((current) => [...current, name])}
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300 hover:border-white/25"
              >
                + {name}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field
        label={`Duration — ${plural(days, "day")}`}
        hint={
          days > DISHONORED_SLIDER_MAX_DAYS
            ? `Until ${formatDate(until)} · longer than the usual 3 months`
            : `Until ${formatDate(until)}`
        }
      >
        <Slider
          min={DISHONORED_MIN_DAYS}
          max={DISHONORED_SLIDER_MAX_DAYS}
          value={Math.min(days, DISHONORED_SLIDER_MAX_DAYS)}
          onChange={setDaysClamped}
          ariaLabel="Days"
        />
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {DAY_PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => setDays(preset.days)}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                days === preset.days
                  ? "border-amber-300 bg-amber-400/20 text-amber-100"
                  : "border-white/10 text-slate-300 hover:border-white/25"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
            <input
              type="number"
              min={DISHONORED_MIN_DAYS}
              max={DISHONORED_MAX_DAYS}
              value={days}
              onChange={(event) => setDaysClamped(Number(event.target.value))}
              className="h-7 w-14 rounded-md border border-white/10 bg-slate-900/80 text-center text-xs font-bold text-white [color-scheme:dark] focus:outline-none"
              aria-label="Exact number of days"
            />
            days
          </label>
        </div>
      </Field>

      {active && (
        <Toggle
          checked={replace}
          onChange={setReplace}
          label="Replace the current restriction"
          description="Off: these nations are added to the active one."
        />
      )}

      <GameSelect games={games} value={gameId} onChange={setGameId} />
      <ReasonField value={reason} onChange={setReason} quick={QUICK_REASONS["give:dishonored"]} />
      {hasRestriction && <PreviewBox preview={{ lines: previewLines, error: null, danger: true }} />}

      <SubmitButton
        label={`Dishonor for ${plural(days, "day")}`}
        busy={busy}
        danger
        disabled={!hasRestriction || !reasonOk}
        onConfirm={() => {
          const payload = {
            user_id: playerId,
            op: "give" as const,
            mode,
            reason: reason.trim(),
            days,
            all_majors: allMajors,
            majors: allMajors ? [] : majors,
            minors,
            replace,
            game_id: gameId,
          };
          // Undo only for a brand-new sentence (lifting would also drop an older one).
          const inverse: ModerationRequest | null = active
            ? null
            : { action: "dishonored", payload: { ...payload, op: "take", reason: `Undo: ${payload.reason}`.slice(0, 1000) } };
          onSend({ action: "dishonored", payload }, inverse, "Lift it again");
        }}
      />
    </div>
  );
}

function LiftDishonorForm({
  playerId,
  portfolio,
  busy,
  applied,
  onSend,
}: {
  playerId: string;
  portfolio: PlayerPortfolio;
  busy: boolean;
  applied: number;
  onSend: Send;
}) {
  const active = portfolio.dishonored.filter((entry): entry is DishonoredRestriction & { category: PortfolioMode } =>
    ["Roleplay", "Historical"].includes(entry.category),
  );
  const [picked, setPicked] = useState<PortfolioMode | null>(null);
  const [reason, setReason] = useState("");
  const [seenApplied, setSeenApplied] = useState(applied);
  if (seenApplied !== applied) {
    setSeenApplied(applied);
    setReason("");
    setPicked(null);
  }
  const entry = active.find((item) => item.category === picked) ?? active[0] ?? null;

  if (!entry) {
    return <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">No active Dishonored restriction to lift.</p>;
  }
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <div className="space-y-3.5">
      <Field label="Active restriction">
        <div className="space-y-1.5">
          {active.map((item) => (
            <button
              key={item.category}
              type="button"
              onClick={() => setPicked(item.category)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${
                item.category === entry.category
                  ? "border-rose-300 bg-rose-500/15 text-rose-50"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
              }`}
            >
              <span className="font-black">⚖️ {item.category}</span> — {restrictionText(item)}
              {item.expires_at ? <span className="opacity-75"> · until {formatDate(item.expires_at)}</span> : null}
            </button>
          ))}
        </div>
      </Field>
      <ReasonField value={reason} onChange={setReason} quick={QUICK_REASONS["take:dishonored"]} />
      <PreviewBox
        preview={{ lines: [`Can reserve ${restrictionText(entry)} again in ${entry.category}`], error: null, danger: false }}
      />
      <SubmitButton
        label={`Lift ${entry.category} Dishonored`}
        busy={busy}
        danger={false}
        disabled={!reasonOk}
        onConfirm={() => {
          const base = {
            user_id: playerId,
            mode: entry.category,
            all_majors: entry.all_majors,
            majors: entry.majors,
            minors: entry.minors,
            game_id: null,
          };
          const remainingDays = entry.expires_at
            ? Math.max(DISHONORED_MIN_DAYS, Math.ceil((entry.expires_at * 1000 - Date.now()) / 86_400_000))
            : 30;
          onSend(
            { action: "dishonored", payload: { ...base, op: "take", reason: reason.trim(), days: 0, replace: false } },
            // Undo: put the same sentence back for the time it had left.
            {
              action: "dishonored",
              payload: {
                ...base,
                op: "give",
                reason: `Undo: ${reason.trim()}`.slice(0, 1000),
                days: Math.min(DISHONORED_MAX_DAYS, remainingDays),
                replace: true,
              },
            },
            "Put it back",
          );
        }}
      />
    </div>
  );
}

export function ResultBox({
  state,
  playerName,
  undo,
  onUndo,
  onDismiss,
  appliedNote,
}: {
  state: ReturnType<typeof useModerationRequest>["state"];
  playerName: string;
  undo: { label: string } | null;
  onUndo: () => void;
  onDismiss: () => void;
  /** Replaces "They were DMed and it's in the audit log." (not every action DMs). */
  appliedNote?: string;
}) {
  if (state.phase === "idle") return null;
  if (state.phase === "sending" || state.phase === "waiting") {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-slate-300">
        <Spinner className="h-4 w-4 text-amber-300" />
        {state.phase === "sending" ? "Sending…" : "The bot is applying it (roles, DM, audit log)…"}
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-100">
        <div className="flex items-start gap-2">
          <span className="flex-1">{state.message}</span>
          <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="gm-fade-up mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-50">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-black">✅ {state.outcome.summary}</p>
          <p className="opacity-80">{appliedNote ?? `Applied to ${playerName}. They were DMed and it's in the audit log.`}</p>
          {state.outcome.notes.length > 0 && (
            <ul className="mt-1 space-y-0.5">
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
      <div className="mt-2 flex flex-wrap gap-2">
        {state.outcome.log_url && (
          <a
            href={state.outcome.log_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-emerald-300/40 px-2 py-1 font-bold hover:bg-emerald-500/20"
          >
            Log ↗
          </a>
        )}
        {undo && (
          <button
            type="button"
            onClick={onUndo}
            className="rounded-md border border-white/20 px-2 py-1 font-bold text-white hover:bg-white/10"
            aria-label={`Undo — ${undo.label.toLowerCase()}`}
          >
            ↶ Undo ({undo.label.toLowerCase()}) <span className="font-normal opacity-60">· 10 min</span>
          </button>
        )}
      </div>
    </div>
  );
}
