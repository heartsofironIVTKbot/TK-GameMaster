import type { RowDataPacket } from "mysql2";
import { readChatLogs } from "@/lib/chatLogs";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { lookupMembers } from "@/lib/memberDirectory";
import { demoRpGames } from "@/lib/rpArchiveDemo";
import {
  parseLogLine,
  searchTerms,
  verdictOf,
  verdictRank,
  type RpGameCard,
  type RpGameDetail,
  type RpLine,
  type RpListResponse,
  type RpPlayer,
  type RpServer,
} from "@/lib/rpArchiveTypes";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { TtlCache } from "@/lib/ttlCache";

/**
 * The public roleplay archive (docs/ai-log-analysis.md): games whose chat log
 * the AI graded, on every server. Public, so: names and avatars only (no
 * Discord IDs), no staff names, no toxicity. Conduct is never spelled out.
 */

const MAX_GAMES = 600;
const PAGE = 24;
/** A very long log is cut for the page (the full files stay in Discord). */
const MAX_LINES = 40_000;

/** A graded game as stored (the bot's game_data). */
export interface RawRpGame {
  id: string;
  keys: string[];
  mode: string;
  name: string;
  ts: number;
  host_id: string | null;
  guild_id: string;
  analysis: Record<string, unknown>;
  given: Record<string, unknown>;
}

interface Indexed {
  card: RpGameCard;
  players: RpPlayer[];
  /** Lower-case text the search looks through. */
  haystack: string;
  /** Lower-case player names and nations (a search for a player). */
  people: string;
}

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const text = (value: unknown) => (typeof value === "string" ? value : "");

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return obj(raw);
  try {
    return obj(JSON.parse(raw));
  } catch {
    return {};
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
  lobby: string | null;
  original: string | null;
  ai: string | null;
  given: string | null;
}

const GAME_SELECT = `SELECT g.thread_id, g.mode, g.thread_name, g.start_timestamp, CAST(g.host_id AS CHAR) AS host_id,
    CAST(g.guild_id AS CHAR) AS guild_id,
    JSON_UNQUOTE(JSON_EXTRACT(g.game_data, '$.lobby_thread_id')) AS lobby,
    JSON_UNQUOTE(JSON_EXTRACT(g.game_data, '$.original_thread_id')) AS original,
    CAST(JSON_EXTRACT(g.game_data, '$.ai_analysis') AS CHAR) AS ai,
    CAST(JSON_EXTRACT(g.game_data, '$.ai_rewards_given') AS CHAR) AS given
  FROM games g`;

function fromRow(row: GameRow): RawRpGame {
  const id = String(row.thread_id);
  const keys = [id, row.lobby, row.original].filter((key): key is string => Boolean(key && key !== "null"));
  return {
    id,
    keys: [...new Set(keys)],
    mode: row.mode ?? "Game",
    name: cleanGameName(row.thread_name ?? "", row.mode ?? ""),
    ts: num(row.start_timestamp),
    host_id: row.host_id && row.host_id !== "0" ? row.host_id : null,
    guild_id: row.guild_id ?? HOME_GUILD_ID,
    analysis: parseJson(row.ai),
    given: parseJson(row.given),
  };
}

async function loadRawGames(): Promise<RawRpGame[]> {
  if (isSchedulerDemo()) return demoRpGames();
  try {
    const [rows] = await getPool().query<GameRow[]>(
      `${GAME_SELECT} WHERE JSON_EXTRACT(g.game_data, '$.ai_analysis.at') IS NOT NULL
        ORDER BY COALESCE(g.start_timestamp, 0) DESC LIMIT ${MAX_GAMES}`,
    );
    return rows.map(fromRow);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") return [];
    throw error;
  }
}

