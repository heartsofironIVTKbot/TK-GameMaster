"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * A player's request to the bot from a public page (hot-join, crash report):
 * send it to `url`, then follow the bot's answer (GET `url`?request_id=)
 * until it's applied or refused. `onDone` gets the bot's result.
 */
export type PlayerRequestState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "waiting"; requestId: string }
  | { phase: "done"; result: ScheduleRequestStatus["result"] }
  | { phase: "error"; message: string };

const POLL_MS = 1_500;
const GIVE_UP_MS = 90_000;

export function usePlayerRequest(url: string, onDone: (result: ScheduleRequestStatus["result"]) => void) {
  const [state, setState] = useState<PlayerRequestState>({ phase: "idle" });
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
        const response = await fetch(`${url}?request_id=${encodeURIComponent(waitingId)}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as {
          status?: string;
          error?: string | null;
          result?: ScheduleRequestStatus["result"];
        } | null;
        if (cancelled) return;
        if (body?.status === "done" || body?.status === "confirm") {
          setState({ phase: "done", result: body.result ?? null });
          onDoneRef.current(body.result ?? null);
          return;
        }
        if (body?.status === "error") {
          setState({ phase: "error", message: (body.error ?? "The bot refused this.").replace(/^❌\s*/, "") });
          onDoneRef.current(null);
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
  }, [waitingId, url]);

  /** JSON body → POST / DELETE; a FormData body is sent as is (uploads). */
  const submit = useCallback(
    async (method: "POST" | "DELETE", body: Record<string, unknown> | FormData) => {
      setState({ phase: "sending" });
      try {
        const response = await fetch(url, {
          method,
          ...(body instanceof FormData
            ? { body }
            : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        });
        const result = (await response.json().catch(() => null)) as { request_id?: string; error?: string } | null;
        if (response.ok && result?.request_id) setState({ phase: "waiting", requestId: result.request_id });
        else setState({ phase: "error", message: result?.error ?? `Request failed (HTTP ${response.status})` });
      } catch {
        setState({ phase: "error", message: "Network error — try again." });
      }
    },
    [url],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  const busy = state.phase === "sending" || state.phase === "waiting";
  return { state, busy, submit, reset };
}
