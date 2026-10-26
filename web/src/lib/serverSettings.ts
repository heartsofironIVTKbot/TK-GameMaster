import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { DiscordGuildsError, guildIconUrl, userGuilds, type OAuthGuild } from "@/lib/discordGuilds";
import { DEMO_HOST, isSchedulerDemo } from "@/lib/scheduleStore";
import { demoServers, type DemoServer } from "@/lib/serverSettingsDemo";
import {
  ADMINISTRATOR_BIT,
  changeSummary,
  normalizeSettings,
  settingsChanges,
  settingsIssues,
  STEPS,
  type GuildSnapshot,
  type HistoryEntry,
  type SaveSettingsBody,
  type ServerAccess,
  type ServerDetail,
  type ServerSettings,
  type ServerSummary,
  type ServersResponse,
  type SetupState,
  type StepId,
} from "@/lib/serverSettingsTypes";
import { getSession, type SessionUser } from "@/lib/session";

/**
 * Server settings on the website (docs/server-setup.md): which servers a
 * user can set up, one server's settings + the bot's snapshot of it, and
 * saving (optimistic version check + a history row). The bot reads
 * `guild_settings` and applies changes for its home server within ~30 s.
 */

/** The bot's home server (bot.py.py GUILD_ID). */
export const HOME_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const HISTORY_LIMIT = 40;

// Same tables as the bot (it creates them too), so the pages work before its restart.
const DDL = [
  `CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id VARCHAR(32) PRIMARY KEY, guild_name VARCHAR(100) NULL, icon VARCHAR(64) NULL, owner_id VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'needs_setup', is_home TINYINT(1) NOT NULL DEFAULT 0,
    bot_present TINYINT(1) NOT NULL DEFAULT 1, settings JSON NULL, version INT NOT NULL DEFAULT 0,
    setup_step VARCHAR(32) NULL, setup_completed_at BIGINT NULL, joined_at BIGINT NULL, left_at BIGINT NULL,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, updated_by VARCHAR(32) NULL)`,
  `CREATE TABLE IF NOT EXISTS guild_settings_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, guild_id VARCHAR(32) NOT NULL, version INT NOT NULL,
    actor_id VARCHAR(32) NULL, actor_name VARCHAR(100) NULL, summary VARCHAR(500) NULL, changes JSON NULL,
    created_at BIGINT NOT NULL, INDEX idx_guild_settings_history (guild_id, created_at))`,
  `CREATE TABLE IF NOT EXISTS web_guild_snapshot (
    guild_id VARCHAR(32) PRIMARY KEY, data JSON NOT NULL, updated_at BIGINT NOT NULL)`,
];
let tablesReady: Promise<void> | null = null;

function ensureTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      for (const sql of DDL) await getPool().query(sql);
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

interface SettingsRow extends RowDataPacket {
  guild_id: string;
  guild_name: string | null;
  icon: string | null;
  status: string;
  is_home: number;
  bot_present: number;
  settings: unknown;
  version: number;
  setup_step: string | null;
  setup_completed_at: number | string | null;
  updated_at: number | string | null;
}

function json(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw ?? null;
}

const stepId = (value: unknown): StepId | null => STEPS.find((step) => step.id === value)?.id ?? null;

/** What the viewer may do in a server (null = nothing). */
function isAdministrator(permissions: string): boolean {
  try {
    return ((BigInt(permissions || "0") >> BigInt(ADMINISTRATOR_BIT)) & BigInt(1)) === BigInt(1);
  } catch {
    return false;
  }
}

function accessOf(guild: OAuthGuild | undefined, settings: ServerSettings | null, staffIds: string[], userId: string): ServerAccess | null {
  if (guild?.owner) return "owner";
  if (guild && isAdministrator(guild.permissions)) return "admin";
  if (settings?.access.staff_can_edit_settings && staffIds.includes(userId)) return "staff";
  return null;
}

function setupState(present: boolean, status: string | null): SetupState {
  if (!present) return "not_added";
  return status === "active" ? "active" : "needs_setup";
}

export type ServersError = { status: number; message: string };

async function viewer(): Promise<{ session: SessionUser; demo: boolean } | null> {
  if (isSchedulerDemo()) {
    return { session: { discord_id: DEMO_HOST.discord_id, username: DEMO_HOST.username, avatar: null }, demo: true };
  }
  const session = await getSession();
  return session ? { session, demo: false } : null;
}

