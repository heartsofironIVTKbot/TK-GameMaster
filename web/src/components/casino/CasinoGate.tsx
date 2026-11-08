"use client";

import { Dices, ExternalLink, Map as MapIcon, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/schedule/ui";
import type { CasinoEntry } from "@/lib/casinoEntry";

/**
 * /casino/<game>: where a Casino game's announcement sends players. Asks
 * GameMaster for their Casino link (api/casino/[game]), signing them in with
 * Discord first if needed, then sends them on to tkcasino.online; or says why
 * they can't go.
 */

type State = { phase: "loading" } | { phase: "entry"; entry: CasinoEntry } | { phase: "error"; message: string };

const KIND_TEXT = {
  new: "Opening the Casino…",
  resume: "Taking you back to where you left off…",
  receipt: "You've already rolled here. Opening your receipt…",
  fortunes: "Opening Fortunes of War…",
} as const;

export default function CasinoGate() {
  const params = useParams<{ game: string }>();
  const game = params?.game ?? "";
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/casino/${encodeURIComponent(game)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (CasinoEntry | { status: "login" }) | null;
        if (cancelled) return;
        if (!body) {
          setState({ phase: "error", message: "GameMaster didn't answer. Try again in a moment." });
          return;
        }
        if (body.status === "login") {
          // Discord sign-in is a server route, not a page: a full page load, back here after.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`${window.location.origin}/api/auth/login?next=${encodeURIComponent(`/casino/${game}`)}`);
          return;
        }
        if (body.status === "not_casino") {
          window.location.replace(`${window.location.origin}${body.map_url}`);
          return;
        }
        setState({ phase: "entry", entry: body });
        // The link is good for a minute: go straight on (not in the preview, which has no Casino behind it).
        if (body.status === "ok" && !body.preview) window.location.replace(body.url);
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error", message: "Network error. Check your connection and try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [game]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center px-4 text-ink-100">
      <section className="gm-plate w-full max-w-md bg-ink-950 p-6 text-center [--cut:16px]">
        {state.phase === "loading" && (
          <>
            <Dices aria-hidden className="mx-auto h-9 w-9 text-brand-400" strokeWidth={1.5} />
            <h1 className="gm-title mt-3 text-[30px]">The Casino</h1>
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-300">
              <Spinner className="h-4 w-4 text-brand-300" /> Getting your link…
            </p>
          </>
        )}
        {state.phase === "error" && (
          <>
            <TriangleAlert aria-hidden className="mx-auto h-9 w-9 text-yellow-300" strokeWidth={1.5} />
            <h1 className="gm-title mt-3 text-[30px]">Couldn&apos;t open it</h1>
            <p className="mt-2 text-sm text-ink-300">{state.message}</p>
            <button type="button" onClick={() => window.location.reload()} className="gm-btn gm-btn-primary mt-5">
              Try again
            </button>
          </>
        )}
        {state.phase === "entry" && state.entry.status === "ok" && (
          <>
            <Dices aria-hidden className="mx-auto h-9 w-9 text-brand-400" strokeWidth={1.5} />
            <h1 className="gm-title mt-3 text-[30px]">{state.entry.kind === "fortunes" ? "Fortunes of War" : "The Casino"}</h1>
            <p className="mt-2 text-sm text-ink-300">
              {KIND_TEXT[state.entry.kind]}
              {state.entry.nation && (
                <>
                  {" "}
                  Your nation: <b className="text-ink-100">{state.entry.nation}</b>.
                </>
              )}
            </p>
            {state.entry.preview && (
              <p className="mt-3 text-xs text-ink-500">Preview mode: there&apos;s no Casino behind this sample game, so it doesn&apos;t go on.</p>
            )}
            <a href={state.entry.url} className="gm-btn gm-btn-primary mt-5 inline-flex">
              <ExternalLink aria-hidden strokeWidth={1.75} /> {state.entry.kind === "fortunes" ? "Open Fortunes of War" : "Open the Casino"}
            </a>
          </>
        )}
        {state.phase === "entry" && state.entry.status === "denied" && (
          <>
            <TriangleAlert aria-hidden className="mx-auto h-9 w-9 text-yellow-300" strokeWidth={1.5} />
            <h1 className="gm-title mt-3 text-[30px]">{state.entry.title}</h1>
            <p className="mt-2 text-sm text-ink-300">{state.entry.message}</p>
            <div className="mt-5 flex flex-col items-center gap-2">
              {state.entry.action && (
                <a href={state.entry.action.url} className="gm-btn gm-btn-primary">
                  {state.entry.action.label}
                </a>
              )}
              {state.entry.map_url && (
                <Link href={state.entry.map_url} className="gm-btn gm-btn-secondary">
                  <MapIcon aria-hidden strokeWidth={1.75} /> Open the game&apos;s map
                </Link>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
