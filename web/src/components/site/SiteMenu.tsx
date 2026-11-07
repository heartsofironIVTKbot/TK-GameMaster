"use client";

import Link from "next/link";
import {
  Archive,
  Activity,
  CalendarDays,
  ClipboardCheck,
  Database,
  History,
  Layers,
  LogOut,
  Map as MapIcon,
  Menu,
  Plus,
  ScrollText,
  ServerCog,
  Swords,
  Ticket,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
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
  | "archive"
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

/** Every page's icon: one line-icon set, one colour (green on the page you're on). */
export const PAGE_ICONS: Record<SitePage, LucideIcon> = {
  map: MapIcon,
  archive: Archive,
  roleplay: ScrollText,
  profile: UserRound,
  tickets: Ticket,
  calendar: CalendarDays,
  games: Swords,
  attendance: ClipboardCheck,
  database: Database,
  presets: Layers,
  servers: ServerCog,
  audit: History,
  status: Activity,
  invite: Plus,
  crash: TriangleAlert,
};

export interface SiteLink {
  page: SitePage;
  href: string;
  label: string;
  hint: string;
}

const PLAYER_LINKS: SiteLink[] = [
  { page: "map", href: "/map", label: "Map", hint: "Reserve your nation" },
  { page: "archive", href: "/archive", label: "Archive", hint: "Every game, its players and its roleplay" },
  { page: "profile", href: "/profile", label: "My profile", hint: "Your games, commends and roles" },
  { page: "tickets", href: "/tickets", label: "My tickets", hint: "Closed tickets you can read" },
];

const HOST_LINKS: SiteLink[] = [
  { page: "calendar", href: "/schedule", label: "Calendar", hint: "Schedule games" },
  { page: "games", href: "/games", label: "Games", hint: "Start, end and manage games" },
  { page: "attendance", href: "/attendance", label: "Attendance", hint: "Who showed up" },
  { page: "database", href: "/database", label: "Database", hint: "Player records" },
  { page: "presets", href: "/presets", label: "Presets", hint: "Saved game setups" },
];

const STAFF_LINKS: SiteLink[] = [{ page: "audit", href: "/audit", label: "Audit log", hint: "Everything that happened" }];

const SERVER_LINKS: SiteLink[] = [
  { page: "servers", href: "/servers", label: "Your servers", hint: "Set up GameMaster" },
  { page: "invite", href: "/invite", label: "Add GameMaster", hint: "To another Discord server" },
  { page: "status", href: "/status", label: "Status", hint: "Is GameMaster up?" },
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
    ? [byPage("map"), byPage("calendar"), byPage("games"), byPage("database"), byPage("archive")]
    : [byPage("map"), byPage("archive"), byPage("profile")];
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
        className={`gm-btn gm-btn-quiet h-9 px-2.5 ${className}`}
      >
        <Menu aria-hidden />
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
      <button type="button" aria-label="Close the menu" onClick={onClose} className="gm-menu-scrim absolute inset-0 bg-ink-950/75" />
      <div
        ref={panelRef}
        className="gm-menu-panel absolute bottom-0 right-0 top-0 flex w-[min(340px,88vw)] flex-col border-l border-ink-800 bg-ink-950"
      >
        <div className="flex h-14 items-center gap-3 border-b border-ink-800 px-4">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <BrandMark />
            <span className="leading-tight">
              <span className="gm-title block text-xl">GameMaster</span>
              <span className="block text-[11px] text-ink-400">Hearts of Iron IV multiplayer</span>
            </span>
          </Link>
          <button type="button" onClick={onClose} className="gm-btn gm-btn-quiet ml-auto h-8 w-8 p-0" aria-label="Close the menu">
            <X aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Site">
          {menuGroups(viewer).map((group) => (
            <div key={group.title} className="mb-4">
              <p className="px-2.5 pb-1 text-xs font-semibold text-ink-500">{group.title}</p>
              <ul className="space-y-0.5">
                {group.links.map((link) => {
                  const active = link.page === current;
                  const Icon = PAGE_ICONS[link.page];
                  return (
                    <li key={link.page}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`gm-cut flex items-center gap-3 px-2.5 py-2 transition-colors ${
                          active ? "bg-ink-900 text-ink-100" : "text-ink-300 hover:bg-ink-900 hover:text-ink-100"
                        }`}
                      >
                        <Icon aria-hidden className={`h-[18px] w-[18px] shrink-0 ${active ? "text-brand-400" : "text-ink-400"}`} strokeWidth={1.75} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{link.label}</span>
                          <span className="block truncate text-xs text-ink-400">{link.hint}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 px-4 py-3">
          {!viewer ? (
            <p className="text-xs text-ink-500">…</p>
          ) : viewer.loggedIn ? (
            <div className="flex items-center gap-2.5">
              <ViewerAvatar viewer={viewer} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-200">{viewer.name}</span>
              {viewer.demo && <span className="gm-tag bg-fuchsia-500/15 text-fuchsia-200">Preview</span>}
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="gm-btn gm-btn-quiet h-8 px-2.5 text-xs" title="Log out of this browser">
                  <LogOut aria-hidden />
                  Log out
                </button>
              </form>
            </div>
          ) : (
            <a href="/api/auth/login" className="gm-btn w-full bg-[#5865F2] text-white hover:bg-[#4752c4]">
              Log in with Discord
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** The GameMaster mark: "GM" in stencil on a green cut plate (until the real logo). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="gm-cut flex shrink-0 items-center justify-center bg-brand-400 font-stencil font-extrabold leading-none text-brand-950"
      style={{ width: size, height: size, fontSize: size * 0.56, ["--cut" as string]: `${Math.round(size / 4.5)}px` }}
    >
      GM
    </span>
  );
}

export function ViewerAvatar({ viewer, size = 28 }: { viewer: Viewer; size?: number }) {
  return viewer.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={viewer.avatarUrl} alt="" width={size} height={size} className="shrink-0 rounded-full" />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-ink-100"
      style={{ width: size, height: size }}
    >
      {(viewer.name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}
