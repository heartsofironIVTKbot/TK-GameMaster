"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleRequestStatus } from "@/lib/scheduleTypes";
import { submitScheduleRequest, useRequestPoller } from "@/components/schedule/useRequestPoller";

/**
 * Send one quick request to the bot (reservation access, late join) and
 * follow it: sending → waiting → done / confirm (warnings to accept) / error.
 * `onDone` runs once when the bot has applied it.
 */
export type BotRequestState =
  | { phase: "idle" }
  | { phase: "sending" }
  /** status: the bot's progress so far, for requests it runs in the background. */
  | { phase: "waiting"; status: ScheduleRequestStatus | null }
  | { phase: "done"; status: ScheduleRequestStatus }
  | { phase: "confirm"; status: ScheduleRequestStatus }
  | { phase: "error"; message: string };

export function useBotRequest(onDone: () => void) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [local, setLocal] = useState<{ phase: "idle" } | { phase: "sending" } | { phase: "error"; message: string }>({
    phase: "idle",
  });
  const { status } = useRequestPoller(requestId);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  let state: BotRequestState = local;
  if (local.phase === "idle" && requestId) {
    if (!status || status.status === "pending" || status.status === "running") state = { phase: "waiting", status };
    else if (status.status === "done") state = { phase: "done", status };
    else if (status.status === "confirm") state = { phase: "confirm", status };
    else state = { phase: "error", message: status.error ?? "The bot refused this." };
  }

  const doneId = state.phase === "done" ? state.status.request_id : null;
  useEffect(() => {
    if (doneId) onDoneRef.current();
  }, [doneId]);

  const submit = useCallback(async (body: Record<string, unknown>) => {
    setRequestId(null);
    setLocal({ phase: "sending" });
    const result = await submitScheduleRequest(body);
    if (result.ok) {
      setRequestId(result.requestId);
      setLocal({ phase: "idle" });
    } else {
      setLocal({ phase: "error", message: result.error });
    }
  }, []);
  const reset = useCallback(() => {
    setRequestId(null);
    setLocal({ phase: "idle" });
  }, []);

  const busy = state.phase === "sending" || state.phase === "waiting";
  return { state, busy, submit, reset };
}
