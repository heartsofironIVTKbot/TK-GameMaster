import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { DEMO_HOST } from "@/lib/scheduleStore";
import { settingsOf } from "@/lib/serverSettings";
import { normalizeSettings, type ServerSettings } from "@/lib/serverSettingsTypes";
import { getSession } from "@/lib/session";
import { TICKET_KINDS, canViewTicket, type TicketViewer } from "@/lib/ticketAccess";
import { DEMO_MANAGEMENT_ROLE, demoTickets } from "@/lib/ticketsDemo";
import {
  INLINE_IMAGE_TYPES,
  type TicketDetail,
  type TicketEmbed,
  type TicketFile,
  type TicketListPage,
  type TicketMessage,
  type TicketSummary,
} from "@/lib/ticketTypes";

/**
 * Closed tickets for the /tickets pages. The bot writes them when a ticket
 * closes; the website only reads. Every read is filtered through
 * canViewTicket (lib/ticketAccess.ts) with the viewer's roles in the
 * ticket's own server — a ticket you may not see behaves as if it didn't exist.
 *
 * APPEND-ONLY: no website code may UPDATE or DELETE these tables. The bot's
 * daily retention job is the only thing that clears old file contents.
 */

// Own check (not scheduleStore's) so scheduleStore can import this file.
const isSchedulerDemo = () => process.env.NODE_ENV === "development" && process.env.SCHEDULER_DEMO === "1";

// Same DDL as the bot (bot.py.py _TICKET_*_DDL) — keep identical.
const DDL = [
  `CREATE TABLE IF NOT EXISTS ticket_records (
    ticket_id VARCHAR(32) NOT NULL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    number INT NOT NULL,
    kind VARCHAR(24) NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    opener_id VARCHAR(32) NOT NULL,
    opener_name VARCHAR(64) NULL,
    host_id VARCHAR(32) NULL,
    target_id VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL,
    closed_by_id VARCHAR(32) NULL,
    closed_by_name VARCHAR(64) NULL,
    close_reason VARCHAR(400) NULL,
    opened_at BIGINT NOT NULL,
    closed_at BIGINT NOT NULL,
    message_count INT NOT NULL DEFAULT 0,
    INDEX idx_ticket_guild_time (guild_id, closed_at),
    INDEX idx_ticket_guild_kind (guild_id, kind, closed_at),
    INDEX idx_ticket_opener (guild_id, opener_id)
)`,
  `CREATE TABLE IF NOT EXISTS ticket_messages (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(32) NOT NULL,
    position INT NOT NULL,
    author_id VARCHAR(32) NOT NULL,
    author_name VARCHAR(64) NOT NULL,
    is_bot TINYINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    content TEXT NULL,
    embeds_json JSON NULL,
    INDEX idx_ticket_messages (ticket_id, position)
)`,
  `CREATE TABLE IF NOT EXISTS ticket_files (
    file_id VARCHAR(32) NOT NULL PRIMARY KEY,
    ticket_id VARCHAR(32) NOT NULL,
    message_position INT NOT NULL,
    filename VARCHAR(200) NOT NULL,
    content_type VARCHAR(100) NULL,
    bytes INT NOT NULL,
    content LONGBLOB NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    INDEX idx_ticket_files (ticket_id)
)`,
];

let ready: Promise<void> | null = null;
async function ensureTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const statement of DDL) await getPool().query(statement);
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}

/** Who is looking: their id, and their roles / admin flag in each server they're in. */
export interface TicketContext {
  viewerId: string;
  servers: Map<string, { viewer: TicketViewer; settings: ServerSettings | null; name: string | null }>;
}

interface MembershipRow extends RowDataPacket {
  guild_id: string;
  role_ids: string | null;
  is_admin?: number | null;
  guild_name?: string | null;
}

