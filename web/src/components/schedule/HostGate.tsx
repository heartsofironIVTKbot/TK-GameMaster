"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  Info,
  Lock,
  LogIn,
  UsersRound,
  WifiOff,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import SiteHeader from "@/components/site/SiteHeader";
import type { SitePage } from "@/components/site/SiteMenu";
import type { HostProfile, HostStatusResponse } from "@/lib/scheduleTypes";
import { Spinner } from "./ui";

/** One line of "what's on this page" on the log-in screen. */
export interface GateFeature {
  icon: LucideIcon;
  title: string;
  text: string;
}

const CALENDAR_FEATURES: GateFeature[] = [
  {
    icon: CalendarPlus,
    title: "Schedule a game in a minute",
    text: "Pick the mode, the day and the nations. GameMaster posts the announcement for you.",
  },
  { icon: Lock, title: "Lock nations before anyone reserves", text: "Presets and lock groups, set once and used for every game." },
  { icon: UsersRound, title: "See who's coming", text: "Reservations, attendance and the draft, live." },
];

/**
 * Renders its children only for signed-in hosts; every other state (loading,
 * needs Discord login, not a host, backend not ready) gets a full page.
 * Children mount on the client only, so they can read the browser's time zone
 * and localStorage without hydration mismatches.
 */
