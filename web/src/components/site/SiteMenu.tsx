"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useViewer, type Viewer } from "./viewer";

/**
 * The one site menu (every page): the pages this viewer can use, grouped, in
 * a panel that slides in from the right. On wide screens the most used pages
 * also sit in the header (SiteHeader); everything is always in the panel.
 */

export type SitePage =
  | "map"
  | "roleplay"
  | "profile"
  | "tickets"
  | "calendar"
  | "games"
  | "attendance"
  | "database"
  | "presets"
  | "servers"
  | "audit"
  | "status"
  | "invite"
  | "crash";

export interface SiteLink {
  page: SitePage;
  href: string;
  label: string;
  icon: string;
  hint: string;
}

const PLAYER_LINKS: SiteLink[] = [
  { page: "map", href: "/", label: "Map", icon: "🗺️", hint: "Reserve your nation" },
  { page: "roleplay", href: "/roleplay", label: "Roleplay archive", icon: "🎭", hint: "Every game's story and roleplay" },
  { page: "profile", href: "/profile", label: "My profile", icon: "👤", hint: "Your games, commends and roles" },
  { page: "tickets", href: "/tickets", label: "My tickets", icon: "🎫", hint: "Closed tickets you can read" },
];

const HOST_LINKS: SiteLink[] = [
  { page: "calendar", href: "/schedule", label: "Calendar", icon: "🗓️", hint: "Schedule games" },
  { page: "games", href: "/games", label: "Games", icon: "🎮", hint: "Start, end and manage games" },
  { page: "attendance", href: "/attendance", label: "Attendance", icon: "🎯", hint: "Who showed up" },
  { page: "database", href: "/database", label: "Database", icon: "🗂️", hint: "Player records" },
  { page: "presets", href: "/presets", label: "Presets", icon: "🧩", hint: "Saved game setups" },
];

const STAFF_LINKS: SiteLink[] = [{ page: "audit", href: "/audit", label: "Audit log", icon: "📜", hint: "Everything that happened" }];

const SERVER_LINKS: SiteLink[] = [
  { page: "servers", href: "/servers", label: "Your servers", icon: "⚙️", hint: "Set up GameMaster" },
  { page: "invite", href: "/invite", label: "Add GameMaster", icon: "➕", hint: "To another Discord server" },
  { page: "status", href: "/status", label: "Status", icon: "🟢", hint: "Is GameMaster up?" },
];

/** The menu's groups for this viewer. */
export function menuGroups(viewer: Viewer | null): { title: string; links: SiteLink[] }[] {
  const groups = [{ title: "Play", links: PLAYER_LINKS }];
  if (viewer?.isHost) groups.push({ title: "Host", links: [...HOST_LINKS, ...(viewer.isStaff ? STAFF_LINKS : [])] });
  groups.push({ title: "Servers", links: SERVER_LINKS });
  return groups;
}

/** The pages worth showing in the header itself on wide screens. */
export function headerLinks(viewer: Viewer | null): SiteLink[] {
  const byPage = (page: SitePage) => [...PLAYER_LINKS, ...HOST_LINKS].find((link) => link.page === page) as SiteLink;
  return viewer?.isHost
    ? [byPage("map"), byPage("calendar"), byPage("games"), byPage("database"), byPage("roleplay")]
    : [byPage("map"), byPage("roleplay"), byPage("profile")];
}

export function MenuButton({
  current,
  className = "",
  label = true,
}: {
  current: SitePage | null;
  className?: string;
  /** Show the word "Menu" next to the icon. */
  label?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tour="site.menu"
        className={`flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-ink-200 transition hover:border-brand-300/50 hover:text-white ${className}`}
      >
        <span aria-hidden className="text-base leading-none">
          ☰
        </span>
        {label && <span className="hidden sm:inline">Menu</span>}
        <span className="sr-only">Open the menu</span>
      </button>
      {/* At the top of the page: headers blur what's behind them, and a blurred
          box would hold a "fixed" panel inside it. */}
      {open && createPortal(<MenuPanel current={current} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function MenuPanel({ current, onClose }: { current: SitePage | null; onClose: () => void }) {
  const viewer = useViewer();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[5950]" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Close the menu" onClick={onClose} className="gm-menu-scrim absolute inset-0 bg-ink-950/70 backdrop-blur-sm" />
      <div
        ref={panelRef}
        className="gm-menu-panel absolute bottom-0 right-0 top-0 flex w-[min(340px,88vw)] flex-col border-l border-white/10 bg-ink-950/95 shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-300 to-brand-700 text-lg shadow-lg shadow-brand-500/30">
              🎖️
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">GameMaster</span>
              <span className="block text-[11px] font-semibold text-ink-400">Hearts of Iron IV multiplayer</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-2 py-1 text-sm text-ink-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Close the menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Site">
          {menuGroups(viewer).map((group) => (
            <div key={group.title} className="mb-4">
              <p className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-ink-500">{group.title}</p>
              <ul className="space-y-0.5">
                {group.links.map((link) => {
                  const active = link.page === current;
                  return (
                    <li key={link.page}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition ${
                          active ? "bg-brand-400/15 text-white ring-1 ring-brand-300/40" : "text-ink-200 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-base" aria-hidden>
                          {link.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">{link.label}</span>
                          <span className="block truncate text-[11px] text-ink-400">{link.hint}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-3">
          {!viewer ? (
            <p className="text-xs text-ink-500">…</p>
          ) : viewer.loggedIn ? (
            <div className="flex items-center gap-2.5">
              <ViewerAvatar viewer={viewer} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-200">{viewer.name}</span>
              {viewer.demo && <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold text-fuchsia-200">PREVIEW</span>}
            </div>
          ) : (
            <a
              href="/api/auth/login"
              className="flex w-full items-center justify-center rounded-xl bg-[#5865F2] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4752c4]"
            >
              Log in with Discord
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function ViewerAvatar({ viewer, size = 28 }: { viewer: Viewer; size?: number }) {
  return viewer.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={viewer.avatarUrl} alt="" width={size} height={size} className="shrink-0 rounded-full ring-2 ring-brand-400/40" />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-black text-ink-200"
      style={{ width: size, height: size }}
    >
      {(viewer.name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}
