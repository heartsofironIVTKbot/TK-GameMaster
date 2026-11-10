"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerRequest } from "@/components/usePlayerRequest";
import type { CoopRequest, CoopState } from "@/lib/coopRequests";

/**
 * The viewer's co-op requests in one game (GET /api/coop): their own request
 * and the ones waiting for their answer. Polled while it matters — they hold a
 * major (someone may ask) or wait on an answer — and paused in hidden tabs.
 */

const POLL_MS = 12_000;

export interface CoopOutcome {
  status: "approved" | "declined" | "failed" | "expired";
  nation: string;
}

export function useCoopRequests(
  threadId: string | null,
  options: { loggedIn: boolean; watch: boolean; onOutcome: (outcome: CoopOutcome) => void; onRosterChanged: () => void },
) {
  const { loggedIn, watch } = options;
  const [state, setState] = useState<{ threadId: string; data: CoopState } | null>(null);
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });
  const lastMine = useRef<CoopRequest | null>(null);

  const load = useCallback(async () => {
    if (!threadId || !loggedIn) return;
    const response = await fetch(`/api/coop?thread_id=${encodeURIComponent(threadId)}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json().catch(() => null)) as CoopState | null;
    if (!data) return;
    // The other player answered while the page was open.
    const before = lastMine.current;
    const after = data.mine;
    if (before?.status === "pending" && after && after.ts === before.ts && after.status !== "pending" && after.status !== "withdrawn") {
      callbacks.current.onOutcome({ status: after.status, nation: after.nation });
      if (after.status === "approved") callbacks.current.onRosterChanged();
    }
    lastMine.current = after;
    setState({ threadId, data });
  }, [threadId, loggedIn]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void load();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const waiting = state?.threadId === threadId && state.data.mine?.status === "pending";
  const polling = Boolean(threadId && loggedIn && (watch || waiting));
  useEffect(() => {
    if (!polling) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [polling, load]);

  const ask = usePlayerRequest("/api/coop", () => void load());
  const answer = usePlayerRequest("/api/coop", (result) => {
    void load();
    if (result && (result as { coop?: string }).coop === "approved") callbacks.current.onRosterChanged();
  });

  // The nation's player takes a co-op player off their nation.
  const kick = usePlayerRequest("/api/coop", (result) => {
    if (result && (result as { coop?: string }).coop === "removed") callbacks.current.onRosterChanged();
  });

  const data = state?.threadId === threadId ? state.data : null;
  return { mine: data?.mine ?? null, incoming: data?.incoming ?? [], ask, answer, kick, reload: load };
}
