"use client";

import { Pencil, X } from "lucide-react";
import { CardTitle } from "@/components/games/labels";
import { useEffect, useState } from "react";
import type { AttendanceGame, AttendancePlayer, Verdict } from "@/lib/attendanceTypes";
import { MIN_REASON_LENGTH } from "@/lib/moderationTypes";
import { PreviewBox, ReasonField, SubmitButton } from "@/components/database/ActionPanel";
import Avatar from "@/components/database/Avatar";
import { outcomeOf, plural } from "./labels";

/**
 * Correct one player's attendance (the bot's apply_attendance_override).
 * Before finalize the choice is stored and applied at finalize ("Automatic"
 * hands it back to the samples). After finalize it's applied at once:
 * attended games, no-show warnings and automatic bans are adjusted and the
 * player is DMed. Every change is in the audit log with its reason.
 */

type Choice = Verdict | "auto";

const CHOICES: { value: Choice; label: string; className: string }[] = [
  { value: "present", label: "Present", className: "border-emerald-300 bg-emerald-300 text-ink-950" },
  { value: "absent", label: "Absent", className: "border-rose-300 bg-rose-500 text-ink-100" },
  { value: "excused", label: "Excused", className: "border-sky-300 bg-sky-300 text-ink-950" },
  { value: "auto", label: "Automatic", className: "border-ink-500 bg-ink-700 text-ink-100" },
];

const QUICK_REASONS = [
  "Was in the game — voice issue",
  "Played without the Gamer Pass role",
  "Left early",
  "Excused before the game",
  "Crashed / internet problems",
  "Bot error",
];

function previewLines(game: AttendanceGame, player: AttendancePlayer, choice: Choice): string[] {
  const finalized = game.phase === "finalized";
  const warn = player.penalty;
  const warnLine = player.vip
    ? "VIP — no no-show warning."
    : warn > 0
      ? `No-show: +${plural(warn, "warning")}${warn > 1 ? " (Major slot)" : ""}. 3 in a mode = automatic game ban.`
      : `No warning — this slot carries none in ${game.logging_mode} logging.`;
  if (!finalized) {
    const lines = ["Saved now, applied when attendance is finalized. Nothing is DMed yet."];
    if (choice === "auto") lines.unshift(`The samples decide again (seen in ${player.hits} so far, needs ${game.required}).`);
    if (choice === "present") lines.unshift("Counted as attended, even if the samples miss them.");
    if (choice === "excused") lines.unshift("Not counted as attended, and no warning.");
    if (choice === "absent") lines.unshift("Counted absent even if the samples see them.", warnLine);
    return lines;
  }
  const before = player.verdict;
  const lines: string[] = [];
  if (before === "absent" && player.warnings_applied > 0 && choice !== "absent") {
    lines.push(
      `Removes the ${plural(player.warnings_applied, "no-show warning")} this game gave (and lifts an automatic game ban if this caused it).`,
    );
  }
  if (choice === "present" && before !== "present") lines.push("+1 attended game.");
  if (before === "present" && choice !== "present") lines.push("−1 attended game.");
  if (choice === "absent") {
    lines.push(warnLine);
    if (!player.vip && warn > 0) lines.push("A game ban resets that mode's commends and all Merit, and removes Trusted and Hearts of Valor.");
  }
  if (choice === "excused") lines.push("Not counted as attended, and no warning.");
  lines.push("The player is DMed when their warnings change; the audit log gets a note.");
  return lines;
}

export default function OverrideDialog({
  game,
  player,
  busy,
  onClose,
  onSubmit,
}: {
  game: AttendanceGame;
  player: AttendancePlayer;
  busy: boolean;
  onClose: () => void;
  onSubmit: (verdict: Choice, reason: string) => void;
}) {
  const finalized = game.phase === "finalized";
  const current: Choice = finalized ? player.verdict : (player.override?.verdict ?? "auto");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = CHOICES.filter((option) => option.value !== "auto" || !finalized);
  const label = CHOICES.find((option) => option.value === choice)?.label ?? "";
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;
  const outcome = outcomeOf(player);

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Change ${player.name}'s attendance`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="gm-plate gm-fade-up w-full max-w-lg bg-ink-950 p-5 [--cut:16px]">
        <div className="flex items-start gap-3">
          <Avatar url={player.avatar_url} name={player.name} size={44} />
          <div className="min-w-0 flex-1">
            <CardTitle icon={Pencil} title="Change attendance" />
            <p className="truncate text-lg font-bold text-ink-100">{player.name}</p>
            <p className="text-xs text-ink-400">
              {player.slots.map((slot) => slot.label).join(" + ")} · seen in {player.hits}/{game.samples.length} · now{" "}
              <span className="font-bold text-ink-200">{outcome.label}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-100" aria-label="Close">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        {player.override && (
          <p className="mt-3 gm-cut [--cut:7px] border border-ink-800 bg-ink-950 px-3 py-2 text-[11px] text-ink-400">
            Already set to <b className="text-ink-200">{player.override.verdict}</b>
            {player.override.by_name ? ` by ${player.override.by_name}` : ""}: “{player.override.reason}”
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {options.map((option) => {
            const isCurrent = option.value === current;
            const active = option.value === choice;
            return (
              <button
                key={option.value}
                type="button"
                disabled={isCurrent}
                onClick={() => setChoice(option.value)}
                className={`gm-cut [--cut:9px] border px-2 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${ active ? option.className : "border-ink-800 bg-ink-950 text-ink-200 hover:border-ink-600" }`}
                aria-label={isCurrent ? `${option.label} (current)` : option.label}
              >
                {option.label}
                {isCurrent && <span className="block text-[9px] font-semibold opacity-70">current</span>}
              </button>
            );
          })}
        </div>

        {choice && (
          <div className="mt-4 space-y-3">
            <PreviewBox preview={{ lines: previewLines(game, player, choice), danger: choice === "absent" && player.penalty > 0, error: null }} />
            <ReasonField value={reason} onChange={setReason} quick={QUICK_REASONS} label="Reason (kept in the audit log)" />
            <SubmitButton
              label={`Set ${player.name} to ${label}`}
              danger={choice === "absent"}
              busy={busy}
              disabled={!reasonOk}
              onConfirm={() => onSubmit(choice, reason.trim())}
            />
          </div>
        )}
      </div>
    </div>
  );
}
