import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { recordAudit } from "@/lib/auditLog";
import { demoServers } from "@/lib/serverSettingsDemo";
import { demoSummary } from "@/lib/serverSettings";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * The system admin's view (web /system): every Discord server using
 * GameMaster, and the servers banned from it.
 *
 * System admins are the GameMaster application's owners, as Discord reports
 * them to the bot (bot.py.py _system_startup → `bot_owners`). Banned servers
 * live in `guild_blocklist`: the bot leaves them when it's added, and within
 * a minute when it's already in one. The home server can't be banned.
 */

export interface SystemServer {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string | null;
  member_count: number | null;
  /** GameMaster is in the server now. */
  bot_present: boolean;
  /** "active" (set up), "needs_setup", … (guild_settings.status). */
  status: string;
  is_home: boolean;
  joined_at: number | null;
  left_at: number | null;
  setup_completed_at: number | null;
  banned: { reason: string | null; added_at: number } | null;
}

export interface BannedServer {
  id: string;
  name: string | null;
  reason: string | null;
  added_at: number;
}

export interface SystemOverview {
  servers: SystemServer[];
  /** Banned servers GameMaster has never been in (no row in the list above). */
  banned_elsewhere: BannedServer[];
  demo: boolean;
}

const ID_RE = /^\d{15,25}$/;

/** Is this Discord user one of GameMaster's owners? */
export async function isSystemAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (isSchedulerDemo()) return true;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT 1 FROM bot_owners WHERE user_id = ? LIMIT 1", [userId]);
    return rows.length > 0;
  } catch {
    // The bot hasn't created the table yet.
    return false;
  }
}

interface ServerRow extends RowDataPacket {
  guild_id: string;
  guild_name: string | null;
  icon: string | null;
  owner_id: string | null;
  status: string | null;
  is_home: number | boolean;
  bot_present: number | boolean;
  joined_at: number | null;
  left_at: number | null;
  setup_completed_at: number | null;
  members: string | null;
}

interface BanRow extends RowDataPacket {
  guild_id: string;
  reason: string | null;
  added_at: number;
}

async function banRows(): Promise<BanRow[]> {
  try {
    const [rows] = await getPool().query<BanRow[]>("SELECT guild_id, reason, added_at FROM guild_blocklist ORDER BY added_at DESC");
    return rows;
  } catch {
    return [];
  }
}

const iconUrl = (id: string, icon: string | null) => (icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64` : null);

export async function systemOverview(): Promise<SystemOverview> {
  if (isSchedulerDemo()) {
    const servers = [...demoServers().values()].map((server) => {
      const summary = demoSummary(server);
      return {
        id: summary.id,
        name: summary.name,
        icon_url: summary.icon_url,
        owner_id: null,
        member_count: summary.member_count,
        bot_present: summary.bot_present,
        status: summary.setup === "active" ? "active" : "needs_setup",
        is_home: summary.is_home,
        joined_at: null,
        left_at: null,
        setup_completed_at: null,
        banned: null,
      } satisfies SystemServer;
    });
    return { servers, banned_elsewhere: [], demo: true };
  }
  const [rows] = await getPool().query<ServerRow[]>(
    `SELECT s.guild_id, s.guild_name, s.icon, s.owner_id, s.status, s.is_home, s.bot_present, s.joined_at, s.left_at,
            s.setup_completed_at, CAST(JSON_EXTRACT(g.data, '$.guild.member_count') AS CHAR) AS members
       FROM guild_settings s LEFT JOIN web_guild_snapshot g ON g.guild_id = s.guild_id`,
  );
  const bans = new Map((await banRows()).map((row) => [String(row.guild_id), row]));
  const servers: SystemServer[] = rows.map((row) => {
    const id = String(row.guild_id);
    const ban = bans.get(id);
    const members = Number(row.members);
    return {
      id,
      name: row.guild_name || "Unknown server",
      icon_url: iconUrl(id, row.icon),
      owner_id: row.owner_id ? String(row.owner_id) : null,
      member_count: Number.isFinite(members) && members > 0 ? members : null,
      bot_present: Boolean(Number(row.bot_present)),
      status: String(row.status || "needs_setup"),
      is_home: Boolean(Number(row.is_home)),
      joined_at: row.joined_at ? Number(row.joined_at) : null,
      left_at: row.left_at ? Number(row.left_at) : null,
      setup_completed_at: row.setup_completed_at ? Number(row.setup_completed_at) : null,
      banned: ban ? { reason: ban.reason, added_at: Number(ban.added_at) } : null,
    };
  });
  // In the server first, then the biggest.
  servers.sort((a, b) => Number(b.bot_present) - Number(a.bot_present) || (b.member_count ?? 0) - (a.member_count ?? 0) || a.name.localeCompare(b.name));
  const known = new Set(servers.map((server) => server.id));
  const banned_elsewhere = [...bans.values()]
    .filter((row) => !known.has(String(row.guild_id)))
    .map((row) => ({ id: String(row.guild_id), name: null, reason: row.reason, added_at: Number(row.added_at) }));
  return { servers, banned_elsewhere, demo: false };
}

/** Ban (or unban) a server. The bot acts on it within a minute. */
export async function setServerBan(
  guildId: string,
  banned: boolean,
  reason: string | null,
  actor: { id: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ID_RE.test(guildId)) return { ok: false, error: "That isn't a Discord server id." };
  if (banned && guildId === HOME_GUILD_ID) return { ok: false, error: "The home server can't be banned." };
  if (isSchedulerDemo()) return { ok: true };
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS guild_blocklist (
        guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
        reason VARCHAR(200) NULL,
        added_by VARCHAR(32) NULL,
        added_at BIGINT NOT NULL
    )`);
  const [names] = await db.query<RowDataPacket[]>("SELECT guild_name FROM guild_settings WHERE guild_id = ? LIMIT 1", [guildId]);
  const name = names[0]?.guild_name ? String(names[0].guild_name) : guildId;
  if (banned) {
    await db.query(
      "INSERT INTO guild_blocklist (guild_id, reason, added_by, added_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)",
      [guildId, reason?.trim().slice(0, 200) || null, actor.id, Math.floor(Date.now() / 1000)],
    );
  } else {
    await db.query("DELETE FROM guild_blocklist WHERE guild_id = ?", [guildId]);
  }
  void recordAudit({
    guildId: HOME_GUILD_ID,
    category: "settings",
    action: banned ? "server_banned" : "server_unbanned",
    summary: banned ? `${actor.name} banned the server ${name} from GameMaster` : `${actor.name} unbanned the server ${name}`,
    actorId: actor.id,
    actorName: actor.name,
    details: { guild_id: guildId, reason: banned ? reason : null },
  });
  return { ok: true };
}
