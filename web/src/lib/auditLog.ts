import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { demoAuditEvents } from "@/lib/auditDemo";
import {
  AUDIT_PAGE_DEFAULT,
  AUDIT_PAGE_MAX,
  type AuditEvent,
  type AuditEventInput,
  type AuditPage,
  type AuditQuery,
} from "@/lib/auditTypes";

/**
 * The audit trail behind the staff-only /audit page. The bot writes most rows
 * (bot.py.py audit_event); the website writes reservations, nicknames and
 * settings saves.
 *
 * APPEND-ONLY: no website code may UPDATE or DELETE `audit_trail` rows. The
 * only thing that deletes is the bot's audit_trail_retention_loop (rows older
 * than 400 days). The bot creates the same table — keep the DDL identical.
 */

// Own check (not scheduleStore's) so scheduleStore can import this file.
const isSchedulerDemo = () => process.env.NODE_ENV === "development" && process.env.SCHEDULER_DEMO === "1";

const DDL = `CREATE TABLE IF NOT EXISTS audit_trail (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    category VARCHAR(24) NOT NULL,
    action VARCHAR(48) NOT NULL,
    actor_id VARCHAR(32) NULL,
    actor_name VARCHAR(64) NULL,
    target_id VARCHAR(32) NULL,
    target_name VARCHAR(64) NULL,
    game_id VARCHAR(32) NULL,
    summary VARCHAR(400) NOT NULL,
    details JSON NULL,
    source VARCHAR(12) NOT NULL,
    INDEX idx_audit_guild_time (guild_id, created_at),
    INDEX idx_audit_guild_actor (guild_id, actor_id, created_at),
    INDEX idx_audit_guild_target (guild_id, target_id, created_at),
    INDEX idx_audit_guild_game (guild_id, game_id, created_at),
    INDEX idx_audit_guild_cat (guild_id, category, created_at)
)`;

const DETAILS_MAX = 4000;
const SECRET_KEYS = ["password", "token", "secret", "webhook"];

let ready: Promise<void> | null = null;
export async function ensureAuditTable(): Promise<void> {
  if (!ready) {
    ready = getPool()
      .query(DDL)
      .then(() => undefined)
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  await ready;
}

function cleanDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanDetails);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.some((word) => key.toLowerCase().includes(word)))
        .map(([key, entry]) => [key, cleanDetails(entry)]),
    );
  }
  return value;
}

function detailsJson(details: Record<string, unknown> | null | undefined): string | null {
  if (!details) return null;
  const text = JSON.stringify(cleanDetails(details));
  return text.length > DETAILS_MAX ? JSON.stringify({ truncated: text.slice(0, DETAILS_MAX - 100) }) : text;
}

const cut = (value: string | null | undefined, max: number) => (value ? String(value).slice(0, max) : null);

