"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostProfile } from "@/lib/scheduleTypes";
import { Spinner } from "@/components/schedule/ui";

/**
 * The header's server switcher (multi-server): which server the host pages
 * show. Hidden when the viewer hosts on one server only (a "Servers" link to
 * set up more stays). Switching reloads the page on the new server.
 */

function Badge({ name, url, size = 22 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-md" style={{ width: size, height: size }} />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-slate-700 font-black text-slate-200"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials || "?"}
    </span>
  );
}

export default function ServerSwitcher({ host }: { host: HostProfile }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const servers = host.servers ?? [];
  if (servers.length < 2) return null;
  const current = servers.find((server) => server.id === host.guild_id) ?? servers[0];

  const pick = async (guildId: string) => {
    if (guildId === current.id) {
      close();
      return;
    }
    setSwitching(guildId);
    setError(null);
    const response = await fetch("/api/me/server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guild_id: guildId }),
    }).catch(() => null);
    if (response?.ok) {
      // A game / record open on the old server doesn't exist on the new one.
      window.location.assign(window.location.pathname);
      return;
    }
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error ?? "Couldn't switch — try again.");
    setSwitching(null);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Server: ${current.name}. Switch server`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[200px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-bold text-slate-200 hover:border-amber-300/40 hover:text-white"
      >
        <Badge name={current.name} url={current.icon_url} />
        <span className="min-w-0 truncate">{current.name}</span>
        <span className="text-[10px] text-slate-500">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-white/15 bg-slate-900 p-1.5 shadow-2xl shadow-black/60">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">Your servers</p>
          <ul role="listbox" aria-label="Servers">
            {servers.map((server) => (
              <li key={server.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={server.id === current.id}
                  disabled={switching !== null}
                  onClick={() => void pick(server.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition disabled:opacity-60 ${
                    server.id === current.id ? "bg-amber-400/15 text-amber-100" : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <Badge name={server.name} url={server.icon_url} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{server.name}</span>
                  {switching === server.id ? (
                    <Spinner className="h-3 w-3 text-amber-300" />
                  ) : server.id === current.id ? (
                    <span className="text-amber-300">✓</span>
                  ) : server.is_staff ? (
                    <span className="text-[10px] text-slate-500">staff</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="px-2 py-1 text-[11px] text-rose-300">{error}</p>}
          <Link href="/servers" className="mt-1 block rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-400 hover:bg-white/5 hover:text-white">
            ⚙️ Server settings & setup
          </Link>
        </div>
      )}
    </div>
  );
}
