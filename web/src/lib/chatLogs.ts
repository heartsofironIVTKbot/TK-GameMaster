import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { CHAT_LOG_MAX_BYTES, CHAT_LOG_MAX_FILES } from "@/lib/aiAnalysisTypes";
import { getPool } from "@/lib/db";

/**
 * Game chat logs uploaded on the Games page. A game's log can come in several
 * files (a rehost after a crash, a log saved in parts): they're kept in order
 * and the bot reads them as one game (bot.py.py _load_game_chat_log_mysql).
 *
 * game_chat_logs holds older single uploads. The first time a game's logs are
 * listed here, its old upload moves into game_chat_log_files as file 1.
 */

const isSchedulerDemo = () => process.env.NODE_ENV === "development" && process.env.SCHEDULER_DEMO === "1";

const LEGACY_DDL = `CREATE TABLE IF NOT EXISTS game_chat_logs (
    game_id VARCHAR(32) NOT NULL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    filename VARCHAR(200) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    bytes INT NOT NULL,
    uploaded_by BIGINT NOT NULL,
    uploaded_at BIGINT NOT NULL,
    INDEX idx_game_chat_logs_guild (guild_id)
)`;

const FILES_DDL = `CREATE TABLE IF NOT EXISTS game_chat_log_files (
    file_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    game_id VARCHAR(32) NOT NULL,
    guild_id VARCHAR(32) NOT NULL,
    part INT NOT NULL,
    filename VARCHAR(200) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    bytes INT NOT NULL,
    uploaded_by BIGINT NOT NULL,
    uploaded_at BIGINT NOT NULL,
    INDEX idx_chat_log_files_game (game_id, part)
)`;

export interface ChatLogFileMeta {
  file_id: string;
  game_id: string;
  part: number;
  filename: string;
  bytes: number;
  uploaded_by: string;
  uploaded_at: number;
}

export interface ChatLogFile extends ChatLogFileMeta {
  content: string;
}

/** Refused uploads and changes, with a message for the host. */
export class ChatLogError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ChatLogError";
  }
}

/** The bot's signature for a game's set of files (bot.py.py _chat_log_bundle): the
 *  analysis is out of date when the files' signature no longer matches it. */
export function chatLogSignature(files: { file_id: string; uploaded_at: number }[]): string {
  return files.map((file) => `${file.file_id}:${file.uploaded_at}`).join(",");
}

// ---- Preview mode -----------------------------------------------------------

function demoFiles(): Map<string, ChatLogFile[]> {
  const holder = globalThis as { __gmChatLogFilesDemoV2?: Map<string, ChatLogFile[]> };
  holder.__gmChatLogFilesDemoV2 ??= new Map();
  return holder.__gmChatLogFilesDemoV2;
}

function demoFor(gameIds: string[]): { key: string; files: ChatLogFile[] } | null {
  for (const id of gameIds) {
    const files = demoFiles().get(id);
    if (files && files.length > 0) return { key: id, files };
  }
  return null;
}

/** Preview mode: a game's files with their text (the simulated bot and the public page read them). */
export function demoChatLogFiles(gameIds: string[]): ChatLogFile[] {
  return demoFor(gameIds)?.files ?? [];
}

/** Preview mode: put a sample log on a game (the public page's sample games). */
export function seedDemoChatLog(gameId: string, files: { filename: string; content: string; uploaded_at: number }[]): void {
  if (demoFiles().has(gameId)) return;
  demoFiles().set(
    gameId,
    files.map((file, index) => ({
      file_id: `demo-${gameId}-${index + 1}`,
      game_id: gameId,
      part: index + 1,
      filename: file.filename,
      bytes: new TextEncoder().encode(file.content).length,
      uploaded_by: "0",
      uploaded_at: file.uploaded_at,
      content: file.content,
    })),
  );
}

// ---- Tables -------------------------------------------------------------------

let ready: Promise<void> | null = null;
async function ensureTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await getPool().query(LEGACY_DDL);
      await getPool().query(FILES_DDL);
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}

