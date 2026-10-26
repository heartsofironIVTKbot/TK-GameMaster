"use client";

import { useEffect, useState } from "react";
import type { PublicStatus } from "@/lib/serverDashboardTypes";

/**
 * GameMaster's 30-day uptime as daily bars (GET /api/status) — on the public
 * status page and in each server's Health section. Refreshes every minute.
 */

const REFRESH_MS = 60_000;

export function barTone(percent: number | null): string {
  if (percent === null) return "bg-slate-700/60";
  if (percent >= 99.5) return "bg-emerald-400";
  if (percent >= 95) return "bg-amber-400";
  return "bg-rose-500";
}

/** Load /api/status and keep it fresh. */
export function usePublicStatus() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch("/api/status", { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as (PublicStatus & { error?: string }) | null;
      if (cancelled) return;
      if (body?.days) {
        setStatus(body);
        setError(null);
      } else setError(body?.error ?? "Couldn't load the status — try again shortly.");
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return { status, error };
}

/** The green bars: one per day, coloured by how much of it GameMaster was up. */
export function UptimeBars({ status }: { status: PublicStatus }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-black text-white">Uptime · last 30 days</h2>
        <span className="text-sm font-black text-emerald-300">{status.uptime_30d === null ? "—" : `${status.uptime_30d}%`}</span>
      </div>
      <div className="mt-3 flex h-10 items-stretch gap-[3px]" role="img" aria-label="Daily uptime for the last 30 days">
        {status.days.map((day) => (
          <span
            key={day.day}
            title={`${day.day}: ${day.percent === null ? "no data" : `${day.percent}% up`}`}
            className={`flex-1 rounded-sm ${barTone(day.percent)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
        <span>30 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}
