"use client";

import { Dices, ExternalLink, Map as MapIcon, Puzzle, TriangleAlert } from "lucide-react";
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
  receipt: "You've already rolled here.",
} as const;

export default function CasinoGate() {
  const params = useParams<{ game: string }>();
  const game = params?.game ?? "";
  const [state, setState] = useState<State>({ phase: "loading" });
  // A host who chose to roll after all (the host choice is skipped).
  const [roll, setRoll] = useState(false);
  const [filler, setFiller] = useState<{ phase: "idle" | "sending" | "sent" | "error"; message?: string }>({ phase: "idle" });

  /** Every nation taken: ask the host for a filler spot (bot: DM with Accept / Decline). */
  const requestFiller = async () => {
    setFiller({ phase: "sending" });
    const base = `/api/casino/${encodeURIComponent(game)}/filler`;
    const response = await fetch(base, { method: "POST" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { request_id?: string; error?: string } | null;
    if (!response?.ok || !body?.request_id) {
      setFiller({ phase: "error", message: body?.error ?? "Couldn't send the request. Try again in a moment." });
      return;
    }
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const poll = await fetch(`${base}?request_id=${encodeURIComponent(body.request_id)}`, { cache: "no-store" }).catch(() => null);
      const outcome = (await poll?.json().catch(() => null)) as { status?: string; error?: string | null } | null;
      if (outcome?.status === "done") return setFiller({ phase: "sent" });
      if (outcome?.status === "error") return setFiller({ phase: "error", message: outcome.error ?? "The request didn't go through." });
    }
    setFiller({ phase: "sent" });
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/casino/${encodeURIComponent(game)}${roll ? "?roll=1" : ""}`, { cache: "no-store" })
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
        // A new or unfinished run: the link is good for a minute, so go straight on
        // (not in the preview, which has no Casino behind it). A finished run stays
        // here: its nation, the map and the receipt (never back into the Casino).
        if (body.status === "ok" && !body.preview && body.kind !== "receipt") window.location.replace(body.url);
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error", message: "Network error. Check your connection and try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [game, roll]);

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
        {state.phase === "entry" && state.entry.status === "host" && (
          <>
            <Dices aria-hidden className="mx-auto h-9 w-9 text-brand-400" strokeWidth={1.5} />
            <h1 className="gm-title mt-3 text-[30px]">You&apos;re hosting this game</h1>
            <p className="mt-2 text-sm text-ink-300">Watch the reservations on the live map, or roll a nation for yourself.</p>
            <div className="mt-5 flex flex-col items-center gap-2">
              <Link href={state.entry.map_url} className="gm-btn gm-btn-primary">
                <MapIcon aria-hidden strokeWidth={1.75} /> Open the live map
              </Link>
              <button
                type="button"
                onClick={() => {
                  setState({ phase: "loading" });
                  setRoll(true);
                }}
                className="gm-btn gm-btn-secondary"
              >
                <Dices aria-hidden strokeWidth={1.75} /> Roll at the Casino
              </button>
            </div>
          </>
        )}
        {state.phase === "entry" && state.entry.status === "full" && (
          <>
            <Dices aria-hidden className="mx-auto h-9 w-9 text-brand-400" strokeWidth={1.5} />
            <h1 className="gm-title mt-3 text-[30px]">Sorry, all nations are taken 😞</h1>
            <p className="mt-2 text-sm text-ink-300">You may request to co-op a major or to be put down as a filler.</p>
            <div className="mt-5 flex flex-col items-center gap-2">
              {state.entry.filler === "approved" ? (
                <p className="text-sm text-emerald-300">You&apos;re on the game as a filler.</p>
              ) : state.entry.filler === "pending" || filler.phase === "sent" ? (
                <p className="text-sm text-sky-200">Filler request sent: the host decides, and you&apos;ll get a Discord DM.</p>
              ) : (
                <button
                  type="button"
                  disabled={filler.phase === "sending"}
                  onClick={() => void requestFiller()}
                  className="gm-btn gm-btn-primary"
                >
                  {filler.phase === "sending" ? <Spinner className="h-4 w-4" /> : <Puzzle aria-hidden strokeWidth={1.75} />}
                  {filler.phase === "sending" ? "Sending…" : "Request a filler spot"}
                </button>
              )}
              {state.entry.filler === "declined" && filler.phase === "idle" && (
                <p className="text-xs text-ink-400">The host declined your last request.</p>
              )}
              {filler.phase === "error" && <p className="text-xs text-rose-300">{filler.message}</p>}
              <Link href={state.entry.map_url} className="gm-btn gm-btn-secondary">
                <MapIcon aria-hidden strokeWidth={1.75} /> Open the live map
              </Link>
              <p className="text-xs text-ink-500">To co-op, click a major on the map and press Request co-op.</p>
            </div>
          </>
        )}
        {state.phase === "entry" && state.entry.status === "ok" && (
          <>
            <Dices aria-hidden className="mx-auto h-9 w-9 text-brand-400" strokeWidth={1.5} />
            <h1 className="gm-title mt-3 text-[30px]">The Casino</h1>
            {state.entry.coop_of ? (
              <p className="mt-2 text-sm text-ink-300">
                You&apos;re on the <b className="text-ink-100">{state.entry.nation}</b> co-op with{" "}
                <b className="text-ink-100">{state.entry.coop_of}</b>, who rolled it.
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-300">
                {KIND_TEXT[state.entry.kind]}
                {state.entry.nation && (
                  <>
                    {" "}
                    Your nation: <b className="text-ink-100">{state.entry.nation}</b>.
                  </>
                )}
              </p>
            )}
            {state.entry.preview && (
              <p className="mt-3 text-xs text-ink-500">Preview mode: there&apos;s no Casino behind this sample game, so it doesn&apos;t go on.</p>
            )}
            {state.entry.kind === "receipt" ? (
              <div className="mt-5 flex flex-col items-center gap-2">
                <Link href={`/map?game=${encodeURIComponent(game)}`} className="gm-btn gm-btn-primary">
                  <MapIcon aria-hidden strokeWidth={1.75} /> View on the map
                </Link>
                <a href={state.entry.url} className="gm-btn gm-btn-secondary">
                  <ExternalLink aria-hidden strokeWidth={1.75} />{" "}
                  {state.entry.coop_of ? `View ${state.entry.coop_of}'s receipt` : "View my receipt"}
                </a>
              </div>
            ) : (
              <a href={state.entry.url} className="gm-btn gm-btn-primary mt-5 inline-flex">
                <ExternalLink aria-hidden strokeWidth={1.75} /> Open the Casino
              </a>
            )}
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
