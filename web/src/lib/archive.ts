import type { RowDataPacket } from "mysql2";
import { canonicalName } from "@/data/nationCategories";
import tagToSlotJson from "@/lib/tag_to_slot.json";
import { demoArchiveGames } from "@/lib/archiveDemo";
import {
  EMPTY_MARKS,
  RATING_WINDOW_SEC,
  type ArchiveCounts,
  type ArchiveGameCard,
  type ArchiveGameDetail,
  type ArchiveListResponse,
  type ArchiveMarks,
  type ArchivePresence,
  type ArchiveRating,
  type ArchiveRow,
  type ArchiveSection,
  type ArchiveServer,
  type ArchiveSort,
  type ArchiveStatus,
  type ArchiveTab,
} from "@/lib/archiveTypes";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { lookupMembers } from "@/lib/memberDirectory";
import { searchTerms } from "@/lib/rpArchiveTypes";
import { categoryOfMode } from "@/lib/scheduleOptions";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { TtlCache } from "@/lib/ttlCache";

/**
 * The public game archive (docs/game-archive.md). Reads the games table only:
 * no Discord calls. Public, so names and avatars only (no Discord IDs), and
 * ratings only as totals (never who gave what).
 */

const MAX_GAMES = 2000;
const PAGE = 30;

/** One game as the bot stores it (the fields the archive needs). */
export interface RawArchiveGame {
  id: string;
  keys: string[];
  guild_id: string;
  mode: string;
  name: string;
  ts: number;
  host_id: string | null;
  /** The games table's status: active, ended or cancelled. */
  status: string;
  started: boolean;
  start_initiated_at: number;
  start_failed_at: number;
  started_at: number;
  ended_at: number;
  reservations: Record<string, string>;
  present_ids: string[];
  dropped_out: string[];
  late_join: string[];
  /** game_action_counts plus the legacy per-action fields. */
  data: Record<string, unknown>;
  ratings: Record<string, number>;
  eligible: string[] | null;
  hosting_evaluated: boolean;
  /** The bot's archive layout: [category, [[sub or null, [nations]]]]. */
  layout: unknown;
  /** A preset game's own nation groups. */
  preset_layout: unknown;
  graded: boolean;
  /** Who the latest attendance sample counted (a running game). */
  sample_present: string[] | null;
}

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []);

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanGameName(name: string, mode: string): string {
  return (name || mode || "Game").replace(/\s*Reservations\s*$/i, "").trim() || mode || "Game";
}

// ---- Loading ------------------------------------------------------------------------

interface GameRow extends RowDataPacket {
  thread_id: string;
  mode: string | null;
  thread_name: string | null;
  start_timestamp: number | null;
  host_id: string | null;
  guild_id: string | null;
  status: string | null;
  game_started: number | null;
  data: string | null;
}

/** Only the fields the archive reads (game_data can be large). */
const GAME_SELECT = `SELECT g.thread_id, g.mode, g.thread_name, g.start_timestamp, CAST(g.host_id AS CHAR) AS host_id,
    CAST(g.guild_id AS CHAR) AS guild_id, g.status, g.game_started,
    CAST(JSON_OBJECT(
      'lobby', JSON_EXTRACT(g.game_data, '$.lobby_thread_id'),
      'original', JSON_EXTRACT(g.game_data, '$.original_thread_id'),
      'reservations', JSON_EXTRACT(g.game_data, '$.reservations'),
      'present_ids', JSON_EXTRACT(g.game_data, '$.present_ids'),
      'dropped_out', JSON_EXTRACT(g.game_data, '$.dropped_out'),
      'late_join', JSON_EXTRACT(g.game_data, '$.late_join_nations'),
      'game_action_counts', JSON_EXTRACT(g.game_data, '$.game_action_counts'),
      'game_commends', JSON_EXTRACT(g.game_data, '$.game_commends'),
      'game_merits', JSON_EXTRACT(g.game_data, '$.game_merits'),
      'game_warns', JSON_EXTRACT(g.game_data, '$.game_warns'),
      'applied_warns', JSON_EXTRACT(g.game_data, '$.applied_warns'),
      'game_dishonored', JSON_EXTRACT(g.game_data, '$.game_dishonored'),
      'game_bans', JSON_EXTRACT(g.game_data, '$.game_bans'),
      'ratings', JSON_EXTRACT(g.game_data, '$.feedback_ratings'),
      'eligible', JSON_EXTRACT(g.game_data, '$.feedback_eligible'),
      'hosting_evaluated', JSON_EXTRACT(g.game_data, '$.hosting_evaluated'),
      'start_initiated_at', JSON_EXTRACT(g.game_data, '$.game_start_started_at'),
      'start_failed_at', JSON_EXTRACT(g.game_data, '$.game_start_failed_at'),
      'started_at', JSON_EXTRACT(g.game_data, '$.game_started_at'),
      'started', JSON_EXTRACT(g.game_data, '$.game_started'),
      'ended_at', JSON_EXTRACT(g.game_data, '$.ended_at'),
      'layout', JSON_EXTRACT(g.game_data, '$.archive_layout'),
      'preset_layout', JSON_EXTRACT(g.game_data, '$.nation_layout'),
      'graded', JSON_EXTRACT(g.game_data, '$.ai_analysis.at'),
      'samples', JSON_EXTRACT(g.game_data, '$.presence_snapshots[last].present_ids')
    ) AS CHAR) AS data
  FROM games g`;

