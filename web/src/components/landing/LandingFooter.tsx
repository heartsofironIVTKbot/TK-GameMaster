import Link from "next/link";
import { BrandMark } from "@/components/site/SiteMenu";

/** The front page's footer. */
export default function LandingFooter() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-8">
        <span className="flex items-center gap-2.5">
          <BrandMark size={26} />
          <span className="font-stencil text-lg font-extrabold uppercase leading-none tracking-wide">GameMaster</span>
        </span>
        <nav aria-label="More" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-400 sm:ml-6">
          <Link href="/map" className="hover:text-ink-100">
            Map
          </Link>
          <Link href="/archive" className="hover:text-ink-100">
            Archive
          </Link>
          <Link href="/status" className="hover:text-ink-100">
            Status
          </Link>
          <Link href="/invite" className="hover:text-ink-100">
            Add GameMaster
          </Link>
        </nav>
        <p className="text-xs text-ink-500 sm:ml-auto">Not affiliated with Paradox Interactive or Discord.</p>
      </div>
    </footer>
  );
}