function demoSummary(server: DemoServer): ServerSummary {
  return {
    id: server.id,
    name: server.name,
    icon_url: server.icon,
    access: server.access,
    bot_present: server.bot_present,
    setup: setupState(server.bot_present, server.status),
    is_home: server.is_home,
    member_count: server.snapshot?.guild.member_count ?? null,
  };
}

const ORDER: Record<SetupState, number> = { needs_setup: 0, active: 1, not_added: 2 };
const sortServers = (servers: ServerSummary[]) =>
  servers.sort((a, b) => Number(b.is_home) - Number(a.is_home) || ORDER[a.setup] - ORDER[b.setup] || a.name.localeCompare(b.name));

/** GET /api/servers — every server the viewer can set up. */
export async function listServers(): Promise<ServersResponse> {
  const who = await viewer();
  if (!who) return { status: "anonymous" };
  if (who.demo) {
    return { status: "ok", username: who.session.username, demo: true, servers: sortServers([...demoServers().values()].map(demoSummary)) };
  }
  let guilds: OAuthGuild[] | null;
  try {
    guilds = await userGuilds(who.session);
  } catch (error) {
    return { status: "unavailable", message: error instanceof DiscordGuildsError ? error.message : "Couldn't reach Discord." };
  }
  if (!guilds) return { status: "needs_scope", username: who.session.username };
  await ensureTables();
  const ids = guilds.map((guild) => guild.id);
  const rows = ids.length
    ? (
        await getPool().query<SettingsRow[]>(
          `SELECT guild_id, guild_name, icon, status, is_home, bot_present, settings, version, setup_step,
                  setup_completed_at, updated_at FROM guild_settings WHERE guild_id IN (?)`,
          [ids],
        )
      )[0]
    : [];
  const staffRows = ids.length
    ? (
        await getPool().query<(RowDataPacket & { guild_id: string; staff: unknown; members: unknown })[]>(
          `SELECT guild_id, JSON_EXTRACT(data, '$.staff_user_ids') AS staff, JSON_EXTRACT(data, '$.guild.member_count') AS members
             FROM web_guild_snapshot WHERE guild_id IN (?)`,
          [ids],
        )
      )[0]
    : [];
  const byId = new Map(rows.map((row) => [String(row.guild_id), row]));
  const snapById = new Map(staffRows.map((row) => [String(row.guild_id), row]));
  const servers: ServerSummary[] = [];
  for (const guild of guilds) {
    const row = byId.get(guild.id);
    const settings = row?.settings ? normalizeSettings(json(row.settings), guild.name) : null;
    const snap = snapById.get(guild.id);
    const staff = (json(snap?.staff) as unknown[] | null) ?? [];
    const access = accessOf(guild, settings, staff.map(String), who.session.discord_id);
    if (!access) continue;
    const present = Boolean(row && Number(row.bot_present));
    servers.push({
      id: guild.id,
      name: guild.name,
      icon_url: guildIconUrl(guild.id, guild.icon),
      access,
      bot_present: present,
      setup: setupState(present, row?.status ?? null),
      is_home: guild.id === HOME_GUILD_ID,
      member_count: snap?.members != null ? Number(json(snap.members)) || null : null,
    });
  }
  return { status: "ok", username: who.session.username, demo: false, servers: sortServers(servers) };
}

interface Loaded {
  who: { session: SessionUser; demo: boolean };
  summary: ServerSummary;
  row: { status: string; version: number; settings: ServerSettings | null; setup_step: StepId | null; completed_at: number | null; updated_at: number | null; is_home: boolean } | null;
  snapshot: GuildSnapshot | null;
}

