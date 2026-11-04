"use client";

import { ArrowRight, Bot, Plus, Server, Settings, TreePalm } from "lucide-react";
import Link from "next/link";
import type { ServerSummary, SetupState } from "@/lib/serverSettingsTypes";
import { inviteUrl } from "./shared";

export function ServerIcon({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 gm-cut [--cut:12px]" style={{ width: size, height: size }} />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="flex shrink-0 items-center justify-center gm-cut [--cut:12px] bg-gradient-to-br from-ink-700 to-ink-800 font-bold text-ink-200"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "?"}
    </span>
  );
}

export function StatusChip({ setup }: { setup: SetupState }) {
  const map = {
    active: { text: "Set up", className: "bg-emerald-400/15 text-emerald-300" },
    needs_setup: { text: "Needs setup", className: "bg-yellow-300/15 text-yellow-300" },
    not_added: { text: "Bot not added", className: "bg-ink-800 text-ink-300" },
  }[setup];
  return <span className={`gm-tag gm-tag-dot ${map.className}`}>{map.text}</span>;
}

const ACCESS_LABEL = { owner: "Owner", admin: "Admin", staff: "Host Management" } as const;

export default function ServerList({ servers, username, demo }: { servers: ServerSummary[]; username: string; demo: boolean }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5">
            <Server aria-hidden className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
            <span className="gm-title text-[30px]">Your servers</span>
          </h1>
          <p className="text-sm text-ink-400">
            Servers you own or admin, and ones whose owner let Host Management change settings. Logged in as {username}.
          </p>
        </div>
        <a href={inviteUrl()} data-tour="servers.add" className="gm-btn gm-btn-primary">
          <Plus aria-hidden strokeWidth={2} /> Add GameMaster to a server
        </a>
      </div>
      {demo && <p className="text-[11px] text-ink-500">Preview mode: sample servers. Nothing here changes Discord.</p>}
      {servers.length === 0 ? (
        <div className="gm-plate p-8 text-center">
          <TreePalm aria-hidden className="mx-auto h-8 w-8 text-ink-500" strokeWidth={1.5} />
          <p className="mt-2 text-sm font-bold text-ink-100">No servers to manage</p>
          <p className="mt-1 text-xs text-ink-400">You need to own a server or have Administrator in it. Add GameMaster to one to start.</p>
        </div>
      ) : (
        <ul data-tour="servers.list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <li key={server.id} className="gm-plate flex flex-col p-4">
              <div className="flex items-center gap-3">
                <ServerIcon name={server.name} url={server.icon_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink-100">{server.name}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {ACCESS_LABEL[server.access]}
                    {server.is_home ? ", home server" : ""}
                    {server.member_count != null ? `, ${server.member_count.toLocaleString()} members` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <StatusChip setup={server.setup} />
              </div>
              <p className="mt-2.5 flex-1 text-[13px] text-ink-400">
                {server.setup === "not_added"
                  ? "GameMaster isn't in this server yet."
                  : server.setup === "needs_setup"
                    ? "GameMaster is in, but its roles and channels aren't set up yet."
                    : server.is_home
                      ? "Running on these settings: changes apply within 30 seconds."
                      : "Setup finished. GameMaster switches on here when multi-server hosting launches."}
              </p>
              <div className="mt-3 border-t border-ink-800 pt-3">
                {server.setup === "not_added" ? (
                  <a href={inviteUrl(server.id)} className="gm-btn h-[30px] bg-[#5865F2] px-3 text-[12.5px] text-white hover:bg-[#4752c4] [--cut:7px]">
                    <Bot aria-hidden strokeWidth={1.75} /> Add GameMaster
                  </a>
                ) : (
                  <Link
                    href={`/servers?guild=${server.id}`}
                    className={`gm-btn h-[30px] px-3 text-[12.5px] [--cut:7px] ${server.setup === "needs_setup" ? "gm-btn-primary" : "gm-btn-secondary"}`}
                  >
                    {server.setup === "needs_setup" ? (
                      <>
                        <ArrowRight aria-hidden strokeWidth={1.75} /> Continue setup
                      </>
                    ) : (
                      <>
                        <Settings aria-hidden strokeWidth={1.75} /> Settings
                      </>
                    )}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-[11px] text-ink-500">
        Don&apos;t see a server? You need to be its owner or have Administrator.{" "}
        <a href="/api/auth/login?servers=1&next=/servers" className="font-bold text-ink-300 hover:underline">
          Refresh the list from Discord
        </a>
      </p>
    </div>
  );
}