/** null = not logged in. */
export async function ticketContext(): Promise<TicketContext | null> {
  if (isSchedulerDemo()) {
    const settings = normalizeSettings(null, "Demo server");
    settings.access.senior_staff_roles = [DEMO_MANAGEMENT_ROLE];
    const viewer = { id: DEMO_HOST.discord_id, isAdmin: false, roleIds: new Set([DEMO_MANAGEMENT_ROLE]) };
    return { viewerId: viewer.id, servers: new Map([[HOME_GUILD_ID, { viewer, settings, name: "Demo server" }]]) };
  }
  const session = await getSession();
  if (!session) return null;
  const viewerId = session.discord_id;
  const query = (withAdmin: boolean) =>
    getPool().query<MembershipRow[]>(
      `SELECT d.guild_id, d.role_ids${withAdmin ? ", d.is_admin" : ""}, s.guild_name
         FROM web_member_directory d LEFT JOIN guild_settings s ON s.guild_id = d.guild_id
        WHERE d.user_id = CAST(? AS UNSIGNED)`,
      [viewerId],
    );
  let rows: MembershipRow[] = [];
  try {
    [rows] = await query(true);
  } catch (error) {
    // Before the bot restart that adds is_admin: nobody counts as admin yet.
    if ((error as { code?: string } | null)?.code !== "ER_BAD_FIELD_ERROR") throw error;
    [rows] = await query(false);
  }
  const servers: TicketContext["servers"] = new Map();
  for (const row of rows) {
    const guildId = String(row.guild_id);
    servers.set(guildId, {
      // Role ids as digit strings — JSON.parse would round 19-digit snowflakes.
      viewer: { id: viewerId, isAdmin: Boolean(row.is_admin), roleIds: new Set(row.role_ids?.match(/\d{5,25}/g) ?? []) },
      settings: await settingsOf(guildId),
      name: row.guild_name ?? null,
    });
  }
  return { viewerId, servers };
}

interface RecordRow {
  ticket_id: string;
  guild_id: string;
  number: number;
  kind: string;
  channel_name: string;
  opener_id: string;
  opener_name: string | null;
  host_id: string | null;
  target_id: string | null;
  status: string;
  closed_by_id: string | null;
  closed_by_name: string | null;
  close_reason: string | null;
  opened_at: number;
  closed_at: number;
  message_count: number;
}

function allowed(ctx: TicketContext, row: RecordRow): boolean {
  const server = ctx.servers.get(String(row.guild_id));
  // Not a member of that server any more: only your own tickets (and never a report about you).
  const viewer = server?.viewer ?? { id: ctx.viewerId, isAdmin: false, roleIds: new Set<string>() };
  return canViewTicket(
    viewer,
    { kind: row.kind, opener_id: String(row.opener_id), host_id: row.host_id ? String(row.host_id) : null, target_id: row.target_id ? String(row.target_id) : null },
    server?.settings ?? null,
  );
}

function summaryOf(ctx: TicketContext, row: RecordRow): TicketSummary {
  return {
    id: String(row.ticket_id),
    guild_id: String(row.guild_id),
    guild_name: ctx.servers.get(String(row.guild_id))?.name ?? null,
    number: Number(row.number) || 0,
    kind: String(row.kind),
    kind_label: TICKET_KINDS[row.kind]?.label ?? String(row.kind),
    channel_name: String(row.channel_name),
    opener_id: String(row.opener_id),
    opener_name: row.opener_name ? String(row.opener_name) : null,
    status: String(row.status),
    closed_by_name: row.closed_by_name ? String(row.closed_by_name) : null,
    close_reason: row.close_reason ? String(row.close_reason) : null,
    opened_at: Number(row.opened_at) || 0,
    closed_at: Number(row.closed_at) || 0,
    message_count: Number(row.message_count) || 0,
    mine: String(row.opener_id) === ctx.viewerId,
  };
}

function demoRecord(ticket: ReturnType<typeof demoTickets>[number]): RecordRow {
  return {
    ...ticket,
    guild_id: HOME_GUILD_ID,
    channel_name: `ticket-${String(ticket.number).padStart(4, "0")}-${ticket.kind.toLowerCase()}`,
    message_count: ticket.messages.length,
  };
}

export interface TicketFilters {
  kind?: string;
  status?: string;
  q?: string;
  /** "closed_at:ticket_id" of the last ticket on the previous page. */
  before?: string;
  limit?: number;
}

const PAGE = 30;
const BATCH = 100;

