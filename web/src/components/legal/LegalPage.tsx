"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import SiteHeader from "@/components/site/SiteHeader";
import { LEGAL } from "@/lib/legal";

/** The Privacy Policy and Terms of Service: one readable column, numbered sections, a contents list. */

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export default function LegalPage({
  page,
  title,
  subtitle,
  intro,
  sections,
}: {
  page: "privacy" | "terms";
  title: string;
  subtitle: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  const other = page === "privacy" ? { href: "/terms", label: "Terms of Service" } : { href: "/privacy", label: "Privacy Policy" };
  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page={page} title={title} subtitle={subtitle} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-400">Last updated {LEGAL.updated}</p>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-300">{intro}</div>

        <nav aria-label="Contents" className="gm-plate mt-8 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">Contents</p>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-ink-300 hover:text-brand-300">
                  <span className="mr-2 font-mono text-[11px] text-ink-500">{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="mt-10 scroll-mt-24">
            <h2 id={`${section.id}-title`} className="gm-title flex items-baseline gap-3 text-[26px]">
              <span className="font-mono text-sm text-brand-400">{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </h2>
            <div className="legal-body mt-3 space-y-3 text-[15px] leading-relaxed text-ink-300">{section.body}</div>
          </section>
        ))}

        <p className="mt-12 border-t border-ink-800 pt-6 text-sm text-ink-500">
          See also the{" "}
          <Link href={other.href} className="text-brand-300 hover:text-brand-200">
            {other.label}
          </Link>
          . GameMaster is not affiliated with Paradox Interactive or Discord.
        </p>
      </main>
    </div>
  );
}

/** How to reach whoever runs GameMaster: a Discord DM. */
export function Contact() {
  return (
    <>
      send a direct message on Discord to <b className="font-semibold text-ink-100">{LEGAL.discord}</b>
    </>
  );
}
