"use client";

import { useEffect, useState } from "react";
import type { ScheduleRequestStatus } from "@/lib/scheduleTypes";

const POLL_MS = 2000;

/**
 * Follows one queued request until the bot finishes it. `waitedSec` lets the
 * UI explain a slow bot (it processes the queue every ~10 seconds).
 */
export function useRequestPoller(requestId: string | null) {
  const [status, setStatus] = useState<ScheduleRequestStatus | null>(null);
  const [waitedSec, setWaitedSec] = useState(0);
  const [trackedId, setTrackedId] = useState(requestId);

  // Reset when a different request is tracked (render-time state sync).
  if (trackedId !== requestId) {
    setTrackedId(requestId);
    setStatus(null);
    setWaitedSec(0);
  }

  useEffect(() => {
    if (!requestId) return undefined;
    let cancelled = false;
    let timer: number | null = null;
    const started = Date.now();

    const tick = async () => {
      try {
        const response = await fetch(`/api/schedule/requests/${requestId}`, { cache: "no-store" });
        if (response.ok) {
          const next = (await response.json()) as ScheduleRequestStatus;
          if (cancelled) return;
          setStatus(next);
          // "running": a game start / end / cancel still reporting progress.
          if (next.status !== "pending" && next.status !== "running") return;
        }
      } catch {
        // Network hiccup — keep polling.
      }
      if (cancelled) return;
      setWaitedSec(Math.floor((Date.now() - started) / 1000));
      timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [requestId]);

  return { status, waitedSec };
}

/** POST a create/cancel request; resolves to the ids or an error message. */
export async function submitScheduleRequest(
  body: Record<string, unknown>,
): Promise<{ ok: true; requestId: string; slotId: string } | { ok: false; error: string }> {
  try {
    const response = await fetch("/api/schedule/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as {
      request_id?: string;
      slot_id?: string;
      error?: string;
    } | null;
    if (response.ok && result?.request_id) {
      return { ok: true, requestId: result.request_id, slotId: result.slot_id ?? "" };
    }
    return { ok: false, error: result?.error ?? `Request failed (HTTP ${response.status})` };
  } catch {
    return { ok: false, error: "Network error — try again." };
  }
}
