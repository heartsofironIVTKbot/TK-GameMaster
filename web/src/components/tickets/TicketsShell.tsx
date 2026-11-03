"use client";

import SiteHeader from "@/components/site/SiteHeader";
import type { ReactNode } from "react";
import { GLASS } from "@/components/schedule/ui";
import { detectTimeZone, formatInZone } from "@/lib/timeEngine";

/** Header + login prompt shared by /tickets and /tickets/<id>. */


export function TicketsShell({ children, subtitle }: { children: ReactNode; subtitle: string }) {
  return (
    <div className="gm-backdrop min-h-screen w-full text-ink-100">
      <SiteHeader page="tickets" title="Tickets" subtitle={`${subtitle}`}></SiteHeader>
      <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

export function LoginPrompt({ next }: { next: string }) {
  return (
    <div className={`mx-auto mt-10 max-w-md rounded-3xl p-6 text-center ${GLASS}`}>
      <p className="text-3xl">🎫</p>
      <h1 className="mt-2 text-lg font-black">Your tickets</h1>
      <p className="mt-2 text-sm text-ink-300">Log in with Discord to read your closed tickets (and the ones your role handles).</p>
      <a
        href={`/api/auth/login?next=${encodeURIComponent(next)}`}
        className="mt-4 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400"
      >
        Log in with Discord
      </a>
    </div>
  );
}

export const STATUS_STYLE: Record<string, string> = {
  Resolved: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  Unresolved: "border-rose-400/40 bg-rose-500/10 text-rose-200",
};

let zone: string | null = null;
export function when(unixSec: number, withYear = false): string {
  zone ??= detectTimeZone();
  return formatInZone(unixSec * 1000, zone, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
