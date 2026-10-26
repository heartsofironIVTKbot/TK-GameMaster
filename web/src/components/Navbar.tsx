"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface MeResponse {
  authenticated: boolean;
  user?: {
    discord_id: string;
    username: string;
    avatar: string | null;
  };
}

type SessionUser = NonNullable<MeResponse["user"]>;

function avatarUrl(user: SessionUser): string | null {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=64`;
}

/**
 * Top navigation bar. Shows a "Login with Discord" button for anonymous
 * visitors and the user's avatar + username once authenticated (session
 * state comes from GET /api/auth/me).
 */
export default function Navbar() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as MeResponse;
      })
      .then((data) => {
        if (cancelled || !data?.authenticated || !data.user) return;
        setUser(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="flex w-full items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
      <span className="font-semibold tracking-tight">GameMaster · HOI4</span>
      <div className="flex items-center gap-3">
        {loading ? (
          <span className="text-sm text-zinc-400">…</span>
        ) : user ? (
          <div className="flex items-center gap-2" title={user.discord_id}>
            {user.avatar && avatarUrl(user) ? (
              <Image
                src={avatarUrl(user) as string}
                alt={user.username}
                width={32}
                height={32}
                className="rounded-full"
                unoptimized
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-300 text-xs font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium">{user.username}</span>
          </div>
        ) : (
          <a
            href="/api/auth/login"
            className="rounded-full bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
          >
            Login with Discord
          </a>
        )}
      </div>
    </nav>
  );
}
