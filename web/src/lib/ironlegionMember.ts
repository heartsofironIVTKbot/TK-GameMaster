import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

/**
 * Whether a member holds IronLegion's authenticated role on a server, from the
 * bot's `web_member_directory.verified` (lib/ironlegion.ts has the rules).
 * Server only. null: no row yet, or an older table without it; callers let
 * them through, like the bot does when it can't check.
 */

interface DirectoryFlag extends RowDataPacket {
  verified: number | boolean | string;
}

export async function ironLegionMemberVerified(db: Pool | PoolConnection, guildId: string, userId: string): Promise<boolean | null> {
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