/** Record one action. Never throws: the audit must never break the action itself. */
export async function recordAudit(event: AuditEventInput): Promise<void> {
  try {
    const row = {
      guild_id: event.guildId,
      created_at: Math.floor(Date.now() / 1000),
      category: event.category,
      action: event.action.slice(0, 48),
      actor_id: cut(event.actorId, 32),
      actor_name: cut(event.actorName, 64),
      target_id: cut(event.targetId, 32),
      target_name: cut(event.targetName, 64),
      game_id: cut(event.gameId, 32),
      summary: (event.summary.replace(/\s+/g, " ").trim() || `${event.category} ${event.action}`).slice(0, 400),
      details: detailsJson(event.details),
      source: event.source ?? "web",
    };
    if (isSchedulerDemo()) {
      const events = demoAuditEvents();
      const id = (events[0]?.id ?? 0) + 1;
      events.unshift({ ...row, id, details: row.details ? (JSON.parse(row.details) as Record<string, unknown>) : null });
      return;
    }
    await ensureAuditTable();
    await getPool().query(
      `INSERT INTO audit_trail (guild_id, created_at, category, action, actor_id, actor_name,
                                target_id, target_name, game_id, summary, details, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.guild_id, row.created_at, row.category, row.action, row.actor_id, row.actor_name,
        row.target_id, row.target_name, row.game_id, row.summary, row.details, row.source,
      ],
    );
  } catch (error) {
    console.error("[audit] record failed:", error);
  }
}

interface AuditRow extends RowDataPacket {
  id: number | string;
  created_at: number | string;
  category: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  target_id: string | null;
  target_name: string | null;
  game_id: string | null;
  summary: string;
  details: unknown;
  source: string;
}

function parseDetails(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { value: parsed };
    } catch {
      return { value: raw };
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : { value: raw };
}

function toEvent(row: AuditRow): AuditEvent {
  return {
    id: Number(row.id),
    created_at: Number(row.created_at) || 0,
    category: String(row.category),
    action: String(row.action),
    actor_id: row.actor_id ? String(row.actor_id) : null,
    actor_name: row.actor_name ? String(row.actor_name) : null,
    target_id: row.target_id ? String(row.target_id) : null,
    target_name: row.target_name ? String(row.target_name) : null,
    game_id: row.game_id ? String(row.game_id) : null,
    summary: String(row.summary),
    details: parseDetails(row.details),
    source: String(row.source),
  };
}

const ID_RE = /^\d{1,32}$/;
const WORD_RE = /^[a-z_]{1,48}$/;

/** Turn URL search params into a checked query (bad values are dropped). */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
  const text = (key: string) => (params.get(key) ?? "").trim();
  const num = (key: string) => {
    const value = Number(text(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  };
  const query: AuditQuery = {};
  if (WORD_RE.test(text("category"))) query.category = text("category");
  if (WORD_RE.test(text("action"))) query.action = text("action");
  if (ID_RE.test(text("actor"))) query.actor = text("actor");
  if (ID_RE.test(text("target"))) query.target = text("target");
  if (ID_RE.test(text("player"))) query.player = text("player");
  if (ID_RE.test(text("game"))) query.game = text("game");
  if (text("q")) query.q = text("q").slice(0, 100);
  query.from = num("from");
  query.to = num("to");
  query.before = num("before");
  query.limit = num("limit");
  return query;
}

function matches(event: AuditEvent, query: AuditQuery): boolean {
  if (query.category && event.category !== query.category) return false;
  if (query.action && event.action !== query.action) return false;
  if (query.actor && event.actor_id !== query.actor) return false;
  if (query.target && event.target_id !== query.target) return false;
  if (query.player && event.actor_id !== query.player && event.target_id !== query.player) return false;
  if (query.game && event.game_id !== query.game) return false;
  if (query.q && !event.summary.toLowerCase().includes(query.q.toLowerCase())) return false;
  if (query.from && event.created_at < query.from) return false;
  if (query.to && event.created_at > query.to) return false;
  if (query.before && event.id >= query.before) return false;
  return true;
}

function whereClause(guildId: string, query: AuditQuery): { sql: string; params: (string | number)[] } {
  const parts = ["guild_id = ?"];
  const params: (string | number)[] = [guildId];
  const add = (sql: string, value: string | number | undefined) => {
    if (value === undefined || value === "") return;
    parts.push(sql);
    params.push(value);
  };
  add("category = ?", query.category);
  add("action = ?", query.action);
  add("actor_id = ?", query.actor);
  add("target_id = ?", query.target);
  if (query.player) {
    parts.push("(actor_id = ? OR target_id = ?)");
    params.push(query.player, query.player);
  }
  add("game_id = ?", query.game);
  add("created_at >= ?", query.from);
  add("created_at <= ?", query.to);
  add("id < ?", query.before);
  if (query.q) add("summary LIKE ?", `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  return { sql: parts.join(" AND "), params };
}

/** One page of events, newest first (keyset paging on id). */
export async function queryAudit(guildId: string, query: AuditQuery, maxLimit = AUDIT_PAGE_MAX): Promise<AuditPage> {
  const limit = Math.min(Math.max(query.limit ?? AUDIT_PAGE_DEFAULT, 1), maxLimit);
  if (isSchedulerDemo()) {
    const events = demoAuditEvents().filter((event) => matches(event, query));
    const page = events.slice(0, limit);
    return { events: page, next_before: events.length > limit ? page[page.length - 1].id : null };
  }
  try {
    const { sql, params } = whereClause(guildId, query);
    const [rows] = await getPool().query<AuditRow[]>(
      `SELECT id, created_at, category, action, actor_id, actor_name, target_id, target_name,
              game_id, summary, details, source
         FROM audit_trail WHERE ${sql} ORDER BY id DESC LIMIT ?`,
      [...params, limit + 1],
    );
    const events = rows.slice(0, limit).map(toEvent);
    return { events, next_before: rows.length > limit ? events[events.length - 1].id : null };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return { events: [], next_before: null };
    throw error;
  }
}

/** Events per category over the last 7 days (the filter chips' counts). */
export async function auditCategoryCounts(guildId: string): Promise<Record<string, number>> {
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  if (isSchedulerDemo()) {
    const counts: Record<string, number> = {};
    for (const event of demoAuditEvents()) {
      if (event.created_at >= since) counts[event.category] = (counts[event.category] ?? 0) + 1;
    }
    return counts;
  }
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT category, COUNT(*) AS n FROM audit_trail
        WHERE guild_id = ? AND created_at >= ? GROUP BY category`,
      [guildId, since],
    );
    return Object.fromEntries(rows.map((row) => [String(row.category), Number(row.n) || 0]));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") return {};
    throw error;
  }
}
