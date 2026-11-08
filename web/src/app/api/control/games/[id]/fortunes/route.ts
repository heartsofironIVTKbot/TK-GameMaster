import type { RowDataPacket } from "mysql2";
import { isFortunesGame } from "@/lib/casinoSettings";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { DatabaseConfigError, getPool } from "@/lib/db";
import { buildFortunesScript, type FortunesDrawRow } from "@/lib/fortunesScript";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * GET /api/control/games/<game id>/fortunes
 *
 * A Fortunes of War game's cards for the Games page: who drew what, and the
 * on_startup script for the submod (lib/fortunesScript.ts). For the game's
 * host, its co-hosts and Host Management.
 */

interface GameRow extends RowDataPacket {
  host_id: string | null;
  guild_id: string | null;
  game_data: unknown;
}
interface DrawRow extends RowDataPacket {
  user_id: string;
  nation: string | null;
  hoi4_tag: string | null;
  slot_priority: number;
  state: string;
  card: string | null;
  card_name: string | null;
  redraws_used: number;
  max_redraws: number;
}
interface NameRow extends RowDataPacket {
  user_id: string;
  username: string | null;
  display_name: string | null;
}

const json = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const STATES = new Set(["new", "dealt", "pending", "locked"]);

const DEMO_ROWS: FortunesDrawRow[] = [
  { user_id: "1", name: "Otto", nation: "Germany", tag: "GER", priority: 3, state: "locked", card: "fortunes_of_war_blitzkrieg", card_name: "Blitzkrieg", redraws_used: 1, max_redraws: 2 },
  { user_id: "2", name: "Winston", nation: "United Kingdom", tag: "ENG", priority: 3, state: "pending", card: "fortunes_of_war_maritime_heritage", card_name: "Maritime Heritage", redraws_used: 0, max_redraws: 2 },
  { user_id: "3", name: "Pieter", nation: "Netherlands", tag: "HOL", priority: 3, state: "dealt", card: null, card_name: null, redraws_used: 0, max_redraws: 1 },
];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!/^\d{5,25}$/.test(id)) return Response.json({ error: "Invalid game id" }, { status: 400 });
  if (isSchedulerDemo()) return Response.json({ draws: DEMO_ROWS, ...buildFortunesScript(DEMO_ROWS) }, { headers: { "Cache-Control": "no-store" } });
  try {
    const db = getPool();
    const [games] = await db.query<GameRow[]>(
      "SELECT CAST(host_id AS CHAR) AS host_id, CAST(guild_id AS CHAR) AS guild_id, game_data FROM games WHERE thread_id = ? LIMIT 1",
      [id],
    );
    const game = games[0];
    if (!game) return Response.json({ error: "That game no longer exists." }, { status: 404 });
    const data = json(game.game_data);
    if (!isFortunesGame(data)) return Response.json({ error: "This isn't a Fortunes of War game." }, { status: 404 });
    const viewer = status.host;
    const guildId = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
    const coHosts = Array.isArray(data.co_hosts) ? data.co_hosts.map(String) : [];
    const allowed = String(game.host_id ?? "") === viewer.discord_id || coHosts.includes(viewer.discord_id) || (viewer.is_staff && viewer.guild_id === guildId);
    if (!allowed) return Response.json({ error: "Only this game's host, its co-hosts and Host Management can see the cards." }, { status: 403 });

    let rows: DrawRow[] = [];
    try {
      [rows] = await db.query<DrawRow[]>(
        `SELECT CAST(user_id AS CHAR) AS user_id, nation, hoi4_tag, slot_priority, state, card, card_name, redraws_used, max_redraws
           FROM fortunes_draws WHERE game_id = ?`,
        [id],
      );
    } catch (error) {
      // Not set up yet (the bot creates the table): no cards.
      if (!/ER_NO_SUCH_TABLE|doesn't exist/i.test(String((error as Error)?.message ?? error))) throw error;
    }
    const names = new Map<string, string>();
    if (rows.length > 0) {
      const [found] = await db.query<NameRow[]>(
        "SELECT CAST(user_id AS CHAR) AS user_id, username, display_name FROM web_member_directory WHERE guild_id = ? AND user_id IN (?)",
        [guildId, rows.map((row) => row.user_id)],
      );
      for (const row of found) names.set(String(row.user_id), row.display_name || row.username || String(row.user_id));
    }
    const draws: FortunesDrawRow[] = rows.map((row) => ({
      user_id: String(row.user_id),
      name: names.get(String(row.user_id)) ?? String(row.user_id),
      nation: row.nation,
      tag: row.hoi4_tag,
      priority: Number(row.slot_priority) || 0,
      state: (STATES.has(row.state) ? row.state : "new") as FortunesDrawRow["state"],
      card: row.card,
      card_name: row.card_name,
      redraws_used: Number(row.redraws_used) || 0,
      max_redraws: Number(row.max_redraws) || 0,
    }));
    draws.sort((a, b) => Number(Boolean(b.nation)) - Number(Boolean(a.nation)) || a.name.localeCompare(b.name));
    return Response.json({ draws, ...buildFortunesScript(draws) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[control/fortunes] failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
