"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttendanceGamePayload, AttendanceOverridePayload } from "@/lib/attendanceTypes";
import type { DishonoredPayload, HostRatingPayload, ModerationOutcome, ModerationPayload } from "@/lib/moderationTypes";
import type { MemberRolesPayload } from "@/lib/memberRolesTypes";
import type { HostDmPayload } from "@/lib/messageTypes";
import type { ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * Submit one Database / Attendance action and follow it until the bot
 * answers: queue it with POST /api/schedule/requests, then poll the request
 * until it is done or refused. The bot applies requests within a few seconds.
 */

export type ModerationRequest =
  | { action: "moderation"; payload: ModerationPayload }
  | { action: "dishonored"; payload: DishonoredPayload }
  | { action: "host_rating"; payload: HostRatingPayload }
  | { action: "member_roles"; payload: MemberRolesPayload }
  | { action: "host_dm"; payload: HostDmPayload }
  | { action: "att_check" | "att_sample" | "att_finalize"; payload: AttendanceGamePayload }
  | { action: "att_override"; payload: AttendanceOverridePayload };

export type SubmitState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "waiting"; requestId: string }
  | { phase: "done"; outcome: ModerationOutcome; request: ModerationRequest; at: number }
  | { phase: "error"; message: string };

const POLL_MS = 1200;
const TIMEOUT_MS = 90_000;

export function useModerationRequest(onApplied: (request: ModerationRequest) => void) {
  const [state, setState] = useState<SubmitState>({ phase: "idle" });
  const timer = useRef<number | null>(null);
  const onAppliedRef = useRef(onApplied);
  useEffect(() => {
    onAppliedRef.current = onApplied;
  }, [onApplied]);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const submit = useCallback(async (request: ModerationRequest) => {
    setState({ phase: "sending" });
    let requestId: string;
    try {
      const response = await fetch("/api/schedule/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await response.json().catch(() => null)) as { request_id?: string; error?: string } | null;
      if (!response.ok || !body?.request_id) {
        setState({ phase: "error", message: body?.error ?? "Couldn't send the action — try again." });
        return;
      }
      requestId = body.request_id;
    } catch {
      setState({ phase: "error", message: "Network error — try again." });
      return;
    }

    setState({ phase: "waiting", requestId });
    const started = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(`/api/schedule/requests/${requestId}`, { cache: "no-store" });
        const status = (await response.json().catch(() => null)) as ScheduleRequestStatus | null;
        if (status?.status === "done") {
          const message = status.result?.message;
          const outcome = status.result?.moderation ??
            status.result?.attendance ??
            (message && "title" in message ? message : null) ?? { title: "Done", summary: "Applied", notes: [], stats: {}, log_url: null };
          setState({ phase: "done", outcome, request, at: Date.now() });
          onAppliedRef.current(request);
          return;
        }
        if (status?.status === "error") {
          setState({ phase: "error", message: status.error ?? "The bot refused this action." });
          return;
        }
      } catch {
        // Keep polling through brief network blips.
      }
      if (Date.now() - started > TIMEOUT_MS) {
        setState({
          phase: "error",
          message: "The bot hasn't picked this up yet — it will apply it when it's back. Check the record again in a minute.",
        });
        return;
      }
      timer.current = window.setTimeout(poll, POLL_MS);
    };
    timer.current = window.setTimeout(poll, 600);
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, submit, reset };
}
