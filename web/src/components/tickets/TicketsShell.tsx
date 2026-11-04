"use client";

import { Search, ShieldCheck, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { LoginScreen } from "@/components/schedule/HostGate";
import SiteHeader from "@/components/site/SiteHeader";
import { detectTimeZone, formatInZone } from "@/lib/timeEngine";

/** Header + login page shared by /tickets and /tickets/<id>. */

export function TicketsShell({ children, subtitle }: { children: ReactNode; subtitle: string }) {
  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page="tickets" title="Tickets" subtitle={subtitle} />
      <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

export function TicketsLogin({ next }: { next: string }) {
  return (
    <LoginScreen
      page="tickets"
      title="Tickets"
      intro="Read your closed tickets, the way they looked in Discord."
      returnPath={next}
      features={[
        { icon: Ticket, title: "Your own tickets", text: "Every message, picture and file, after the ticket is closed." },
        { icon: ShieldCheck, title: "The ones your role handles", text: "Staff see the kinds of ticket they could see in Discord." },
        { icon: Search, title: "Search", text: "By name or ticket number, resolved or not." },
      ]}
    />
  );
}

/** A closed ticket's status tag. */
export const STATUS_STYLE: Record<string, string> = {
  Resolved: "gm-tag gm-tag-dot bg-emerald-950 text-emerald-300",
  Unresolved: "gm-tag gm-tag-dot bg-rose-950 text-rose-300",
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
