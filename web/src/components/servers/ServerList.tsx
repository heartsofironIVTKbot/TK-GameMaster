"use client";

import Link from "next/link";
import type { ServerSummary, SetupState } from "@/lib/serverSettingsTypes";
import { GLASS } from "@/components/schedule/ui";
import { inviteUrl } from "./shared";

export function ServerIcon({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-2xl" style={{ width: size, height: size }} />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 font-black text-slate-200"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "?"}
    </span>
  );
}

export function StatusChip({ setup }: { setup: SetupState }) {
  const map = {
    active: { text: "Set up", className: "bg-emerald-500/15 text-emerald-200" },
    needs_setup: { text: "Needs setup", className: "bg-amber-400/15 text-amber-200" },
    not_added: { text: "Bot not added", className: "bg-slate-500/20 text-slate-300" },
  }[setup];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map.className}`}>{map.text}</span>;
}

const ACCESS_LABEL = { owner: "Owner", admin: "Admin", staff: "Host Management" } as const;

export default function ServerList({ servers, username, demo }: { servers: ServerSummary[]; username: string; demo: boolean }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">⚙️ Your servers</p>
          <h1 className="text-2xl font-black text-white">Set up GameMaster</h1>
          <p className="text-sm text-slate-400">
            Servers you own or admin, and ones whose owner let Host Management change settings. Logged in as {username}.
          </p>
        </div>
        <a href={inviteUrl()} className="rounded-xl bg-[#5865F2] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-[#4752c4]">
          ＋ Add GameMaster to a server
        </a>
      </div>
      {demo && <p className="text-[11px] text-slate-500">Preview mode: sample servers. Nothing here changes Discord.</p>}
      {servers.length === 0 ? (
        <div className={`rounded-3xl p-8 text-center ${GLASS}`}>
          <p className="text-3xl">🏝️</p>
          <p className="mt-2 text-sm font-bold text-white">No servers to manage</p>
          <p className="mt-1 text-xs text-slate-400">You need to own a server or have Administrator in it. Add GameMaster to one to start.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {servers.map((server) => (
            <li key={server.id} className={`flex flex-col rounded-3xl p-4 ${GLASS}`}>
              <div className="flex items-center gap-3">
                <ServerIcon name={server.name} url={server.icon_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black text-white">{server.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <StatusChip setup={server.setup} />
                    <span>{ACCESS_LABEL[server.access]}</span>
                    {server.member_count != null && <span>· {server.member_count.toLocaleString()} members</span>}
                    {server.is_home && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-200">Home server</span>}
                  </p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-xs text-slate-400">
                {server.setup === "not_added"
                  ? "GameMaster isn't in this server yet."
                  : server.setup === "needs_setup"
                    ? "GameMaster is in, but its roles and channels aren't set up yet."
                    : server.is_home
                      ? "Running on these settings: changes apply within 30 seconds."
                      : "Setup finished. GameMaster switches on here when multi-server hosting launches."}
              </p>
              <div className="mt-3">
                {server.setup === "not_added" ? (
                  <a href={inviteUrl(server.id)} className="inline-flex rounded-xl bg-[#5865F2] px-4 py-2 text-xs font-bold text-white hover:bg-[#4752c4]">
                    Add GameMaster
                  </a>
                ) : (
                  <Link
                    href={`/servers?guild=${server.id}`}
                    className={`inline-flex rounded-xl px-4 py-2 text-xs font-black ${
                      server.setup === "needs_setup" ? "bg-amber-400 text-slate-950 hover:bg-amber-300" : "border border-white/15 text-slate-100 hover:border-amber-300/40"
                    }`}
                  >
                    {server.setup === "needs_setup" ? "Continue setup →" : "Settings"}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-[11px] text-slate-500">
        Don&apos;t see a server? You need to be its owner or have Administrator.{" "}
        <a href="/api/auth/login?servers=1&next=/servers" className="font-bold text-slate-300 hover:underline">
          Refresh the list from Discord
        </a>
      </p>
    </div>
  );
}