/** Started games, plus ended and cancelled ones (scheduled games aren't in the archive yet). */
const GAME_WHERE = `(g.status IN ('ended', 'cancelled') OR g.game_started = 1
    OR JSON_EXTRACT(g.game_data, '$.game_start_started_at') IS NOT NULL)`;

export function rawFromData(row: {
  thread_id: string;
  mode: string | null;
  thread_name: string | null;
  start_timestamp: number | null;
  host_id: string | null;
  guild_id: string | null;
  status: string | null;
  game_started?: number | boolean | null;
  data: Record<string, unknown>;
}): RawArchiveGame {
  const data = row.data;
  const id = String(row.thread_id);
  const keys = [id, data.lobby, data.original].map((key) => (key == null ? "" : String(key))).filter((key) => key && key !== "null");
  const reservations: Record<string, string> = {};
  for (const [slot, user] of Object.entries(obj(data.reservations))) {
    if (user != null && String(user).trim()) reservations[slot] = String(user);
  }
  const ratings: Record<string, number> = {};
  for (const [user, stars] of Object.entries(obj(data.ratings))) {
    const value = Math.round(num(stars));
    if (value >= 1 && value <= 5) ratings[user] = value;
  }
  return {
    id,
    keys: [...new Set(keys)],
    guild_id: row.guild_id ?? HOME_GUILD_ID,
    mode: row.mode ?? "Game",
    name: cleanGameName(row.thread_name ?? "", row.mode ?? ""),
    ts: num(row.start_timestamp),
    host_id: row.host_id && row.host_id !== "0" ? row.host_id : null,
    status: row.status ?? "active",
    started: Boolean(row.game_started) || data.started === true,
    start_initiated_at: num(data.start_initiated_at),
    start_failed_at: num(data.start_failed_at),
    started_at: num(data.started_at),
    ended_at: num(data.ended_at),
    reservations,
    present_ids: ids(data.present_ids),
    dropped_out: ids(data.dropped_out),
    late_join: ids(data.late_join),
    data,
    ratings,
    eligible: Array.isArray(data.eligible) ? ids(data.eligible) : null,
    hosting_evaluated: data.hosting_evaluated === true,
    layout: data.layout ?? null,
    preset_layout: data.preset_layout ?? null,
    graded: data.graded != null,
    sample_present: Array.isArray(data.samples) ? ids(data.samples) : null,
  };
}

function fromRow(row: GameRow): RawArchiveGame {
  return rawFromData({ ...row, data: obj(parseJson(row.data)) });
}

async function loadRawGames(): Promise<RawArchiveGame[]> {
  if (isSchedulerDemo()) return demoArchiveGames();
  try {
    const [rows] = await getPool().query<GameRow[]>(
      `${GAME_SELECT} WHERE ${GAME_WHERE} ORDER BY COALESCE(g.start_timestamp, 0) DESC LIMIT ${MAX_GAMES}`,
    );
    return rows.map(fromRow);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") return [];
    throw error;
  }
}

