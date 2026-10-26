"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { HostProfile, HostStatusResponse } from "@/lib/scheduleTypes";
import { GLASS, Spinner } from "./ui";

/**
 * Renders its children only for signed-in hosts; every other state (loading,
 * needs Discord login, not a host, backend not ready) gets a full-page card.
 * Children mount on the client only, so they can read the browser's time zone
 * and localStorage without hydration mismatches.
 */
export default function HostGate({
  returnPath,
  children,
  icon = "🗓️",
  title = "Host Calendar",
  intro = "Schedule games, set nation locks and plan announcements — all from one place. Log in with the Discord account you host with.",
  area = "the calendar",
}: {
  /** Where Discord login should come back to. */
  returnPath: string;
  children: (host: HostProfile) => ReactNode;
  /** Login card wording for the page being gated. */
  icon?: string;
  title?: string;
  intro?: string;
  /** "You're logged in, but <area> is only for…" */
  area?: string;
}) {
  const [status, setStatus] = useState<HostStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/schedule/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<HostStatusResponse>)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status?.status === "ok") return <>{children(status.host)}</>;

  let body: ReactNode;
  if (failed) {
    body = (
      <GateMessage icon="📡" title="Can't reach the server" text="Check your connection and reload the page." />
    );
  } else if (!status) {
    body = (
      <div className="flex items-center gap-3 text-slate-300">
        <Spinner className="h-5 w-5 text-amber-400" />
        <span className="text-sm font-semibold">Checking your host access…</span>
      </div>
    );
  } else if (status.status === "anonymous") {
    body = (
      <GateMessage icon={icon} title={title} text={intro}>
        <a
          href={`/api/auth/login?next=${encodeURIComponent(returnPath)}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-[#4752c4]"
        >
          <DiscordGlyph />
          Log in with Discord
        </a>
      </GateMessage>
    );
  } else if (status.status === "not_host") {
    body = (
      <GateMessage
        icon="🔒"
        title="Hosts only"
        text={`You're logged in as @${status.username}, but ${area} is only for members with a Host role. If you were just promoted, try again in a few minutes.`}
      />
    );
  } else {
    body = <GateMessage icon="🛠️" title={`${title} unavailable`} text={status.message} />;
  }

  return (
    <main className="gm-backdrop flex min-h-screen w-full items-center justify-center p-4">
      {body}
    </main>
  );
}

export function GateMessage({
  icon,
  title,
  text,
  children,
}: {
  icon: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className={`gm-fade-up w-full max-w-md rounded-3xl p-8 text-center ${GLASS}`}>
      <div className="text-5xl">{icon}</div>
      <h1 className="mt-4 text-2xl font-black tracking-tight text-white">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
      {children}
      <div className="mt-6">
        <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-amber-300">
          ← Back to the map
        </Link>
      </div>
    </div>
  );
}

export function DiscordGlyph() {
  return (
    <svg width="20" height="16" viewBox="0 0 71 55" fill="currentColor" aria-hidden>
      <path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.4 37.4 0 0 0 25.4.5a.2.2 0 0 0-.2-.1 58.4 58.4 0 0 0-14.6 4.5.2.2 0 0 0-.1.1C1.5 18.7-1 32.1.3 45.4v.1a58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1.1.9a.2.2 0 0 1 0 .4 36.3 36.3 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.2 47.2 0 0 0 3.6 5.9.2.2 0 0 0 .3.1 58.6 58.6 0 0 0 17.7-9v-.1c1.5-15.4-2.5-28.7-10.5-40.5a.2.2 0 0 0-.1-.1ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z" />
    </svg>
  );
}
