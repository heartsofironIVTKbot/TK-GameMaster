import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * A finished game's Game Thread, as the bot saved it when the game ended
 * (bot.py.py _archive_and_delete_game_thread → game_thread_logs). Shown on
 * the game's Archive page to members of its server.
 */

export interface GameThreadMessage {
  author: string;
  avatar: string | null;
  bot: boolean;
  ts: number;
  content: string;
  attachments: { name: string; url: string }[];
  embeds: string[];
}

export interface GameThreadLog {
  name: string;
  archived_at: number;
  messages: GameThreadMessage[];
}

interface LogRow extends RowDataPacket {
  thread_name: string;
  messages: string;
  archived_at: number;
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const https = (value: unknown) => (typeof value === "string" && /^https:\/\//.test(value) ? value : null);

function clean(raw: unknown): GameThreadMessage[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5000).map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      author: text(item.author, 100) || "Unknown",
      avatar: https(item.avatar),
      bot: item.bot === true,
      ts: Number(item.ts) || 0,
      content: text(item.content, 4000),
      attachments: (Array.isArray(item.attachments) ? item.attachments : [])
        .map((file) => file as Record<string, unknown>)
        .map((file) => ({ name: text(file.name, 200), url: https(file.url) ?? "" }))
        .filter((file) => file.name && file.url),
      embeds: (Array.isArray(item.embeds) ? item.embeds : []).map((embed) => text(embed, 2000)).filter(Boolean),
    };
  });
}

function demoLog(): GameThreadLog {
  const now = Math.floor(Date.now() / 1000);
  return {
    name: "Roleplay Game - Saturday - 11.14.2026",
    archived_at: now,
    messages: [
      { author: "GameMaster", avatar: null, bot: true, ts: now - 7200, content: "💬 Game Thread\nThis thread is for talking about this game.", attachments: [], embeds: [] },
      { author: "Otto", avatar: null, bot: false, ts: now - 6000, content: "Is the Road to 56 submod the latest version?", attachments: [], embeds: [] },
      { author: "Host", avatar: null, bot: false, ts: now - 5800, content: "Yes, subscribe and restart your launcher.", attachments: [], embeds: [] },
      { author: "GameMaster", avatar: null, bot: true, ts: now - 3600, content: "🎮 Game Has Started", attachments: [], embeds: [] },
    ],
  };
}

/** The saved thread of a game (any of its ids), or null when there's none. */
export async function loadGameThreadLog(gameIds: string[]): Promise<GameThreadLog | null> {
  if (isSchedulerDemo()) return demoLog();
  const ids = [...new Set(gameIds.filter(Boolean))];
  if (ids.length === 0) return null;
  try {
    const [rows] = await getPool().query<LogRow[]>(
      "SELECT thread_name, messages, archived_at FROM game_thread_logs WHERE game_id IN (?) ORDER BY archived_at DESC LIMIT 1",
      [ids],
    );
    const row = rows[0];
    if (!row) return null;
    return { name: row.thread_name, archived_at: Number(row.archived_at) || 0, messages: clean(row.messages) };
  } catch (error) {
    // Before the first game ends with a thread, the table doesn't exist yet.
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return null;
    throw error;
  }
}
