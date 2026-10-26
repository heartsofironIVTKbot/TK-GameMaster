"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftViewer } from "@/lib/draft";

/**
 * Draft requests from the map: POST /api/draft, then follow the bot's answer
 * (GET /api/draft?request_id=) until it's applied or refused.
 */
export type DraftRequestState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "waiting"; requestId: string }
  | { phase: "done"; title: string; summary: string }
  | { phase: "error"; message: string };

const POLL_MS = 1_500;
const GIVE_UP_MS = 90_000;

export function useDraftRequest(onDone: () => void) {
  const [state, setState] = useState<DraftRequestState>({ phase: "idle" });
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const waitingId = state.phase === "waiting" ? state.requestId : null;
  useEffect(() => {
    if (!waitingId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(`/api/draft?request_id=${encodeURIComponent(waitingId)}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as {
          status?: string;
          error?: string | null;
          result?: { draft?: { title?: string; summary?: string } } | null;
        } | null;
        if (cancelled) return;
        if (body?.status === "done") {
          setState({ phase: "done", title: body.result?.draft?.title ?? "Done", summary: body.result?.draft?.summary ?? "" });
          onDoneRef.current();
          return;
        }
        if (body?.status === "error") {
          setState({ phase: "error", message: body.error ?? "The bot refused this." });
          onDoneRef.current();
          return;
        }
      } catch {
        // Network blip — keep polling.
      }
      if (cancelled) return;
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setState({ phase: "error", message: "The bot hasn't answered — it may be offline. Try again in a minute." });
        return;
      }
      timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    timer = window.setTimeout(() => void poll(), 1_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [waitingId]);

  const submit = useCallback(async (body: Record<string, unknown>) => {
    setState({ phase: "sending" });
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { request_id?: string; error?: string } | null;
      if (response.ok && result?.request_id) setState({ phase: "waiting", requestId: result.request_id });
      else setState({ phase: "error", message: result?.error ?? `Request failed (HTTP ${response.status})` });
    } catch {
      setState({ phase: "error", message: "Network error — try again." });
    }
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  /** Show a problem found on the page itself (e.g. a drop on a taken minor). */
  const fail = useCallback((message: string) => setState({ phase: "error", message }), []);
  const busy = state.phase === "sending" || state.phase === "waiting";
  return { state, busy, submit, reset, fail };
}

/** Close a pop-up with Escape (not while a request is on its way). */
export function useEscape(onClose: () => void, busy: boolean) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (busy) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);
}

/** The viewer's role in a draft (captain / host) and the notes they may read. */
export function useDraftViewer(threadId: string | null, nonce: number) {
  const [state, setState] = useState<{ key: string; viewer: DraftViewer | null } | null>(null);
  const key = `${threadId ?? ""}|${nonce}`;
  useEffect(() => {
    if (!threadId) return undefined;
    let cancelled = false;
    const load = () =>
      fetch(`/api/draft?thread_id=${encodeURIComponent(threadId)}`, { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { viewer?: DraftViewer } | null;
          if (!cancelled) setState({ key, viewer: response.ok ? (body?.viewer ?? null) : null });
        })
        .catch(() => {
          if (!cancelled) setState((previous) => ({ key, viewer: previous?.viewer ?? null }));
        });
    void load();
    // Notes and captains can change while the page is open.
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [threadId, key]);
  const loaded = Boolean(threadId && state && state.key.startsWith(`${threadId}|`));
  return { viewer: loaded ? (state?.viewer ?? null) : null, loaded };
}
