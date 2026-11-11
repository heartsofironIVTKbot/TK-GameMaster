"use client";

import { useEffect, useState } from "react";

/**
 * Who is looking at the site, for the shared menu: logged in or not, their
 * name and avatar, and whether they host or are Host Management. Fetched once
 * per page load and shared by every component that asks.
 */

export interface Viewer {
  loggedIn: boolean;
  name: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  isStaff: boolean;
  /** One of GameMaster's owners: sees every server using it (/system). */
  isSystemAdmin: boolean;
  /** Local preview mode (sample data). */
  demo: boolean;
}

const ANONYMOUS: Viewer = { loggedIn: false, name: null, avatarUrl: null, isHost: false, isStaff: false, isSystemAdmin: false, demo: false };

let pending: Promise<Viewer> | null = null;

async function loadViewer(): Promise<Viewer> {
  const [me, host] = await Promise.all([
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null) as Promise<{ authenticated?: boolean; system_admin?: boolean; user?: { discord_id: string; username: string; avatar: string | null; ingame_nickname?: string | null } } | null>,
    fetch("/api/schedule/me", { cache: "no-store" })
      .then((response) => response.json())
      .catch(() => null) as Promise<{ status?: string; host?: { discord_id: string; username: string; display_name: string | null; avatar: string | null; is_staff: boolean; demo: boolean } } | null>,
  ]);
  const user = me?.authenticated ? me.user : undefined;
  const hostProfile = host?.status === "ok" ? host.host : undefined;
  const id = user?.discord_id ?? hostProfile?.discord_id ?? null;
  const avatar = user?.avatar ?? hostProfile?.avatar ?? null;
  return {
    loggedIn: Boolean(user || hostProfile),
    name: user?.ingame_nickname || hostProfile?.display_name || user?.username || hostProfile?.username || null,
    avatarUrl: id && avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64` : null,
    isHost: Boolean(hostProfile),
    isStaff: Boolean(hostProfile?.is_staff),
    // The preview has no owners list: its sample host sees the page.
    isSystemAdmin: Boolean(me?.system_admin || hostProfile?.demo),
    demo: Boolean(hostProfile?.demo),
  };
}

/** The viewer (null while it loads). */
export function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  useEffect(() => {
    let cancelled = false;
    pending ??= loadViewer().catch(() => ANONYMOUS);
    void pending.then((value) => {
      if (!cancelled) setViewer(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return viewer;
}