export async function listTickets(ctx: TicketContext, filters: TicketFilters): Promise<TicketListPage> {
  const limit = Math.min(Math.max(filters.limit ?? PAGE, 1), 100);
  const q = filters.q?.trim().toLowerCase().replace(/^#/, "") ?? "";
  const matches = (row: RecordRow) =>
    (!filters.kind || row.kind === filters.kind) &&
    (!filters.status || row.status === filters.status) &&
    (!q ||
      String(row.channel_name).toLowerCase().includes(q) ||
      String(row.opener_name ?? "").toLowerCase().includes(q) ||
      String(row.number).padStart(4, "0").includes(q));

  if (isSchedulerDemo()) {
    const rows = demoTickets().map(demoRecord).filter((row) => matches(row) && allowed(ctx, row));
    return { tickets: rows.slice(0, limit).map((row) => summaryOf(ctx, row)), next_before: null };
  }

  await ensureTables();
  const guilds = [...ctx.servers.keys()];
  const where: string[] = [guilds.length ? `(guild_id IN (${guilds.map(() => "?").join(", ")}) OR opener_id = ?)` : "opener_id = ?"];
  const params: (string | number)[] = [...guilds, ctx.viewerId];
  if (filters.kind) {
    where.push("kind = ?");
    params.push(filters.kind);
  }
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    where.push("(channel_name LIKE ? OR opener_name LIKE ?)");
    params.push(like, like);
  }
  const start = /^(\d+):(\d+)$/.exec(filters.before ?? "");
  // Where the scan has got to (the last row looked at, shown or not).
  let cursor: { at: number; id: string } | null = start ? { at: Number(start[1]), id: start[2] } : null;
  const found: RecordRow[] = [];
  let more = false;
  for (let round = 0; round < 10 && found.length < limit; round += 1) {
    const page = cursor
      ? { sql: " AND (closed_at < ? OR (closed_at = ? AND ticket_id < ?))", params: [cursor.at, cursor.at, cursor.id] }
      : { sql: "", params: [] };
    const [rows] = await getPool().query<(RecordRow & RowDataPacket)[]>(
      `SELECT ticket_id, guild_id, number, kind, channel_name, opener_id, opener_name, host_id, target_id, status,
              closed_by_id, closed_by_name, close_reason, opened_at, closed_at, message_count
         FROM ticket_records WHERE ${where.join(" AND ")}${page.sql}
        ORDER BY closed_at DESC, ticket_id DESC LIMIT ?`,
      [...params, ...page.params, BATCH],
    );
    let stoppedEarly = false;
    for (const row of rows) {
      if (found.length >= limit) {
        stoppedEarly = true;
        break;
      }
      cursor = { at: Number(row.closed_at), id: String(row.ticket_id) };
      if (allowed(ctx, row)) found.push(row);
    }
    more = stoppedEarly || rows.length === BATCH;
    if (!more) break;
  }
  return {
    tickets: found.map((row) => summaryOf(ctx, row)),
    next_before: more && cursor ? `${cursor.at}:${cursor.id}` : null,
  };
}

interface MessageRow extends RowDataPacket {
  position: number;
  author_id: string;
  author_name: string;
  is_bot: number;
  created_at: number;
  content: string | null;
  embeds_json: unknown;
}

interface FileRow extends RowDataPacket {
  file_id: string;
  message_position: number;
  filename: string;
  content_type: string | null;
  bytes: number;
  kept: number;
}

function parseEmbeds(raw: unknown): TicketEmbed[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map((card: Partial<TicketEmbed>) => ({
    title: card.title ? String(card.title) : null,
    description: card.description ? String(card.description) : null,
    fields: Array.isArray(card.fields) ? card.fields.map((field) => ({ name: String(field.name ?? ""), value: String(field.value ?? "") })) : [],
  }));
}

function fileView(file: { file_id: string; filename: string; content_type: string | null; bytes: number; kept: boolean }): TicketFile {
  const type = (file.content_type ?? "").split(";")[0].trim().toLowerCase();
  return {
    id: file.file_id,
    filename: file.filename,
    content_type: file.content_type,
    bytes: file.bytes,
    kept: file.kept,
    image: file.kept && INLINE_IMAGE_TYPES.includes(type),
  };
}