async function loadRawGame(id: string): Promise<RawRpGame | null> {
  if (isSchedulerDemo()) return demoRpGames().find((game) => game.keys.includes(id)) ?? null;
  const [rows] = await getPool().query<GameRow[]>(
    `${GAME_SELECT} WHERE JSON_EXTRACT(g.game_data, '$.ai_analysis.at') IS NOT NULL
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

async function loadServers(ids: string[]): Promise<Map<string, RpServer>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const fallback = (id: string): RpServer => ({ id, name: "Discord server", icon_url: null });
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

/** Display names and avatars, per server (the member directory is per server). */
async function loadNames(games: RawRpGame[]): Promise<Map<string, { name: string | null; avatar_url: string | null }>> {
  const byGuild = new Map<string, Set<string>>();
  for (const game of games) {
    const ids = byGuild.get(game.guild_id) ?? new Set<string>();
    if (game.host_id) ids.add(game.host_id);
    for (const player of Array.isArray(game.analysis.players) ? game.analysis.players.map(obj) : []) {
      if (player.user_id) ids.add(String(player.user_id));
    }
    byGuild.set(game.guild_id, ids);
  }
  const out = new Map<string, { name: string | null; avatar_url: string | null }>();
  await Promise.all(
    [...byGuild.entries()].map(async ([guildId, ids]) => {
      const members = await lookupMembers([...ids], guildId).catch(() => new Map());
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

function playersOf(game: RawRpGame, names: Map<string, { name: string | null; avatar_url: string | null }>): RpPlayer[] {
  const raw = Array.isArray(game.analysis.players) ? game.analysis.players.map(obj) : [];
  return raw
    .map((player, index): RpPlayer => {
      const userId = player.user_id ? String(player.user_id) : null;
      const known = userId ? names.get(`${game.guild_id}:${userId}`) : undefined;
      const reward = obj(player.reward);
      const status = text(player.status);
      const verdict = verdictOf({ commends: num(reward.commends), merit: num(reward.merit) }, status);
      const nation = text(player.nation) || text(player.tag);
      const role = player.role === "COOP" || player.role === "UNRESERVED" ? player.role : "MAIN";
      return {
        key: `${game.id}-${index}`,
        name: known?.name || text(player.name) || (role === "UNRESERVED" ? `Unreserved ${nation}` : nation),
        avatar_url: known?.avatar_url ?? null,
        tag: text(player.tag).toUpperCase(),
        nation,
        role,
        words: num(player.words),
        ic_words: num(player.meaningful_words),
        creativity: num(player.creativity),
        verdict,
        // Conduct stays private: a toxic result just isn't rewarded.
        why: status === "toxic" ? "Not rewarded." : text(reward.why),
        summary: status === "toxic" ? "" : text(player.summary),
        snippets: Array.isArray(player.snippets) ? player.snippets.map(String).filter(Boolean).slice(0, 3) : [],
        given: userId ? Boolean(obj(game.given[userId]).kind) : false,
        left_early: Boolean(player.left_early),
      };
    })
    .sort((a, b) => verdictRank(b.verdict) - verdictRank(a.verdict) || b.ic_words - a.ic_words);
}

function cardOf(
  game: RawRpGame,
  players: RpPlayer[],
  server: RpServer,
  names: Map<string, { name: string | null; avatar_url: string | null }>,
): RpGameCard {
  return {
    id: game.id,
    server_id: server.id,
    server_name: server.name,
    server_icon_url: server.icon_url,
    mode: game.mode,
    name: game.name,
    ts: game.ts || num(game.analysis.at),
    host_name: game.host_id ? (names.get(`${game.guild_id}:${game.host_id}`)?.name ?? null) : null,
    summary: text(game.analysis.game_summary),
    players: players.length,
    ic_words: players.reduce((sum, player) => sum + player.ic_words, 0),
    rewarded: players.filter((player) => player.verdict.kind === "commend" || player.verdict.kind === "merit").length,
    top: players
      .filter((player) => player.verdict.kind !== "no_rp")
      .slice(0, 5)
      .map((player) => ({ name: player.name, avatar_url: player.avatar_url, tag: player.tag, verdict: player.verdict })),
  };
}

async function indexAll(): Promise<{ games: Indexed[]; servers: RpServer[] }> {
  const raw = await loadRawGames();
  const [names, servers] = await Promise.all([loadNames(raw), loadServers(raw.map((game) => game.guild_id))]);
  const games = raw.map((game): Indexed => {
    const players = playersOf(game, names);
    const server = servers.get(game.guild_id) ?? { id: game.guild_id, name: "Discord server", icon_url: null };
    const card = cardOf(game, players, server, names);
    const people = players.map((player) => `${player.name} ${player.nation} ${player.tag}`).join(" ").toLowerCase();
    const haystack = [
      card.name,
      card.mode,
      card.server_name,
      card.host_name ?? "",
      card.summary,
      people,
      ...players.flatMap((player) => [player.summary, ...player.snippets]),
    ]
      .join(" \n ")
      .toLowerCase();
    return { card, players, haystack, people };
  });
  const used = new Set(games.map((game) => game.card.server_id));
  return { games, servers: [...servers.values()].filter((server) => used.has(server.id)) };
}

const indexCache = new TtlCache<{ games: Indexed[]; servers: RpServer[] }>(60_000, 4);

// ---- Public reads --------------------------------------------------------------------

export type RpSort = "newest" | "oldest" | "most_rp";

export interface RpQuery {
  q: string;
  server: string;
  mode: string;
  rewardedOnly: boolean;
  sort: RpSort;
  offset: number;
}

export async function listRpGames(query: RpQuery): Promise<RpListResponse> {
  const { games, servers } = await indexCache.get("all", indexAll);
  const terms = searchTerms(query.q);
  let shown = games.filter(
    (game) =>
      (!query.server || game.card.server_id === query.server) &&
      (!query.mode || game.card.mode === query.mode) &&
      (!query.rewardedOnly || game.card.rewarded > 0) &&
      terms.every((term) => game.haystack.includes(term)),
  );
  if (query.sort === "oldest") shown = [...shown].sort((a, b) => a.card.ts - b.card.ts);
  else if (query.sort === "most_rp") shown = [...shown].sort((a, b) => b.card.ic_words - a.card.ic_words);
  else shown = [...shown].sort((a, b) => b.card.ts - a.card.ts);
  // A search for a player: their games first.
  if (terms.length > 0) shown = [...shown].sort((a, b) => Number(terms.every((t) => b.people.includes(t))) - Number(terms.every((t) => a.people.includes(t))));
  const offset = Math.max(0, query.offset);
  const page = shown.slice(offset, offset + PAGE);
  const modes = [...new Set(games.map((game) => game.card.mode))].sort();
  return {
    games: page.map((game) => game.card),
    total: shown.length,
    servers,
    modes,
    next: offset + PAGE < shown.length ? offset + PAGE : null,
  };
}

export async function getRpGame(id: string): Promise<RpGameDetail | null> {
  const game = await loadRawGame(id);
  if (!game) return null;
  const [names, servers, files] = await Promise.all([
    loadNames([game]),
    loadServers([game.guild_id]),
    readChatLogs(game.keys).catch(() => []),
  ]);
  const players = playersOf(game, names);
  const server = servers.get(game.guild_id) ?? { id: game.guild_id, name: "Discord server", icon_url: null };
  const lines: RpLine[] = [];
  const fileInfo: RpGameDetail["files"] = [];
  let truncated = false;
  files.forEach((file, index) => {
    const raw = file.content.split("\n");
    fileInfo.push({ part: index + 1, filename: file.filename, lines: raw.length });
    for (const line of raw) {
      if (!line.trim()) continue;
      if (lines.length >= MAX_LINES) {
        truncated = true;
        return;
      }
      lines.push({ n: lines.length + 1, file: index + 1, ...parseLogLine(line) });
    }
  });
  return {
    card: cardOf(game, players, server, names),
    players,
    files: fileInfo,
    lines,
    truncated,
    graded_at: num(game.analysis.at),
  };
}
