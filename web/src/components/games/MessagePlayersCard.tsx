"use client";

import { useState } from "react";
import type { GameControl } from "@/lib/gameControlTypes";
import { HOST_MESSAGE_MAX_LEN } from "@/lib/messageTypes";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { RequestResult } from "./AccessCard";
import { dateTime } from "./labels";
import { useBotRequest } from "./useBotRequest";

/**
 * DM the players of a game through the bot (formerly /dm_participants):
 * everyone signed up — reserved nations, co-ops, fillers and the draft pool —
 * or only the ones the host ticks. The game's host or Host Management can send;
 * every message goes to the audit log and stays listed here.
 */
export default function MessagePlayersCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [armed, setArmed] = useState(false);
  const request = useBotRequest(() => {
    setText("");
    setExcluded(new Set());
    setChoosing(false);
    onChanged();
  });

  const everyone = game.message_recipients;
  const picked = everyone.filter((entry) => !excluded.has(entry.user_id));
  const trimmed = text.trim();
  const canSend = game.can_manage && trimmed.length > 0 && picked.length > 0 && !request.busy;
  const toggle = (userId: string) => {
    setArmed(false);
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };
  const send = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    void request.submit({
      action: "game_message",
      payload: {
        thread_id: game.id,
        message: trimmed,
        // Nobody unticked → "everyone", worked out by the bot when it sends.
        recipients: excluded.size === 0 ? null : picked.map((entry) => entry.user_id),
      },
    });
  };

  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Message players</p>
      <p className="mt-1 text-sm text-slate-300">
        {everyone.length === 0
          ? "Nobody has signed up yet — once players reserve, you can DM them here."
          : `The bot DMs your message to the players of this game. It goes to the audit log too.`}
      </p>

      {game.can_manage && everyone.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-100">
                To: {excluded.size === 0 ? `everyone (${everyone.length})` : `${picked.length} of ${everyone.length} players`}
              </span>
              <button
                type="button"
                onClick={() => setChoosing((value) => !value)}
                className="ml-auto rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-bold text-slate-300 hover:border-amber-300/40 hover:text-white"
                aria-expanded={choosing}
              >
                {choosing ? "Done" : "Choose players…"}
              </button>
            </div>
            {choosing && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="mb-1.5 flex gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setArmed(false);
                      setExcluded(new Set());
                    }}
                    className="rounded-md bg-white/5 px-2 py-0.5 font-bold text-slate-300 hover:text-white"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setArmed(false);
                      setExcluded(new Set(everyone.map((entry) => entry.user_id)));
                    }}
                    className="rounded-md bg-white/5 px-2 py-0.5 font-bold text-slate-300 hover:text-white"
                  >
                    None
                  </button>
                </div>
                <ul className="roster-scroll max-h-60 space-y-0.5 overflow-y-auto pr-1">
                  {everyone.map((entry) => (
                    <li key={entry.user_id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={!excluded.has(entry.user_id)}
                          onChange={() => toggle(entry.user_id)}
                          aria-label={`Send to ${entry.name} (${entry.label})`}
                          className="h-3.5 w-3.5 accent-amber-400"
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{entry.name}</span>
                        <span className="shrink-0 truncate text-[11px] text-slate-400">{entry.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <textarea
              value={text}
              onChange={(event) => {
                setArmed(false);
                setText(event.target.value.slice(0, HOST_MESSAGE_MAX_LEN));
              }}
              rows={4}
              disabled={request.busy}
              placeholder="e.g. The game is moved to 20:00 — same lobby, same checksum."
              aria-label="Message to the players"
              className="w-full resize-y rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none disabled:opacity-60"
            />
            <p className={`text-right text-[10px] ${text.length > HOST_MESSAGE_MAX_LEN - 100 ? "text-amber-300" : "text-slate-500"}`}>
              {text.length} / {HOST_MESSAGE_MAX_LEN}
            </p>
          </div>

          {trimmed && (
            <div className="rounded-xl border border-white/10 bg-[#2b2d31] p-3">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">What they&apos;ll see</p>
              <div className="border-l-4 border-amber-400 pl-3">
                <p className="text-sm font-bold text-white">📢 Message from the host of your {game.mode} game</p>
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-200">{trimmed}</p>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {game.discord_url && game.has_thread ? "Game thread · " : ""}On the website (link to this game)
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
              armed ? "animate-pulse bg-amber-300 text-slate-950" : "bg-amber-400 text-slate-950 hover:bg-amber-300"
            }`}
          >
            {request.busy && <Spinner className="h-4 w-4" />}
            {armed
              ? `Click again to DM ${picked.length} player${picked.length === 1 ? "" : "s"}`
              : `📢 Send to ${picked.length} player${picked.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
      {!game.can_manage && everyone.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">Only the game&apos;s host or Host Management can message its players.</p>
      )}

      <RequestResult state={request.state} onDismiss={request.reset} />

      {game.messages.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Sent before</p>
          <ul className="space-y-2">
            {game.messages.map((entry) => (
              <li key={`${entry.ts}-${entry.text.slice(0, 20)}`} className="rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2">
                <p className="text-[11px] text-slate-400">
                  {dateTime(entry.ts)}
                  {entry.by_name ? ` · ${entry.by_name}` : ""} · DMed {entry.sent} of {entry.total}
                  {entry.failed ? `, ${entry.failed} unreachable` : ""}
                </p>
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs text-slate-200">{entry.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
