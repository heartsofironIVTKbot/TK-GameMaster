"use client";

import { Bell, ChevronDown, FileText, Hash, Headphones, Mic, Plus, Settings, Users, Volume2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import "./front/front.css";

/**
 * Discord, as the front page's tours need it (scripts/capture-tours.mjs shoots
 * it; dev only, never linked). Every message is the bot's own text from
 * bot.py.py.
 *
 *   ?view=announce&mode=Roleplay&when=<unix s>&host=Demo%20Host&state=0|1|2&site=<url>
 *       a game's announcement: 0 before it, 1 just posted ("(Creating link...)"), 2 link edited in
 *   ?view=panel     the ticket panel (/spawn): "Contact the Host Team"
 *   ?view=ticket    ticket #0114 (a player report) in its private channel, the close buttons
 *   ?view=dm&site=  the DM the player gets when it's closed, with the website link
 */

const SERVERS = ["KR", "MD", "TNO", "HOI"];
// Sample ticket #0114 (lib/ticketsDemo.ts): Zoe reports Ivan, Kurt handles it.
const TICKET_ID = "1400000000000000016";
const TICKET_CHANNEL = "ticket-0114-behavior";

type View = "announce" | "panel" | "ticket" | "dm";

export default function DiscordLab() {
  const params = useSearchParams();
  // Read the clock once: the page is a still for the capture script.
  const [now] = useState(() => Date.now());
  const view = (["announce", "panel", "ticket", "dm"].includes(params.get("view") ?? "") ? params.get("view") : "announce") as View;
  const mode = params.get("mode") || "Roleplay";
  const host = params.get("host") || "Demo Host";
  const state = Number(params.get("state") ?? 2);
  const when = Number(params.get("when")) || Math.floor(now / 1000) + 22 * 3600;
  const site = (params.get("site") || (typeof window === "undefined" ? "" : window.location.origin)).replace(/\/$/, "");
  const announceChannel = `${mode.toLowerCase().split(" ")[0]}-announcements`;
  const channel = view === "panel" ? "contact-the-host-team" : view === "ticket" ? TICKET_CHANNEL : announceChannel;
  const topic =
    view === "panel"
      ? "Questions, reports, appeals and applications: press a button."
      : view === "ticket"
        ? "Player Report · opened by Zoe"
        : "Games are announced here. Reserve your nation on the map.";
  const viewer = view === "ticket" ? "Kurt" : view === "panel" || view === "dm" ? "Zoe" : host;
  // Ticket #0114 was opened 13.5 hours ago and closed 3 hours later (as in the sample data).
  const opened = now / 1000 - 13.5 * 3600;

  return (
    <div
      className="fx-discord flex h-screen w-full overflow-hidden text-[15px]"
      style={{ fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif" }}
    >
      {/* Servers. */}
      <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-[#1e1f22] py-3">
        <span className={`relative flex h-12 w-12 items-center justify-center bg-[#5865f2] text-white ${view === "dm" ? "rounded-2xl" : "rounded-full"}`}>
          {view === "dm" ? <i className="absolute -left-3 h-10 w-1 rounded-r bg-white" /> : null}
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
            <path d="M19.3 5.3A17 17 0 0 0 15 4l-.2.4a15.6 15.6 0 0 1 3.8 1.9 13 13 0 0 0-11.2 0A15.6 15.6 0 0 1 11.2 4.4L11 4a17 17 0 0 0-4.3 1.3C4 9.4 3.3 13.4 3.6 17.3A17 17 0 0 0 8.8 20l1-1.6a11 11 0 0 1-1.7-.8l.4-.3a12.2 12.2 0 0 0 10.9 0l.4.3-1.7.8 1 1.6a17 17 0 0 0 5.2-2.7c.4-4.5-.7-8.5-3-12ZM9.5 15c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm5 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z" />
          </svg>
        </span>
        <span className="h-0.5 w-8 rounded bg-[#35363c]" />
        <span className={`relative flex h-12 w-12 items-center justify-center bg-ink-900 font-stencil text-lg font-extrabold text-brand-400 ${view === "dm" ? "rounded-full" : "rounded-2xl"}`}>
          {view === "dm" ? null : <i className="absolute -left-3 h-10 w-1 rounded-r bg-white" />}
          TK
        </span>
        {SERVERS.map((name) => (
          <span key={name} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#313338] text-[13px] font-semibold text-[#dbdee1]">
            {name}
          </span>
        ))}
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#313338] text-[#23a559]">
          <Plus className="h-6 w-6" />
        </span>
      </nav>

      {/* Channels, or direct messages. */}
      <aside className="flex w-[240px] shrink-0 flex-col bg-[#2b2d31]">
        {view === "dm" ? (
          <>
            <header className="flex h-12 items-center border-b border-black/30 px-2.5">
              <span className="w-full rounded bg-[#1e1f22] px-2 py-1 text-[13px] text-[var(--dc-muted)]">Find or start a conversation</span>
            </header>
            <div className="flex-1 space-y-0.5 px-2 pt-4">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--dc-muted)]">Direct messages</p>
              <DmRow name="GameMaster" app active />
              <DmRow name="Kurt" />
              <DmRow name="Otto" />
              <DmRow name="Lena" />
            </div>
          </>
        ) : (
          <>
            <header className="flex h-12 items-center justify-between gap-2 border-b border-black/30 px-4 font-semibold text-white">
              <span className="truncate">TommyKay&apos;s HOI4 Community</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </header>
            <div className="flex-1 space-y-0.5 overflow-hidden px-2 pt-4 text-[15px]">
              <Category name="Information" />
              <Channel name="welcome" />
              <Channel name="mods" unread={view === "announce" && state >= 1} />
              <Channel name="rules" unread={view === "announce" && state >= 1} />
              <Category name="Games" />
              <Channel name={announceChannel} active={view === "announce"} />
              <Channel name="historical-announcements" />
              <Channel name="game-chat" />
              <Category name="Support" />
              <Channel name="contact-the-host-team" active={view === "panel"} />
              {view === "ticket" ? (
                <>
                  <Category name="Tickets" />
                  <Channel name={TICKET_CHANNEL} active />
                </>
              ) : null}
              <Category name="Voice" />
              <Channel name="Game VC" voice />
              <Channel name="Lobby" voice />
            </div>
          </>
        )}
        <footer className="flex h-[52px] items-center gap-2 bg-[#232428] px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{viewer[0]}</span>
          <span className="flex-1 text-[13px] leading-tight">
            <b className="block font-semibold text-white">{viewer}</b>
            <span className="text-[var(--dc-muted)]">Online</span>
          </span>
          <Mic className="h-[18px] w-[18px] text-[#b5bac1]" />
          <Headphones className="h-[18px] w-[18px] text-[#b5bac1]" />
          <Settings className="h-[18px] w-[18px] text-[#b5bac1]" />
        </footer>
      </aside>

      {/* The channel. */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4">
          {view === "dm" ? (
            <>
              <BotFace size={24} />
              <b className="font-semibold text-white">GameMaster</b>
              <AppTag />
            </>
          ) : (
            <>
              <Hash className="h-6 w-6 text-[#80848e]" />
              <b className="font-semibold text-white">{channel}</b>
              <span className="ml-2 border-l border-[#3f4147] pl-3 text-sm text-[var(--dc-muted)]">{topic}</span>
              <Users className="ml-auto h-6 w-6 text-[#b5bac1]" />
            </>
          )}
        </header>
        <div className="flex flex-1 flex-col justify-end gap-1 overflow-hidden pb-6">
          {view === "announce" ? (
            <>
              <Announcement
                postedAt="Yesterday at 18:00"
                mode={mode}
                host={host}
                when={when - 24 * 3600}
                now={now}
                link={`${site}/?game=1305210467841102918`}
                faded
              />
              {state >= 1 ? (
                <>
                  <NewLine />
                  <Announcement
                    postedAt={`Today at ${clock(now / 1000)}`}
                    mode={mode}
                    host={host}
                    when={when}
                    now={now}
                    link={state >= 2 ? `${site}/?game=1305482190317756426` : null}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {view === "panel" ? (
            <Message at="Monday at 12:00">
              <Embed colour="#3fbf5a" title="Contact the Host Team">
                <p>Press a button below to open a private ticket with our team.</p>
                <p className="mt-3">
                  🎮 <b>Game Support</b> — apply to host, report a host, appeal a ban or warning, report a player, or request a commend.
                </p>
                <p className="mt-3">
                  ✅ <b>Verification</b> — <em>optional, only for major nations.</em> Everyone can join a game and play a minor nation straight
                  away. To get Verified, post a speed test (20 Mb/s+ down and up), your hardware specs and proof you own all HOI4 DLCs.{" "}
                  <b>Historical Verified</b> also needs a screenshot of at least <b>500 hours</b> in HOI4.
                </p>
                <p className="mt-3">
                  ❓ <b>General Question</b> — anything about our games, rules or community.
                </p>
                <p className="mt-3">
                  🐞 <b>Bug / Suggestion</b> — tell our developers about a bug or an idea.
                </p>
                <p className="mt-3">
                  <em>You can have one open ticket of each type. Abusing tickets can get you muted or banned.</em>
                </p>
              </Embed>
              <div className="mt-2 flex flex-wrap gap-2">
                <DcButton colour="bg-[#248046]">🎮 Game Support</DcButton>
                <DcButton colour="bg-[#5865f2]">✅ Verification</DcButton>
                <DcButton colour="bg-[#4e5058]">❓ General Question</DcButton>
                <DcButton colour="bg-[#4e5058]">🐞 Bug / Suggestion</DcButton>
              </div>
            </Message>
          ) : null}

          {view === "ticket" ? (
            <>
              <Message at={stamp(opened, now)}>
                <p>
                  <Mention>@Zoe</Mention> | 🔔 Host of that game: <Mention>@Kurt</Mention>
                </p>
                <Embed colour="#3fbf5a" title="#0114 - Player Report" footer="Staff: close it with the buttons below when it's done.">
                  <p>
                    <b>Player:</b> <Mention>@Zoe</Mention>
                  </p>
                  <p>
                    <b>Game:</b> Sunday Vanilla
                  </p>
                  <p>
                    <b>Details:</b>
                  </p>
                  <p>Player &apos;Ivan&apos; kept griefing allies in the last game.</p>
                </Embed>
                <div className="mt-2 flex flex-wrap gap-2">
                  <DcButton colour="bg-[#248046]">✅ Close &amp; Resolve</DcButton>
                  <DcButton colour="bg-[#da373c]">⛔ Close (Unresolved)</DcButton>
                </div>
              </Message>
              <Message who="Zoe" at={stamp(opened + 120, now)}>
                <p>Player &apos;Ivan&apos; kept griefing allies in the last game.</p>
              </Message>
              <Message who="Kurt" colour="text-brand-300" at={stamp(opened + 40 * 60, now)}>
                <p>Thanks — looking into it now.</p>
              </Message>
              <Message who="Kurt" colour="text-brand-300" at={stamp(opened + 120 * 60, now)}>
                <p>All sorted, closing this. 👍</p>
              </Message>
            </>
          ) : null}

          {view === "dm" ? (
            <Message at={stamp(opened + 3 * 3600, now)}>
              <p>
                Your ticket <b>{TICKET_CHANNEL}</b> was closed (Resolved). The transcript is attached — you can also read it on the website:{" "}
                <span className="text-[var(--dc-link)]">
                  {site}/tickets/{TICKET_ID}
                </span>
                .
              </p>
              <div className="mt-2 flex w-[420px] items-center gap-3 rounded-lg border border-[#3f4147] bg-[#2b2d31] p-3">
                <FileText className="h-9 w-9 text-[#b5bac1]" strokeWidth={1.5} />
                <span className="leading-tight">
                  <span className="block text-[var(--dc-link)]">{TICKET_CHANNEL}.html</span>
                  <span className="text-xs text-[var(--dc-muted)]">6.18 KB</span>
                </span>
              </div>
            </Message>
          ) : null}
        </div>
        <div className="mx-4 mb-6 flex h-11 items-center gap-3 rounded-lg bg-[#383a40] px-4 text-[var(--dc-muted)]">
          <Plus className="h-6 w-6 rounded-full bg-[#b5bac1] p-0.5 text-[#383a40]" />
          {view === "announce" || view === "panel" ? "You do not have permission to send messages in this channel." : view === "dm" ? "Message @GameMaster" : `Message #${channel}`}
        </div>
      </main>

      {/* Members. */}
      {view === "dm" ? null : (
        <aside className="w-[240px] shrink-0 bg-[#2b2d31] px-2 pt-6">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--dc-muted)]">Hosts — 2</p>
          <Member name={view === "announce" ? host : "Demo Host"} colour="text-brand-300" />
          <Member name="Kurt" colour="text-brand-300" />
          <p className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-[var(--dc-muted)]">Apps — 1</p>
          <Member name="GameMaster" app />
          <p className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-[var(--dc-muted)]">
            Online — {view === "ticket" ? 1 : 9}
          </p>
          {(view === "ticket" ? ["Zoe"] : ["Otto", "Nikolai", "Erwin", "Wilhelm", "Jan", "Isoroku", "Winston", "Charles", "Zoe"]).map((name) => (
            <Member key={name} name={name} />
          ))}
        </aside>
      )}
    </div>
  );
}

/** <t:…:F> the way Discord shows it in English. */
function discordFull(sec: number): string {
  return new Date(sec * 1000)
    .toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(" at ", " ");
}

/** <t:…:R>: "in 22 hours", "5 hours ago", "in a day". */
function discordRelative(sec: number, now: number): string {
  const hours = Math.round((sec * 1000 - now) / 3_600_000);
  const n = Math.abs(hours) < 24 ? Math.abs(hours) : Math.round(Math.abs(hours) / 24);
  const size = Math.abs(hours) < 24 ? (n === 1 ? "an hour" : `${n} hours`) : n === 1 ? "a day" : `${n} days`;
  return hours >= 0 ? `in ${size}` : `${size} ago`;
}

function clock(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "Today at 18:31" / "Yesterday at 18:31", as Discord stamps messages. */
function stamp(sec: number, now: number): string {
  const day = (ms: number) => new Date(ms).toDateString();
  const label = day(sec * 1000) === day(now) ? "Today" : "Yesterday";
  return `${label} at ${clock(sec)}`;
}

function Category({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-0.5 px-0.5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-[var(--dc-muted)] first:pt-0">
      <ChevronDown className="h-3 w-3" />
      {name}
    </p>
  );
}

function Channel({ name, active, unread, voice }: { name: string; active?: boolean; unread?: boolean; voice?: boolean }) {
  const Icon = voice ? Volume2 : Hash;
  return (
    <p className={`relative flex h-8 items-center gap-1.5 rounded px-2 ${active ? "bg-[#404249] text-white" : unread ? "font-semibold text-white" : "text-[#80848e]"}`}>
      {unread ? <i className="absolute -left-2 h-2 w-1 rounded-r bg-white" /> : null}
      <Icon className="h-5 w-5 shrink-0 text-[#80848e]" />
      <span className="truncate">{name}</span>
    </p>
  );
}

function DmRow({ name, app, active }: { name: string; app?: boolean; active?: boolean }) {
  return (
    <p className={`flex h-[42px] items-center gap-3 rounded px-2 ${active ? "bg-[#404249] text-white" : "text-[#949ba4]"}`}>
      {app ? <BotFace size={32} /> : <Face name={name} />}
      <span className="font-medium">{name}</span>
      {app ? <AppTag /> : null}
    </p>
  );
}

function Member({ name, colour, app }: { name: string; colour?: string; app?: boolean }) {
  return (
    <p className="flex h-[42px] items-center gap-3 rounded px-2">
      {app ? <BotFace size={32} /> : <Face name={name} />}
      <span className={`font-medium ${colour ?? "text-[#949ba4]"}`}>{name}</span>
      {app ? <AppTag /> : null}
    </p>
  );
}

function Face({ name }: { name: string }) {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5865f2]/70 text-sm font-semibold text-white">{name[0]}</span>;
}

function BotFace({ size }: { size: number }) {
  return (
    <span
      className="gm-cut flex shrink-0 items-center justify-center bg-brand-400 font-stencil font-extrabold text-brand-950 [--cut:6px]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      GM
    </span>
  );
}

function AppTag() {
  return <span className="rounded-[3px] bg-[#5865f2] px-[5px] text-[10px] font-semibold leading-[15px] text-white">APP</span>;
}

function BotName() {
  return (
    <>
      <span className="font-medium text-white">GameMaster</span>
      <AppTag />
    </>
  );
}

function Mention({ children }: { children: ReactNode }) {
  return <span className="fx-mention">{children}</span>;
}

function NewLine() {
  return (
    <div className="mx-4 my-2 flex items-center gap-2 text-xs font-semibold text-[#f23f43]">
      <span className="h-px flex-1 bg-[#f23f43]" />
      <span className="rounded bg-[#f23f43] px-1 text-[10px] text-white">NEW</span>
    </div>
  );
}

function DcButton({ colour, children }: { colour: string; children: ReactNode }) {
  return <span className={`inline-flex h-8 items-center gap-1.5 rounded-[3px] px-4 text-sm font-medium text-white ${colour}`}>{children}</span>;
}

function Embed({ colour, title, footer, children }: { colour: string; title: string; footer?: string; children: ReactNode }) {
  return (
    <div className="mt-1 max-w-[520px] rounded border-l-4 bg-[#2b2d31] px-4 py-3 text-[14px] leading-[1.375]" style={{ borderLeftColor: colour }}>
      <p className="mb-2 text-base font-semibold text-white">{title}</p>
      {children}
      {footer ? <p className="mt-2 text-xs text-[var(--dc-muted)]">{footer}</p> : null}
    </div>
  );
}

/** One message: who (a person, or GameMaster when no one is named) and when, then what. */
function Message({ who, colour, at, children }: { who?: string; colour?: string; at: string; children: ReactNode }) {
  return (
    <article className="flex gap-4 px-4 py-2">
      <span className="mt-0.5">
        {who ? <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5865f2]/70 font-semibold text-white">{who[0]}</span> : <BotFace size={40} />}
      </span>
      <div className="min-w-0 flex-1 leading-[1.375]">
        <p className="flex items-center gap-1.5">
          {who ? <span className={`font-medium ${colour ?? "text-white"}`}>{who}</span> : <BotName />}
          <span className="text-xs text-[var(--dc-muted)]">{at}</span>
        </p>
        <div className="mt-0.5">{children}</div>
      </div>
    </article>
  );
}

/** One announcement, as the bot posts it. */
function Announcement({
  postedAt,
  mode,
  host,
  when,
  now,
  link,
  faded,
}: {
  postedAt: string;
  mode: string;
  host: string;
  when: number;
  now: number;
  link: string | null;
  faded?: boolean;
}) {
  return (
    <article className={`flex gap-4 px-4 py-2 ${faded ? "" : "bg-[#2e3035]"}`}>
      <span className="mt-0.5">
        <BotFace size={40} />
      </span>
      <div className="min-w-0 flex-1 leading-[1.375]">
        <p className="flex items-center gap-1.5">
          <BotName />
          <span className="text-xs text-[var(--dc-muted)]">{postedAt}</span>
        </p>
        <h3 className="mt-1 flex items-center gap-2 text-[24px] font-bold leading-tight text-white">
          <Bell className="h-6 w-6 text-yellow-300" fill="currentColor" strokeWidth={1.5} />
          Game Announcement
          <Bell className="h-6 w-6 text-yellow-300" fill="currentColor" strokeWidth={1.5} />
        </h3>
        <p className="mt-1.5">
          <span className="fx-spoiler">
            <span className="fx-mention">@{mode}</span>
          </span>
        </p>
        <p className="mt-1 font-bold">
          🕓 <span className="rounded-[3px] bg-white/[0.06] px-0.5">{discordFull(when)}</span> (
          <span className="rounded-[3px] bg-white/[0.06] px-0.5">{discordRelative(when, now)}</span>)
        </p>
        <p className="font-bold">
          🎮 Host - <span className="fx-mention">@{host}</span>
        </p>
        <p className="font-bold">
          📝 Reserve Here -{" "}
          {link ? (
            <>
              <span className="text-[var(--dc-link)]">{link}</span>
              <span className="ml-1 text-[10px] font-normal text-[var(--dc-muted)]">(edited)</span>
            </>
          ) : (
            <em className="font-bold">(Creating link...)</em>
          )}
        </p>
      </div>
    </article>
  );
}
