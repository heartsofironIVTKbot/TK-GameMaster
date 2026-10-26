"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PlayerProfile } from "@/lib/playerTypes";
import type { LobbyReservation } from "@/lib/types";
import PlayerPortfolioModal from "./PlayerPortfolioModal";

/**
 * Floating Discord-style mini profile shown when a player tag is clicked in
 * the reservation roster.
 *
 * Renders instantly from what the roster already knows (nickname, avatar),
 * then fills in the full card from GET /api/players/<id>: in-game nickname,
 * Discord username + server name, round avatar, banner (known once the
 * player has logged in on the web; else their accent color, else blurple)
 * and their server roles, highest first — like Discord's own popout.
 * Hosts additionally get "View portfolio" (the bot's /report).
 */

export interface ProfileBadge {
  label: string;
  /** Tailwind classes for the badge chip (colored). */
  className: string;
}

/** Game chips for a reserved player (roster tags and map avatars). */
export function reservationBadges(
  reservation: LobbyReservation,
  hostId: string | number | null | undefined,
): ProfileBadge[] {
  const badges: ProfileBadge[] = [];
  if (hostId !== undefined && hostId !== null && String(reservation.user_id) === String(hostId)) {
    badges.push({ label: "Host", className: "border-amber-400/50 bg-amber-400/15 text-amber-300" });
  }
  if (reservation.hoi4_verified) {
    badges.push({ label: "HOI4 Verified", className: "border-sky-400/50 bg-sky-400/15 text-sky-300" });
  }
  if (reservation.host_tier && reservation.host_tier !== "None") {
    badges.push({ label: reservation.host_tier, className: "border-purple-400/50 bg-purple-400/15 text-purple-300" });
  }
  badges.push({ label: "Reserved", className: "border-rose-400/50 bg-rose-400/15 text-rose-300" });
  return badges;
}

interface PlayerProfilePopoverProps {
  userId: string;
  /** Discord @handle when known (falls back to the profile lookup). */
  username: string | null;
  ingameNickname: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: number | null;
  /** Game-specific chips (Host, HOI4 Verified, host tier…). */
  badges: ProfileBadge[];
  onClose: () => void;
  /** Hosts: show the "View portfolio" button. */
  canViewPortfolio?: boolean;
  /** Open beside this screen box (a map avatar) instead of the parent row. */
  anchorRect?: { left: number; top: number; right: number; bottom: number } | null;
}

// Profiles change rarely: reuse a fetched card for the rest of the visit,
// and share one request between cards opened while it is in flight.
const profileCache = new Map<string, PlayerProfile | null>();
const profileRequests = new Map<string, Promise<PlayerProfile | null>>();