export async function loadRawArchiveGame(id: string): Promise<RawArchiveGame | null> {
  if (isSchedulerDemo()) return demoArchiveGames().find((game) => game.keys.includes(id)) ?? null;
  const [rows] = await getPool().query<GameRow[]>(
    `${GAME_SELECT} WHERE ${GAME_WHERE}
      AND (g.thread_id = ? OR JSON_UNQUOTE(JSON_EXTRACT(g.game_data, '$.lobby_thread_id')) = ?
        OR JSON_UNQUOTE(JSON_EXTRACT(g.game_data, '$.original_thread_id')) = ?)
      LIMIT 1`,
    [id, id, id],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

interface ServerRow extends RowDataPacket {
  guild_id: string;
  guild_name: string | null;
  icon: string | null;
  community: string | null;
}

interface ServerInfo extends ArchiveServer {
  icon_url: string | null;
}

async function loadServers(guildIds: string[]): Promise<Map<string, ServerInfo>> {
  const unique = [...new Set(guildIds)].filter(Boolean);
  const fallback = (id: string): ServerInfo => ({ id, name: "Discord server", icon_url: null });
  if (unique.length === 0) return new Map();
  if (isSchedulerDemo()) return new Map(unique.map((id) => [id, { id, name: "TommyKay's HOI4 Community", icon_url: null }]));
  try {
    const [rows] = await getPool().query<ServerRow[]>(
      `SELECT guild_id, guild_name, icon,
              JSON_UNQUOTE(JSON_EXTRACT(settings, '$.general.community_name')) AS community
         FROM guild_settings WHERE guild_id IN (?)`,
      [unique],
    );
    const found = new Map(
      rows.map((row) => [
        String(row.guild_id),
        {
          id: String(row.guild_id),
          name: (row.community && row.community !== "null" ? row.community : row.guild_name) || "Discord server",
          icon_url: row.icon ? `https://cdn.discordapp.com/icons/${row.guild_id}/${row.icon}.png?size=64` : null,
        },
      ]),
    );
    return new Map(unique.map((id) => [id, found.get(id) ?? fallback(id)]));
  } catch {
    return new Map(unique.map((id) => [id, fallback(id)]));
  }
}

type NameMap = Map<string, { name: string | null; avatar_url: string | null }>;

/** Display names and avatars, per server (the member directory is per server). */
async function loadNames(games: RawArchiveGame[]): Promise<NameMap> {
  const byGuild = new Map<string, Set<string>>();
  for (const game of games) {
    const wanted = byGuild.get(game.guild_id) ?? new Set<string>();
    if (game.host_id) wanted.add(game.host_id);
    for (const user of Object.values(game.reservations)) wanted.add(user);
    byGuild.set(game.guild_id, wanted);
  }
  const out: NameMap = new Map();
  await Promise.all(
    [...byGuild.entries()].map(async ([guildId, wanted]) => {
      const members = await lookupMembers([...wanted], guildId).catch(() => new Map());
      for (const [id, member] of members) {
        out.set(`${guildId}:${id}`, {
          name: member.ingame_nickname || member.display_name || member.username || null,
          avatar_url: member.avatar_url ?? null,
        });
      }
    }),
  );
  return out;
}

// ---- Shaping ---------------------------------------------------------------------------

/** The game's state for the archive and the live post. */
export function statusOf(game: RawArchiveGame): ArchiveStatus {
  if (game.status === "cancelled") return "cancelled";
  if (game.status === "ended") return "ended";
  if (game.started) return "ongoing";
  return "starting";
}

/** Cancelled before anyone started it: not a game the archive keeps. */
function isArchived(game: RawArchiveGame): boolean {
  if (game.status === "cancelled") return game.started || game.started_at > 0;
  return game.status === "ended" || game.started || game.start_initiated_at > 0;
}

/** The host's /give count for one action (bot.py.py _stored_game_action_amount). */
function actionAmount(game: RawArchiveGame, user: string, action: keyof typeof LEGACY): number {
  const counts = obj(obj(game.data.game_action_counts)[user]);
  if (action in counts) return Math.max(0, Math.round(num(counts[action])));
  if (action === "warn") {
    const applied = obj(game.data.applied_warns)[user];
    if (applied != null) return Math.max(0, Math.round(num(applied)));
  }
  const legacy = game.data[LEGACY[action]];
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) return Math.max(0, Math.round(num(obj(legacy)[user])));
  if (Array.isArray(legacy)) return legacy.filter((entry) => String(entry) === user).length;
  return 0;
}

const LEGACY = {
  commend: "game_commends",
  merit: "game_merits",
  warn: "game_warns",
  dishonored: "game_dishonored",
  ban: "game_bans",
} as const;

/** Rating Merit (for rating the game) isn't a host reward, and would show who rated: left out. */
function marksOf(game: RawArchiveGame, user: string): ArchiveMarks {
  return {
    commend: actionAmount(game, user, "commend"),
    merit: actionAmount(game, user, "merit"),
    warn: actionAmount(game, user, "warn"),
    dishonored: Math.min(1, actionAmount(game, user, "dishonored")),
    ban: Math.min(1, actionAmount(game, user, "ban")),
  };
}

function presenceOf(game: RawArchiveGame, slot: string, user: string, status: ArchiveStatus): ArchivePresence {
  if (status === "cancelled") return "none";
  if (game.dropped_out.includes(user)) return "told_host";
  if (game.late_join.includes(slot)) return "late";
  // A running game: in the latest attendance sample, or not counted yet.
  if (status !== "ended") return game.sample_present?.includes(user) ? "played" : "pending";
  return game.present_ids.includes(user) ? "played" : "no_show";
}

export function ratingOf(game: RawArchiveGame, now = Math.floor(Date.now() / 1000)): ArchiveRating {
  const values = Object.values(game.ratings);
  const spread: ArchiveRating["spread"] = [0, 0, 0, 0, 0];
  for (const stars of values) spread[5 - stars] += 1;
  const closesAt = game.ended_at ? game.ended_at + RATING_WINDOW_SEC : null;
  const open = game.status === "ended" && !game.hosting_evaluated && closesAt !== null && now < closesAt;
  return {
    average: values.length ? values.reduce((sum, stars) => sum + stars, 0) / values.length : null,
    count: values.length,
    spread,
    open,
    closes_at: open ? closesAt : null,
  };
}

/** A filler slot ("_FILL_…"), not a nation. */
const isFiller = (slot: string) => slot.startsWith("_FILL_");

/** "Germany_coop", "Germany_coop_2" → "Germany". */
function baseNation(slot: string): string {
  return slot.replace(/_coop(_\d+)?$/, "");
}

const tagByName = (() => {
  const map = new Map<string, string>();
  for (const [tag, slot] of Object.entries(tagToSlotJson as Record<string, string>)) {
    const key = canonicalName(slot);
    if (!map.has(key)) map.set(key, tag);
  }
  return map;
})();

function tagOf(nation: string): string | null {
  return tagByName.get(canonicalName(nation)) ?? null;
}

/** The game's sections, in the reservation board's order: [title, nations]. */
function layoutOf(game: RawArchiveGame): [string, string[]][] {
  // The bot's own layout, saved when the game started (or backfilled).
  if (Array.isArray(game.layout)) {
    const out: [string, string[]][] = [];
    for (const entry of game.layout) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const nations = (Array.isArray(entry[1]) ? entry[1] : []).flatMap((sub: unknown) =>
        Array.isArray(sub) && Array.isArray(sub[1]) ? sub[1].map(String) : [],
      );
      if (nations.length) out.push([entry[0], nations]);
    }
    if (out.length) return out;
  }
  // A preset game's groups (older games without a saved layout).
  if (Array.isArray(game.preset_layout)) {
    const out: [string, string[]][] = [];
    for (const group of game.preset_layout.map(obj)) {
      const tiers = Array.isArray(group.tiers) ? group.tiers.map(obj) : [];
      const nations = tiers.flatMap((tier) => (Array.isArray(tier.nations) ? tier.nations.map(String) : []));
      if (nations.length) out.push([String(group.name ?? "Nations"), nations]);
    }
    if (out.length) return out;
  }
  return [];
}

