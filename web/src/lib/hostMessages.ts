import type { RowDataPacket } from "mysql2";
import { currentGuildId } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { demoHostMessages } from "@/lib/hostMessagesDemo";
import { lookupMembers } from "@/lib/memberDirectory";
import type { HostMessageEntry } from "@/lib/messageTypes";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * Messages hosts sent a member from the Database page (formerly /dm), read
 * from the bot's `host_messages` table — this server's rows only (servers
 * running the bot share the database). The bot sends them ("host_dm"
 * requests) and records each one, delivered or not. "This server" is the
 * one the host pages work on (multi-server).
 */

const KEEP = 20;

interface MessageRow extends RowDataPacket {
  id: number | string;
  sender_id: string;
  message: string;
  signed: number;
  delivered: number;
  created_at: number | string;
}

export async function listHostMessages(userId: string, guildId?: string): Promise<HostMessageEntry[]> {
  if (isSchedulerDemo()) return demoHostMessages(userId);
  const guild = guildId ?? (await currentGuildId());
  let rows: MessageRow[];
  try {
    [rows] = await getPool().query<MessageRow[]>(
      `SELECT id, sender_id, message, signed, delivered, created_at FROM host_messages
        WHERE guild_id = ? AND recipient_id = ? ORDER BY created_at DESC, id DESC LIMIT ${KEEP}`,
      [guild, userId],
    );
  } catch (error) {
    // The bot creates the table on its next start.
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
  const names = await lookupMembers(rows.map((row) => String(row.sender_id)), guild);
  return rows.map((row) => {
    const sender = names.get(String(row.sender_id));
    return {
      id: String(row.id),
      sender_id: String(row.sender_id),
      sender_name: sender?.ingame_nickname || sender?.display_name || sender?.username || `#${row.sender_id}`,
      message: String(row.message ?? ""),
      signed: Boolean(Number(row.signed)),
      delivered: Boolean(Number(row.delivered)),
      created_at: Number(row.created_at) || 0,
    };
  });
}
