"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HostStatusResponse,
  RosterAssignPayload,
  RosterRemovePayload,
  ScheduleRequestStatus,
} from "@/lib/scheduleTypes";

/**
 * Live map host tools state: who may use them, the on/off switch, and the
 * roster actions in flight (queued for the bot, polled until it answers).
 */

export type HostActionState = "pending" | "done" | "error" | "confirm";

export interface HostAction {
  id: number;
  requestId: string | null;
  label: string;
  /** Slot the action targets (roster shows a pending marker on it). */
  targetSlot: string | null;
  state: HostActionState;
  message: string | null;
  warnings: string[];
  /** Re-sent with force=true when the host accepts the warnings. */
  payload: { action: "roster_assign"; payload: RosterAssignPayload } | { action: "roster_remove"; payload: RosterRemovePayload };
}

const STORAGE_KEY = "gm_host_tools";
/** "0" = Notify players switched off; anything else (or nothing) = on. */
const NOTIFY_KEY = "gm_host_tools_notify";
const POLL_MS = 1200;
const KEEP_FINISHED = 6;

export function useHostTools(onRosterChanged: () => void) {
  const [hostStatus, setHostStatus] = useState<HostStatusResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  // DM players about every Host Tool change (on by default).
  const [notify, setNotifyState] = useState(true);
  const notifyRef = useRef(true);
  const [actions, setActions] = useState<HostAction[]>([]);
  const nextId = useRef(1);
  const changedRef = useRef(onRosterChanged);
  useEffect(() => {
    changedRef.current = onRosterChanged;
  }, [onRosterChanged]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/schedule/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<HostStatusResponse>)
      .then((status) => {
        if (cancelled) return;
        setHostStatus(status);
        if (status.status === "ok") {
          try {
            setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
            const notifyOn = window.localStorage.getItem(NOTIFY_KEY) !== "0";
            notifyRef.current = notifyOn;
            setNotifyState(notifyOn);
          } catch {
            // Storage blocked — tools start off.
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isHost = hostStatus?.status === "ok";

  const setToolsEnabled = useCallback((next: boolean) => {
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not persisted; still applies now.
    }
  }, []);

  const setNotify = useCallback((next: boolean) => {
    notifyRef.current = next;
    setNotifyState(next);
    try {
      window.localStorage.setItem(NOTIFY_KEY, next ? "1" : "0");
    } catch {
      // Not persisted; still applies now.
    }
  }, []);

  const update = useCallback((id: number, patch: Partial<HostAction>) => {
    setActions((current) => current.map((action) => (action.id === id ? { ...action, ...patch } : action)));
  }, []);

  const send = useCallback(
    async (request: HostAction["payload"], label: string, targetSlot: string | null) => {
      // Stamp the Notify players switch as it is now ("Add anyway" re-sends keep it).
      const payload = {
        ...request,
        payload: { ...request.payload, notify: request.payload.notify ?? notifyRef.current },
      } as HostAction["payload"];
      const id = nextId.current++;
      const fresh: HostAction = {
        id, requestId: null, label, targetSlot, state: "pending", message: null, warnings: [], payload,
      };
      setActions((current) => {
        const open = current.filter((action) => action.state === "pending" || action.state === "confirm");
        const finished = current
          .filter((action) => action.state !== "pending" && action.state !== "confirm")
          .slice(0, KEEP_FINISHED);
        return [fresh, ...open, ...finished];
      });
      try {
        const response = await fetch("/api/schedule/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = (await response.json().catch(() => null)) as { request_id?: string; error?: string } | null;
        if (!response.ok || !result?.request_id) {
          update(id, { state: "error", message: result?.error ?? `Failed (HTTP ${response.status})` });
          return;
        }
        update(id, { requestId: result.request_id });
      } catch {
        update(id, { state: "error", message: "Network error — try again." });
      }
    },
    [update],
  );

  // Poll every in-flight request until the bot answers.
  const pendingIds = actions
    .filter((action) => action.state === "pending" && action.requestId)
    .map((action) => `${action.id}:${action.requestId}`)
    .join(",");
  useEffect(() => {
    if (!pendingIds) return undefined;
    const timer = window.setInterval(async () => {
      for (const entry of pendingIds.split(",")) {
        const [idText, requestId] = entry.split(":");
        try {
          const response = await fetch(`/api/schedule/requests/${requestId}`, { cache: "no-store" });
          if (!response.ok) continue;
          const status = (await response.json()) as ScheduleRequestStatus;
          if (status.status === "pending" || status.status === "running") continue;
          update(Number(idText), {
            state: status.status,
            message: status.error,
            warnings: status.result?.warnings ?? [],
          });
          if (status.status === "done") changedRef.current();
        } catch {
          // Try again next tick.
        }
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pendingIds, update]);

  const dismiss = useCallback((id: number) => {
    setActions((current) => current.filter((action) => action.id !== id));
  }, []);

  /** Accept a "confirm" action's warnings: re-send it with force=true. */
  const confirm = useCallback(
    (action: HostAction) => {
      dismiss(action.id);
      if (action.payload.action !== "roster_assign") return;
      void send(
        { action: "roster_assign", payload: { ...action.payload.payload, force: true } },
        action.label,
        action.targetSlot,
      );
    },
    [dismiss, send],
  );

  return {
    isHost,
    isStaff: hostStatus?.status === "ok" && hostStatus.host.is_staff,
    demo: hostStatus?.status === "ok" && hostStatus.host.demo,
    enabled: isHost && enabled,
    setEnabled: setToolsEnabled,
    notify,
    setNotify,
    actions,
    send,
    dismiss,
    confirm,
  };
}
