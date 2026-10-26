import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, isHomeGuild } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { buildLobbyDraft, type LobbyDraft } from "@/lib/draft";
import { lookupMembers } from "@/lib/memberDirectory";
import { moderationOptions } from "@/lib/playerIndex";
import { parsePresetData } from "@/lib/presetValidation";
import type { DirectoryMember } from "@/lib/scheduleTypes";
import { sharedCache } from "@/lib/ttlCache";
import type { LobbyReservation } from "@/lib/types";

/**
 * Lobby state for the live map (GET /api/reserve), built for many viewers
 * (scale plan, Phase 0):
 *
 *  1. `lobbyVersion` — a fingerprint from ONE cheap primary-key read of the
 *     games row: reservations_rev (bumped by every reservation write, web and
 *     bot), status, host, lock state. Viewers send the version they hold and
 *     get "unchanged" without any further queries. The version also rolls
 *     over every REFRESH_BUCKET_MS, so name/avatar edits (and any write that
 *     forgot to bump the rev) still reach everyone within a minute.
 *  2. `lobbySnapshot` — the full payload (reservations + player names), built
 *     once per version and shared by every viewer of that lobby. Names,
 *     badges and nation lists come from the game's own server (multi-server),
 *     never the viewer's.
 */

export interface LobbyGame {
  thread_id: string;
  mode: string | null;
  status: string | null;
  game_started: number | boolean;
  host_id: string | null;
  thread_name: string | null;
  lockdown: boolean;
  locked_regions: string[];
  /** A preset's own nation groups (null = the mode's usual grouping). */
  nation_layout: { name: string; tiers: { label: string | null; nations: string[] }[] }[] | null;
  /** Nations the preset leaves out (not playable). */
  layout_disabled_nations: string[];
  /** Draft games: teams, turn and the shared pool (no notes). */
  draft: LobbyDraft | null;
}

export interface LobbySnapshot {
  game: LobbyGame | null;
  reservations: LobbyReservation[];
}

/** How long one version check is reused (collapses polling bursts). */
const VERSION_TTL_MS = 1_000;
/** Snapshots are keyed by version, so this only bounds memory. */
const SNAPSHOT_TTL_MS = 60_000;
/** Forced refresh window for data the rev doesn't track (names, avatars). */
const REFRESH_BUCKET_MS = 60_000;

const versions = sharedCache<string>("lobby-version", VERSION_TTL_MS);
const snapshots = sharedCache<LobbySnapshot>("lobby-snapshot", SNAPSHOT_TTL_MS, 200);

interface VersionRow extends RowDataPacket {
  reservations_rev: number | null;
  status: string | null;
  game_started: number | boolean | null;
  mode: string | null;
  host_id: string | null;
  thread_name: string | null;
  lockdown: string | null;
  locked_regions: string | null;
  draft: string | null;
}