/** Keep only a safe, short file name. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "chat_log.txt";
  const safe = base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120).trim();
  return safe.toLowerCase().endsWith(".txt") ? safe : `${safe || "chat_log"}.txt`;
}

const META_COLUMNS = `CAST(file_id AS CHAR) AS file_id, game_id, part, filename, bytes,
  CAST(uploaded_by AS CHAR) AS uploaded_by, uploaded_at`;

function metaOf(file: ChatLogFile): ChatLogFileMeta {
  return {
    file_id: file.file_id,
    game_id: file.game_id,
    part: file.part,
    filename: file.filename,
    bytes: file.bytes,
    uploaded_by: file.uploaded_by,
    uploaded_at: file.uploaded_at,
  };
}

function toMeta(row: RowDataPacket): ChatLogFileMeta {
  return {
    file_id: String(row.file_id),
    game_id: String(row.game_id),
    part: Number(row.part) || 0,
    filename: String(row.filename),
    bytes: Number(row.bytes) || 0,
    uploaded_by: String(row.uploaded_by),
    uploaded_at: Number(row.uploaded_at) || 0,
  };
}

/** A game with an old single upload and no files yet: move the old upload in as file 1. */
async function moveLegacyLog(db: PoolConnection, gameIds: string[]): Promise<void> {
  const [have] = await db.query<RowDataPacket[]>("SELECT 1 FROM game_chat_log_files WHERE game_id IN (?) LIMIT 1", [gameIds]);
  if (have.length > 0) return;
  const [legacy] = await db.query<RowDataPacket[]>(
    "SELECT game_id FROM game_chat_logs WHERE game_id IN (?) ORDER BY uploaded_at DESC LIMIT 1",
    [gameIds],
  );
  const gameId = legacy[0]?.game_id ? String(legacy[0].game_id) : null;
  if (!gameId) return;
  await db.beginTransaction();
  try {
    await db.query(
      `INSERT INTO game_chat_log_files (game_id, guild_id, part, filename, content, bytes, uploaded_by, uploaded_at)
       SELECT game_id, guild_id, 1, filename, content, bytes, uploaded_by, uploaded_at FROM game_chat_logs WHERE game_id = ?`,
      [gameId],
    );
    await db.query("DELETE FROM game_chat_logs WHERE game_id = ?", [gameId]);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

/** Run with the tables ready and the game's old upload moved in. */
async function withLogs<T>(gameIds: string[], work: (db: PoolConnection) => Promise<T>): Promise<T> {
  await ensureTables();
  const db = await getPool().getConnection();
  try {
    await moveLegacyLog(db, gameIds);
    return await work(db);
  } finally {
    db.release();
  }
}

/** The files' game id: the one they're stored under, or the game's own key for a first upload. */
async function filesOf(db: PoolConnection, gameIds: string[]): Promise<ChatLogFileMeta[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${META_COLUMNS} FROM game_chat_log_files WHERE game_id IN (?) ORDER BY part, file_id`,
    [gameIds],
  );
  return rows.map(toMeta);
}

// ---- Reading --------------------------------------------------------------------

/** A game's files in order (no text), for any of its ids. */
export async function listChatLogs(gameIds: string[]): Promise<ChatLogFileMeta[]> {
  const ids = [...new Set(gameIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (isSchedulerDemo()) return demoChatLogFiles(ids).map(metaOf);
  try {
    return await withLogs(ids, (db) => filesOf(db, ids));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

/** A game's files with their text, in order (the public roleplay page). */
export async function readChatLogs(gameIds: string[]): Promise<ChatLogFile[]> {
  const ids = [...new Set(gameIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (isSchedulerDemo()) return demoChatLogFiles(ids);
  try {
    return await withLogs(ids, async (db) => {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT ${META_COLUMNS}, content FROM game_chat_log_files WHERE game_id IN (?) ORDER BY part, file_id`,
        [ids],
      );
      return rows.map((row) => ({ ...toMeta(row), content: String(row.content ?? "") }));
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

// ---- Changing -------------------------------------------------------------------

function checkRoom(files: { bytes: number }[], addBytes: number): void {
  if (files.length >= CHAT_LOG_MAX_FILES) {
    throw new ChatLogError(`A game can have up to ${CHAT_LOG_MAX_FILES} log files. Remove one first.`, 409);
  }
  const total = files.reduce((sum, file) => sum + file.bytes, 0) + addBytes;
  if (total > CHAT_LOG_MAX_BYTES) {
    throw new ChatLogError(
      `That's too much text for one game: the files can add up to ${CHAT_LOG_MAX_BYTES / 1024 / 1024} MB.`,
      413,
    );
  }
}

/** Add a file after the game's others. */
export async function addChatLog(input: {
  gameId: string;
  gameIds: string[];
  guildId: string;
  filename: string;
  content: string;
  uploadedBy: string;
}): Promise<ChatLogFileMeta> {
  const bytes = new TextEncoder().encode(input.content).length;
  const filename = cleanName(input.filename);
  const uploadedAt = Math.floor(Date.now() / 1000);
  const ids = [...new Set([input.gameId, ...input.gameIds].filter(Boolean))];
  if (isSchedulerDemo()) {
    const found = demoFor(ids);
    const key = found?.key ?? input.gameId;
    const files = found?.files ?? [];
    checkRoom(files, bytes);
    const file: ChatLogFile = {
      file_id: `demo-${Date.now()}-${files.length + 1}`,
      game_id: key,
      part: (files[files.length - 1]?.part ?? 0) + 1,
      filename,
      bytes,
      uploaded_by: input.uploadedBy,
      uploaded_at: uploadedAt,
      content: input.content,
    };
    demoFiles().set(key, [...files, file]);
    return metaOf(file);
  }
  return withLogs(ids, async (db) => {
    const files = await filesOf(db, ids);
    checkRoom(files, bytes);
    // Keep a game's files under one id (the one they already use).
    const gameId = files[0]?.game_id ?? input.gameId;
    const part = (files[files.length - 1]?.part ?? 0) + 1;
    const [result] = await db.query<ResultSetHeader>(
      `INSERT INTO game_chat_log_files (game_id, guild_id, part, filename, content, bytes, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS UNSIGNED), ?)`,
      [gameId, input.guildId, part, filename, input.content, bytes, input.uploadedBy, uploadedAt],
    );
    return {
      file_id: String(result.insertId),
      game_id: gameId,
      part,
      filename,
      bytes,
      uploaded_by: input.uploadedBy,
      uploaded_at: uploadedAt,
    };
  });
}

/** Remove one of a game's files. */
export async function removeChatLog(gameIds: string[], fileId: string): Promise<void> {
  const ids = [...new Set(gameIds.filter(Boolean))];
  if (isSchedulerDemo()) {
    const found = demoFor(ids);
    if (!found?.files.some((file) => file.file_id === fileId)) throw new ChatLogError("That file is already gone.", 404);
    demoFiles().set(
      found.key,
      found.files.filter((file) => file.file_id !== fileId),
    );
    return;
  }
  await withLogs(ids, async (db) => {
    const [result] = await db.query<ResultSetHeader>(
      "DELETE FROM game_chat_log_files WHERE file_id = ? AND game_id IN (?)",
      [fileId, ids],
    );
    if (result.affectedRows === 0) throw new ChatLogError("That file is already gone.", 404);
  });
}

/** Move a file one place earlier or later (the order the game was played in). */
export async function moveChatLog(gameIds: string[], fileId: string, direction: "up" | "down"): Promise<void> {
  const ids = [...new Set(gameIds.filter(Boolean))];
  const swap = <T extends { file_id: string }>(files: T[]): [T, T] | null => {
    const index = files.findIndex((file) => file.file_id === fileId);
    if (index < 0) throw new ChatLogError("That file is gone.", 404);
    const other = direction === "up" ? index - 1 : index + 1;
    return other >= 0 && other < files.length ? [files[index], files[other]] : null;
  };
  if (isSchedulerDemo()) {
    const found = demoFor(ids);
    if (!found) throw new ChatLogError("That file is gone.", 404);
    const pair = swap(found.files);
    if (!pair) return;
    [pair[0].part, pair[1].part] = [pair[1].part, pair[0].part];
    found.files.sort((a, b) => a.part - b.part);
    return;
  }
  await withLogs(ids, async (db) => {
    const pair = swap(await filesOf(db, ids));
    if (!pair) return;
    await db.beginTransaction();
    try {
      await db.query("UPDATE game_chat_log_files SET part = ? WHERE file_id = ?", [pair[1].part, pair[0].file_id]);
      await db.query("UPDATE game_chat_log_files SET part = ? WHERE file_id = ?", [pair[0].part, pair[1].file_id]);
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
  });
}
