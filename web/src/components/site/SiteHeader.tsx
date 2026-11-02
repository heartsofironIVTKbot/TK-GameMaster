"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MenuButton, ViewerAvatar, headerLinks, type SitePage } from "./SiteMenu";
import { useViewer } from "./viewer";

/**
 * The header every page shares: the page's name, its own controls
 * (children: a server switcher, a time zone, a live badge…), the most used
 * pages on wide screens, and the menu with everything else.
 *
 * Pages pass `page` rather than the header reading the address: reading it
 * here would stop Next from pre-rendering the page (cacheComponents).
 */
export default function SiteHeader({
  page,
  icon,
  title,
  subtitle,
  gradient = "from-brand-300 to-brand-700",
  children,
  wide = false,
}: {
  page: SitePage | null;
  icon: string;
  title: string;
  subtitle?: string;
  /** Tailwind gradient for the page's icon tile. */
  gradient?: string;
  /** The page's own controls, next to its name. */
  children?: ReactNode;
  /** Full width (pages with wide tables). */
  wide?: boolean;
}) {
  const viewer = useViewer();
  return (
    <header className="sticky top-0 z-[1100] border-b border-white/10 bg-ink-950/70 backdrop-blur-xl">
      <div className={`mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 ${wide ? "" : "max-w-[1700px]"}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg shadow-lg shadow-black/30 ${gradient}`}
            aria-hidden
          >
            {icon}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-black tracking-tight text-white">{title}</span>
            {subtitle && <span className="block truncate text-[11px] font-semibold text-ink-400">{subtitle}</span>}
          </span>
        </div>

        <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:w-auto">{children}</div>

        <div className="ml-auto flex items-center gap-1.5">
          <nav className="hidden items-center gap-1 xl:flex" aria-label="Main pages" data-tour="site.nav">
            {headerLinks(viewer).map((link) => {
              const active = link.page === page;
              return (
                <Link
                  key={link.page}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  title={link.hint}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    active ? "bg-brand-400/15 text-brand-100 ring-1 ring-brand-300/40" : "text-ink-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span aria-hidden>{link.icon}</span> {link.label}
                </Link>
              );
            })}
          </nav>
          {viewer?.loggedIn && (
            <Link href="/profile" title={viewer.name ? `${viewer.name} · My profile` : "My profile"} className="hidden sm:block">
              <ViewerAvatar viewer={viewer} />
            </Link>
          )}
          {viewer && !viewer.loggedIn && (
            <a href="/api/auth/login" className="hidden rounded-lg bg-[#5865F2] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4752c4] sm:block">
              Log in
            </a>
          )}
          <MenuButton current={page} />
        </div>
      </div>
    </header>
  );
}