async function recordById(ticketId: string): Promise<RecordRow | null> {
  if (!/^\d{5,32}$/.test(ticketId)) return null;
  if (isSchedulerDemo()) {
    const ticket = demoTickets().find((entry) => entry.ticket_id === ticketId);
    return ticket ? demoRecord(ticket) : null;
  }
  await ensureTables();
  const [rows] = await getPool().query<(RecordRow & RowDataPacket)[]>(
    `SELECT ticket_id, guild_id, number, kind, channel_name, opener_id, opener_name, host_id, target_id, status,
            closed_by_id, closed_by_name, close_reason, opened_at, closed_at, message_count
       FROM ticket_records WHERE ticket_id = ?`,
    [ticketId],
  );
  return rows[0] ?? null;
}

/** One ticket with its messages — null when it doesn't exist or the viewer may not see it. */
export async function getTicket(ctx: TicketContext, ticketId: string): Promise<TicketDetail | null> {
  const row = await recordById(ticketId);
  if (!row || !allowed(ctx, row)) return null;
  const ticket = { ...summaryOf(ctx, row), host_id: row.host_id ? String(row.host_id) : null, closed_by_id: row.closed_by_id ? String(row.closed_by_id) : null };

  if (isSchedulerDemo()) {
    const demo = demoTickets().find((entry) => entry.ticket_id === ticketId);
    const messages: TicketMessage[] = (demo?.messages ?? []).map((message, position) => ({
      position,
      author_id: message.author_id,
      author_name: message.author_name,
      is_bot: message.is_bot,
      created_at: row.opened_at + message.minutes * 60,
      content: message.content,
      embeds: message.embeds ?? [],
      files: (message.files ?? []).map((file) =>
        fileView({ ...file, bytes: file.content?.length ?? 52_000_000, kept: Boolean(file.content) }),
      ),
    }));
    return { ticket, messages };
  }

  const [[messageRows], [fileRows]] = await Promise.all([
    getPool().query<MessageRow[]>(
      `SELECT position, author_id, author_name, is_bot, created_at, content, embeds_json
         FROM ticket_messages WHERE ticket_id = ? ORDER BY position`,
      [ticketId],
    ),
    getPool().query<FileRow[]>(
      `SELECT file_id, message_position, filename, content_type, bytes, content IS NOT NULL AS kept
         FROM ticket_files WHERE ticket_id = ? ORDER BY message_position, filename`,
      [ticketId],
    ),
  ]);
  const files = new Map<number, TicketFile[]>();
  for (const file of fileRows) {
    const list = files.get(Number(file.message_position)) ?? [];
    list.push(
      fileView({
        file_id: String(file.file_id),
        filename: String(file.filename),
        content_type: file.content_type ? String(file.content_type) : null,
        bytes: Number(file.bytes) || 0,
        kept: Boolean(Number(file.kept)),
      }),
    );
    files.set(Number(file.message_position), list);
  }
  const messages: TicketMessage[] = messageRows.map((message) => ({
    position: Number(message.position),
    author_id: String(message.author_id),
    author_name: String(message.author_name),
    is_bot: Boolean(message.is_bot),
    created_at: Number(message.created_at) || 0,
    content: message.content ?? null,
    embeds: parseEmbeds(message.embeds_json),
    files: files.get(Number(message.position)) ?? [],
  }));
  return { ticket, messages };
}

/** A stored file of a ticket the viewer may see (null otherwise, or when it wasn't kept). */
export async function ticketFile(
  ctx: TicketContext,
  ticketId: string,
  fileId: string,
): Promise<{ filename: string; contentType: string | null; content: Buffer } | null> {
  if (!/^[0-9a-z]{1,32}$/i.test(fileId)) return null;
  const row = await recordById(ticketId);
  if (!row || !allowed(ctx, row)) return null;
  if (isSchedulerDemo()) {
    const file = demoTickets()
      .find((entry) => entry.ticket_id === ticketId)
      ?.messages.flatMap((message) => message.files ?? [])
      .find((entry) => entry.file_id === fileId);
    return file?.content ? { filename: file.filename, contentType: file.content_type, content: file.content } : null;
  }
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT filename, content_type, content FROM ticket_files WHERE ticket_id = ? AND file_id = ?",
    [ticketId, fileId],
  );
  const file = rows[0];
  if (!file?.content) return null;
  return { filename: String(file.filename), contentType: file.content_type ? String(file.content_type) : null, content: file.content as Buffer };
}
