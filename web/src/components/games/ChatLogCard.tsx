"use client";

import { useRef, useState } from "react";
import Avatar from "@/components/database/Avatar";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { CHAT_LOG_MAX_BYTES, DEFAULT_AI_RULES, rulesSummary, type AiPlayerResult } from "@/lib/aiAnalysisTypes";
import type { GameControl } from "@/lib/gameControlTypes";
import { categoryOfMode } from "@/lib/scheduleOptions";
import { dateTime } from "./labels";
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
  if (player.reward.commends) return { text: `⭐ ${player.reward.commends} commend${player.reward.commends > 1 ? "s" : ""}`, tone: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" };
  if (player.reward.merit) return { text: `🎖️ ${player.reward.merit} Merit`, tone: "border-amber-400/40 bg-amber-500/15 text-amber-100" };
  if (player.status === "toxic") return { text: "Toxic", tone: "border-rose-400/40 bg-rose-500/15 text-rose-100" };
  if (player.status === "no_rp") return { text: "0 RP", tone: "border-white/10 bg-white/5 text-slate-300" };
  if (player.status === "ungraded") return { text: "Not graded", tone: "border-white/10 bg-white/5 text-slate-300" };
  return { text: "No reward", tone: "border-white/10 bg-white/5 text-slate-300" };
}

function GiveButton({ game, player, onChanged }: { game: GameControl; player: AiPlayerResult; onChanged: () => void }) {
  const request = useBotRequest(onChanged);
  const kind = player.reward.commends ? "commend" : "merit";
  const amount = player.reward.commends || player.reward.merit;
  if (player.given) {
    return (
      <span className="shrink-0 text-[11px] font-bold text-emerald-300" title={player.given.by_name ? `Given by ${player.given.by_name}` : undefined}>
        ✓ Given
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
        className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-2.5 py-1 text-[11px] font-black text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
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
    <li className="bg-slate-950/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Avatar url={player.avatar_url} name={name} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-slate-100">
            {name} <span className="font-normal text-slate-400">· {player.nation}{player.role === "COOP" ? " (Co-op)" : ""}</span>
          </span>
          <span className="block text-[11px] text-slate-500">
            {player.meaningful_words.toLocaleString()} in-character words of {player.words.toLocaleString()} · creativity {player.creativity}/10 ·
            toxicity {player.toxicity}/10{player.left_early ? " · left early" : ""}
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${label.tone}`}>{label.text}</span>
        <GiveButton game={game} player={player} onChanged={onChanged} />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-300">
        {player.reward.why}
        {player.summary ? <span className="text-slate-400"> {player.summary}</span> : null}
      </p>
      {player.snippets.length > 0 && (
        <button type="button" onClick={() => setOpen((value) => !value)} className="mt-1 text-[11px] font-bold text-sky-300 hover:text-sky-200">
          {open ? "Hide lines" : `Show ${player.snippets.length} line${player.snippets.length > 1 ? "s" : ""} from the log`}
        </button>
      )}
      {open && (
        <ul className="mt-1.5 space-y-1">
          {player.snippets.map((line) => (
            <li key={line} className="border-l-2 border-white/15 pl-2 text-[11px] italic text-slate-300">
              {line}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ChatLogCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const analysis = useBotRequest(onChanged);
  const result = game.ai_analysis;

  const upload = async (file: File) => {
    setUploadError(null);
    if (file.size > CHAT_LOG_MAX_BYTES) {
      setUploadError(`That file is too big (the limit is ${CHAT_LOG_MAX_BYTES / 1024 / 1024} MB).`);
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/control/games/${game.id}/chatlog`, { method: "POST", body: form }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!response?.ok) {
      setUploadError(body?.error ?? "Couldn't upload — check your connection and try again.");
      return;
    }
    onChanged();
  };

  const players = result ? [...result.players].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.reward.commends - a.reward.commends || b.reward.merit - a.reward.merit || b.meaningful_words - a.meaningful_words) : [];
  const rewarded = players.filter((player) => player.reward.commends || player.reward.merit);
  const outcome = analysis.state.phase === "done" ? analysis.state.status.result?.analysis : undefined;
  const staleLog = Boolean(result && game.chat_log && result.log && game.chat_log.uploaded_at > result.log.uploaded_at);

  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-300">Chat log & AI analysis</p>
      <p className="mt-1 text-sm text-slate-300">
        Upload the game&apos;s HOI4 chat log (.txt). The AI grades everyone&apos;s roleplay with strict rules, the log goes to the public
        archive, and players see their result on their profile. Nothing is given until you click <b>Give</b>.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
          {game.chat_log ? (
            <span className="min-w-0 flex-1 text-slate-200">
              📄 <b>{game.chat_log.filename}</b> · {size(game.chat_log.bytes)} · uploaded {dateTime(game.chat_log.uploaded_at)}
              {game.chat_log.uploaded_by_name ? ` by ${game.chat_log.uploaded_by_name}` : ""}
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-slate-400">No chat log uploaded yet.</span>
          )}
          {game.can_manage && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                aria-label="Chat log file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <button
                type="button"
                disabled={uploading || analysis.busy}
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-sky-300/40 hover:text-white disabled:opacity-50"
              >
                {uploading ? <Spinner className="h-3 w-3 text-sky-300" /> : "📁"} {game.chat_log ? "Replace" : "Upload .txt"}
              </button>
            </>
          )}
        </div>
        {uploadError && <p className="text-xs text-rose-300">{uploadError}</p>}

        {game.can_manage && (
          <button
            type="button"
            disabled={!game.chat_log || analysis.busy || uploading}
            onClick={() => void analysis.submit({ action: "game_log_analysis", payload: { thread_id: game.id } })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {analysis.busy && <Spinner className="h-4 w-4" />}
            {analysis.busy ? "The AI is reading the log…" : result ? "🤖 Run the AI analysis again" : "🤖 Run the AI analysis"}
          </button>
        )}
        {analysis.busy && <p className="text-center text-[11px] text-slate-400">Long logs can take a minute or two.</p>}
        {analysis.state.phase === "error" && (
          <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{analysis.state.message.replace(/^❌\s*/, "")}</p>
        )}
        {outcome && "title" in outcome && (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50">
            <p className="font-black">
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
          <p className="text-[11px] text-amber-300">A newer chat log was uploaded after this analysis — run it again to grade the new one.</p>
        )}

        <button type="button" onClick={() => setShowRules((value) => !value)} className="text-[11px] font-bold text-slate-400 hover:text-white">
          {showRules ? "Hide the rules" : "How the AI grades (strict rules)"}
        </button>
        {showRules && (
          <ul className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300">
            {rulesSummary(result?.rules ?? DEFAULT_AI_RULES, result?.merit_enabled ?? true).map((line) => (
              <li key={line}>• {line}</li>
            ))}
            <li>• The AI only scores quality; the bot counts the words itself and applies these rules.</li>
          </ul>
        )}

        {result && (
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Results · {rewarded.length} of {players.length} recommended · graded {dateTime(result.at)}
              {result.by_name ? ` (run by ${result.by_name})` : ""}
            </p>
            <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
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