function sectionsOf(game: RawArchiveGame, names: NameMap, status: ArchiveStatus): ArchiveSection[] {
  const playerOf = (user: string) => {
    const known = names.get(`${game.guild_id}:${user}`);
    return { name: known?.name || "A player", avatar_url: known?.avatar_url ?? null };
  };
  const rowsFor = (nation: string, slots: string[]): ArchiveRow[] =>
    slots.map((slot) => {
      const user = game.reservations[slot];
      const coop = slot !== nation;
      return {
        nation: coop ? `${nation} (co-op)` : nation,
        tag: tagOf(nation),
        coop,
        player: playerOf(user),
        presence: presenceOf(game, slot, user, status),
        marks: marksOf(game, user),
      };
    });

  // Reserved slots by nation (main first, then co-ops in order).
  const slotsByNation = new Map<string, string[]>();
  for (const slot of Object.keys(game.reservations)) {
    if (isFiller(slot)) continue;
    const nation = baseNation(slot);
    const list = slotsByNation.get(nation) ?? [];
    list.push(slot);
    slotsByNation.set(nation, list);
  }
  for (const list of slotsByNation.values()) list.sort((a, b) => (a.includes("_coop") ? 1 : 0) - (b.includes("_coop") ? 1 : 0) || a.localeCompare(b));

  const placed = new Set<string>();
  const byCanonical = new Map([...slotsByNation.keys()].map((nation) => [canonicalName(nation), nation]));
  const sections: ArchiveSection[] = [];
  for (const [title, nations] of layoutOf(game)) {
    const rows: ArchiveRow[] = [];
    let open = 0;
    for (const listed of nations) {
      const reserved = slotsByNation.has(listed) ? listed : byCanonical.get(canonicalName(listed));
      if (reserved && !placed.has(reserved)) {
        placed.add(reserved);
        rows.push(...rowsFor(reserved, slotsByNation.get(reserved) ?? []));
      } else if (!reserved) {
        open += 1;
        rows.push({ nation: listed, tag: tagOf(listed), coop: false, player: null, presence: "none", marks: { ...EMPTY_MARKS } });
      }
    }
    if (rows.length) sections.push({ title, rows, open });
  }
  // Reserved nations the layout doesn't list ("Other" mode, older games).
  const rest = [...slotsByNation.keys()].filter((nation) => !placed.has(nation)).sort((a, b) => a.localeCompare(b));
  if (rest.length) {
    sections.push({
      title: sections.length ? "Other nations" : "Nations",
      rows: rest.flatMap((nation) => rowsFor(nation, slotsByNation.get(nation) ?? [])),
      open: 0,
    });
  }
  const fillers = Object.keys(game.reservations).filter(isFiller);
  if (fillers.length) {
    sections.push({
      title: "Fillers",
      rows: fillers.map((slot, index) => {
        const user = game.reservations[slot];
        return {
          nation: `Filler ${index + 1}`,
          tag: null,
          coop: false,
          player: playerOf(user),
          presence: presenceOf(game, slot, user, status),
          marks: marksOf(game, user),
        };
      }),
      open: 0,
    });
  }
  return sections;
}

