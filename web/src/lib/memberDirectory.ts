import type { RowDataPacket } from "mysql2";
import { currentGuildId } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { demoMembersById, searchDemoMembers } from "@/lib/liveDemo";
import { SchedulerSetupError, isSchedulerDemo } from "@/lib/scheduleStore";
import type { DirectoryMember } from "@/lib/scheduleTypes";

/**
 * Server members for the live map's host tools, from web_member_directory
 * (mirrored by the bot's web_member_directory_loop every 10 minutes — the web
 * never talks to Discord). In-game nicknames come from the bot's users table.
 * One server at a time (multi-server): the server the host pages work on,
 * unless the caller names one (a game's server).
 */

interface DirectoryRow extends RowDataPacket {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified: number | boolean;
  is_vip: number | boolean;
}

interface NicknameRow extends RowDataPacket {
  id: string;
  ingame_nickname: string | null;
}

const COLUMNS = `CAST(user_id AS CHAR) AS user_id, username, display_name, avatar_url, verified, is_vip`;
const MAX_RESULTS = 20;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `IN (…)` over BIGINT snowflakes, compared exactly (no float rounding). */
function idList(ids: string[]): string {
  return ids.map(() => "CAST(? AS UNSIGNED)").join(", ");
}

function toMember(row: DirectoryRow, nicknames: Map<string, string | null>): DirectoryMember {
  return {
    discord_id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    verified: Boolean(row.verified),
    is_vip: Boolean(row.is_vip),
    ingame_nickname: nicknames.get(row.user_id) ?? null,
  };
}

async function nicknamesFor(ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  try {
    const [rows] = await getPool().query<NicknameRow[]>(
      "SELECT CAST(discord_id AS CHAR) AS id, ingame_nickname FROM users WHERE discord_id IN (?)",
      [ids],
    );
    return new Map(rows.map((row) => [row.id, row.ingame_nickname]));
  } catch {
    // users table / ingame_nickname column missing — names only.
    return new Map();
  }
}

/** Find members by username, display name, in-game nickname or Discord id. */
export async function searchMembers(query: string, guildId?: string): Promise<DirectoryMember[]> {
  const needle = query.trim().slice(0, 64);
  if (!needle) return [];
  if (isSchedulerDemo()) return searchDemoMembers(needle);
  const pool = getPool();
  const guild = guildId ?? (await currentGuildId());
  try {
    let rows: DirectoryRow[];
    if (/^\d{15,25}$/.test(needle)) {
      [rows] = await pool.query<DirectoryRow[]>(
        `SELECT ${COLUMNS} FROM web_member_directory WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED)`,
        [guild, needle],
      );
    } else {
      const like = `%${escapeLike(needle)}%`;
      [rows] = await pool.query<DirectoryRow[]>(
        `SELECT ${COLUMNS} FROM web_member_directory
         WHERE guild_id = ? AND (username LIKE ? OR display_name LIKE ?)
         ORDER BY (username = ? OR display_name = ?) DESC, verified DESC, display_name
         LIMIT ${MAX_RESULTS}`,
        [guild, like, like, needle, needle],
      );
      // Players are often known by their in-game name.
      if (rows.length < MAX_RESULTS) {
        try {
          const [byNick] = await pool.query<NicknameRow[]>(
            `SELECT CAST(discord_id AS CHAR) AS id, ingame_nickname FROM users
             WHERE ingame_nickname LIKE ? LIMIT ${MAX_RESULTS}`,
            [like],
          );
          const extra = byNick.map((row) => row.id).filter((id) => !rows.some((row) => row.user_id === id));
          if (extra.length > 0) {
            const [more] = await pool.query<DirectoryRow[]>(
              `SELECT ${COLUMNS} FROM web_member_directory WHERE guild_id = ? AND user_id IN (${idList(extra)})`,
              [guild, ...extra],
            );
            rows = [...rows, ...more].slice(0, MAX_RESULTS);
          }
        } catch {
          // No nickname column — username/display-name matches only.
        }
      }
    }
    const nicknames = await nicknamesFor(rows.map((row) => row.user_id));
    return rows.map((row) => toMember(row, nicknames));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") throw new SchedulerSetupError();
    throw error;
  }
}

/** Names/avatars for reserved players (best effort: empty when unavailable). */
export async function lookupMembers(ids: string[], guildId?: string): Promise<Map<string, DirectoryMember>> {
  const unique = [...new Set(ids)].filter((id) => /^\d{5,25}$/.test(id));
  if (unique.length === 0) return new Map();
  if (isSchedulerDemo()) return demoMembersById(unique);
  try {
    const guild = guildId ?? (await currentGuildId());
    const [rows] = await getPool().query<DirectoryRow[]>(
      `SELECT ${COLUMNS} FROM web_member_directory WHERE guild_id = ? AND user_id IN (${idList(unique)})`,
      [guild, ...unique],
    );
    const nicknames = new Map<string, string | null>();
    return new Map(rows.map((row) => [row.user_id, toMember(row, nicknames)]));
  } catch {
    return new Map();
  }
}