export default function HostGate({
  returnPath,
  children,
  page = "calendar",
  title = "Host Calendar",
  intro = "Everything a host needs for a game, in one place.",
  features = CALENDAR_FEATURES,
  audience = "For members with a Host role on a GameMaster server.",
  area = "the calendar",
}: {
  /** Where Discord login should come back to. */
  returnPath: string;
  children: (host: HostProfile) => ReactNode;
  /** The page being gated (its header and icon). */
  page?: SitePage;
  title?: string;
  intro?: string;
  /** What the page does, shown next to the log-in card. */
  features?: GateFeature[];
  /** Who the page is for, after the intro. */
  audience?: string;
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

  if (status?.status === "anonymous") {
    return (
      <LoginScreen
        page={page}
        title={title}
        intro={`${intro} ${audience}`}
        features={features}
        returnPath={returnPath}
        account="the Discord account you host with"
        note="Logged in but not a host? Ask Host Management for a Host role, then reload."
      />
    );
  }

  let body: ReactNode;
  if (failed) {
    body = <GateMessage icon={WifiOff} title="Can't reach GameMaster" text="Check your connection and reload the page." />;
  } else if (!status) {
    body = (
      <div className="flex items-center gap-3 text-ink-300">
        <Spinner className="h-5 w-5 text-brand-400" />
        <span className="text-sm font-semibold">Checking your host access…</span>
      </div>
    );
  } else if (status.status === "not_host") {
    body = (
      <GateMessage
        icon={Lock}
        title="Hosts only"
        text={`You're logged in as @${status.username}, but ${area} is only for members with a Host role. If you were just given one, try again in a few minutes.`}
      />
    );
  } else {
    body = <GateMessage icon={Wrench} title={`${title} isn't available`} text={status.message} />;
  }

  return (
    <GateScreen page={page} title={title}>
      {body}
    </GateScreen>
  );
}

/** A full page with the site header and one thing in the middle. */
export function GateScreen({ page, title, children }: { page: SitePage; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page={page} title={title} />
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center p-4">{children}</main>
    </div>
  );
}

/**
 * The log-in page: what this page is for on the left, the Discord button on
 * the right (on phones the card comes straight after the heading).
 */
export function LoginScreen({
  page,
  title,
  intro,
  features,
  returnPath,
  account = "your Discord account",
  note,
}: {
  page: SitePage;
  title: string;
  intro: string;
  features: GateFeature[];
  returnPath: string;
  /** "Use <account>." */
  account?: string;
  /** A hint under the button. */
  note?: string;
}) {
  const featureList = (
    <ul className="max-w-[560px]">
      {features.map(({ icon: Icon, title: name, text }) => (
        <li key={name} className="flex gap-3 border-t border-ink-800 py-3">
          <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" strokeWidth={1.75} />
          <span>
            <span className="block text-sm font-semibold text-ink-100">{name}</span>
            <span className="text-[13px] text-ink-400">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page={page} title={title} />
      <main className="grid min-h-[calc(100vh-57px)] lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="flex flex-col justify-center px-5 pb-2 pt-8 sm:px-10 lg:border-r lg:border-ink-800 lg:px-16 lg:py-16">
          <h1 className="gm-title text-[42px] sm:text-[64px]">{title}</h1>
          <p className="mb-7 mt-3 max-w-[520px] text-[15px] text-ink-400">{intro}</p>
          <div className="hidden lg:block">{featureList}</div>
        </section>
        <section className="flex items-start justify-center bg-ink-950 px-5 pb-6 pt-2 sm:px-10 lg:items-center lg:bg-ink-900/40 lg:p-8">
          <div className="gm-plate flex w-full max-w-[380px] flex-col items-center p-8 text-center">
            <span className="gm-cut grid h-[52px] w-[52px] place-items-center bg-ink-800 text-brand-400 [--cut:10px]">
              <LogIn aria-hidden className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h2 className="gm-title mt-4 text-[30px]">Log in to continue</h2>
            <p className="mt-2 text-[13.5px] text-ink-400">
              Use {account}. GameMaster only sees your Discord name and picture.
            </p>
            <DiscordLoginButton returnPath={returnPath} className="mt-5" />
            {note && (
              <p className="gm-cut mt-5 flex w-full gap-2.5 bg-ink-950 px-3 py-2.5 text-left text-[12.5px] text-ink-400 [--cut:9px]">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" strokeWidth={1.75} />
                {note}
              </p>
            )}
            <BackToMap className="mt-3" />
          </div>
        </section>
        <section className="px-5 pb-10 sm:px-10 lg:hidden">{featureList}</section>
      </main>
    </div>
  );
}

/** A card in the middle of the page: an error, "hosts only", and so on. */
export function GateMessage({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="gm-plate gm-fade-up flex w-full max-w-md flex-col items-center p-8 text-center">
      <span className="gm-cut grid h-[52px] w-[52px] place-items-center bg-ink-800 text-brand-400 [--cut:10px]">
        <Icon aria-hidden className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h1 className="gm-title mt-4 text-[34px]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-400">{text}</p>
      {children}
      <BackToMap className="mt-5" />
    </div>
  );
}

function BackToMap({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`gm-btn gm-btn-quiet h-[30px] px-2.5 text-[12.5px] [--cut:7px] ${className}`}>
      <ArrowLeft aria-hidden strokeWidth={1.75} />
      Back to the map
    </Link>
  );
}

/** "Log in with Discord", coming back to `returnPath`. */
export function DiscordLoginButton({ returnPath, className = "" }: { returnPath: string; className?: string }) {
  return (
    <a
      href={`/api/auth/login?next=${encodeURIComponent(returnPath)}`}
      className={`gm-btn h-[42px] bg-[#5865F2] px-5 text-sm text-white [--cut:9px] hover:bg-[#4752c4] ${className}`}
    >
      <DiscordGlyph />
      Log in with Discord
    </a>
  );
}

export function DiscordGlyph() {
  return (
    <svg width="20" height="16" viewBox="0 0 71 55" fill="currentColor" aria-hidden>
      <path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.4 37.4 0 0 0 25.4.5a.2.2 0 0 0-.2-.1 58.4 58.4 0 0 0-14.6 4.5.2.2 0 0 0-.1.1C1.5 18.7-1 32.1.3 45.4v.1a58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1.1.9a.2.2 0 0 1 0 .4 36.3 36.3 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.2 47.2 0 0 0 3.6 5.9.2.2 0 0 0 .3.1 58.6 58.6 0 0 0 17.7-9v-.1c1.5-15.4-2.5-28.7-10.5-40.5a.2.2 0 0 0-.1-.1ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z" />
    </svg>
  );
}