/** One server the viewer may set up, or an error to show. */
async function loadServer(guildId: string): Promise<Loaded | ServersError> {
  const who = await viewer();
  if (!who) return { status: 401, message: "Log in with Discord first." };
  if (who.demo) {
    const server = demoServers().get(guildId);
    if (!server) return { status: 404, message: "You can't set up that server." };
    return {
      who,
      summary: demoSummary(server),
      row: server.bot_present
        ? {
            status: server.status,
            version: server.version,
            settings: server.settings,
            setup_step: server.setup_step,
            completed_at: server.completed_at,
            updated_at: server.updated_at,
            is_home: server.is_home,
          }
        : null,
      snapshot: server.snapshot,
    };
  }
  let guilds: OAuthGuild[] | null;
  try {
    guilds = await userGuilds(who.session);
  } catch (error) {
    return { status: 503, message: error instanceof DiscordGuildsError ? error.message : "Couldn't reach Discord." };
  }
  if (!guilds) return { status: 401, message: "Connect your servers first (log in again from the Servers page)." };
  const guild = guilds.find((entry) => entry.id === guildId);
  await ensureTables();
  const [rows] = await getPool().query<SettingsRow[]>(
    `SELECT guild_id, guild_name, icon, status, is_home, bot_present, settings, version, setup_step, setup_completed_at, updated_at
       FROM guild_settings WHERE guild_id = ?`,
    [guildId],
  );
  const raw = rows[0] ?? null;
  const [snaps] = await getPool().query<(RowDataPacket & { data: unknown })[]>(
    "SELECT data FROM web_guild_snapshot WHERE guild_id = ?",
    [guildId],
  );
  const snapshot = (json(snaps[0]?.data) as GuildSnapshot | null) ?? null;
  const name = guild?.name ?? raw?.guild_name ?? snapshot?.guild.name ?? "Server";
  const settings = raw?.settings ? normalizeSettings(json(raw.settings), name) : null;
  const access = accessOf(guild, settings, snapshot?.staff_user_ids ?? [], who.session.discord_id);
  if (!access) return { status: 403, message: "Only the server's owner, its admins, or Host Management the owner allowed can set it up." };
  const present = Boolean(raw && Number(raw.bot_present));
  return {
    who,
    summary: {
      id: guildId,
      name,
      icon_url: guild ? guildIconUrl(guild.id, guild.icon) : null,
      access,
      bot_present: present,
      setup: setupState(present, raw?.status ?? null),
      is_home: guildId === HOME_GUILD_ID,
      member_count: snapshot?.guild.member_count ?? null,
    },
    row: raw
      ? {
          status: raw.status,
          version: Number(raw.version) || 0,
          settings,
          setup_step: stepId(raw.setup_step),
          completed_at: Number(raw.setup_completed_at) || null,
          updated_at: Number(raw.updated_at) || null,
          is_home: Boolean(Number(raw.is_home)),
        }
      : null,
    snapshot,
  };
}

