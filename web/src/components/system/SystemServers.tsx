"use client";

import { Ban, Crown, Globe, ShieldCheck, Undo2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/site/SiteHeader";
import { Spinner } from "@/components/schedule/ui";
import type { SystemOverview, SystemServer } from "@/lib/systemAdmin";

/**
 * /system — GameMaster's owners: every Discord server using the bot, and the
 * banned ones. A ban makes the bot leave that server within a minute, and
 * leave again whenever someone adds it there.
 */

type Filter = "in" | "left" | "banned" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "in", label: "Using GameMaster" },
  { value: "left", label: "Left" },
  { value: "banned", label: "Banned" },
  { value: "all", label: "All" },
];

const dateText = (sec: number | null) =>
  sec ? new Date(sec * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function SystemServers() {
  const [data, setData] = useState<SystemOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("in");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [banId, setBanId] = useState("");
  const [banReason, setBanReason] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/system/servers", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as (SystemOverview & { error?: string }) | null;
    if (response?.ok && body) {
      setData(body);
      setError(null);
    } else {
      setError(body?.error ?? "Couldn't load the servers.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void load();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const setBan = async (guildId: string, banned: boolean, reason: string | null, name: string) => {
    setBusy(guildId);
    setNotice(null);
    const response = await fetch("/api/system/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guild_id: guildId, banned, reason }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (response?.ok) {
      setNotice({
        tone: "ok",
        text: banned ? `${name} is banned. GameMaster leaves it within a minute.` : `${name} is unbanned. It can add GameMaster again.`,
      });
      await load();
    } else {
      setNotice({ tone: "error", text: body?.error ?? "That didn't work. Try again." });
    }
  };

  const servers = useMemo(() => {
    const all = data?.servers ?? [];
    if (filter === "in") return all.filter((server) => server.bot_present && !server.banned);
    if (filter === "left") return all.filter((server) => !server.bot_present && !server.banned);
    if (filter === "banned") return all.filter((server) => server.banned);
    return all;
  }, [data, filter]);
  const counts = useMemo(() => {
    const all = data?.servers ?? [];
    return {
      in: all.filter((server) => server.bot_present && !server.banned).length,
      left: all.filter((server) => !server.bot_present && !server.banned).length,
      banned: all.filter((server) => server.banned).length + (data?.banned_elsewhere.length ?? 0),
      all: all.length,
    };
  }, [data]);

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="system" title="All servers" subtitle="Every Discord server using GameMaster" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        {error && <p className="gm-plate bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</p>}
        {!data && !error && (
          <div className="flex items-center justify-center gap-3 py-24 text-ink-300">
            <Spinner className="h-5 w-5 text-brand-400" />
            <span className="text-sm font-semibold">Loading every server…</span>
          </div>
        )}
        {data && (
          <>
            {data.demo && <p className="text-xs text-ink-500">Preview: sample servers; bans aren&apos;t saved.</p>}
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setFilter(entry.value)}
                  aria-pressed={filter === entry.value}
                  className={`gm-cut px-3 py-1.5 text-xs font-bold [--cut:6px] ${
                    filter === entry.value ? "bg-brand-400 text-brand-950" : "bg-ink-800 text-ink-300 hover:text-ink-100"
                  }`}
                >
                  {entry.label} <span className="tabular-nums opacity-70">{counts[entry.value]}</span>
                </button>
              ))}
            </div>

            {notice && (
              <p className={`gm-plate px-4 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-950/40 text-emerald-200" : "bg-rose-950/40 text-rose-200"}`}>
                {notice.text}
              </p>
            )}

            <ul className="space-y-2">
              {servers.map((server) => (
                <ServerRow key={server.id} server={server} busy={busy === server.id} onBan={setBan} />
              ))}
              {servers.length === 0 && <li className="py-10 text-center text-sm text-ink-500">No servers here.</li>}
            </ul>

            {(filter === "banned" || filter === "all") && data.banned_elsewhere.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Banned before GameMaster ever joined</h2>
                {data.banned_elsewhere.map((entry) => (
                  <div key={entry.id} className="gm-plate flex items-center gap-3 bg-ink-950 px-4 py-3">
                    <Ban aria-hidden className="h-5 w-5 shrink-0 text-rose-300" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm text-ink-100">{entry.id}</p>
                      <p className="text-xs text-ink-500">
                        Banned {dateText(entry.added_at)}
                        {entry.reason ? ` · ${entry.reason}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy === entry.id}
                      onClick={() => void setBan(entry.id, false, null, entry.id)}
                      className="gm-btn gm-btn-secondary h-8 px-3 text-xs"
                    >
                      <Undo2 aria-hidden className="h-3.5 w-3.5" /> Unban
                    </button>
                  </div>
                ))}
              </section>
            )}

            <section className="gm-plate space-y-2 bg-ink-950 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-100">
                <Ban aria-hidden className="h-4 w-4 text-rose-300" strokeWidth={1.75} /> Ban a server by its id
              </h2>
              <p className="text-xs text-ink-400">For a server that hasn&apos;t added GameMaster yet. If it does, the bot leaves at once.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={banId}
                  onChange={(event) => setBanId(event.target.value.replace(/\D/g, "").slice(0, 25))}
                  placeholder="Server id"
                  inputMode="numeric"
                  aria-label="Server id to ban"
                  className="gm-input font-mono text-sm sm:w-64"
                />
                <input
                  value={banReason}
                  onChange={(event) => setBanReason(event.target.value.slice(0, 200))}
                  placeholder="Reason (only you see it)"
                  aria-label="Ban reason"
                  className="gm-input flex-1 text-sm"
                />
                <button
                  type="button"
                  disabled={!/^\d{15,25}$/.test(banId) || busy === banId}
                  onClick={() => {
                    void setBan(banId, true, banReason, banId).then(() => {
                      setBanId("");
                      setBanReason("");
                    });
                  }}
                  className="gm-btn gm-btn-danger h-10 px-4 text-sm"
                >
                  Ban
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ServerRow({
  server,
  busy,
  onBan,
}: {
  server: SystemServer;
  busy: boolean;
  onBan: (guildId: string, banned: boolean, reason: string | null, name: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className="gm-plate bg-ink-950 px-4 py-3">
      <div className="flex items-center gap-3">
        {server.icon_url ? (
          // Discord's own CDN image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={server.icon_url} alt="" className="h-10 w-10 shrink-0 rounded-full" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-400">
            <Globe aria-hidden className="h-5 w-5" strokeWidth={1.5} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-100">
            <span className="truncate">{server.name}</span>
            {server.is_home && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-950/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                <Crown aria-hidden className="h-3 w-3" /> HOME
              </span>
            )}
            {server.banned ? (
              <span className="rounded bg-rose-950/70 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">BANNED</span>
            ) : server.bot_present ? (
              <span className="rounded bg-emerald-950/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">
                {server.status === "active" ? "SET UP" : "NEEDS SETUP"}
              </span>
            ) : (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold text-ink-400">LEFT</span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-500">
            <span className="font-mono">{server.id}</span>
            {server.member_count !== null && (
              <span className="inline-flex items-center gap-1">
                <Users aria-hidden className="h-3 w-3" /> {server.member_count.toLocaleString()}
              </span>
            )}
            <span>Added {dateText(server.joined_at)}</span>
            {!server.bot_present && server.left_at && <span>Left {dateText(server.left_at)}</span>}
            {server.owner_id && <span>Owner {server.owner_id}</span>}
            {server.banned?.reason && <span className="text-rose-300/80">Ban: {server.banned.reason}</span>}
          </p>
        </div>
        {!server.is_home &&
          (server.banned ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onBan(server.id, false, null, server.name)}
              className="gm-btn gm-btn-secondary h-8 shrink-0 px-3 text-xs"
            >
              <Undo2 aria-hidden className="h-3.5 w-3.5" /> Unban
            </button>
          ) : (
            !asking && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsking(true)}
                className="gm-btn gm-btn-secondary h-8 shrink-0 px-3 text-xs text-rose-200"
              >
                <Ban aria-hidden className="h-3.5 w-3.5" /> Ban
              </button>
            )
          ))}
        {server.is_home && <ShieldCheck aria-label="The home server can't be banned" className="h-4 w-4 shrink-0 text-ink-600" />}
      </div>
      {asking && !server.banned && (
        <div className="mt-3 flex flex-col gap-2 border-t border-ink-800 pt-3 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-300 sm:w-56">Ban {server.name}? GameMaster leaves it and won&apos;t stay if added again.</p>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 200))}
            placeholder="Reason (only you see it)"
            aria-label={`Reason for banning ${server.name}`}
            className="gm-input flex-1 text-sm"
          />
          <button type="button" onClick={() => setAsking(false)} className="gm-btn gm-btn-secondary h-9 px-3 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAsking(false);
              void onBan(server.id, true, reason, server.name);
            }}
            className="gm-btn gm-btn-danger h-9 px-3 text-xs"
          >
            Ban
          </button>
        </div>
      )}
    </li>
  );
}
