import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { demoHotJoinGame } from "@/lib/gameControlDemo";
import { parseHotJoin, type HotJoinEntry } from "@/lib/hotJoinTypes";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * A game as a player sees it on the website — for hot-join (the map) and
 * crash reports (/crash): is it running, has it ended, and the hot-join
 * requests. Any server's game (the request goes to the game's own server).
 */

export interface PlayerGame {
  /** The bot's key for the game (the announcement post, or an older game's thread). */
  id: string;
  guild_id: string;
  name: string;
  mode: string;
  host_id: string | null;
  started: boolean;
  finished: boolean;
  hotjoin: HotJoinEntry[];
}

interface Row extends RowDataPacket {
  thread_id: string;
  guild_id: string | null;
  mode: string | null;
  status: string | null;
  thread_name: string | null;
  game_started: number | boolean | null;
  host_id: string | null;
  hotjoin: string | null;
  end_done: string | null;
}

export async function loadPlayerGame(gameId: string): Promise<PlayerGame | null> {
  if (!/^\d{5,25}$/.test(gameId)) return null;
  if (isSchedulerDemo()) {
    const demo = demoHotJoinGame(gameId);
    return demo ? { ...demo, guild_id: HOME_GUILD_ID, hotjoin: demo.requests } : null;
  }
  const [rows] = await getPool().query<Row[]>(
    `SELECT thread_id, CAST(guild_id AS CHAR) AS guild_id, mode, status, thread_name, game_started,
            CAST(host_id AS CHAR) AS host_id,
            CAST(JSON_EXTRACT(game_data, '$.hotjoin_requests') AS CHAR) AS hotjoin,
            CAST(JSON_EXTRACT(game_data, '$.game_end_completed_at') AS CHAR) AS end_done
       FROM games
      WHERE thread_id = ?
         OR JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.lobby_thread_id')) = ?
         OR JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.original_thread_id')) = ?
      ORDER BY (thread_id = ?) DESC LIMIT 1`,
    [gameId, gameId, gameId, gameId],
  );
  const row = rows[0];
  if (!row) return null;
  let hotjoin: HotJoinEntry[] = [];
  try {
    hotjoin = parseHotJoin(row.hotjoin ? JSON.parse(row.hotjoin) : null);
  } catch {
    hotjoin = [];
  }
  const status = String(row.status ?? "").toLowerCase();
  return {
    id: String(row.thread_id),
    guild_id: row.guild_id ? String(row.guild_id) : HOME_GUILD_ID,
    name: (row.thread_name || `${row.mode ?? "Game"}`).replace(/\s*Reservations\s*$/i, ""),
    mode: row.mode || "Game",
    host_id: row.host_id,
    started: Boolean(Number(row.game_started)),
    finished: status === "ended" || status === "cancelled" || Boolean(row.end_done && row.end_done !== "null"),
    hotjoin,
  };
}
