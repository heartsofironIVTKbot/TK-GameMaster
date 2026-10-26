"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ServersResponse } from "@/lib/serverSettingsTypes";
import { GLASS, Spinner } from "@/components/schedule/ui";
import ServerList from "./ServerList";
import ServerSetupApp from "./ServerSetupApp";

/**
 * /servers — every server you can set GameMaster up in; /servers?guild=<id>
 * opens that server's setup wizard (or settings once set up).
 */
export default function ServersPage() {
  const params = useSearchParams();
  const guild = params.get("guild");
  if (guild && /^\d{15,25}$/.test(guild)) {
    return <ServerSetupApp key={guild} serverId={guild} initialStep={params.get("step")} added={params.get("added") === "1"} />;
  }
  return <ServersIndex cancelled={params.get("invite") === "cancelled"} />;
}

function ServersIndex({ cancelled }: { cancelled: boolean }) {
  const [state, setState] = useState<ServersResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelledRequest = false;
    fetch("/api/servers", { cache: "no-store" })
      .then((response) => response.json() as Promise<ServersResponse>)
      .then((body) => {
        if (!cancelledRequest) setState(body);
      })
      .catch(() => {
        if (!cancelledRequest) setFailed(true);
      });
    return () => {
      cancelledRequest = true;
    };
  }, []);

  const connect = "/api/auth/login?servers=1&next=/servers";
  let body: React.ReactNode;
  if (failed) {
    body = <Gate icon="📡" title="Can't reach the website" text="Check your connection and reload the page." />;
  } else if (!state) {
    body = (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-300">
        <Spinner className="h-5 w-5 text-amber-400" />
        <span className="text-sm font-semibold">Loading your servers…</span>
      </div>
    );
  } else if (state.status === "anonymous" || state.status === "needs_scope") {
    body = (
      <Gate
        icon="⚙️"
        title={state.status === "anonymous" ? "Set up GameMaster" : "Connect your servers"}
        text={
          state.status === "anonymous"
            ? "Log in with Discord to see the servers you own or admin, add GameMaster and set it up."
            : `You're logged in as ${state.username}. GameMaster also needs to see which servers you're in. Discord asks you once, and GameMaster only reads the list.`
        }
      >
        <a href={connect} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:bg-[#4752c4]">
          {state.status === "anonymous" ? "Log in with Discord" : "Connect your servers"}
        </a>
      </Gate>
    );
  } else if (state.status === "unavailable") {
    body = <Gate icon="🛠️" title="Not available right now" text={state.message} />;
  } else {
    body = <ServerList servers={state.servers} username={state.username} demo={state.demo} />;
  }

  return (
    <div className="gm-backdrop min-h-screen w-full px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto mb-5 flex max-w-5xl items-center justify-between">
        <Link href="/" className="text-sm font-black text-white">
          🎖️ GameMaster
        </Link>
        <Link href="/invite" className="text-xs font-bold text-slate-400 hover:text-white">
          What is GameMaster?
        </Link>
      </div>
      {cancelled && (
        <p className="mx-auto mb-4 max-w-5xl rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
          Adding the bot was cancelled — nothing changed.
        </p>
      )}
      {body}
    </div>
  );
}

function Gate({ icon, title, text, children }: { icon: string; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className={`mx-auto mt-10 max-w-lg rounded-3xl p-8 text-center ${GLASS}`}>
      <p className="text-4xl">{icon}</p>
      <h1 className="mt-3 text-xl font-black text-white">{title}</h1>
      <p className="mt-2 text-sm text-slate-300">{text}</p>
      {children}
    </div>
  );
}
