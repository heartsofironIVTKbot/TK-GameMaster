import mysql, { type Pool, type PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

/**
 * Whether IronLegion lets a member in on a server, for reservations on the map
 * (lib/ironlegion.ts has the switches). IronLegion has the final say in servers
 * it's in, and its answer comes from its database, never a Discord role:
 *
 * 1. With the read-only IronLegion login set (IRONLEGION_DB_HOST / _PORT / _USER /
 *    _PASSWORD / _NAME, optional _SSL_CA or _SSL_DISABLED; the same values as the
 *    bot's), it reads IronLegion's views live: `gamemaster_servers.bot_present`
 *    (no lock where IronLegion isn't) and `gamemaster_members` (no row = no).
 * 2. Otherwise, or when that database can't be reached, the bot's
 *    `web_member_directory.verified`, which the bot fills from the same answers
 *    every few minutes.
 *
 * Server only. null: it can't tell (callers let them through, like the bot).
 */

interface DirectoryFlag extends RowDataPacket {
  verified: number | boolean | string;
}
interface ServerRow extends RowDataPacket {
  bot_present: number | string | null;
}
interface MemberRow extends RowDataPacket {
  authenticated: number | string | null;
}

let ironLegionPool: Pool | null = null;

function ironLegionDb(): Pool | null {
  const { IRONLEGION_DB_HOST: host, IRONLEGION_DB_USER: user, IRONLEGION_DB_PASSWORD: password, IRONLEGION_DB_NAME: database } = process.env;
  if (!host || !user || !password || !database) return null;
  if (ironLegionPool) return ironLegionPool;
  const ca = process.env.IRONLEGION_DB_SSL_CA;
  const disabled = (process.env.IRONLEGION_DB_SSL_DISABLED ?? "").toLowerCase() === "true";
  ironLegionPool = mysql.createPool({
    host,
    user,
    password,
    database,
    port: Number(process.env.IRONLEGION_DB_PORT) || 3306,
    connectionLimit: 3,
    connectTimeout: 5_000,
    // Encrypted by default, like the bot; the certificate is checked when a CA is given.
    ...(disabled ? {} : { ssl: ca ? { ca } : { rejectUnauthorized: false } }),
  });
  return ironLegionPool;
}

/** IronLegion's own answer, or null when its database isn't set up or can't be reached. */
async function fromIronLegion(guildId: string, userId: string): Promise<boolean | null> {
  const db = ironLegionDb();
  if (!db) return null;
  try {
    const [servers] = await db.query<ServerRow[]>("SELECT bot_present FROM gamemaster_servers WHERE guild_id = ?", [guildId]);
    if (!servers[0] || !Number(servers[0].bot_present)) return true; // IronLegion isn't in this server: no lock
    const [members] = await db.query<MemberRow[]>(
      "SELECT authenticated FROM gamemaster_members WHERE guild_id = ? AND discord_id = ?",
      [guildId, userId],
    );
    return Boolean(members[0] && Number(members[0].authenticated));
  } catch (error) {
    console.warn("[ironlegion] database unreachable, using the member directory:", (error as { code?: string }).code ?? error);
    return null;
  }
}

async function fromDirectory(db: Pool | PoolConnection, guildId: string, userId: string): Promise<boolean | null> {
  try {
    const [rows] = await db.query<DirectoryFlag[]>(
      "SELECT verified FROM web_member_directory WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)",
      [guildId, userId],
    );
    return rows[0] ? Boolean(Number(rows[0].verified)) : null;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") return null;
    throw error;
  }
}

export async function ironLegionMemberVerified(db: Pool | PoolConnection, guildId: string, userId: string): Promise<boolean | null> {
  const live = await fromIronLegion(guildId, userId);
  return live !== null ? live : fromDirectory(db, guildId, userId);
}
