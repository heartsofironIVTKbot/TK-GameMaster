"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePlayerRequest } from "@/components/usePlayerRequest";
import { HOTJOIN_STATUS_TEXT, type HotJoinEntry } from "@/lib/hotJoinTypes";
import type { AuthUser, NationFeatureProps, SelectionKind } from "@/lib/types";

/**
 * The map's bottom bar for a game that is already running (replaces the
 * Hot-Join and Crash Report panels of the old reservation threads): ask to
 * hot-join as a free nation — the host approves on the Games page — or open
 * the crash report form.
 */

interface Props {
  threadId: string;
  selected: NationFeatureProps | null;
  selectionKind: SelectionKind | null;
  ownerLabel: string | null;
  authUser: AuthUser | null;
  /** The roster may have changed (an approved hot-join). */
  onChanged: () => void;
}

const CTA =
  "reserve-cta-glow rounded-xl px-8 py-3 text-base font-black uppercase tracking-wider shadow-2xl transition-transform hover:scale-105 disabled:opacity-60";

export default function HotJoinBar({ threadId, selected, selectionKind, ownerLabel, authUser, onChanged }: Props) {
  /** The viewer's request for this game (`at`: when it was loaded, epoch seconds; null entry when logged out). */
  const [mine, setMine] = useState<{ threadId: string; entry: HotJoinEntry | null; loggedIn: boolean; at: number } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/hotjoin?thread_id=${encodeURIComponent(threadId)}`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { request?: HotJoinEntry | null } | null;
    if (response?.ok || response?.status === 401) {
      setMine({ threadId, entry: body?.request ?? null, loggedIn: response.ok, at: Math.floor(Date.now() / 1000) });
    }
  }, [threadId]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled && !document.hidden) void load();
    };
    run();
    // The host's decision arrives while the page is open.
    const timer = window.setInterval(run, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load]);

  const request = usePlayerRequest("/api/hotjoin", (result) => {
    void load();
    if (result?.hotjoin === "approved") onChanged();
  });
  const entry = mine?.threadId === threadId ? mine.entry : null;
  // The server knows who's logged in (the map's own login state may still be loading).
  const loggedIn = mine?.threadId === threadId ? mine.loggedIn : Boolean(authUser);
  const pending = entry?.status === "pending";
  // A decision from the last few hours is still worth showing.
  const recent = entry && mine && entry.status !== "pending" && mine.at - (entry.decided_at ?? entry.ts) < 6 * 3600 ? entry : null;
  const sent = request.state.phase === "done" && request.state.result?.hotjoin === "pending";

  let main: ReactNode = null;
  if (pending) {
    main = (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-300/40 bg-slate-950/85 px-5 py-3 text-center shadow-2xl backdrop-blur-md">
        <p className="text-sm font-bold text-amber-100">
          ⏳ Hot-join request for <b>{entry?.nation}</b> — {HOTJOIN_STATUS_TEXT.pending.toLowerCase()}
        </p>
        <p className="text-[11px] text-slate-400">You&apos;ll get a Discord DM when the host decides.</p>
        <button
          type="button"
          disabled={request.busy}
          onClick={() => void request.submit("DELETE", { thread_id: threadId })}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-slate-200 hover:border-rose-300/50 hover:text-white disabled:opacity-50"
        >
          {request.busy ? "Withdrawing…" : "Withdraw request"}
        </button>
      </div>
    );
  } else if (selected && selectionKind === "pending") {
    main = loggedIn ? (
      <button
        type="button"
        disabled={request.busy}
        onClick={() => void request.submit("POST", { thread_id: threadId, nation: selected.slot_key ?? selected.name })}
        className={`${CTA} bg-orange-400 text-slate-950`}
      >
        {request.busy ? "Sending…" : `🔥 Ask to hot-join as ${selected.name}`}
      </button>
    ) : (
      <a href={`/api/auth/login?next=${encodeURIComponent(`/?game=${threadId}`)}`} className={`${CTA} bg-orange-400 text-slate-950`}>
        Log in &amp; hot-join
      </a>
    );
  } else if (selected && selectionKind === "self") {
    main = (
      <p className="rounded-xl border border-emerald-400/40 bg-slate-950/85 px-5 py-2.5 text-sm font-bold text-emerald-200 shadow-2xl">
        ✓ You&apos;re playing {selected.name}
      </p>
    );
  } else if (selected && (selectionKind === "locked" || selectionKind === "coop")) {
    main = (
      <p className="rounded-xl border border-rose-400/40 bg-rose-950/70 px-5 py-2.5 text-sm font-bold text-rose-200/80 shadow-2xl">
        {selected.name} is taken{ownerLabel ? ` by ${ownerLabel}` : ""} — pick a free nation to hot-join
      </p>
    );
  } else {
    main = (
      <p className="rounded-xl border border-white/10 bg-slate-950/85 px-5 py-2.5 text-center text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur-md">
        🎮 Game running — pick a free nation to ask to hot-join
      </p>
    );
  }

  return (
    <div className="absolute bottom-6 left-1/2 z-[900] flex w-max max-w-[min(92vw,520px)] -translate-x-1/2 flex-col items-center gap-2">
      {main}
      {sent && !pending && (
        <p className="rounded-md bg-slate-950/80 px-3 py-1.5 text-xs text-emerald-300">Sent! The host got a DM — you&apos;ll get one when they decide.</p>
      )}
      {request.state.phase === "error" && <p className="rounded-md bg-slate-950/80 px-3 py-1.5 text-xs text-rose-300">{request.state.message}</p>}
      {!pending && !sent && recent && (
        <p className={`rounded-md bg-slate-950/80 px-3 py-1.5 text-xs ${recent.status === "approved" ? "text-emerald-300" : "text-slate-300"}`}>
          Your hot-join request for {recent.nation}: {HOTJOIN_STATUS_TEXT[recent.status].toLowerCase()}
          {recent.status === "approved" ? " — you have the Gamer Pass, hop into your voice channel." : "."}
        </p>
      )}
      <a
        href={`/crash?game=${encodeURIComponent(threadId)}`}
        className="rounded-lg border border-rose-400/40 bg-slate-950/85 px-3 py-1.5 text-xs font-bold text-rose-200 shadow-xl hover:border-rose-300 hover:text-white"
      >
        🚨 Game crashed? Send your logs
      </a>
    </div>
  );
}