function fingerprint(parts: unknown[]): string {
  return crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

/** Version for any JSON-able payload (preview mode). */
export function versionOf(payload: unknown): string {
  return fingerprint([payload]);
}

/** Current version of a lobby (cached for VERSION_TTL_MS). */
export function lobbyVersion(threadId: string): Promise<string> {
  return versions.get(threadId, async () => {
    const [rows] = await getPool().query<VersionRow[]>(
      `SELECT reservations_rev, status, game_started, mode, CAST(host_id AS CHAR) AS host_id, thread_name,
              CAST(JSON_EXTRACT(game_data, '$.lockdown') AS CHAR) AS lockdown,
              CAST(JSON_EXTRACT(game_data, '$.locked_regions') AS CHAR) AS locked_regions,
              CAST(JSON_EXTRACT(game_data, '$.draft') AS CHAR) AS draft
       FROM games WHERE thread_id = ?`,
      [threadId],
    );
    const row = rows[0];
    const bucket = Math.floor(Date.now() / REFRESH_BUCKET_MS);
    return fingerprint(
      row
        ? [row.reservations_rev, row.status, row.game_started, row.mode, row.host_id, row.thread_name, row.lockdown, row.locked_regions, row.draft, bucket]
        : ["missing", bucket],
    );
  });
}

/** Forget a lobby's cached version after a write made by this server. */
export function invalidateLobby(threadId: string): void {
  versions.delete(threadId);
}

/** Full lobby payload for a version (built once, shared by all viewers). */
export function lobbySnapshot(threadId: string, version: string): Promise<LobbySnapshot> {
  return snapshots.get(`${threadId}:${version}`, () => buildSnapshot(threadId));
}

interface GameRow extends RowDataPacket {
  thread_id: string;
  guild_id: string | null;
  mode: string | null;
  status: string | null;
  game_started: number | boolean;
  host_id: string | null;
  thread_name: string | null;
  game_data: unknown;
}

interface SlotRow extends RowDataPacket {
  slot_key: string;
  user_id: string;
  rerolls_used: number;
}

interface PlayerRow extends RowDataPacket {
  discord_id: string;
  ingame_nickname: string | null;
  hoi4_verified: number | boolean;
  hoi4_host_tier: string | null;
}

function parseGameData(raw: unknown): {
  lockdown?: unknown;
  locked_regions?: unknown;
  nation_layout?: unknown;
  layout_disabled_nations?: unknown;
  is_draft?: unknown;
  draft?: unknown;
} {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) ?? {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

/** Roster badges: nickname (users, every server) + verified / host tier (the
 *  game's server's records). */
async function playerBadges(userIds: string[], guildId: string): Promise<Map<string, PlayerRow>> {
  const pool = getPool();
  const players = new Map<string, PlayerRow>();
  if (userIds.length === 0) return players;
  const [rows] = await pool.query<PlayerRow[]>(
    `SELECT discord_id, ingame_nickname, hoi4_verified, hoi4_host_tier
     FROM users WHERE discord_id IN (?)`,
    [userIds],
  );
  for (const row of rows) {
    players.set(String(row.discord_id), isHomeGuild(guildId) ? row : ({ ...row, hoi4_verified: 0, hoi4_host_tier: null } as PlayerRow));
  }
  if (!isHomeGuild(guildId)) {
    const [records] = await pool.query<PlayerRow[]>(
      `SELECT discord_id, hoi4_verified, hoi4_host_tier FROM guild_users WHERE guild_id = ? AND discord_id IN (?)`,
      [guildId, userIds],
    );
    for (const row of records) {
      const id = String(row.discord_id);
      const known = players.get(id);
      players.set(id, { ...row, ingame_nickname: known?.ingame_nickname ?? null } as PlayerRow);
    }
  }
  return players;
}

async function buildSnapshot(threadId: string): Promise<LobbySnapshot> {
  const pool = getPool();
  const [[gameRows], [slotRows]] = await Promise.all([
    pool.query<GameRow[]>(
      `SELECT thread_id, CAST(guild_id AS CHAR) AS guild_id, mode, status, game_started,
              CAST(host_id AS CHAR) AS host_id, thread_name, game_data
       FROM games WHERE thread_id = ?`,
      [threadId],
    ),
    pool.query<SlotRow[]>(
      // Snowflakes exceed 2^53: read them as text so they stay exact.
      `SELECT slot_key, CAST(user_id AS CHAR) AS user_id, rerolls_used
       FROM game_reservations WHERE thread_id = ? ORDER BY slot_key`,
      [threadId],
    ),
  ]);

  // Player metadata for the roster tags + popover badges. Best-effort:
  // when the `ingame_nickname` migration hasn't run yet the query fails —
  // reservations must never 503 over a badge.
  const userIds = [...new Set(slotRows.map((row) => String(row.user_id)))];
  const guildId = gameRows[0]?.guild_id ? String(gameRows[0].guild_id) : HOME_GUILD_ID;
  const [players, directory] = await Promise.all([
    playerBadges(userIds, guildId).catch((error: unknown) => {
      console.error("[reserve] player metadata lookup failed (run the ingame_nickname migration):", error);
      return new Map<string, PlayerRow>();
    }),
    // Discord names/avatars from the bot-mirrored member directory.
    lookupMembers(userIds, guildId),
  ]);

  const reservations: LobbyReservation[] = slotRows.map((row) => {
    const player = players.get(String(row.user_id));
    const member = directory.get(String(row.user_id));
    return {
      slot_key: row.slot_key,
      user_id: row.user_id,
      rerolls_used: row.rerolls_used,
      ingame_nickname: player?.ingame_nickname ?? null,
      hoi4_verified: player ? Boolean(player.hoi4_verified) : null,
      host_tier: player?.hoi4_host_tier ?? null,
      username: member?.username ?? null,
      display_name: member?.display_name ?? null,
      avatar_url: member?.avatar_url ?? null,
    };
  });

  const gameRow = gameRows[0] ?? null;
  const gameData = parseGameData(gameRow?.game_data);
  const draft = gameRow && gameData.is_draft ? await snapshotDraft(gameData, gameRow.mode, guildId) : null;
  return {
    game: gameRow
      ? {
          thread_id: gameRow.thread_id,
          mode: gameRow.mode,
          status: gameRow.status,
          game_started: gameRow.game_started,
          host_id: gameRow.host_id ?? null,
          thread_name: gameRow.thread_name ?? null,
          // Host lock state (the Reservation Board's Locked Nations section):
          // `locked_regions` lists disabled nation names or whole
          // categories; `lockdown` freezes all claims.
          lockdown: Boolean(gameData.lockdown),
          locked_regions: Array.isArray(gameData.locked_regions) ? gameData.locked_regions.map(String) : [],
          // Preset games: the roster follows the preset's groups and leaves
          // its not-playable nations out (set once, at the announcement).
          nation_layout: parsePresetData({ layout: gameData.nation_layout ?? null }).layout?.map((group) => ({
            name: group.name,
            tiers: group.tiers.map((tier) => ({ label: tier.label, nations: tier.nations })),
          })) ?? null,
          layout_disabled_nations: Array.isArray(gameData.layout_disabled_nations)
            ? gameData.layout_disabled_nations.map(String)
            : [],
          draft,
        }
      : null,
    reservations,
  };
}

/** A draft game's public state: teams, turn, the pool (names, no notes). */
async function snapshotDraft(
  gameData: Record<string, unknown>,
  mode: string | null,
  guildId: string,
): Promise<LobbyDraft | null> {
  const draftData = (typeof gameData.draft === "object" && gameData.draft !== null ? gameData.draft : {}) as Record<string, unknown>;
  const teams = Array.isArray(draftData.teams) ? draftData.teams : [];
  const ids = [
    ...Object.keys((draftData.pool as Record<string, unknown> | undefined) ?? {}),
    ...teams.map((team) => String((team as Record<string, unknown>).captain_id ?? "")),
  ].filter(Boolean);
  const [directory, options] = await Promise.all([
    lookupMembers(ids, guildId).catch(() => new Map<string, DirectoryMember>()),
    moderationOptions(guildId).catch(() => null),
  ]);
  const hidden = new Set(Array.isArray(gameData.layout_disabled_nations) ? gameData.layout_disabled_nations.map(String) : []);
  const lists = options?.mode_nations?.[mode ?? ""];
  return buildLobbyDraft(
    gameData,
    (id) => {
      const member = directory.get(id);
      return {
        name: member ? member.ingame_nickname || member.display_name || member.username : null,
        avatar_url: member?.avatar_url ?? null,
      };
    },
    lists
      ? { majors: lists.majors.filter((name) => !hidden.has(name)), minors: lists.minors.filter((name) => !hidden.has(name)) }
      : null,
  );
}
