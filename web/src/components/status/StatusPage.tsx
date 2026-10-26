"use client";

import Link from "next/link";
import { GLASS, Spinner } from "@/components/schedule/ui";
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

export default function StatusPage() {
  const { status, error } = usePublicStatus();

  // The server's clock at the last check (durations stay right whatever the viewer's clock says).
  const now = status?.checked_at ?? 0;
  const state = status?.state ?? "unknown";
  const banner = {
    online: { text: "GameMaster is online", tone: "border-emerald-400/40 bg-emerald-500/10", dot: "bg-emerald-400" },
    offline: { text: "GameMaster is offline", tone: "border-rose-400/50 bg-rose-500/15", dot: "bg-rose-500" },
    unknown: { text: "Status not available yet", tone: "border-white/15 bg-white/5", dot: "bg-slate-500" },
  }[state];

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-600 text-lg shadow-lg shadow-emerald-500/30">
              📡
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Status</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        {!status && !error && (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner className="h-4 w-4 text-emerald-300" /> Checking…
          </p>
        )}
        {error && !status && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>}

        {status && (
          <>
            <section className={`rounded-3xl border p-5 ${banner.tone}`}>
              <div className="flex items-center gap-3">
                <span className="relative flex h-3.5 w-3.5">
                  {state === "online" && <span className={`gm-live-ping absolute inline-flex h-full w-full rounded-full ${banner.dot}`} />}
                  <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${banner.dot}`} />
                </span>
                <h1 className="text-xl font-black text-white">{banner.text}</h1>
              </div>
              <p className="mt-1.5 text-sm text-slate-300">
                {state === "online" && status.started_at
                  ? `Running for ${duration(now - status.started_at)}${status.latency_ms !== null ? ` · ${status.latency_ms} ms to Discord` : ""}${
                      status.servers !== null ? ` · serving ${status.servers} ${status.servers === 1 ? "community" : "communities"}` : ""
                    }.`
                  : state === "offline" && status.last_beat
                    ? `Last heard from ${duration(now - status.last_beat)} ago. Games, reminders and website requests resume when it's back.`
                    : "GameMaster reports here once it runs the latest update."}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Checked {dateTime(status.checked_at)} · refreshes every minute</p>
            </section>

            <section className={`rounded-3xl p-5 ${GLASS}`}>
              <UptimeBars status={status} />
            </section>

            <section className={`rounded-3xl p-5 ${GLASS}`}>
              <h2 className="text-sm font-black text-white">Incidents</h2>
              {status.incidents.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No incidents in the last 30 days.</p>
              ) : (
                <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                  {status.incidents.map((incident, index) => (
                    <li key={`${incident.started_at}-${index}`} className="flex items-start gap-3 bg-slate-950/40 px-3 py-2.5 text-sm">
                      <span>{incident.kind === "outage" ? (incident.ended_at === null ? "🔴" : "🟠") : "🔁"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-100">
                          {incident.kind === "outage" ? (incident.ended_at === null ? "Offline now" : "Outage") : "Restart"}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {dateTime(incident.started_at)}
                          {incident.kind === "outage" &&
                            ` · ${incident.ended_at === null ? `for ${duration(now - incident.started_at)} so far` : `lasted ${duration(incident.ended_at - incident.started_at)}`}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
