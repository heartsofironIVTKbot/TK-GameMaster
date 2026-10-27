"use client";

import { useCallback, useEffect, useState } from "react";
import type { DatabasePlayer, ModerationOptions } from "@/lib/moderationTypes";
import type { PlayerPortfolio, PlayerProfile } from "@/lib/playerTypes";
import type { HostProfile } from "@/lib/scheduleTypes";
import { PortfolioBody } from "@/components/PlayerPortfolioModal";
import { CopyButton, GLASS, Spinner } from "@/components/schedule/ui";
import ActionPanel from "./ActionPanel";
import Avatar from "./Avatar";
import HostStandingPanel from "./HostStandingPanel";
import MessagePanel from "./MessagePanel";
import PlayerHistory from "./PlayerHistory";
import RolesPanel from "./RolesPanel";

/**
 * One player's record on the Database page: profile header, the full
 * portfolio (same view as the map's Portfolio card) and the action panel.
 * After every action the portfolio reloads fresh from the database.
 */
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

  return (
    <div className="gm-fade-up space-y-4">
      <section
        className={`relative overflow-hidden rounded-3xl p-4 sm:p-5 ${GLASS} ${flagged ? "!border-rose-500/40" : ""}`}
        style={
          profile?.banner_url
            ? { backgroundImage: `linear-gradient(rgba(2,6,23,.78), rgba(2,6,23,.92)), url(${profile.banner_url})`, backgroundSize: "cover" }
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white lg:hidden"
          >
            ← Users
          </button>
          <Avatar url={avatarUrl} name={name} size={64} dim={!inServer} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">🗂️ User record</p>
            <h1 className="truncate text-2xl font-black tracking-tight text-white">{name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              {username && <span>@{username}</span>}
              <span className="font-mono text-[11px] text-slate-500">{playerId}</span>
              <CopyButton text={playerId} label="Copy ID" />
              {!inServer && (
                <span className="rounded-full border border-slate-500/40 bg-slate-700/40 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                  Left the server
                </span>
              )}
              {isSelf && (
                <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-200">
                  You
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hidden rounded-lg px-2.5 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white lg:block"
            aria-label="Close record"
            title="Back to the activity feed"
          >
            ✕
          </button>
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <section className={`min-w-0 space-y-4 rounded-3xl p-4 sm:p-5 ${GLASS}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">📊 Portfolio</h2>
              {refreshing && data && (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Spinner className="h-3 w-3 text-amber-300" /> Updating…
                </span>
              )}
            </div>
            {portfolio?.error && (
              <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{portfolio.error}</p>
            )}
            {!data && !portfolio?.error && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Spinner className="h-4 w-4 text-amber-300" /> Loading the record…
              </div>
            )}
            {data && <PortfolioBody portfolio={data} />}
          </section>
          {host.is_staff && <PlayerHistory key={playerId} playerId={playerId} />}
        </div>

        <div className="order-first xl:order-none">
          {/* Scrolls on its own when taller than the screen, so its bottom (result, Undo) stays reachable. */}
          <div className="roster-scroll space-y-4 xl:sticky xl:top-[76px] xl:max-h-[calc(100vh-96px)] xl:overflow-y-auto xl:rounded-2xl">
            {data ? (
              <>
                <ActionPanel
                  key={playerId}
                  playerId={playerId}
                  playerName={name}
                  portfolio={data}
                  options={options}
                  isSelf={isSelf}
                  onApplied={handleApplied}
                />
                {data.host && (
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
                )}
                <RolesPanel
                  key={`${playerId}-roles`}
                  playerId={playerId}
                  playerName={name}
                  isSelf={isSelf}
                  onApplied={handleApplied}
                />
                <MessagePanel
                  key={`${playerId}-message`}
                  playerId={playerId}
                  playerName={name}
                  viewerName={host.display_name || host.username}
                  isSelf={isSelf}
                />
              </>
            ) : (
              <div className={`rounded-2xl p-4 text-sm text-slate-400 ${GLASS}`}>Actions unlock once the record loads.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
