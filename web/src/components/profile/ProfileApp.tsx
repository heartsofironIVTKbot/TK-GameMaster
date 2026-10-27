"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/database/Avatar";
import { PortfolioBody } from "@/components/PlayerPortfolioModal";
import { DiscordGlyph, GateMessage } from "@/components/schedule/HostGate";
import { GLASS, Spinner } from "@/components/schedule/ui";
import type { ProfileAiResult } from "@/lib/aiAnalysisTypes";
import type { HostStanding } from "@/lib/moderationTypes";
import type { MyProfileResponse } from "@/lib/profileTypes";

/**
 * A player's own profile — where the /info command sends them. The same
 * layout as a record on the Database page (header + portfolio), read-only:
 * no staff tools, no staff names.
 */

type State =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: MyProfileResponse };

const NAV_LINK =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white";

export default function ProfileApp() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const query = window.location.search;
    fetch(`/api/me/profile${query}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (MyProfileResponse & { error?: string }) | null;
        if (cancelled) return;
        setSearch(query);
        if (response.status === 401) setState({ kind: "login" });
        else if (!response.ok || !body?.portfolio) setState({ kind: "error", message: body?.error ?? "Couldn't load your profile." });
        else setState({ kind: "ok", data: body });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "Network error — check your connection and reload." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind !== "ok") {
    return (
      <main className="gm-backdrop flex min-h-screen w-full items-center justify-center p-4">
        {state.kind === "loading" ? (
          <div className="flex items-center gap-3 text-slate-300">
            <Spinner className="h-5 w-5 text-amber-400" />
            <span className="text-sm font-semibold">Loading your profile…</span>
          </div>
        ) : state.kind === "login" ? (
          <GateMessage
            icon="👤"
            title="Your profile"
            text="Your games, attendance, commends, warnings, Merit and roles. Log in with your Discord account to see your own record."
          >
            <a
              href={`/api/auth/login?next=${encodeURIComponent(`/profile${search}`)}`}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-[#4752c4]"
            >
              <DiscordGlyph />
              Log in with Discord
            </a>
          </GateMessage>
        ) : (
          <GateMessage icon="🛠️" title="Profile unavailable" text={state.message} />
        )}
      </main>
    );
  }

  const { profile, portfolio, server, viewer, ai_results: aiResults } = state.data;
  const name = profile?.ingame_nickname || profile?.display_name || profile?.username || viewer.username;
  const username = profile?.username ?? viewer.username;
  const avatarUrl = profile?.avatar_url ?? viewer.avatar_url;
  const roles = profile?.roles.slice(0, 12) ?? [];
  const flagged = portfolio.game_bans.length > 0 || portfolio.dishonored.length > 0;

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-300 to-indigo-600 text-lg shadow-lg shadow-indigo-500/30">
              👤
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">My profile</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · {server.name ?? "Your stats"}</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            <Link href="/tickets" className={NAV_LINK} title="Read your closed tickets">
              🎫 My tickets
            </Link>
            <Link href="/" className={NAV_LINK}>
              🗺️ Map
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1300px] space-y-4 px-4 py-5 sm:px-6">
        <section
          className={`relative overflow-hidden rounded-3xl p-4 sm:p-5 ${GLASS} ${flagged ? "!border-rose-500/40" : ""}`}
          style={
            profile?.banner_url
              ? { backgroundImage: `linear-gradient(rgba(2,6,23,.78), rgba(2,6,23,.92)), url(${profile.banner_url})`, backgroundSize: "cover" }
              : undefined
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <Avatar url={avatarUrl} name={name} size={64} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">👤 Player profile</p>
              <h1 className="truncate text-2xl font-black tracking-tight text-white">{name}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {username && <span>@{username}</span>}
                {server.name && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    {server.name}
                  </span>
                )}
                {portfolio.hearts_of_valor && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                    🎖️ Hearts of Valor
                  </span>
                )}
              </div>
            </div>
          </div>
          {roles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {roles.map((role) => (
                <span
                  key={role.id}
                  className="flex items-center gap-1 rounded-md border border-white/10 bg-slate-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-200"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: role.color ?? "#99aab5" }} />
                  {role.icon_emoji && <span>{role.icon_emoji}</span>}
                  {role.name}
                </span>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className={`min-w-0 space-y-4 rounded-3xl p-4 sm:p-5 ${GLASS}`}>
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">📊 Portfolio</h2>
            <PortfolioBody portfolio={portfolio} playerView />
          </section>

          <aside className="space-y-4">
            <AiResultsCard results={aiResults} />
            {portfolio.host && <HostingCard standing={portfolio.host} />}
            <section className={`rounded-2xl p-4 text-sm text-slate-300 ${GLASS}`}>
              <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ℹ️ About your record</h2>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed">
                <li>
                  Records are kept per server{server.name ? <> — this is your record on <b>{server.name}</b></> : null}.
                </li>
                <li>Commends come from hosts after good games; enough of them (plus Verified) earns Trusted.</li>
                <li>Warnings are per game type; reaching the limit means an automatic game ban in that type.</li>
                <li>Think something here is wrong? Open a ticket on the server.</li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

/** The AI's verdict on the player's recent games (their chat-log roleplay). */
function AiResultsCard({ results }: { results: ProfileAiResult[] }) {
  return (
    <section className={`rounded-2xl p-4 ${GLASS}`}>
      <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">🤖 AI roleplay results</h2>
      {results.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">
          None yet. After a game, the host uploads its chat log and the AI grades everyone&apos;s roleplay — your result shows up here.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {results.map((result) => {
            const verdict = result.reward.commends
              ? `⭐ ${result.reward.commends} commend${result.reward.commends > 1 ? "s" : ""}`
              : result.reward.merit
                ? `🎖️ ${result.reward.merit} Merit`
                : result.status === "no_rp"
                  ? "0 RP"
                  : "No reward";
            const rewarded = Boolean(result.reward.commends || result.reward.merit);
            return (
              <li key={result.game_id} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-100">{result.game_name}</span>
                  <span className={`shrink-0 text-xs font-black ${rewarded ? "text-emerald-300" : "text-slate-400"}`}>{verdict}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {new Date(result.ts * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {result.nation} ·{" "}
                  {result.meaningful_words.toLocaleString()} in-character words · creativity {result.creativity}/10
                </p>
                <p className="mt-0.5 text-[11px] text-slate-300">{result.reward.why}</p>
                {rewarded && (
                  <p className={`mt-0.5 text-[11px] font-bold ${result.given ? "text-emerald-300" : "text-amber-300"}`}>
                    {result.given ? "✓ Given by the host" : "Waiting for the host to give it"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Read-only host standing for players who host. */
function HostingCard({ standing }: { standing: HostStanding }) {
  return (
    <section className={`rounded-2xl p-4 ${GLASS}`}>
      <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">🎙️ Your hosting</h2>
      <p className="mt-2 text-sm text-slate-300">
        <span className="text-2xl font-black text-white">{standing.hosted_games}</span> games hosted
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
        {standing.branches.map((branch) => (
          <div key={branch.branch} className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/40 px-3 py-2 text-xs last:border-b-0">
            <span className="w-12 font-black text-slate-100">{branch.branch}</span>
            <span className="flex-1 text-slate-400">{branch.rank ? `${branch.rank} host` : "No rank"}</span>
            <span className="text-emerald-300" title="Acclamations">
              👏 {branch.acclamations}
            </span>
            <span className="text-rose-300" title="Violations">
              ⛔ {branch.violations}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
