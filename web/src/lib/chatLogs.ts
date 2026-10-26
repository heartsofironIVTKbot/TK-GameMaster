import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

/**
 * Game chat logs uploaded on the Games page (one per game; a new upload
 * replaces it). The bot reads them for the AI analysis (bot.py.py
 * _load_game_chat_log_mysql), archives the file and tells the players.
 */

const isSchedulerDemo = () => process.env.NODE_ENV === "development" && process.env.SCHEDULER_DEMO === "1";

const DDL = `CREATE TABLE IF NOT EXISTS game_chat_logs (
    game_id VARCHAR(32) NOT NULL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    filename VARCHAR(200) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    bytes INT NOT NULL,
    uploaded_by BIGINT NOT NULL,
    uploaded_at BIGINT NOT NULL,
    INDEX idx_game_chat_logs_guild (guild_id)
)`;

export interface ChatLogMeta {
  game_id: string;
  filename: string;
  bytes: number;
  uploaded_by: string;
  uploaded_at: number;
}

interface DemoLog extends ChatLogMeta {
  content: string;
}

function demoLogs(): Map<string, DemoLog> {
  const holder = globalThis as { __gmChatLogsDemoV1?: Map<string, DemoLog> };
  holder.__gmChatLogsDemoV1 ??= new Map();
  return holder.__gmChatLogsDemoV1;
}

let ready: Promise<void> | null = null;
async function ensureTable(): Promise<void> {
  if (!ready) {
    ready = getPool()
      .query(DDL)
      .then(() => undefined)
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  await ready;
}

/** Keep only a safe, short file name. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "chat_log.txt";
  const safe = base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120).trim();
  return safe.toLowerCase().endsWith(".txt") ? safe : `${safe || "chat_log"}.txt`;
}

export async function saveChatLog(input: {
  gameId: string;
  guildId: string;
  filename: string;
  content: string;
  uploadedBy: string;
}): Promise<ChatLogMeta> {
  const meta: ChatLogMeta = {
    game_id: input.gameId,
    filename: cleanName(input.filename),
    bytes: new TextEncoder().encode(input.content).length,
    uploaded_by: input.uploadedBy,
    uploaded_at: Math.floor(Date.now() / 1000),
  };
  if (isSchedulerDemo()) {
    demoLogs().set(input.gameId, { ...meta, content: input.content });
    return meta;
  }
  await ensureTable();
  await getPool().query(
    `INSERT INTO game_chat_logs (game_id, guild_id, filename, content, bytes, uploaded_by, uploaded_at)
     VALUES (?, ?, ?, ?, ?, CAST(? AS UNSIGNED), ?)
     ON DUPLICATE KEY UPDATE guild_id = VALUES(guild_id), filename = VALUES(filename), content = VALUES(content),
       bytes = VALUES(bytes), uploaded_by = VALUES(uploaded_by), uploaded_at = VALUES(uploaded_at)`,
    [meta.game_id, input.guildId, meta.filename, input.content, meta.bytes, meta.uploaded_by, meta.uploaded_at],
  );
  return meta;
}

/** The uploaded log's details (no content) for any of a game's ids. */
export async function chatLogMeta(gameIds: string[]): Promise<ChatLogMeta | null> {
  const ids = [...new Set(gameIds.filter(Boolean))];
  if (ids.length === 0) return null;
  if (isSchedulerDemo()) {
    for (const id of ids) {
      const found = demoLogs().get(id);
      if (found) return { game_id: found.game_id, filename: found.filename, bytes: found.bytes, uploaded_by: found.uploaded_by, uploaded_at: found.uploaded_at };
    }
    return null;
  }
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT game_id, filename, bytes, CAST(uploaded_by AS CHAR) AS uploaded_by, uploaded_at
         FROM game_chat_logs WHERE game_id IN (?) ORDER BY uploaded_at DESC LIMIT 1`,
      [ids],
    );
    const row = rows[0];
    return row
      ? {
          game_id: String(row.game_id),
          filename: String(row.filename),
          bytes: Number(row.bytes) || 0,
          uploaded_by: String(row.uploaded_by),
          uploaded_at: Number(row.uploaded_at) || 0,
        }
      : null;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return null;
    throw error;
  }
}

/** Preview mode: the uploaded text (the simulated bot grades it). */
export function demoChatLogText(gameIds: string[]): DemoLog | null {
  for (const id of gameIds) {
    const found = demoLogs().get(id);
    if (found) return found;
  }
  return null;
}
