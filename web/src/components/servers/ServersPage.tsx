"use client";

import { Radio, Settings, Wrench, type LucideIcon } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ServersResponse } from "@/lib/serverSettingsTypes";
import { Spinner } from "@/components/schedule/ui";
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
    body = <Gate icon={Radio} title="Can't reach the website" text="Check your connection and reload the page." />;
  } else if (!state) {
    body = (
      <div className="flex items-center justify-center gap-3 py-24 text-ink-300">
        <Spinner className="h-5 w-5 text-brand-400" />
        <span className="text-sm font-semibold">Loading your servers…</span>
      </div>
    );
  } else if (state.status === "anonymous" || state.status === "needs_scope") {
    body = (
      <Gate
        icon={Settings}
        title={state.status === "anonymous" ? "Set up GameMaster" : "Connect your servers"}
        text={
          state.status === "anonymous"
            ? "Log in with Discord to see the servers you own or admin, add GameMaster and set it up."
            : `You're logged in as ${state.username}. GameMaster also needs to see which servers you're in. Discord asks you once, and GameMaster only reads the list.`
        }
      >
        <a href={connect} className="mt-6 inline-flex items-center gap-2 gm-cut [--cut:9px] bg-[#5865F2] px-6 py-3 text-sm font-bold text-ink-100 shadow-lg shadow-indigo-500/30 hover:bg-[#4752c4]">
          {state.status === "anonymous" ? "Log in with Discord" : "Connect your servers"}
        </a>
      </Gate>
    );
  } else if (state.status === "unavailable") {
    body = <Gate icon={Wrench} title="Not available right now" text={state.message} />;
  } else {
    body = <ServerList servers={state.servers} username={state.username} demo={state.demo} />;
  }

  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page="servers" title="Your servers" subtitle="Set up GameMaster and change its settings" />
      <div className="px-4 py-6 sm:px-6">
      {cancelled && (
        <p className="mx-auto mb-4 max-w-5xl gm-cut [--cut:9px] border border-ink-800 bg-ink-800 px-3 py-2 text-xs text-ink-300">
          Adding the bot was cancelled, so nothing changed.
        </p>
      )}
      {body}
      </div>
    </div>
  );
}

function Gate({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="gm-plate mx-auto mt-10 flex max-w-lg flex-col items-center p-8 text-center">
      <Icon aria-hidden className="h-9 w-9 text-brand-400" strokeWidth={1.5} />
      <h1 className="gm-title mt-4 text-[30px]">{title}</h1>
      <p className="mt-2 text-sm text-ink-300">{text}</p>
      {children}
    </div>
  );
}