function countsOf(sections: ArchiveSection[], status: ArchiveStatus): ArchiveCounts {
  const counts: ArchiveCounts = {
    reserved: 0, played: 0, no_show: 0, told_host: 0, late: 0, commend: 0, merit: 0, warn: 0, dishonored: 0, ban: 0,
  };
  for (const row of sections.flatMap((section) => section.rows)) {
    if (!row.player) continue;
    counts.reserved += 1;
    if (row.presence === "played") counts.played += 1;
    else if (row.presence === "no_show") counts.no_show += 1;
    else if (row.presence === "told_host") counts.told_host += 1;
    else if (row.presence === "late") counts.late += 1;
    counts.commend += row.marks.commend;
    counts.merit += row.marks.merit;
    counts.warn += row.marks.warn;
    counts.dishonored += row.marks.dishonored;
    counts.ban += row.marks.ban;
  }
  // Late joiners played too ("28 of 32 played"; 3 of them joined late).
  if (status === "ended" || status === "ongoing") counts.played += counts.late;
  return counts;
}

function cardOf(game: RawArchiveGame, sections: ArchiveSection[], server: ServerInfo, names: NameMap): ArchiveGameCard {
  const status = statusOf(game);
  return {
    id: game.id,
    name: game.name,
    mode: game.mode,
    category: categoryOfMode(game.mode),
    status,
    server_id: server.id,
    server_name: server.name,
    server_icon_url: server.icon_url,
    host_name: game.host_id ? (names.get(`${game.guild_id}:${game.host_id}`)?.name ?? null) : null,
    ts: game.ts || game.started_at,
    counts: countsOf(sections, status),
    rating: ratingOf(game),
    graded: game.graded,
  };
}

// ---- The index (list + search) ------------------------------------------------------------

interface Indexed {
  card: ArchiveGameCard;
  haystack: string;
  people: string;
}

