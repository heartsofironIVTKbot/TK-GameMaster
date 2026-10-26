import Link from "next/link";
import { REQUIRED_PERMISSIONS, inviteUrl } from "@/lib/serverSettingsTypes";

/**
 * /invite — what GameMaster is, what it asks for, and the Add to Discord
 * button (Discord's "Add to server" screen, then straight into setup).
 */

const FEATURES = [
  { icon: "🗓️", title: "Calendar", text: "Hosts schedule games on the website. GameMaster announces them, opens reservations and reminds players." },
  { icon: "🗺️", title: "Live map", text: "Players reserve nations on a clickable map, alone, as a co-op or as a filler. Draft games included." },
  { icon: "🎮", title: "Game control", text: "Start, end and cancel games, voice channels for every nation, late joins and messages to players." },
  { icon: "🎯", title: "Attendance", text: "Automatic voice checks, no-show warnings and an attendance page to correct them." },
  { icon: "🗂️", title: "Player records", text: "Commends, warnings, game bans, Merit, Dishonored, VIP and verification on one page per player." },
  { icon: "🎖️", title: "Host branches", text: "Roleplay and Historical host teams with Assistant, Full and Senior ranks that promote themselves." },
];

const STAGES = [
  { n: 1, title: "Add GameMaster", text: "Pick your server and approve the permissions. No Administrator needed." },
  { n: 2, title: "Set it up on the website", text: "Map your staff, host and player roles, channels and game modes, with a check at every step." },
  { n: 3, title: "Host", text: "Your hosts log in with Discord and run everything from the website." },
];

export default function InviteLanding() {
  return (
    <div className="gm-backdrop min-h-screen w-full px-4 pb-16 text-slate-100 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between py-5">
        <Link href="/" className="text-sm font-black text-white">
          🎖️ GameMaster
        </Link>
        <Link href="/servers" className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white">
          Your servers
        </Link>
      </div>

      <section className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-300">Hearts of Iron IV multiplayer</p>
        <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">Run your HOI4 games from one website</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
          GameMaster handles scheduling, reservations, attendance, moderation and host teams for HOI4 multiplayer communities. Add it to
          your Discord server and set it up in a few minutes.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a
            href={inviteUrl()}
            className="rounded-xl bg-[#5865F2] px-7 py-3.5 text-sm font-black text-white shadow-xl shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:bg-[#4752c4]"
          >
            Add to Discord
          </a>
          <Link href="/servers" className="rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-bold text-slate-100 hover:border-amber-300/40">
            Set up a server I already added
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-14 grid max-w-5xl gap-3 sm:grid-cols-3">
        {STAGES.map((stage) => (
          <div key={stage.n} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-slate-950">{stage.n}</span>
            <p className="mt-2 font-black text-white">{stage.title}</p>
            <p className="mt-1 text-xs text-slate-400">{stage.text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-2xl">{feature.icon}</p>
            <p className="mt-1 font-black text-white">{feature.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{feature.text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-10 max-w-5xl rounded-3xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-lg font-black text-white">What GameMaster asks for</h2>
        <p className="mt-1 text-xs text-slate-400">
          Only the permissions it uses, never Administrator. Setup shows anything missing and how to fix it.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {REQUIRED_PERMISSIONS.map((perm) => (
            <li key={perm.bit} className="flex items-start gap-2 text-xs">
              <span className="text-emerald-400">✓</span>
              <span>
                <span className="font-bold text-slate-200">{perm.name}</span>
                <span className="block text-slate-500">{perm.why}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mx-auto mt-8 max-w-3xl text-center text-[11px] text-slate-500">
        Each server keeps its own player records. Only the server&apos;s owner, its admins, and Host Management the owner allows can change
        its settings. Every change is logged.
      </p>
    </div>
  );
}