async function history(guildId: string): Promise<HistoryEntry[]> {
  if (isSchedulerDemo()) return demoServers().get(guildId)?.history ?? [];
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT version, actor_name, summary, changes, created_at FROM guild_settings_history
      WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ${HISTORY_LIMIT}`,
    [guildId],
  );
  return rows.map((row) => ({
    version: Number(row.version) || 0,
    actor_name: row.actor_name ?? null,
    summary: row.summary ?? null,
    changes: ((json(row.changes) as HistoryEntry["changes"] | null) ?? []).slice(0, 60),
    created_at: Number(row.created_at) || 0,
  }));
}

/** GET /api/servers/<id>. */
export async function getServerDetail(guildId: string): Promise<ServerDetail | ServersError> {
  const loaded = await loadServer(guildId);
  if ("message" in loaded) return loaded;
  return {
    server: loaded.summary,
    settings: loaded.row?.settings ?? normalizeSettings(null, loaded.summary.name),
    version: loaded.row?.version ?? 0,
    setup_step: loaded.row?.setup_step ?? null,
    completed_at: loaded.row?.completed_at ?? null,
    updated_at: loaded.row?.updated_at ?? null,
    snapshot: loaded.snapshot,
    history: await history(guildId),
    viewer_id: loaded.who.session.discord_id,
  };
}

export type SaveResult = { ok: true; version: number; setup: SetupState; changed: number } | ServersError;

/** PUT /api/servers/<id>: save a step (draft) or finish setup. */
export async function saveServerSettings(guildId: string, body: SaveSettingsBody): Promise<SaveResult> {
  const loaded = await loadServer(guildId);
  if ("message" in loaded) return loaded;
  const { row, summary, snapshot, who } = loaded;
  if (!row || !summary.bot_present) return { status: 409, message: "Add GameMaster to this server first." };
  if (row.is_home && !row.settings) {
    return {
      status: 409,
      message: "GameMaster is still copying this server's current roles and channels into the settings — restart the bot, then reload.",
    };
  }
  if (Number(body.version) !== row.version) {
    return { status: 409, message: "Someone else saved these settings a moment ago — reload to see their changes, then try again." };
  }
  const before = row.settings ?? normalizeSettings(null, summary.name);
  const next = normalizeSettings(body.settings, summary.name);
  const changes = settingsChanges(before, next);
  const finishing = Boolean(body.finish) && row.status !== "active";

  // Finishing needs a clean bill of health; after setup, a save may not add new problems.
  const afterIssues = settingsIssues(next, snapshot, summary.bot_present).filter((issue) => issue.level === "error");
  if (finishing && afterIssues.length > 0) {
    return { status: 409, message: `Fix these first: ${afterIssues.slice(0, 3).map((issue) => issue.message.replace(/\*\*/g, "")).join(" · ")}` };
  }
  if (row.status === "active") {
    const known = new Set(settingsIssues(before, snapshot, summary.bot_present).filter((issue) => issue.level === "error").map((issue) => issue.path));
    const added = afterIssues.filter((issue) => !known.has(issue.path));
    if (added.length > 0) {
      return { status: 409, message: `This would break the setup: ${added.slice(0, 3).map((issue) => issue.message.replace(/\*\*/g, "")).join(" · ")}` };
    }
  }
  const step = stepId(body.step);
  if (changes.length === 0 && !finishing && (!step || step === row.setup_step)) {
    return { ok: true, version: row.version, setup: summary.setup, changed: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const version = row.version + 1;
  const status = finishing ? "active" : row.status === "active" ? "active" : "needs_setup";
  const summaryText = changeSummary(changes, finishing);
  const actorName = (who.session.username || who.session.discord_id).slice(0, 100);
  if (who.demo) {
    const server = demoServers().get(guildId);
    if (!server) return { status: 404, message: "Server not found." };
    Object.assign(server, {
      settings: next,
      version,
      status,
      setup_step: step ?? server.setup_step,
      completed_at: finishing ? now : server.completed_at,
      updated_at: now,
    });
    if (changes.length > 0 || finishing) {
      server.history.unshift({ version, actor_name: actorName, summary: summaryText, changes: changes.slice(0, 60), created_at: now });
    }
    return { ok: true, version, setup: setupState(true, status), changed: changes.length };
  }

  const [result] = await getPool().query<ResultSetHeader>(
    `UPDATE guild_settings SET settings = ?, version = ?, status = ?, setup_step = COALESCE(?, setup_step),
            setup_completed_at = IF(? = 1, COALESCE(setup_completed_at, ?), setup_completed_at),
            updated_at = ?, updated_by = ?
      WHERE guild_id = ? AND version = ?`,
    [JSON.stringify(next), version, status, step, finishing ? 1 : 0, now, now, who.session.discord_id, guildId, row.version],
  );
  if (result.affectedRows === 0) {
    return { status: 409, message: "Someone else saved these settings a moment ago — reload to see their changes, then try again." };
  }
  if (changes.length > 0 || finishing) {
    await getPool().query(
      `INSERT INTO guild_settings_history (guild_id, version, actor_id, actor_name, summary, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [guildId, version, who.session.discord_id, actorName, summaryText.slice(0, 500), JSON.stringify(changes.slice(0, 200)), now],
    );
  }
  return { ok: true, version, setup: setupState(true, status), changed: changes.length };
}

/** Who may queue "Create for me" for this server (same rule as viewing it). */
export async function setupRequester(guildId: string): Promise<{ userId: string } | ServersError> {
  const loaded = await loadServer(guildId);
  if ("message" in loaded) return loaded;
  if (!loaded.summary.bot_present) return { status: 409, message: "Add GameMaster to this server first." };
  return { userId: loaded.who.session.discord_id };
}

/** Who may see a server's dashboard and health (same rule as its settings), and its state. */
export async function dashboardAccess(
  guildId: string,
): Promise<{ setupDone: boolean; botPresent: boolean; snapshotAt: number | null } | ServersError> {
  const loaded = await loadServer(guildId);
  if ("message" in loaded) return loaded;
  return {
    setupDone: loaded.summary.setup === "active",
    botPresent: loaded.summary.bot_present,
    snapshotAt: loaded.snapshot?.updated_at ?? null,
  };
}

/** The home server's settings; null before the bot seeds them. */
export async function homeSettings(): Promise<ServerSettings | null> {
  return settingsOf(HOME_GUILD_ID);
}

/** A server's settings (calendar mode list etc.); null before it has any. */
export async function settingsOf(guildId: string): Promise<ServerSettings | null> {
  if (isSchedulerDemo()) return demoServers().get(guildId)?.settings ?? null;
  try {
    await ensureTables();
    const [rows] = await getPool().query<SettingsRow[]>("SELECT settings, guild_name FROM guild_settings WHERE guild_id = ?", [guildId]);
    const raw = rows[0];
    return raw?.settings ? normalizeSettings(json(raw.settings), raw.guild_name ?? "") : null;
  } catch {
    return null;
  }
}
