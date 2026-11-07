"use client";

import { Activity, CircleX, Radio, RotateCcw, Server, Timer, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import SiteHeader from "@/components/site/SiteHeader";
import { Spinner } from "@/components/schedule/ui";
import { UptimeBars, usePublicStatus } from "./UptimeCard";

/**
 * The public status page: is GameMaster online, 30-day uptime and recent
 * incidents (GET /api/status). Refreshes every minute.
 */

function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 3_600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 2 * 86_400) return `${Math.floor(s / 3_600)} h ${Math.round((s % 3_600) / 60)} min`;
  return `${Math.floor(s / 86_400)} days ${Math.round((s % 86_400) / 3_600)} h`;
}

function dateTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** The status plate's colour, dot and heading for each state. */
const STATE = {
  online: { text: "GameMaster is online", tone: "oklch(79.4% 0.118 174)", dot: "bg-emerald-400" },
  offline: { text: "GameMaster is offline", tone: "oklch(70.4% 0.191 22.2)", dot: "bg-rose-400" },
  unknown: { text: "Status not available yet", tone: "", dot: "bg-ink-500" },
} as const;

export default function StatusPage() {
  const { status, error } = usePublicStatus();

  // The server's clock at the last check (durations stay right whatever the viewer's clock says).
  const now = status?.checked_at ?? 0;
  const state = status?.state ?? "unknown";
  const meta = STATE[state];

  const facts: { icon: LucideIcon; label: string; value: string }[] = [];
  if (status && state === "online" && status.started_at) facts.push({ icon: Timer, label: "Running for", value: duration(now - status.started_at) });
  if (status && state === "online" && status.latency_ms !== null) facts.push({ icon: Radio, label: "Reply time to Discord", value: `${status.latency_ms} ms` });
  if (status && status.servers !== null) {
    facts.push({ icon: Server, label: "Serving", value: `${status.servers} ${status.servers === 1 ? "community" : "communities"}` });
  }

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="status" title="Status" subtitle="Is GameMaster online" />

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        {!status && !error && (
          <p className="flex items-center gap-2 text-sm text-ink-400">
            <Spinner className="h-4 w-4 text-emerald-300" /> Checking…
          </p>
        )}
        {error && !status && <p className="gm-cut bg-rose-950 px-4 py-3 text-sm text-rose-200 [--cut:9px]">{error}</p>}

        {status && (
          <>
            <section
              className="gm-plate p-5 sm:px-6 sm:py-[22px]"
              style={
                meta.tone
                  ? ({
                      backgroundColor: `color-mix(in oklab, ${meta.tone} 9%, var(--color-ink-900))`,
                      "--line": `color-mix(in oklab, ${meta.tone} 35%, var(--color-ink-800))`,
                    } as CSSProperties)
                  : undefined
              }
            >
              <div className="flex items-center gap-3.5">
                <span className="relative flex h-3.5 w-3.5 shrink-0">
                  {state === "online" && <span className={`gm-live-ping absolute inline-flex h-full w-full rounded-full ${meta.dot}`} />}
                  <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${meta.dot}`} />
                </span>
                <h1 className="gm-title text-[32px] sm:text-[40px]">{meta.text}</h1>
              </div>
              <p className="mt-2 text-[13px] text-ink-400">
                {state === "offline" && status.last_beat
                  ? `Last heard from ${duration(now - status.last_beat)} ago. Games, reminders and website requests start again when it's back. `
                  : state === "unknown"
                    ? "GameMaster reports here once it runs the latest update. "
                    : ""}
                Checked {dateTime(status.checked_at)}, refreshes every minute.
              </p>
              {facts.length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {facts.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="gm-cut bg-ink-950 p-3 [--cut:9px]">
                      <p className="flex items-center gap-1.5 text-xs text-ink-400">
                        <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {label}
                      </p>
                      <p className="mt-1.5 font-display text-[26px] font-extrabold leading-none text-ink-100">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="gm-plate p-4 sm:p-5">
              <UptimeBars status={status} />
            </section>

            <section className="gm-plate p-4 sm:p-5">
              <h2 className="flex items-center gap-2.5">
                <Activity aria-hidden className="h-[18px] w-[18px] text-brand-400" strokeWidth={1.75} />
                <span className="gm-title text-[22px]">Incidents</span>
              </h2>
              {status.incidents.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-400">No incidents in the last 30 days.</p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {status.incidents.map((incident, index) => {
                    const outage = incident.kind === "outage";
                    const ongoing = outage && incident.ended_at === null;
                    const Icon = outage ? CircleX : RotateCcw;
                    return (
                      <li key={`${incident.started_at}-${index}`} className="gm-cut flex items-start gap-3 bg-ink-950 px-3 py-2.5 text-[13px] [--cut:7px]">
                        <Icon
                          aria-hidden
                          className={`mt-0.5 h-4 w-4 shrink-0 ${ongoing ? "text-rose-400" : outage ? "text-yellow-300" : "text-sky-300"}`}
                          strokeWidth={1.75}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink-100">{ongoing ? "Offline now" : outage ? "Outage" : "Restart"}</span>
                          <span className="block text-xs text-ink-500">
                            {dateTime(incident.started_at)}
                            {outage &&
                              `, ${incident.ended_at === null ? `for ${duration(now - incident.started_at)} so far` : `lasted ${duration(incident.ended_at - incident.started_at)}`}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
