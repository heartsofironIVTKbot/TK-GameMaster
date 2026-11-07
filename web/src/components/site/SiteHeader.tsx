"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark, MenuButton, PAGE_ICONS, ViewerAvatar, headerLinks, type SitePage } from "./SiteMenu";
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
  title,
  subtitle,
  children,
  wide = false,
}: {
  page: SitePage;
  title: string;
  subtitle?: string;
  /** The page's own controls, next to its name. */
  children?: ReactNode;
  /** Full width (pages with wide tables). */
  wide?: boolean;
}) {
  const viewer = useViewer();
  const PageIcon = PAGE_ICONS[page];
  return (
    <header className="sticky top-0 z-[1100] border-b border-ink-800 bg-ink-950">
      <div className={`mx-auto flex min-h-14 flex-wrap items-center gap-x-4 px-4 sm:px-6 ${wide ? "" : "max-w-[1700px]"}`}>
        <div className="flex min-w-0 items-center gap-3 py-2.5">
          <Link href="/" aria-label="GameMaster: home">
            <BrandMark size={30} />
          </Link>
          <PageIcon aria-hidden className="h-5 w-5 shrink-0 text-brand-400 2xl:hidden" strokeWidth={1.75} />
          <span className="min-w-0 leading-tight">
            <span className="gm-title block truncate text-[26px]">{title}</span>
            {subtitle && <span className="block truncate text-xs text-ink-400">{subtitle}</span>}
          </span>
        </div>

        <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 pb-2.5 sm:order-none sm:w-auto sm:pb-0">{children}</div>

        <div className="ml-auto flex items-center gap-2 self-stretch">
          <nav className="hidden items-stretch self-stretch 2xl:flex" aria-label="Main pages" data-tour="site.nav">
            {headerLinks(viewer).map((link) => {
              const active = link.page === page;
              const Icon = PAGE_ICONS[link.page];
              return (
                <Link
                  key={link.page}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  title={link.hint}
                  className={`flex items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors ${
                    active ? "gm-nav-on text-ink-100" : "text-ink-400 hover:text-ink-100"
                  }`}
                >
                  <Icon aria-hidden className={`h-4 w-4 ${active ? "text-brand-400" : ""}`} strokeWidth={1.75} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {viewer?.loggedIn && (
            <Link href="/profile" title={viewer.name ? `${viewer.name}: my profile` : "My profile"} className="hidden self-center sm:block">
              <ViewerAvatar viewer={viewer} />
            </Link>
          )}
          {viewer && !viewer.loggedIn && (
            <a href="/api/auth/login" className="gm-btn hidden h-8 self-center bg-[#5865F2] px-3 text-xs text-white hover:bg-[#4752c4] sm:inline-flex">
              Log in
            </a>
          )}
          <MenuButton current={page} className="self-center" />
        </div>
      </div>
    </header>
  );
}
