"use client";

import { useEffect, useState } from "react";
import { HOST_MESSAGE_MAX_LEN, type HostMessageEntry } from "@/lib/messageTypes";
import { Spinner } from "@/components/schedule/ui";
import { ResultBox, SubmitButton } from "./ActionPanel";
import { useModerationRequest } from "./useModerationRequest";

/**
 * Send a member a DM through the bot (formerly /dm). Any host can; it's
 * anonymous ("a Game Host") unless they sign it, and either way it goes to
 * the audit log and the list below, so hosts can see who wrote what.
 */

function when(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagePanel({
  playerId,
  playerName,
  viewerName,
  isSelf,
}: {
  playerId: string;
  playerName: string;
  /** The signed-in host (shown in the preview when they sign). */
  viewerName: string;
  isSelf: boolean;
}) {
  const [text, setText] = useState("");
  const [signed, setSigned] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [history, setHistory] = useState<{ nonce: number; entries: HostMessageEntry[] | null; error: string | null } | null>(null);
  const { state, submit, reset } = useModerationRequest(() => {
    setText("");
    setNonce((value) => value + 1);
  });
  // A refused send (closed DMs) is recorded too — reload the list then as well.
  const [seenError, setSeenError] = useState(false);
  if ((state.phase === "error") !== seenError) {
    setSeenError(state.phase === "error");
    if (state.phase === "error") setNonce((value) => value + 1);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/database/players/${playerId}/messages`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { messages?: HostMessageEntry[]; error?: string } | null;
        if (cancelled) return;
        if (response.ok && body?.messages) setHistory({ nonce, entries: body.messages, error: null });
        else setHistory((current) => ({ nonce, entries: current?.entries ?? null, error: body?.error ?? "Couldn't load earlier messages." }));
      })
      .catch(() => {
        if (!cancelled) setHistory((current) => ({ nonce, entries: current?.entries ?? null, error: "Network error." }));
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, nonce]);

  const busy = state.phase === "sending" || state.phase === "waiting";
  const trimmed = text.trim();
  const entries = history?.entries ?? null;

  return (
    <section className="rounded-2xl border border-amber-300/20 bg-slate-950/70 p-4 shadow-xl shadow-black/30">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">✉️ Send a message</h2>
        {entries && entries.length > 0 && <span className="text-[11px] text-slate-500">{entries.length} sent before</span>}
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        The bot DMs it to {playerName}. Every message goes to the audit log, so other hosts can see who sent it.
      </p>

      {isSelf ? (
        <p className="text-[11px] text-slate-500">You can&apos;t message yourself.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, HOST_MESSAGE_MAX_LEN))}
              rows={4}
              disabled={busy}
              placeholder={`Write to ${playerName}…`}
              aria-label={`Message to ${playerName}`}
              className="w-full resize-y rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none disabled:opacity-60"
            />
            <p className={`text-right text-[10px] ${text.length > HOST_MESSAGE_MAX_LEN - 100 ? "text-amber-300" : "text-slate-500"}`}>
              {text.length} / {HOST_MESSAGE_MAX_LEN}
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={signed}
              onChange={(event) => setSigned(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-400"
            />
            <span>
              <span className="font-bold text-slate-100">Sign it with my name</span>
              <span className="block text-[11px] text-slate-500">Off: they see it as from &ldquo;a Game Host&rdquo;.</span>
            </span>
          </label>

          {trimmed && (
            <div className="rounded-lg border border-white/10 bg-[#2b2d31] p-3">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">What they&apos;ll see</p>
              <div className="border-l-4 border-amber-400 pl-3">
                <p className="text-sm font-bold text-white">
                  📩 {signed ? `Message from ${viewerName} (Game Host)` : "Message from a Game Host"}
                </p>
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-200">{trimmed}</p>
                <p className="mt-1.5 text-[10px] text-slate-500">This message was sent via the Game Master bot.</p>
              </div>
            </div>
          )}

          <SubmitButton
            label={`Send to ${playerName}`}
            busy={busy}
            danger={false}
            disabled={!trimmed}
            onConfirm={() => void submit({ action: "host_dm", payload: { user_id: playerId, message: trimmed, signed } })}
          />
          <ResultBox state={state} playerName={playerName} undo={null} onUndo={() => {}} onDismiss={reset} appliedNote="It's listed below." />
        </div>
      )}

      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Earlier messages</p>
        {history === null ? (
          <p className="flex items-center gap-2 text-[11px] text-slate-500">
            <Spinner className="h-3 w-3" /> Loading…
          </p>
        ) : history.error && !entries ? (
          <p className="text-[11px] text-rose-300">{history.error}</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-[11px] text-slate-500">No host has messaged them from the website yet.</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="font-bold text-slate-200">{entry.sender_name}</span>
                  <span className="text-slate-500">{when(entry.created_at)}</span>
                  <span
                    className={`rounded px-1.5 py-px text-[10px] font-bold ${
                      entry.signed ? "bg-sky-500/15 text-sky-200" : "bg-white/10 text-slate-300"
                    }`}
                  >
                    {entry.signed ? "Signed" : "Anonymous"}
                  </span>
                  {!entry.delivered && (
                    <span className="rounded bg-rose-500/15 px-1.5 py-px text-[10px] font-bold text-rose-200">Not delivered — DMs closed</span>
                  )}
                </div>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-xs text-slate-300">{entry.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
