import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import type { GGConfig } from "./model";

/**
 * Discord profile pictures for an event's people, from web_member_directory
 * (the bot mirrors every member of the servers it's in; the web never talks
 * to Discord). Someone in several servers has several rows: the newest wins.
 * Someone the bot has never seen gets none, and the page falls back to their
 * initial. Cached for ten minutes.
 */

interface AvatarRow extends RowDataPacket {
  user_id: string;
  avatar_url: string | null;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = ((globalThis as { __ggAvatars?: Map<string, { at: number; urls: Record<string, string> }> }).__ggAvatars ??= new Map());

/** Preview mode: Discord's own default pictures, so the demo shows real-looking balls. */
function demoAvatars(ids: string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id, i) => [id, `https://cdn.discordapp.com/embed/avatars/${i % 6}.png`]));
}

export async function avatarsFor(slug: string, config: GGConfig): Promise<Record<string, string>> {
  const ids = config.people.map((person) => person.id).filter((id) => /^\d{15,25}$/.test(id));
  if (isSchedulerDemo()) return demoAvatars(ids);
  const key = `${slug}:${ids.join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.urls;
  const urls: Record<string, string> = {};
  if (ids.length) {
    try {
      const [rows] = await getPool().query<AvatarRow[]>(
        `SELECT CAST(user_id AS CHAR) AS user_id, avatar_url FROM web_member_directory
         WHERE avatar_url IS NOT NULL AND user_id IN (${ids.map(() => "CAST(? AS UNSIGNED)").join(", ")})
         ORDER BY updated_at ASC`,
        ids,
      );
      // Newest last, so it overwrites older rows for the same person.
      for (const row of rows) if (row.avatar_url) urls[row.user_id] = row.avatar_url;
    } catch {
      // No directory (or no database): initials only.
    }
  }
  cache.set(key, { at: Date.now(), urls });
  return urls;
}
