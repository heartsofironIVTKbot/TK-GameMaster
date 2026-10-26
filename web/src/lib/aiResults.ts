import type { RowDataPacket } from "mysql2";
import type { AiStatus, ProfileAiResult } from "@/lib/aiAnalysisTypes";
import { demoControlRaw } from "@/lib/gameControlDemo";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * A player's AI chat-log results (their own profile — /info): the bot's
 * verdict for their recent analyzed games on one server, and whether a host
 * has given it yet. No staff names.
 */

const KEEP = 10;
const STATUSES: AiStatus[] = ["rewarded", "minimal", "no_rp", "toxic", "ungraded"];

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function parse(text: unknown): unknown {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resultFor(
  userId: string,
  game: { id: string; name: string | null; mode: string | null; ts: number },
  analysisRaw: unknown,
  givenRaw: unknown,
): ProfileAiResult | null {
  const analysis = obj(parse(analysisRaw));
  const players = Array.isArray(analysis.players) ? analysis.players.map(obj) : [];
  const mine = players.find((player) => String(player.user_id ?? "") === userId);
  if (!mine) return null;
  const reward = obj(mine.reward);
  return {
    game_id: game.id,
    game_name: (game.name || game.mode || "Game").replace(/\s*Reservations\s*$/i, ""),
    mode: game.mode || "Game",
    ts: game.ts || num(analysis.at),
    nation: String(mine.nation ?? ""),
    words: num(mine.words),
    meaningful_words: num(mine.meaningful_words),
    creativity: num(mine.creativity),
    reward: { commends: num(reward.commends), merit: num(reward.merit), why: String(reward.why ?? "") },
    status: STATUSES.find((status) => status === mine.status) ?? "minimal",
    summary: String(mine.summary ?? ""),
    given: Boolean(obj(obj(parse(givenRaw))[userId]).kind),
  };
}

export async function aiResultsFor(userId: string, guildId: string): Promise<ProfileAiResult[]> {
  if (isSchedulerDemo()) {
    // The sample games belong to the home server.
    if (guildId !== HOME_GUILD_ID) return [];
    return demoControlRaw()
      .map((raw) =>
        resultFor(
          userId,
          { id: raw.storage_key, name: raw.thread_name, mode: raw.mode, ts: num(raw.start_timestamp) },
          raw.data.ai_analysis,
          raw.data.ai_rewards_given,
        ),
      )
      .filter((entry): entry is ProfileAiResult => entry !== null)
      .slice(0, KEEP);
  }
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT g.thread_id, g.mode, g.thread_name, g.start_timestamp,
              CAST(JSON_EXTRACT(g.game_data, '$.ai_analysis') AS CHAR) AS ai,
              CAST(JSON_EXTRACT(g.game_data, '$.ai_rewards_given') AS CHAR) AS given
         FROM games g
        WHERE g.guild_id = ? AND JSON_EXTRACT(g.game_data, '$.ai_analysis.at') IS NOT NULL
          AND g.thread_id IN (SELECT thread_id FROM game_reservations WHERE user_id = CAST(? AS UNSIGNED))
        ORDER BY g.start_timestamp DESC LIMIT ${KEEP}`,
      [guildId, userId],
    );
    return rows
      .map((row) =>
        resultFor(
          userId,
          { id: String(row.thread_id), name: row.thread_name ?? null, mode: row.mode ?? null, ts: num(row.start_timestamp) },
          row.ai,
          row.given,
        ),
      )
      .filter((entry): entry is ProfileAiResult => entry !== null);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") return [];
    throw error;
  }
}
