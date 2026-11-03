"use client";

import { BadgeCheck, BarChart3, ChevronLeft, Gavel, Scale, Send, UserCog, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DatabasePlayer, ModerationOptions } from "@/lib/moderationTypes";
import type { PlayerPortfolio, PlayerProfile } from "@/lib/playerTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { PortfolioBody } from "@/components/PlayerPortfolioModal";
import { CopyButton, Spinner } from "@/components/schedule/ui";
import { CardTitle } from "@/components/games/labels";
import ActionPanel from "./ActionPanel";
import Avatar from "./Avatar";
import HostStandingPanel from "./HostStandingPanel";
import MessagePanel from "./MessagePanel";
import PlayerHistory from "./PlayerHistory";
import RolesPanel from "./RolesPanel";

/**
 * One player's record on the Database page: profile header, the full
 * portfolio (same view as the map's Portfolio card) and the actions in
 * tabs: Moderate, Roles (Verified / VIP), Host (branches and ranks; only for
 * hosts) and Message. After every action the portfolio reloads fresh.
 */

type ActionTab = "moderate" | "roles" | "host" | "message";
export default function PlayerRecord({
  playerId,
  row,
  host,
  options,
  onClose,
  onApplied,
}: {
  playerId: string;
  /** The search row, when opened from the list (null for a ?player= link). */
  row: DatabasePlayer | null;
  host: HostProfile;
  options: ModerationOptions | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [portfolio, setPortfolio] = useState<{ nonce: number; data: PlayerPortfolio | null; error: string | null } | null>(
    null,
  );
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<ActionTab>("moderate");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/players/${playerId}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ profile?: PlayerProfile }>) : null))
      .then((body) => {
        if (!cancelled && body?.profile) setProfile(body.profile);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/players/${playerId}/portfolio${nonce > 0 ? "?fresh=1" : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { portfolio?: PlayerPortfolio; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.portfolio) {
          setPortfolio((current) => ({ nonce, data: current?.data ?? null, error: body?.error ?? "Couldn't load the record." }));
        } else {
          setPortfolio({ nonce, data: body.portfolio, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) setPortfolio((current) => ({ nonce, data: current?.data ?? null, error: "Network error — try again." }));
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, nonce]);

  const handleApplied = useCallback(() => {
    setNonce((value) => value + 1);
    onApplied();
  }, [onApplied]);

  const name = profile?.ingame_nickname || profile?.display_name || row?.name || profile?.username || `#${playerId}`;
  const username = profile?.username ?? row?.username ?? null;
  const avatarUrl = profile?.avatar_url ?? row?.avatar_url ?? null;
  const inServer = profile ? profile.in_server : (row?.in_server ?? true);
  const roles = profile?.roles.slice(0, 10) ?? [];
  const data = portfolio?.data ?? null;
  const refreshing = portfolio?.nonce !== nonce;
  const isSelf = host.discord_id === playerId;
  const flagged = (data?.game_bans.length ?? 0) > 0 || (data?.dishonored.length ?? 0) > 0;

  const tabs: { id: ActionTab; label: string; icon: LucideIcon }[] = [
    { id: "moderate", label: "Moderate", icon: Gavel },
    { id: "roles", label: "Roles", icon: BadgeCheck },
    ...(data?.host ? [{ id: "host" as const, label: "Host", icon: UserCog }] : []),
    { id: "message", label: "Message", icon: Send },
  ];
  const current = tabs.some((entry) => entry.id === tab) ? tab : "moderate";

  return (
    <div className="gm-fade-up space-y-4">
      <section
        data-tour="database.profile"
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
        <button type="button" onClick={onClose} className="gm-btn gm-btn-quiet -ml-2 mb-2 h-7 px-2 text-xs lg:hidden">
          <ChevronLeft aria-hidden />
          Players
        </button>
        <div className="flex items-center gap-4">
          <Avatar url={avatarUrl} name={name} size={64} dim={!inServer} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-400">User record</p>
            <h1 className="gm-title truncate text-[26px] sm:text-[32px]">{name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-400">
              {username && <span>@{username}</span>}
              <span className="font-mono text-xs text-ink-500">{playerId}</span>
              <CopyButton text={playerId} label="Copy ID" />
              {!inServer && <span className="gm-tag bg-ink-800 text-ink-400">Left the server</span>}
              {isSelf && <span className="gm-tag bg-brand-950 text-brand-400">You</span>}
              {(data?.dishonored.length ?? 0) > 0 && (
                <span className="gm-tag bg-rose-950 text-rose-300">
                  <Scale aria-hidden className="h-3 w-3" />
                  Dishonored
                </span>
              )}
              {(data?.game_bans.length ?? 0) > 0 && <span className="gm-tag gm-tag-dot bg-rose-950 text-rose-300">Game banned</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gm-btn gm-btn-quiet hidden h-8 w-8 shrink-0 p-0 lg:inline-flex"
            aria-label="Close record"
            title="Back to the activity feed"
          >
            <X aria-hidden />
          </button>
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <section className="gm-plate min-w-0 space-y-4 p-4 sm:p-[18px]">
            <CardTitle icon={BarChart3} title="Portfolio">
              {refreshing && data && (
                <span className="flex items-center gap-1.5 text-xs text-ink-400">
                  <Spinner className="h-3 w-3 text-brand-300" /> Updating…
                </span>
              )}
            </CardTitle>
            {portfolio?.error && <p className="gm-cut bg-rose-950 px-3 py-2 text-sm text-rose-200 [--cut:8px]">{portfolio.error}</p>}
            {!data && !portfolio?.error && (
              <div className="flex items-center gap-2 text-sm text-ink-400">
                <Spinner className="h-4 w-4 text-brand-300" /> Loading the record…
              </div>
            )}
            {data && <PortfolioBody portfolio={data} />}
          </section>
          {host.is_staff && <PlayerHistory key={playerId} playerId={playerId} />}
        </div>

        <div className="order-first xl:order-none">
          {/* Scrolls on its own when taller than the screen, so its bottom (result, Undo) stays reachable. */}
          <div className="gm-plate roster-scroll xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-92px)] xl:overflow-y-auto">
            <nav data-tour="database.actions" className="sticky top-0 z-10 flex overflow-x-auto border-b border-ink-800 bg-ink-900 px-2.5" aria-label="Actions">
              {tabs.map((entry) => {
                const Icon = entry.icon;
                const on = entry.id === current;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setTab(entry.id)}
                    aria-current={on ? "page" : undefined}
                    className={`flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] font-semibold transition-colors ${
                      on ? "text-ink-100 shadow-[inset_0_-2px_0_var(--color-brand-400)]" : "text-ink-400 hover:text-ink-100"
                    }`}
                  >
                    <Icon aria-hidden className={`h-4 w-4 ${on ? "text-brand-400" : ""}`} strokeWidth={1.75} />
                    {entry.label}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 sm:p-[18px]">
              {!data ? (
                <p className="text-sm text-ink-400">Actions unlock once the record loads.</p>
              ) : current === "moderate" ? (
                <ActionPanel
                  key={playerId}
                  playerId={playerId}
                  playerName={name}
                  portfolio={data}
                  options={options}
                  isSelf={isSelf}
                  onApplied={handleApplied}
                />
              ) : current === "roles" ? (
                <RolesPanel key={`${playerId}-roles`} playerId={playerId} playerName={name} isSelf={isSelf} onApplied={handleApplied} />
              ) : current === "host" && data.host ? (
                <HostStandingPanel
                  key={`${playerId}-host`}
                  playerId={playerId}
                  playerName={name}
                  standing={data.host}
                  rateBranches={host.rate_branches}
                  canTake={host.is_staff}
                  isSelf={isSelf}
                  onApplied={handleApplied}
                />
              ) : (
                <MessagePanel
                  key={`${playerId}-message`}
                  playerId={playerId}
                  playerName={name}
                  viewerName={host.display_name || host.username}
                  isSelf={isSelf}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
