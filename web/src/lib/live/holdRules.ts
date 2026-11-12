import type { RowDataPacket } from "mysql2";
import { botNationName } from "@/lib/botNation";
import { getPool } from "@/lib/db";
import { mapAccessFor } from "@/lib/mapAccess";
import { moderationOptions } from "@/lib/playerIndex";
import { gameClosedRefusal, nationRefusal, parseGameData, type RuleGame } from "@/lib/reserveRules";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import tagToSlotJson from "@/lib/tag_to_slot.json";

/**
 * May this player hold this nation on the map (POST /api/live/select): only
 * if they could reserve it — the reserve route's own rules (lib/reserveRules.ts).
 * A player without Trusted could otherwise hold a major for 30 s and keep
 * everyone else off it (2026-11-12).
 *
 * Picks come often (every click, a keepalive every 15 s), so each answer is
 * kept for a few seconds per player and nation.
 */

const tagToSlot = tagToSlotJson as Record<string, string>;
const CACHE_MS = 8_000;
const MAX_CACHE = 5_000;

interface GameRow extends RowDataPacket, RuleGame {
  game_data: unknown;
}

const answers = new Map<string, { refusal: string | null; until: number }>();

async function check(threadId: string, userId: string, tag: string): Promise<string | null> {
  const [rows] = await getPool().query<GameRow[]>(
    "SELECT CAST(guild_id AS CHAR) AS guild_id, mode, status, game_started, start_timestamp, game_data FROM games WHERE thread_id = ?",
    [threadId],
  );
  const game = rows[0];
  if (!game) return "Game not found";
  const access = await mapAccessFor(game.guild_id ?? null);
  if (!access.ok) return access.message;
  const gameData = parseGameData(game.game_data);
  const closed = gameClosedRefusal(game, gameData);
  if (closed) return closed.message;
  const options = await moderationOptions(game.guild_id ?? undefined).catch(() => null);
  const lists = options?.mode_nations?.[String(game.mode ?? "")];
  const slot = botNationName(lists, tag, tagToSlot[tag] ?? tag);
  const refusal = await nationRefusal(getPool(), {
    game,
    gameData,
    slot,
    mapTag: tag,
    userId,
    modeMajors: lists?.majors ?? null,
  });
  return refusal?.message ?? null;
}

/** Why this player can't hold this nation, or null when they may. */
export async function holdRefusal(threadId: string, userId: string, tag: string): Promise<string | null> {
  if (isSchedulerDemo()) return null;
  const key = `${threadId}:${userId}:${tag}`;
  const now = Date.now();
  const kept = answers.get(key);
  if (kept && kept.until > now) return kept.refusal;
  const refusal = await check(threadId, userId, tag);
  if (answers.size >= MAX_CACHE) {
    for (const [entry, value] of answers) if (value.until <= now) answers.delete(entry);
    if (answers.size >= MAX_CACHE) answers.clear();
  }
  answers.set(key, { refusal, until: now + CACHE_MS });
  return refusal;
}
