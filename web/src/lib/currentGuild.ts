import type { RowDataPacket } from "mysql2";
import { cookies } from "next/headers";
import { cache } from "react";
import { getPool } from "@/lib/db";
import { guildIconUrl } from "@/lib/discordGuilds";
import { demoServers } from "@/lib/serverSettingsDemo";
import type { HostServer } from "@/lib/scheduleTypes";
import { getSession } from "@/lib/session";

/**
 * Which server the website works on (multi-server, docs/server-setup.md).
 *
 * Host pages (calendar, games, database, attendance, presets) show one server
 * at a time: the one picked in the header's server switcher (cookie
 * `gm_guild`), as long as the viewer hosts there — else their first server,
 * else the home server. Public pages (the map) use the server of the game
 * being shown instead. The bot keeps every server's data apart with a
 * guild_id column; the home server's player records stay in `users`, other
 * servers' in `guild_users`.
 */

export const HOME_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
export const GUILD_COOKIE = "gm_guild";
const ID_RE = /^\d{15,25}$/;

const demo = () => process.env.NODE_ENV === "development" && process.env.SCHEDULER_DEMO === "1";

export type { HostServer };

interface RosterServerRow extends RowDataPacket {
  guild_id: string;
  is_senior: number;
  guild_name: string | null;
  icon: string | null;
}

/** Servers where `userId` is on the bot's host roster (active servers only). */
export const hostServersOf = cache(async (userId: string): Promise<HostServer[]> => {
  if (demo()) {
    // Preview: the home server, plus any sample server whose setup was finished on /servers.
    return [...demoServers().values()]
      .filter((server) => server.is_home || (server.bot_present && server.status === "active"))
      .map((server) => ({ id: server.id, name: server.name, icon_url: server.icon, is_staff: true, is_home: server.is_home }));
  }
  let rows: RosterServerRow[];
  try {
    [rows] = await getPool().query<RosterServerRow[]>(
      `SELECT r.guild_id, r.is_senior, s.guild_name, s.icon
         FROM web_host_roster r LEFT JOIN guild_settings s ON s.guild_id = r.guild_id
        WHERE r.user_id = CAST(? AS UNSIGNED)`,
      [userId],
    );
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    // Before the bot's multi-server update: one server, no guild_id / guild_settings yet.
    if (code === "ER_BAD_FIELD_ERROR" || code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
  const servers = rows.map((row) => {
    const id = String(row.guild_id);
    return {
      id,
      name: row.guild_name || (id === HOME_GUILD_ID ? "Home server" : `Server ${id}`),
      icon_url: guildIconUrl(id, row.icon),
      is_staff: Boolean(row.is_senior),
      is_home: id === HOME_GUILD_ID,
    };
  });
  return servers.sort((a, b) => Number(b.is_home) - Number(a.is_home) || a.name.localeCompare(b.name));
});

/** The server picked in the switcher (not validated). */
export async function guildCookie(): Promise<string | null> {
  const value = (await cookies()).get(GUILD_COOKIE)?.value ?? "";
  return ID_RE.test(value) ? value : null;
}

/** The server the host pages work on right now (see the file comment). */
export const currentGuildId = cache(async (): Promise<string> => {
  const wanted = await guildCookie();
  if (demo()) {
    const servers = await hostServersOf("demo");
    return wanted && servers.some((server) => server.id === wanted) ? wanted : HOME_GUILD_ID;
  }
  const session = await getSession();
  if (!session) return HOME_GUILD_ID;
  const servers = await hostServersOf(session.discord_id).catch(() => [] as HostServer[]);
  if (wanted && servers.some((server) => server.id === wanted)) return wanted;
  if (servers.length === 0 || servers.some((server) => server.is_home)) return HOME_GUILD_ID;
  return servers[0].id;
});

export function isHomeGuild(guildId: string): boolean {
  return guildId === HOME_GUILD_ID;
}

/**
 * Where a server's player records live: the home server keeps `users`
 * (which also holds everyone's in-game nickname); other servers share
 * `guild_users`. `where` matches one player; `scope` limits a list.
 */
export function playerRecords(guildId: string): {
  table: "users" | "guild_users";
  where: string;
  whereParams: string[];
  scope: string;
  scopeParams: string[];
} {
  if (isHomeGuild(guildId)) {
    return { table: "users", where: "discord_id = ?", whereParams: [], scope: "1 = 1", scopeParams: [] };
  }
  return {
    table: "guild_users",
    where: "guild_id = ? AND discord_id = ?",
    whereParams: [guildId],
    scope: "guild_id = ?",
    scopeParams: [guildId],
  };
}

/** bot_config row for a server's key: the home server's keys are top-level,
 *  another server's live inside its "guild:<id>" row. */
export function botConfigLocation(guildId: string, key: string): { configKey: string; inner: string | null } {
  return isHomeGuild(guildId) ? { configKey: key, inner: null } : { configKey: `guild:${guildId}`, inner: key };
}

/** Read one bot_config value for a server (null when missing). */
export async function readBotConfig(guildId: string, key: string): Promise<unknown> {
  const { configKey, inner } = botConfigLocation(guildId, key);
  const [rows] = await getPool().query<(RowDataPacket & { config_value: unknown })[]>(
    "SELECT config_value FROM bot_config WHERE config_key = ?",
    [configKey],
  );
  let value = rows[0]?.config_value ?? null;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      // stored as plain text
    }
  }
  if (inner === null) return value;
  return value && typeof value === "object" && !Array.isArray(value) ? ((value as Record<string, unknown>)[inner] ?? null) : null;
}
