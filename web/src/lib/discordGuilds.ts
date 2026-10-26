import type { SessionUser } from "@/lib/session";

/**
 * The servers a logged-in user is in, from Discord (GET /users/@me/guilds
 * with their OAuth token — only after "Connect your servers", which asks for
 * the `guilds` scope). Cached for a minute per user: Discord rate-limits this.
 */

export interface OAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  /** The user's permissions in that server (a bitfield as a string). */
  permissions: string;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; guilds: OAuthGuild[] }>();

export class DiscordGuildsError extends Error {}

/** null = no usable token (log in again with "Connect your servers"). */
export async function userGuilds(session: SessionUser): Promise<OAuthGuild[] | null> {
  const token = session.access_token;
  if (!token || !session.token_exp || session.token_exp < Date.now() / 1000 + 30) return null;
  const cached = cache.get(session.discord_id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.guilds;

  const response = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!response) {
    if (cached) return cached.guilds;
    throw new DiscordGuildsError("Couldn't reach Discord — try again in a moment.");
  }
  if (response.status === 401) return null;
  if (!response.ok) {
    if (cached) return cached.guilds;
    throw new DiscordGuildsError(
      response.status === 429 ? "Discord is rate-limiting us — wait a few seconds and reload." : `Discord answered ${response.status}.`,
    );
  }
  const raw = (await response.json().catch(() => [])) as unknown[];
  const guilds = (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const g = entry as Record<string, unknown>;
    if (typeof g.id !== "string" || typeof g.name !== "string") return [];
    return [
      {
        id: g.id,
        name: g.name,
        icon: typeof g.icon === "string" ? g.icon : null,
        owner: g.owner === true,
        permissions: typeof g.permissions === "string" ? g.permissions : String(g.permissions ?? "0"),
      },
    ];
  });
  cache.set(session.discord_id, { at: Date.now(), guilds });
  return guilds;
}

export function guildIconUrl(id: string, icon: string | null): string | null {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${icon.startsWith("a_") ? "gif" : "png"}?size=128`;
}
