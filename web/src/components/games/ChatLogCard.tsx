"use client";

import { Drama, FileText, FolderUp, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import Avatar from "@/components/database/Avatar";
import { Spinner } from "@/components/schedule/ui";
import { CHAT_LOG_MAX_BYTES, CHAT_LOG_MAX_FILES, DEFAULT_AI_RULES, rulesSummary, type AiPlayerResult } from "@/lib/aiAnalysisTypes";
import type { GameControl } from "@/lib/gameControlTypes";
import { categoryOfMode } from "@/lib/scheduleOptions";
import { dateTime, CardTitle } from "./labels";
import { useBotRequest } from "./useBotRequest";

/**
 * Chat log + AI analysis on the Games page (replaces the Host Control
 * Center's "Upload Chat Log" / "Run AI Analysis"). The host uploads the
 * HOI4 .txt, the bot grades it with the strict rules, archives the log and
 * tells the players their result is on their profile. Rewards are never
 * given automatically: the host clicks Give for each player.
 */

const ORDER: Record<AiPlayerResult["status"], number> = { rewarded: 0, minimal: 1, ungraded: 2, no_rp: 3, toxic: 4 };

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function verdict(player: AiPlayerResult): { text: string; tone: string } {
  if (player.reward.commends) return { text: `${player.reward.commends} commend${player.reward.commends > 1 ? "s" : ""}`, tone: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" };
  if (player.reward.merit) return { text: `${player.reward.merit} Merit`, tone: "border-brand-400/40 bg-brand-500/15 text-brand-100" };
  if (player.status === "toxic") return { text: "Toxic", tone: "border-rose-400/40 bg-rose-500/15 text-rose-100" };
  if (player.status === "no_rp") return { text: "0 RP", tone: "border-ink-800 bg-ink-800 text-ink-300" };
  if (player.status === "ungraded") return { text: "Not graded", tone: "border-ink-800 bg-ink-800 text-ink-300" };
  return { text: "No reward", tone: "border-ink-800 bg-ink-800 text-ink-300" };
}

function GiveButton({ game, player, onChanged }: { game: GameControl; player: AiPlayerResult; onChanged: () => void }) {
  const request = useBotRequest(onChanged);
  const kind = player.reward.commends ? "commend" : "merit";
  const amount = player.reward.commends || player.reward.merit;
  if (player.given) {
    return (
      <span className="shrink-0 text-[11px] font-bold text-emerald-300" title={player.given.by_name ? `Given by ${player.given.by_name}` : undefined}>
        Given
      </span>
    );
  }
  if (!player.user_id || !amount) return null;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={request.busy || !game.can_manage}
        onClick={() =>
          void request.submit({
            action: "moderation",
            payload: {
              user_id: player.user_id,
              op: "give",
              kind,
              mode: kind === "commend" ? categoryOfMode(game.mode) : null,
              amount,
              reason: `AI chat-log analysis — ${game.name}`.slice(0, 180),
              game_id: game.id,
              ai_reward: true,
            },
          })
        }
        className="gm-btn gm-btn-primary h-7 px-2.5 text-xs [--cut:6px]"
      >
        {request.busy && <Spinner className="h-3 w-3" />}
        Give {amount} {kind === "commend" ? `commend${amount > 1 ? "s" : ""}` : "Merit"}
      </button>
      {request.state.phase === "error" && <span className="max-w-[220px] text-right text-[10px] text-rose-300">{request.state.message}</span>}
    </span>
  );
}

function PlayerRow({ game, player, onChanged }: { game: GameControl; player: AiPlayerResult; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const label = verdict(player);
  const name = player.name ?? (player.user_id ? `#${player.user_id}` : "Unreserved");
  return (
    <li className="bg-ink-950/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Avatar url={player.avatar_url} name={name} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-ink-100">
            {name} <span className="font-normal text-ink-400">· {player.nation}{player.role === "COOP" ? " (Co-op)" : ""}</span>
          </span>
          <span className="block text-[11px] text-ink-500">
            {player.meaningful_words.toLocaleString()} in-character words of {player.words.toLocaleString()} · creativity {player.creativity}/10 ·
            toxicity {player.toxicity}/10{player.left_early ? " · left early" : ""}
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${label.tone}`}>{label.text}</span>
        <GiveButton game={game} player={player} onChanged={onChanged} />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-300">
        {player.reward.why}
        {player.summary ? <span className="text-ink-400"> {player.summary}</span> : null}
      </p>
      {player.snippets.length > 0 && (
        <button type="button" onClick={() => setOpen((value) => !value)} className="mt-1 text-[11px] font-bold text-sky-300 hover:text-sky-200">
          {open ? "Hide lines" : `Show ${player.snippets.length} line${player.snippets.length > 1 ? "s" : ""} from the log`}
        </button>
      )}
      {open && (
        <ul className="mt-1.5 space-y-1">
          {player.snippets.map((line) => (
            <li key={line} className="border-l-2 border-ink-700 pl-2 text-[11px] italic text-ink-300">
              {line}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Upload, order and remove a game's log files (all read as one game). */
function LogFiles({ game, busy, onChanged }: { game: GameControl; busy: boolean; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const files = game.chat_logs;
  const total = files.reduce((sum, file) => sum + file.bytes, 0);

  const call = async (init: RequestInit, query = "") => {
    setError(null);
    setWorking(true);
    const response = await fetch(`/api/control/games/${game.id}/chatlog${query}`, init).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setWorking(false);
    if (!response?.ok) {
      setError(body?.error ?? "Couldn't change the files. Check your connection and try again.");
      return;
    }
    onChanged();
  };

  const move = (fileId: string, direction: "up" | "down") =>
    void call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: fileId, move: direction }) });

  const upload = async (picked: File[]) => {
    if (picked.length === 0) return;
    const adding = picked.reduce((sum, file) => sum + file.size, 0);
    if (files.length + picked.length > CHAT_LOG_MAX_FILES) {
      setError(`A game can have up to ${CHAT_LOG_MAX_FILES} log files.`);
      return;
    }
    if (total + adding > CHAT_LOG_MAX_BYTES) {
      setError(`That's too much text for one game: the files can add up to ${CHAT_LOG_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    const form = new FormData();
    for (const file of picked) form.append("file", file);
    await call({ method: "POST", body: form });
    if (fileRef.current) fileRef.current.value = "";
  };

  const disabled = busy || working || !game.can_manage;
  return (
    <div
      onDragOver={(event) => {
        if (!game.can_manage) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!game.can_manage) return;
        event.preventDefault();
        setDragging(false);
        void upload([...event.dataTransfer.files]);
      }}
      className={`gm-cut [--cut:9px] border px-3 py-2.5 text-xs transition ${
        dragging ? "border-sky-300/70 bg-sky-400/10" : "border-ink-800 bg-ink-950"
      }`}
    >
      {files.length === 0 ? (
        <p className="text-ink-400">
          No chat log yet.{game.can_manage ? " Add the .txt file, or several if the game was rehosted or saved in parts." : ""}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {files.map((file, index) => (
            <li key={file.file_id} className="flex flex-wrap items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center gm-cut [--cut:5px] bg-sky-400/15 text-[10px] font-bold text-sky-200">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-200">
                <b className="font-semibold">{file.filename}</b>, {size(file.bytes)}, {dateTime(file.uploaded_at)}
                {file.uploaded_by_name ? ` by ${file.uploaded_by_name}` : ""}
              </span>
              {game.can_manage && (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => move(file.file_id, "up")}
                    className="gm-cut [--cut:5px] border border-ink-800 px-1.5 py-0.5 text-ink-300 hover:text-ink-100 disabled:opacity-30"
                    aria-label={`Move ${file.filename} earlier`}
                    title="Earlier in the game"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === files.length - 1}
                    onClick={() => move(file.file_id, "down")}
                    className="gm-cut [--cut:5px] border border-ink-800 px-1.5 py-0.5 text-ink-300 hover:text-ink-100 disabled:opacity-30"
                    aria-label={`Move ${file.filename} later`}
                    title="Later in the game"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void call({ method: "DELETE" }, `?file=${encodeURIComponent(file.file_id)}`)}
                    className="gm-cut [--cut:5px] border border-ink-800 px-1.5 py-0.5 text-rose-300 hover:border-rose-300/50 disabled:opacity-30"
                    aria-label={`Remove ${file.filename}`}
                    title="Remove this file"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {game.can_manage && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            multiple
            className="hidden"
            aria-label="Chat log files"
            onChange={(event) => void upload([...(event.target.files ?? [])])}
          />
          <button
            type="button"
            disabled={disabled || files.length >= CHAT_LOG_MAX_FILES}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 gm-cut [--cut:7px] border border-ink-800 bg-ink-800 px-2.5 py-1.5 text-xs font-bold text-ink-200 hover:border-sky-300/40 hover:text-ink-100 disabled:opacity-50"
          >
            {working ? <Spinner className="h-3 w-3 text-sky-300" /> : <FolderUp aria-hidden className="h-3.5 w-3.5" />} {files.length ? "Add more files" : "Add .txt files"}
          </button>
          <span className="text-[11px] text-ink-500">
            or drop them here · {files.length}/{CHAT_LOG_MAX_FILES} files · {size(total)} of {CHAT_LOG_MAX_BYTES / 1024 / 1024} MB
          </span>
        </div>
      )}
      {files.length > 1 && (
        <p className="mt-2 text-[11px] text-sky-200/80">The AI reads these as one game, in this order. Use ↑ ↓ if they&apos;re out of order.</p>
      )}
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  );
}

export default function ChatLogCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const [showRules, setShowRules] = useState(false);
  const analysis = useBotRequest(onChanged);
  const result = game.ai_analysis;

  const players = result ? [...result.players].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.reward.commends - a.reward.commends || b.reward.merit - a.reward.merit || b.meaningful_words - a.meaningful_words) : [];
  const rewarded = players.filter((player) => player.reward.commends || player.reward.merit);
  const outcome = analysis.state.phase === "done" ? analysis.state.status.result?.analysis : undefined;
  // Out of date: the files changed since it ran (older analyses: a newer or extra upload).
  const graded = result?.log ?? null;
  const staleLog = Boolean(
    graded &&
      game.chat_logs.length > 0 &&
      (graded.signature
        ? graded.signature !== game.chat_log_signature
        : game.chat_logs.length > 1 || game.chat_logs.some((file) => file.uploaded_at > graded.uploaded_at)),
  );

  return (
    <section data-tour="games.chatlog" className="gm-plate p-4 sm:p-[18px]">
      <div className="flex flex-wrap items-baseline gap-2">
        <CardTitle icon={FileText} title="Chat log and AI analysis" />
        {result && (
          <Link href={`/roleplay/${game.id}`} className="ml-auto text-[11px] font-bold text-sky-300 hover:text-sky-200">
            <Drama aria-hidden className="h-3.5 w-3.5" />
            Public roleplay page
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-300">
        Upload the game&apos;s HOI4 chat log (.txt), in several files if it was rehosted. The AI grades everyone&apos;s roleplay with
        strict rules, the roleplay goes on the public roleplay page, and players are told. Nothing is given until you click{" "}
        <b>Give</b>.
      </p>

      <div className="mt-4 space-y-3">
        <LogFiles game={game} busy={analysis.busy} onChanged={onChanged} />

        {game.can_manage && (
          <button
            type="button"
            disabled={game.chat_logs.length === 0 || analysis.busy}
            onClick={() => void analysis.submit({ action: "game_log_analysis", payload: { thread_id: game.id } })}
            className="gm-btn gm-btn-primary h-11 w-full [--cut:10px]"
          >
            {analysis.busy && <Spinner className="h-4 w-4" />}
            {analysis.busy ? "The AI is reading the log…" : result ? "Run the AI analysis again" : "Run the AI analysis"}
          </button>
        )}
        {analysis.busy && <p className="text-center text-[11px] text-ink-400">Long logs can take a minute or two.</p>}
        {analysis.state.phase === "error" && (
          <p className="gm-cut [--cut:9px] border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{analysis.state.message.replace(/^❌\s*/, "")}</p>
        )}
        {outcome && "title" in outcome && (
          <div className="gm-cut [--cut:9px] border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50">
            <p className="font-bold">
              {outcome.title} — {outcome.summary}
            </p>
            {outcome.notes.map((note) => (
              <p key={note} className="opacity-90">
                • {note}
              </p>
            ))}
          </div>
        )}
        {staleLog && (
          <p className="text-[11px] text-brand-300">The log files changed after this analysis. Run it again to grade them.</p>
        )}

        <button type="button" onClick={() => setShowRules((value) => !value)} className="text-[11px] font-bold text-ink-400 hover:text-ink-100">
          {showRules ? "Hide the rules" : "How the AI grades (strict rules)"}
        </button>
        {showRules && (
          <ul className="space-y-1 gm-cut [--cut:9px] border border-ink-800 bg-ink-950 px-3 py-2 text-[11px] text-ink-300">
            {rulesSummary(result?.rules ?? DEFAULT_AI_RULES, result?.merit_enabled ?? true).map((line) => (
              <li key={line}>• {line}</li>
            ))}
            <li>• The AI only scores quality; the bot counts the words itself and applies these rules.</li>
          </ul>
        )}

        {result?.game_summary && (
          <p className="gm-cut [--cut:9px] border border-ink-800 bg-ink-950 px-3 py-2 text-xs italic leading-relaxed text-ink-300">
            {result.game_summary}
          </p>
        )}
        {result && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-400">
              Results · {rewarded.length} of {players.length} recommended · graded {dateTime(result.at)}
              {result.by_name ? ` (run by ${result.by_name})` : ""}
            </p>
            <ul className="divide-y divide-white/5 overflow-hidden gm-cut [--cut:9px] border border-ink-800">
              {players.map((player) => (
                <PlayerRow key={`${player.tag}-${player.user_id ?? "none"}`} game={game} player={player} onChanged={onChanged} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