function loadProfile(userId: string): Promise<PlayerProfile | null> {
  let request = profileRequests.get(userId);
  if (!request) {
    request = fetch(`/api/players/${userId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { profile?: PlayerProfile } | null) => {
        const loaded = body?.profile ?? null;
        profileCache.set(userId, loaded);
        return loaded;
      })
      .catch(() => {
        profileRequests.delete(userId); // let a later open retry
        return null;
      });
    profileRequests.set(userId, request);
  }
  return request;
}

function accentColorToHex(accent: number | null): string | null {
  if (accent === null || !Number.isFinite(accent)) return null;
  return `#${(accent & 0xffffff).toString(16).padStart(6, "0")}`;
}

function seedInitialsColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return `hsl(${hash}, 55%, 45%)`;
}

export default function PlayerProfilePopover({
  userId,
  username,
  ingameNickname,
  avatarUrl,
  bannerUrl,
  accentColor,
  badges,
  onClose,
  canViewPortfolio = false,
  anchorRect = null,
}: PlayerProfilePopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Zero-size marker left in the roster row: the card is portaled to <body>
  // (the roster's scroll box would clip it) and placed beside this row.
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<PlayerProfile | null>(() => profileCache.get(userId) ?? null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const portfolioOpenRef = useRef(false);
  useEffect(() => {
    portfolioOpenRef.current = portfolioOpen;
  }, [portfolioOpen]);

  useEffect(() => {
    if (profileCache.has(userId)) return undefined;
    let cancelled = false;
    // Best effort: on failure the quick card simply stays.
    void loadProfile(userId).then((loaded) => {
      if (!cancelled && loaded) setProfile(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Beside the row, kept inside the window; follows the row while the roster
  // scrolls and re-clamps once the full card (roles) has loaded.
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRect ?? anchorRef.current?.parentElement?.getBoundingClientRect();
      if (!anchor) return;
      const width = rootRef.current?.offsetWidth ?? 320;
      const height = rootRef.current?.offsetHeight ?? 0;
      const top = Math.min(Math.max(anchor.top, 88), window.innerHeight - height - 8);
      // Right of the anchor; flip to its left when that would leave the window.
      const left =
        anchor.right + 12 + width > window.innerWidth - 8 ? anchor.left - 12 - width : anchor.right + 12;
      setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [profile, anchorRect]);

  // Close on outside click and Escape (the portfolio, when open, handles its own).
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (portfolioOpenRef.current) return;
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !portfolioOpenRef.current) onClose();
    };
    // Capture phase: map avatars stop pointerdown from bubbling (so the map
    // doesn't pan), but clicking one must still close this card.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const nickname = profile?.ingame_nickname ?? ingameNickname;
  const handle = profile?.username ?? username;
  const serverName = profile?.display_name ?? null;
  const name = nickname || serverName || handle || `User ${userId}`;
  const avatar = profile?.avatar_url ?? avatarUrl;
  const banner = profile?.banner_url ?? bannerUrl;
  const accent = accentColorToHex(profile?.accent_color ?? accentColor);
  const bannerStyle = banner
    ? { backgroundImage: `url("${banner}")` }
    : {
        backgroundImage: accent
          ? `linear-gradient(135deg, ${accent}, ${accent}88 55%, #111827)`
          : "linear-gradient(135deg, #5865f2, #4752c4 60%, #1e2235)",
      };
  const roles = profile?.roles ?? [];

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const card = (
    <div
      ref={rootRef}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
      className="fixed z-[1300] w-80 cursor-default overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 text-left shadow-2xl backdrop-blur-md"
      role="dialog"
      aria-label={`Discord profile of ${name}`}
      onClick={(event) => event.stopPropagation()}
    >
      {/* Banner */}
      <div className="h-24 w-full bg-cover bg-center" style={bannerStyle} aria-hidden />

      {/* Round avatar overlapping the banner, then names */}
      <div className="px-4 pb-3">
        <div className="-mt-10 h-20 w-20 overflow-hidden rounded-full border-[5px] border-slate-900 bg-slate-900">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-xl font-black text-white"
              style={{ backgroundColor: seedInitialsColor(userId) }}
            >
              {initials}
            </div>
          )}
        </div>
        <p className="mt-2 truncate text-lg font-black leading-tight text-slate-50">{name}</p>
        {handle && !/^\d+$/.test(handle) && <p className="truncate text-sm text-slate-300">@{handle}</p>}
        {serverName && serverName !== name && (
          <p className="truncate text-[11px] text-slate-500">Server name: {serverName}</p>
        )}
        {profile && !profile.in_server && (
          <p className="mt-1 text-[11px] font-semibold text-rose-300">No longer in the server</p>
        )}
      </div>

      {/* Game chips */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {/* Server roles, Discord-style */}
      {roles.length > 0 && (
        <div className="border-t border-slate-800 px-4 py-3">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Roles</p>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {roles.map((role) => (
              <span
                key={role.id}
                className="flex items-center gap-1.5 rounded-md bg-slate-800/90 px-2 py-1 text-[11px] font-semibold text-slate-200"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: role.color ?? "#99aab5" }}
                  aria-hidden
                />
                {role.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={role.icon_url} alt="" className="h-3.5 w-3.5" />
                ) : role.icon_emoji ? (
                  <span aria-hidden>{role.icon_emoji}</span>
                ) : null}
                {role.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-slate-800 px-4 py-3">
        {canViewPortfolio && (
          <button
            type="button"
            onClick={() => setPortfolioOpen(true)}
            className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 transition-colors hover:bg-amber-300"
          >
            📊 View portfolio
          </button>
        )}
        <div className="flex items-center gap-2">
          <a
            href={`discord://-/users/${userId}`}
            className="flex-1 rounded-lg bg-[#5865F2] px-3 py-2 text-center text-xs font-bold text-white transition-colors hover:bg-[#4752c4]"
          >
            Open in Discord App
          </a>
          <button
            type="button"
            onClick={copyId}
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            {copied ? "Copied ✓" : "Copy ID"}
          </button>
        </div>
      </div>

      {portfolioOpen && (
        <PlayerPortfolioModal
          userId={userId}
          name={name}
          handle={handle && !/^\d+$/.test(handle) ? handle : null}
          avatarUrl={avatar}
          onClose={() => setPortfolioOpen(false)}
        />
      )}
    </div>
  );

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {typeof document !== "undefined" && createPortal(card, document.body)}
    </>
  );
}
