"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CalendarCheck,
  Drama,
  Info,
  Medal,
  Mic,
  Scale,
  Star,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import SiteHeader from "@/components/site/SiteHeader";
import Avatar from "@/components/database/Avatar";
import { CardTitle } from "@/components/games/labels";
import { PortfolioBody } from "@/components/PlayerPortfolioModal";
import { GateMessage, GateScreen, LoginScreen } from "@/components/schedule/HostGate";
import { Spinner } from "@/components/schedule/ui";
import type { ProfileAiResult } from "@/lib/aiAnalysisTypes";
import type { HostStanding } from "@/lib/moderationTypes";
import type { MyProfileResponse } from "@/lib/profileTypes";

/**
 * A player's own profile (My Profile). The same
 * layout as a record on the Database page (header + portfolio), read-only:
 * no staff tools, no staff names.
 */

type State =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: MyProfileResponse };

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
        if (!cancelled) setState({ kind: "error", message: "Network error. Check your connection and reload." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "login") {
    return (
      <LoginScreen
        page="profile"
        title="My profile"
        intro="Your record on a GameMaster server, the same one hosts see."
        returnPath={`/profile${search}`}
        features={[
          { icon: CalendarCheck, title: "Games and attendance", text: "Every game you reserved, and whether you came." },
          { icon: Star, title: "Commends, warnings and Merit", text: "What you earned, and how close you are to Hearts of Valor." },
          { icon: Drama, title: "Your roleplay", text: "The AI's results for your recent games, and the rewards." },
        ]}
      />
    );
  }
  if (state.kind !== "ok") {
    return (
      <GateScreen page="profile" title="My profile">
        {state.kind === "loading" ? (
          <div className="flex items-center gap-3 text-ink-300">
            <Spinner className="h-5 w-5 text-brand-400" />
            <span className="text-sm font-semibold">Loading your profile…</span>
          </div>
        ) : (
          <GateMessage icon={Wrench} title="Profile unavailable" text={state.message} />
        )}
      </GateScreen>
    );
  }

  const { profile, portfolio, server, viewer, ai_results: aiResults } = state.data;
  const name = profile?.ingame_nickname || profile?.display_name || profile?.username || viewer.username;
  const username = profile?.username ?? viewer.username;
  const avatarUrl = profile?.avatar_url ?? viewer.avatar_url;
  const roles = profile?.roles.slice(0, 12) ?? [];
  const flagged = portfolio.game_bans.length > 0 || portfolio.dishonored.length > 0;

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="profile" title="My profile" subtitle={server.name ? `Your record on ${server.name}` : "Your record"} />

      <main className="mx-auto max-w-[1300px] space-y-4 px-4 py-5 sm:px-6">
        <section
          data-tour="profile.header"
          className={`gm-plate relative p-4 sm:px-[18px] ${flagged ? "shadow-[inset_3px_0_0_var(--color-rose-400)]" : ""}`}
          style={
            profile?.banner_url
              ? {
                  backgroundImage: `linear-gradient(color-mix(in oklab, var(--color-ink-950) 82%, transparent), var(--color-ink-950)), url(${profile.banner_url})`,
                  backgroundSize: "cover",
                }
              : undefined
          }
        >
          <div className="flex items-center gap-4">
            <Avatar url={avatarUrl} name={name} size={64} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs text-ink-400">
                <UserRound aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                Player profile
              </p>
              <h1 className="gm-title truncate text-[30px] sm:text-[38px]">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-400">
                {username && <span>@{username}</span>}
                {server.name && <span className="gm-tag bg-ink-800 text-ink-300">{server.name}</span>}
                {portfolio.hearts_of_valor && (
                  <span className="gm-tag bg-yellow-950 text-yellow-300">
                    <Medal aria-hidden className="h-3 w-3" />
                    Hearts of Valor
                  </span>
                )}
                {portfolio.dishonored.length > 0 && (
                  <span className="gm-tag bg-rose-950 text-rose-300">
                    <Scale aria-hidden className="h-3 w-3" />
                    Dishonored
                  </span>
                )}
                {portfolio.game_bans.length > 0 && <span className="gm-tag gm-tag-dot bg-rose-950 text-rose-300">Game banned</span>}
              </div>
            </div>
          </div>
          {roles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-[5px] sm:pl-20">
              {roles.map((role) => (
                <span
                  key={role.id}
                  className="gm-cut flex h-[22px] items-center gap-1.5 bg-ink-950 px-2.5 text-xs text-ink-300 shadow-[inset_0_0_0_1px_var(--color-ink-800)] [--cut:5px]"
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
          <section data-tour="profile.portfolio" className="gm-plate min-w-0 space-y-4 p-4 sm:p-[18px]">
            <CardTitle icon={BarChart3} title="Your record" />
            <PortfolioBody portfolio={portfolio} playerView />
          </section>

          <aside data-tour="profile.side" className="space-y-4">
            <AiResultsCard results={aiResults} />
            {portfolio.host && <HostingCard standing={portfolio.host} />}
            <section className="gm-plate p-4 sm:p-[18px]">
              <CardTitle icon={Info} title="About your record" />
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-400">
                <li>
                  Records are kept per server
                  {server.name ? (
                    <>
                      . This is your record on <b className="font-semibold text-ink-200">{server.name}</b>
                    </>
                  ) : null}
                  .
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
    <section className="gm-plate p-4 sm:p-[18px]">
      <CardTitle icon={Drama} title="AI roleplay results">
        <Link href="/archive?tab=roleplay&graded=1" className="gm-btn gm-btn-quiet h-7 px-2 text-xs [--cut:6px]">
          Archive
          <ArrowUpRight aria-hidden strokeWidth={1.75} />
        </Link>
      </CardTitle>
      {results.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-400">
          None yet. After a game, the host uploads its chat log and the AI grades everyone&apos;s roleplay. Your result shows up here.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {results.map((result) => {
            const rewarded = Boolean(result.reward.commends || result.reward.merit);
            const verdict = result.reward.commends
              ? `${result.reward.commends} commend${result.reward.commends > 1 ? "s" : ""}`
              : result.reward.merit
                ? `${result.reward.merit} Merit`
                : result.status === "no_rp"
                  ? "No roleplay"
                  : "No reward";
            return (
              <li key={result.game_id} className="gm-cut bg-ink-950 px-3 py-2 [--cut:7px]">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/roleplay/${result.game_id}`}
                    className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-100 hover:text-violet-200 hover:underline"
                    title="Read this game's roleplay"
                  >
                    {result.game_name}
                  </Link>
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      result.reward.commends ? "text-emerald-300" : result.reward.merit ? "text-yellow-300" : "text-ink-400"
                    }`}
                  >
                    {verdict}
                  </span>
                </div>
                <p className="text-[11.5px] text-ink-500">
                  {new Date(result.ts * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}, {result.nation},{" "}
                  {result.meaningful_words.toLocaleString()} in-character words, creativity {result.creativity}/10
                </p>
                <p className="mt-0.5 text-xs text-ink-300">{result.reward.why}</p>
                {rewarded && (
                  <p className={`mt-0.5 text-[11.5px] font-semibold ${result.given ? "text-emerald-300" : "text-yellow-300"}`}>
                    {result.given ? "Given by the host" : "Waiting for the host to give it"}
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
    <section className="gm-plate p-4 sm:p-[18px]">
      <CardTitle icon={Mic} title="Your hosting" />
      <p className="mt-1 text-[13px] text-ink-400">
        <span className="font-display text-[28px] font-extrabold leading-none text-ink-100">{standing.hosted_games}</span> games hosted
      </p>
      <div className="mt-3 space-y-1">
        {standing.branches.map((branch) => (
          <div key={branch.branch} className="gm-cut flex items-center gap-3 bg-ink-950 px-3 py-2 text-xs [--cut:7px]">
            <span className="w-11 font-semibold text-ink-100">{branch.branch}</span>
            <span className="flex-1 text-ink-400">{branch.rank ? `${branch.rank} host` : "No rank"}</span>
            <span className="text-emerald-300" title="Acclamations">
              {branch.acclamations} acclaimed
            </span>
            <span className="text-rose-300" title="Violations">
              {branch.violations} violations
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
