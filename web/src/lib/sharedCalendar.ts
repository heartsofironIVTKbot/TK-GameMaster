import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { currentGuildId, hostServersOf } from "@/lib/currentGuild";
import { guildIconUrl } from "@/lib/discordGuilds";
import { listCalendar, isSchedulerDemo, withStarted } from "@/lib/scheduleStore";
import { settingsOf } from "@/lib/serverSettings";
import { currentAddOn } from "@/lib/scheduleOptions";
import type { SharedGame, SharedServer } from "@/lib/scheduleTypes";

/**
 * The Shared Calendar: the games of every server that turned on "Share our
 * calendar with other servers" (server setup, Features), so hosts don't run
 * the same kind of game at the same hour as another community.
 *
 * Only servers that share can see it (a server can't look at everyone's plans
 * without showing its own). Each game carries its day, time, mode and status:
 * never its host, players or nations.
 */

interface SharingServerRow extends RowDataPacket {
  guild_id: string;
  guild_name: string | null;
  icon: string | null;
  community: string | null;
}

interface SharedSlotRow extends RowDataPacket {
  slot_id: string;
  guild_id: string;
  status: string | null;
  mode: string | null;
  game_timestamp: number | string | null;
  announced: number | boolean;
  slot_data: unknown;
}

export async function listSharedCalendar(
  fromSec: number,
  toSec: number,
  viewerId: string,
): Promise<{ sharing: boolean; servers: SharedServer[]; games: SharedGame[] }> {
  const guildId = await currentGuildId();
  if (isSchedulerDemo()) return demoShared(fromSec, toSec, viewerId, guildId);

  const settings = await settingsOf(guildId);
  if (!settings?.features.share_calendar) return { sharing: false, servers: [], games: [] };

  const pool = getPool();
  const [serverRows] = await pool.query<SharingServerRow[]>(
    `SELECT CAST(guild_id AS CHAR) AS guild_id, guild_name, icon,
            JSON_UNQUOTE(JSON_EXTRACT(settings, '$.general.community_name')) AS community
       FROM guild_settings
      WHERE bot_present = 1 AND status = 'active'
        AND JSON_EXTRACT(settings, '$.features.share_calendar') = TRUE`,
  );
  const servers: SharedServer[] = serverRows.map((row) => {
    const id = String(row.guild_id);
    return {
      id,
      name: (row.community && row.community !== "null" ? row.community : row.guild_name) || "Discord server",
      icon_url: guildIconUrl(id, row.icon),
      is_yours: id === guildId,
    };
  });
  // The viewer's own server shares (its settings say so) even if its row is mid-update.
  if (!servers.some((server) => server.is_yours)) {
    servers.push({ id: guildId, name: settings.general.community_name || "Your server", icon_url: null, is_yours: true });
  }

  const [slotRows] = await pool.query<SharedSlotRow[]>(
    `SELECT slot_id, CAST(guild_id AS CHAR) AS guild_id, status, mode, game_timestamp, announced, slot_data
       FROM schedule_slots
      WHERE guild_id IN (?) AND game_timestamp BETWEEN ? AND ?
      ORDER BY game_timestamp`,
    [servers.map((server) => server.id), fromSec, toSec],
  );
  const games = await withStarted(
    slotRows.map((row) => {
      const data = parseJson(row.slot_data);
      const thread = String(data.thread_id ?? "");
      return {
        id: String(row.slot_id),
        guild_id: String(row.guild_id),
        mode: row.mode ?? String(data.mode ?? "Unknown"),
        game_timestamp: Number(row.game_timestamp ?? data.game_timestamp ?? 0),
        status: row.status ?? (typeof data.status === "string" ? data.status : null),
        announced: Boolean(row.announced) || Boolean(data.announced),
        started: false,
        add_on: currentAddOn(typeof data.add_on === "string" ? data.add_on : null),
        thread_id: /^\d{5,25}$/.test(thread) ? thread : null,
      };
    }),
  );
  // The reservation thread only found `started`; it stays private.
  const shared: SharedGame[] = games.map((game) => ({
    id: game.id,
    guild_id: game.guild_id,
    mode: game.mode,
    game_timestamp: game.game_timestamp,
    status: game.status,
    announced: game.announced,
    started: game.started,
    add_on: game.add_on,
  }));
  return { sharing: true, servers: sortServers(servers), games: shared };
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sortServers(servers: SharedServer[]): SharedServer[] {
  return servers.sort((a, b) => Number(b.is_yours) - Number(a.is_yours) || a.name.localeCompare(b.name));
}

// --- Preview mode -------------------------------------------------------------

/** Made-up communities that share, so the preview has something to compare with. */
const DEMO_OTHERS: { id: string; name: string; games: [number, number, number, string, string, string | null][] }[] = [
  // [days from today, hour UTC, minute, mode, status, add-on]
  {
    id: "810000000000000001",
    name: "Iron Front",
    games: [
      [-1, 16, 0, "Historical (Vanilla)", "ended", null],
      [2, 17, 30, "Historical (Vanilla)", "announced", null],
      [4, 15, 0, "Kaiserreich (FFA)", "scheduled", "zombies"],
    ],
  },
  {
    id: "810000000000000002",
    name: "Red Dawn",
    games: [
      [0, 14, 0, "Roleplay", "live", null],
      [1, 18, 30, "Roleplay", "announced", null],
      [4, 17, 0, "Roleplay (Millennium Dawn)", "cancelled", null],
    ],
  },
  {
    id: "810000000000000003",
    name: "Ostfront Community",
    games: [
      [-1, 18, 0, "Historical (Horst)", "ended", null],
      [3, 14, 0, "Historical (Oak)", "scheduled", null],
      [5, 12, 0, "Historical (Vanilla)", "scheduled", null],
    ],
  },
];

async function demoShared(fromSec: number, toSec: number, viewerId: string, guildId: string) {
  const own = await listCalendar(fromSec, toSec, viewerId);
  const yours: SharedServer = {
    id: guildId,
    name: (await hostServersOf("demo")).find((server) => server.id === guildId)?.name ?? "Your server",
    icon_url: null,
    is_yours: true,
  };
  const games: SharedGame[] = own.slots.map((slot) => ({
    id: slot.slot_id,
    guild_id: guildId,
    mode: slot.mode,
    game_timestamp: slot.game_timestamp,
    status: slot.status,
    announced: slot.announced,
    started: slot.started,
    add_on: slot.add_on,
  }));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (const server of DEMO_OTHERS) {
    server.games.forEach(([days, hour, minute, mode, status, addOn], index) => {
      const ts = Math.floor(today.getTime() / 1000) + days * 86_400 + hour * 3600 + minute * 60;
      if (ts < fromSec || ts > toSec) return;
      games.push({
        id: `${server.id}-${index}`,
        guild_id: server.id,
        mode,
        game_timestamp: ts,
        status: status === "live" ? "announced" : status,
        announced: status !== "scheduled",
        started: status === "live",
        add_on: addOn,
      });
    });
  }
  const servers = [yours, ...DEMO_OTHERS.map((server) => ({ id: server.id, name: server.name, icon_url: null, is_yours: false }))];
  return { sharing: true, servers: sortServers(servers), games: games.sort((a, b) => a.game_timestamp - b.game_timestamp) };
}
