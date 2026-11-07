"use client";

import Link from "next/link";
import { BrandMark, MenuButton, ViewerAvatar } from "@/components/site/SiteMenu";
import { useViewer } from "@/components/site/viewer";

/** The front page's top bar, over the globe: the name, a few pages, log in and the menu. */

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/archive", label: "Archive" },
  { href: "/status", label: "Status" },
];

export default function LandingTop() {
  const viewer = useViewer();
  return (
    <header className="pointer-events-auto mx-auto flex w-full max-w-[1400px] items-center gap-4 px-4 py-4 sm:px-8">
      <Link href="/" className="flex items-center gap-2.5" aria-label="GameMaster: home">
        <BrandMark size={34} />
        <span className="font-stencil text-[22px] font-extrabold uppercase leading-none tracking-wide text-ink-100">GameMaster</span>
      </Link>
      <nav aria-label="Main pages" className="ml-auto hidden items-center gap-1 md:flex">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="px-3 py-2 text-[13px] font-medium text-ink-300 transition-colors hover:text-ink-100">
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 md:ml-2">
        {viewer?.loggedIn && (
          <Link href="/profile" title={viewer.name ? `${viewer.name}: my profile` : "My profile"} className="hidden sm:block">
            <ViewerAvatar viewer={viewer} />
          </Link>
        )}
        {viewer && !viewer.loggedIn && (
          <a
            href="/api/auth/login?next=%2Fmap"
            className="gm-btn hidden h-9 bg-[#5865F2] px-3.5 text-xs text-white hover:bg-[#4752c4] sm:inline-flex"
          >
            Log in
          </a>
        )}
        <MenuButton current={null} />
      </div>
    </header>
  );
}
