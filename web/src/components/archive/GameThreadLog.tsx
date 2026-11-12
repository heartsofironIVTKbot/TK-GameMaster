"use client";

import { ChevronDown, MessagesSquare, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import type { GameThreadLog as Log } from "@/lib/gameThreadLog";

/**
 * A finished game's Game Thread on its Archive page (saved when the game
 * ended). Members of the game's server only: anyone else sees nothing, or
 * a "log in" line. Folded until opened; long threads show in a scroll box.
 */

type State = { kind: "loading" } | { kind: "none" } | { kind: "login" } | { kind: "log"; log: Log };

function time(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function GameThreadLog({ gameId }: { gameId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/archive/${encodeURIComponent(gameId)}/thread`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { log?: Log | null; access?: string } | null;
        if (cancelled) return;
        if (response.status === 401 && body?.access === "login") setState({ kind: "login" });
        else if (response.ok && body?.log && body.log.messages.length > 0) setState({ kind: "log", log: body.log });
        else setState({ kind: "none" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (state.kind === "loading" || state.kind === "none") return null;
  if (state.kind === "login") {
    return (
      <p className="gm-plate px-4 py-3 text-xs text-ink-400">
        This game has a saved Game Thread.{" "}
        <a href={`/api/auth/login?next=${encodeURIComponent(`/archive/${gameId}`)}`} className="font-semibold text-brand-300 hover:underline">
          Log in
        </a>{" "}
        to read it (members of the game&apos;s server only).
      </p>
    );
  }

  const { log } = state;
  return (
    <section className="gm-plate p-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <MessagesSquare aria-hidden className="h-4 w-4 shrink-0 text-brand-300" strokeWidth={1.75} />
        <span className="flex-1 text-sm font-bold text-ink-100">
          Game thread <span className="font-normal text-ink-500">· {log.messages.length} message(s)</span>
        </span>
        <ChevronDown aria-hidden className={`h-4 w-4 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>
      {open && (
        <ol className="roster-scroll max-h-[60vh] space-y-3 overflow-y-auto border-t border-ink-800 px-4 py-3">
          {log.messages.map((message, index) => (
            <li key={`${message.ts}-${index}`} className="flex gap-2.5">
              {message.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- Discord's avatar CDN, small and fixed size
                <img src={message.avatar} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-ink-800" />
              ) : (
                <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-ink-800" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <b className="text-ink-100">{message.author}</b>
                  {message.bot && <span className="ml-1.5 gm-cut bg-[#5865F2] px-1 text-[9px] font-bold text-white [--cut:3px]">BOT</span>}
                  <span className="ml-2 text-ink-500">{time(message.ts)}</span>
                </p>
                {message.content && <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-ink-200">{message.content}</p>}
                {message.embeds.map((embed, n) => (
                  <p key={n} className="mt-1 whitespace-pre-wrap border-l-2 border-ink-700 pl-2 text-xs text-ink-400">
                    {embed}
                  </p>
                ))}
                {message.attachments.map((file) => (
                  <a
                    key={file.url}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs text-brand-300 hover:underline"
                  >
                    <Paperclip aria-hidden className="h-3 w-3" strokeWidth={1.75} />
                    {file.name}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
