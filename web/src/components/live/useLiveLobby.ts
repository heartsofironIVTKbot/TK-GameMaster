"use client";

import { useEffect, useRef, useState } from "react";

/** Another player's selected nation on the same game's map (GET /api/live). */
export interface LiveSelection {
  user_id: string;
  name: string;
  tag: string;
}

/** Apply a `selected` event ({set, gone}) to the current list. */
function mergeSelections(current: LiveSelection[], payload: unknown): LiveSelection[] {
  const { set, gone } = (payload ?? {}) as { set?: unknown; gone?: unknown };
  const byUser = new Map(current.map((selection) => [selection.user_id, selection]));
  if (Array.isArray(gone)) for (const userId of gone) byUser.delete(String(userId));
  if (Array.isArray(set)) for (const selection of set as LiveSelection[]) byUser.set(selection.user_id, selection);
  return [...byUser.values()];
}

export interface LiveLobbyState {
  /** The push connection is up: polling can slow down to a safety net. */
  connected: boolean;
  selections: LiveSelection[];
  /** People with this game's map open (null until known). */
  viewers: number | null;
}

/** A hidden tab keeps its connection this long, then frees it until it's shown again. */
const HIDDEN_GRACE_MS = 60_000;
/** After the server refused live updates (204 / errors), try again this much later. */
const RETRY_MS = 30_000;

const IDLE: LiveLobbyState = { connected: false, selections: [], viewers: null };

/**
 * Live updates for one game's map (lib/live/hub.ts). `onLobby` gets the
 * same payload as GET /api/reserve whenever the lobby changes; `knownVersion`
 * is read when (re)connecting so an unchanged lobby isn't sent again.
 */
export function useLiveLobby(
  threadId: string | null,
  onLobby: (payload: unknown) => void,
  knownVersion: () => string | null,
): LiveLobbyState {
  const [state, setState] = useState<{ threadId: string | null; live: LiveLobbyState }>({ threadId: null, live: IDLE });
  const onLobbyRef = useRef(onLobby);
  const knownRef = useRef(knownVersion);
  useEffect(() => {
    onLobbyRef.current = onLobby;
    knownRef.current = knownVersion;
  }, [onLobby, knownVersion]);

  useEffect(() => {
    if (!threadId || typeof EventSource === "undefined") return undefined;
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let hiddenTimer: number | undefined;
    let stopped = false;
    const update = (patch: Partial<LiveLobbyState>) =>
      setState((current) => ({
        threadId,
        live: { ...(current.threadId === threadId ? current.live : IDLE), ...patch },
      }));
    const parse = (event: MessageEvent) => {
      try {
        return JSON.parse(String(event.data)) as unknown;
      } catch {
        return null;
      }
    };

    const open = () => {
      if (stopped || source) return;
      const params = new URLSearchParams({ thread_id: threadId });
      const known = knownRef.current();
      if (known) params.set("known", known);
      const next = new EventSource(`/api/live?${params}`);
      source = next;
      next.onopen = () => update({ connected: true });
      next.onerror = () => {
        update({ connected: false });
        // CLOSED: the server said no (204 / an error page) — EventSource won't
        // retry by itself. CONNECTING: it is already retrying.
        if (next.readyState === EventSource.CLOSED) {
          source = null;
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(open, RETRY_MS);
        }
      };
      next.addEventListener("lobby", (event) => {
        const payload = parse(event as MessageEvent);
        if (payload) onLobbyRef.current(payload);
      });
      next.addEventListener("selections", (event) => {
        const payload = parse(event as MessageEvent);
        if (Array.isArray(payload)) update({ selections: payload as LiveSelection[] });
      });
      next.addEventListener("selected", (event) => {
        const payload = parse(event as MessageEvent);
        if (!payload) return;
        setState((current) => {
          const live = current.threadId === threadId ? current.live : IDLE;
          return { threadId, live: { ...live, selections: mergeSelections(live.selections, payload) } };
        });
      });
      next.addEventListener("viewers", (event) => {
        const payload = parse(event as MessageEvent) as { count?: unknown } | null;
        if (typeof payload?.count === "number") update({ viewers: payload.count });
      });
    };
    const close = () => {
      source?.close();
      source = null;
      update({ connected: false, selections: [], viewers: null });
    };
    const onVisibility = () => {
      window.clearTimeout(hiddenTimer);
      if (document.hidden) hiddenTimer = window.setTimeout(close, HIDDEN_GRACE_MS);
      else open();
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(hiddenTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      source?.close();
    };
  }, [threadId]);

  return state.threadId === threadId ? state.live : IDLE;
}

/** How often a held selection is refreshed (the server forgets it after 40 s). */
const KEEPALIVE_MS = 15_000;
/** Quick clicks across nations send only the one the player settles on. */
const SETTLE_MS = 120;

function postSelection(threadId: string, tag: string | null, beacon = false): void {
  const body = JSON.stringify({ thread_id: threadId, tag });
  if (beacon && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/live/select", new Blob([body], { type: "text/plain" }));
    return;
  }
  void fetch("/api/live/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Tell everyone on the game's map which free nation this (logged-in) player
 * has selected — the yellow glow with their name — and clear it when they
 * pick something else, leave the game or close the page.
 */
export function useShareSelection(threadId: string | null, tag: string | null, enabled: boolean): void {
  // Moving straight to another nation replaces the selection; the "cleared"
  // update only goes out if nothing new follows (no flicker for the others).
  const pendingClear = useRef<{ threadId: string; timer: number } | null>(null);
  useEffect(() => {
    if (!enabled || !threadId || !tag) return undefined;
    if (pendingClear.current?.threadId === threadId) {
      window.clearTimeout(pendingClear.current.timer);
      pendingClear.current = null;
    }
    const settle = window.setTimeout(() => postSelection(threadId, tag), SETTLE_MS);
    const keepalive = window.setInterval(() => {
      if (!document.hidden) postSelection(threadId, tag);
    }, KEEPALIVE_MS);
    const onPageHide = () => postSelection(threadId, null, true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearTimeout(settle);
      window.clearInterval(keepalive);
      window.removeEventListener("pagehide", onPageHide);
      const timer = window.setTimeout(() => {
        if (pendingClear.current?.timer === timer) pendingClear.current = null;
        postSelection(threadId, null);
      }, SETTLE_MS + 50);
      pendingClear.current = { threadId, timer };
    };
  }, [threadId, tag, enabled]);
}