async function indexAll(): Promise<{ games: Indexed[]; servers: ArchiveServer[] }> {
  const raw = (await loadRawGames()).filter(isArchived);
  const [names, servers] = await Promise.all([loadNames(raw), loadServers(raw.map((game) => game.guild_id))]);
  const games = raw.map((game): Indexed => {
    const server = servers.get(game.guild_id) ?? { id: game.guild_id, name: "Discord server", icon_url: null };
    const sections = sectionsOf(game, names, statusOf(game));
    const card = cardOf(game, sections, server, names);
    const people = sections
      .flatMap((section) => section.rows)
      .filter((row) => row.player)
      .map((row) => `${row.player?.name ?? ""} ${row.nation}`)
      .join(" ")
      .toLowerCase();
    const haystack = [card.name, card.mode, card.server_name, card.host_name ?? "", people].join(" \n ").toLowerCase();
    return { card, haystack, people };
  });
  const used = new Set(games.map((game) => game.card.server_id));
  return {
    games,
    servers: [...servers.values()].filter((server) => used.has(server.id)).map(({ id, name }) => ({ id, name })),
  };
}

const indexCache = new TtlCache<{ games: Indexed[]; servers: ArchiveServer[] }>(60_000, 4);

export interface ArchiveQuery {
  q: string;
  tab: ArchiveTab;
  server: string;
  mode: string;
  gradedOnly: boolean;
  sort: ArchiveSort;
  offset: number;
}

const inTab = (card: ArchiveGameCard, tab: ArchiveTab) =>
  tab === "all" || (tab === "roleplay" ? card.category === "Roleplay" : card.category === "Historical");

export async function listArchiveGames(query: ArchiveQuery): Promise<ArchiveListResponse> {
  const { games, servers } = await indexCache.get("all", indexAll);
  const terms = searchTerms(query.q);
  const matches = games.filter(
    (game) =>
      (!query.server || game.card.server_id === query.server) &&
      (!query.mode || game.card.mode === query.mode) &&
      (!query.gradedOnly || game.card.graded) &&
      terms.every((term) => game.haystack.includes(term)),
  );
  const tabs: Record<ArchiveTab, number> = {
    all: matches.length,
    roleplay: matches.filter((game) => inTab(game.card, "roleplay")).length,
    historical: matches.filter((game) => inTab(game.card, "historical")).length,
  };
  let shown = matches.filter((game) => inTab(game.card, query.tab));
  if (query.sort === "oldest") shown = [...shown].sort((a, b) => a.card.ts - b.card.ts);
  else if (query.sort === "rating") {
    shown = [...shown].sort(
      (a, b) => (b.card.rating.average ?? -1) - (a.card.rating.average ?? -1) || b.card.rating.count - a.card.rating.count,
    );
  } else shown = [...shown].sort((a, b) => b.card.ts - a.card.ts);
  // A search for a player: their games first.
  if (terms.length > 0) {
    shown = [...shown].sort(
      (a, b) => Number(terms.every((t) => b.people.includes(t))) - Number(terms.every((t) => a.people.includes(t))),
    );
  }
  const offset = Math.max(0, query.offset);
  const modes = [...new Set(games.filter((game) => inTab(game.card, query.tab)).map((game) => game.card.mode))].sort();
  return {
    games: shown.slice(offset, offset + PAGE).map((game) => game.card),
    total: shown.length,
    tabs,
    servers,
    modes,
    next: offset + PAGE < shown.length ? offset + PAGE : null,
  };
}

export async function getArchiveGame(id: string, viewerId: string | null): Promise<ArchiveGameDetail | null> {
  const game = await loadRawArchiveGame(id);
  if (!game || !isArchived(game)) return null;
  const [names, servers] = await Promise.all([loadNames([game]), loadServers([game.guild_id])]);
  const server = servers.get(game.guild_id) ?? { id: game.guild_id, name: "Discord server", icon_url: null };
  const status = statusOf(game);
  const sections = sectionsOf(game, names, status);
  const card = cardOf(game, sections, server, names);
  let viewer: ArchiveGameDetail["viewer"] = null;
  if (viewerId && raterEligible(game, viewerId)) {
    viewer = { can_rate: card.rating.open, stars: game.ratings[viewerId] ?? null };
  }
  return { card, started_at: game.started_at || null, ended_at: game.ended_at || null, sections, viewer };
}

/** Who may rate: the players the bot marked present (bot.py.py _feedback_eligible_ids). */
export function raterEligible(game: RawArchiveGame, userId: string): boolean {
  return (game.eligible ?? game.present_ids).includes(userId);
}
