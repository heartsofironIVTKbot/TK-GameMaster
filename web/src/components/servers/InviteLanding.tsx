import { CalendarDays, Check, FolderOpen, Gamepad2, Map as MapIcon, Medal, Target } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
import Link from "next/link";
import { REQUIRED_PERMISSIONS, inviteUrl } from "@/lib/serverSettingsTypes";

/**
 * /invite — what GameMaster is, what it asks for, and the Add to Discord
 * button (Discord's "Add to server" screen, then straight into setup).
 */

const FEATURES = [
  { icon: CalendarDays, title: "Calendar", text: "Hosts schedule games on the website. GameMaster announces them, opens reservations and reminds players." },
  { icon: MapIcon, title: "Live map", text: "Players reserve nations on a clickable map, alone, as a co-op or as a filler. Draft games included." },
  { icon: Gamepad2, title: "Game control", text: "Start, end and cancel games, voice channels for every nation, late joins and messages to players." },
  { icon: Target, title: "Attendance", text: "Automatic voice checks, no-show warnings and an attendance page to correct them." },
  { icon: FolderOpen, title: "Player records", text: "Commends, warnings, game bans, Merit, Dishonored, VIP and verification on one page per player." },
  { icon: Medal, title: "Host branches", text: "Roleplay and Historical host teams with Assistant, Full and Senior ranks that promote themselves." },
];

const STAGES = [
  { n: 1, title: "Add GameMaster", text: "Pick your server and approve the permissions. No Administrator needed." },
  { n: 2, title: "Set it up on the website", text: "Map your staff, host and player roles, channels and game modes, with a check at every step." },
  { n: 3, title: "Host", text: "Your hosts log in with Discord and run everything from the website." },
];

export default function InviteLanding() {
  return (
    <div className="gm-backdrop min-h-screen w-full pb-16 text-ink-100">
      <SiteHeader page="invite" title="GameMaster" subtitle="Hearts of Iron IV multiplayer" />
      <div className="px-4 sm:px-6">

      <section className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
        <p className="text-xs font-semibold text-brand-300">Hearts of Iron IV multiplayer</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-ink-100 sm:text-5xl">Run your HOI4 games from one website</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-ink-300 sm:text-base">
          GameMaster handles scheduling, reservations, attendance, moderation and host teams for HOI4 multiplayer communities. Add it to
          your Discord server and set it up in a few minutes.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a
            href={inviteUrl()}
            className="gm-cut [--cut:9px] bg-[#5865F2] px-7 py-3.5 text-sm font-bold text-ink-100 shadow-xl shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:bg-[#4752c4]"
          >
            Add to Discord
          </a>
          <Link href="/servers" className="gm-cut [--cut:9px] border border-ink-700 bg-ink-800 px-7 py-3.5 text-sm font-bold text-ink-100 hover:border-brand-300/40">
            Set up a server I already added
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-14 grid max-w-5xl gap-3 sm:grid-cols-3">
        {STAGES.map((stage) => (
          <div key={stage.n} className="gm-cut [--cut:12px] border border-ink-800 bg-ink-900/60 p-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-400 text-sm font-bold text-ink-950">{stage.n}</span>
            <p className="mt-2 font-bold text-ink-100">{stage.title}</p>
            <p className="mt-1 text-xs text-ink-400">{stage.text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="gm-plate p-4">
            <feature.icon aria-hidden className="h-6 w-6 text-brand-400" strokeWidth={1.5} />
            <p className="mt-1 font-bold text-ink-100">{feature.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">{feature.text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-10 max-w-5xl gm-plate border border-ink-800 bg-ink-900/60 p-5">
        <h2 className="text-lg font-bold text-ink-100">What GameMaster asks for</h2>
        <p className="mt-1 text-xs text-ink-400">
          Only the permissions it uses, never Administrator. Setup shows anything missing and how to fix it.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {REQUIRED_PERMISSIONS.map((perm) => (
            <li key={perm.bit} className="flex items-start gap-2 text-xs">
              <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" strokeWidth={2} />
              <span>
                <span className="font-bold text-ink-200">{perm.name}</span>
                <span className="block text-ink-500">{perm.why}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mx-auto mt-8 max-w-3xl text-center text-[11px] text-ink-500">
        Each server keeps its own player records. Only the server&apos;s owner, its admins, and Host Management the owner allows can change
        its settings. Every change is logged.
      </p>
      </div>
    </div>
  );
}
