"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GLASS } from "@/components/schedule/ui";
import { detectTimeZone, formatInZone } from "@/lib/timeEngine";

/** Header + login prompt shared by /tickets and /tickets/<id>. */

const NAV_LINK =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white";

export function TicketsShell({ children, subtitle }: { children: ReactNode; subtitle: string }) {
  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/tickets" className="flex items-center gap-2.5" title="All tickets">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-300 to-indigo-600 text-lg shadow-lg shadow-indigo-500/30">
              🎫
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Tickets</span>
              <span className="block text-[11px] font-semibold text-slate-400">{subtitle}</span>
            </span>
          </Link>
          <nav className="ml-auto flex flex-wrap items-center gap-2">
            <Link href="/" className={NAV_LINK}>
              🗺️ Map
            </Link>
            <Link href="/profile" className={NAV_LINK}>
              👤 My profile
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

export function LoginPrompt({ next }: { next: string }) {
  return (
    <div className={`mx-auto mt-10 max-w-md rounded-3xl p-6 text-center ${GLASS}`}>
      <p className="text-3xl">🎫</p>
      <h1 className="mt-2 text-lg font-black">Your tickets</h1>
      <p className="mt-2 text-sm text-slate-300">Log in with Discord to read your closed tickets (and the ones your role handles).</p>
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
