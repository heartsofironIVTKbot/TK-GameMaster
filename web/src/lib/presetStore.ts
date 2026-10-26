import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, currentGuildId, isHomeGuild } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { demoModerationOptions } from "@/lib/databaseDemo";
import { moderationOptions } from "@/lib/playerIndex";
import {
  PRESET_LIMITS,
  layoutFromDefaults,
  type GamePreset,
  type ModeDefaults,
  type PresetData,
  type PresetDefaults,
  type PresetInput,
} from "@/lib/presetTypes";
import { parsePresetData } from "@/lib/presetValidation";
import type { HostProfile } from "@/lib/scheduleTypes";
import { DEMO_HOST, SchedulerSetupError, isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * Game mode presets, stored in the game_presets table (the web writes it
 * itself; the bot also creates it at startup). Every preset belongs to one
 * Discord server (guild_id) — a server only ever lists and edits its own.
 * shared = 1 puts a preset in the public library: every server can browse
 * it and copy it into its own list (the copy is theirs; the original stays
 * untouched). Any host of the server can use its presets; only the creator
 * or staff can change or delete one.
 *
 * "This server" is the one the host pages work on (multi-server: the
 * header's server switcher, HostProfile.guild_id).
 *
 * Preview mode (SCHEDULER_DEMO=1) keeps presets in memory with samples.
 */

export class PresetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PresetError";
  }
}

class PresetSetupError extends SchedulerSetupError {
  constructor() {
    super();
    this.message =
      "The presets table doesn't exist yet and the website couldn't create it — restart the Discord bot " +
      "with the latest code, then reload this page.";
  }
}

const PRESETS_DDL = `CREATE TABLE IF NOT EXISTS game_presets (
    preset_id VARCHAR(32) PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    guild_name VARCHAR(100) NULL,
    mode VARCHAR(64) NOT NULL,
    name VARCHAR(60) NOT NULL,
    description VARCHAR(300) NULL,
    created_by BIGINT NOT NULL,
    created_by_name VARCHAR(64) NULL,
    shared TINYINT(1) NOT NULL DEFAULT 0,
    copied_from VARCHAR(32) NULL,
    uses INT NOT NULL DEFAULT 0,
    data JSON NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX idx_game_presets_guild (guild_id, mode),
    INDEX idx_game_presets_shared (shared, updated_at)
)`;

let tableReady: Promise<void> | null = null;

/** Create the table once per server process (harmless if the bot already did). */
async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = getPool()
      .query(PRESETS_DDL)
      .then(() => undefined)
      .catch((error: unknown) => {
        // No CREATE permission is fine when the bot made the table already.
        console.warn("[presets] could not create game_presets:", (error as Error)?.message ?? error);
      });
  }
  await tableReady;
}

function rethrow(error: unknown): never {
  if ((error as { code?: string } | null)?.code === "ER_NO_SUCH_TABLE") {
    tableReady = null;
    throw new PresetSetupError();
  }
  throw error;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/** A stored row (MySQL or preview). */
interface StoredPreset {
  preset_id: string;
  guild_id: string;
  guild_name: string | null;
  mode: string;
  name: string;
  description: string | null;
  created_by: string;
  created_by_name: string | null;
  shared: boolean;
  copied_from: string | null;
  uses: number;
  data: PresetData;
  created_at: number;
  updated_at: number;
}

function toPublic(row: StoredPreset, viewer: HostProfile): GamePreset {
  const own = row.guild_id === viewer.guild_id;
  return {
    preset_id: row.preset_id,
    mode: row.mode,
    name: row.name,
    description: row.description,
    shared: row.shared,
    data: row.data,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    copied_from: row.copied_from,
    uses: row.uses,
    created_at: row.created_at,
    updated_at: row.updated_at,
    server_name: row.guild_name,
    own_server: own,
    can_edit: own && (row.created_by === viewer.discord_id || viewer.is_staff),
  };
}

function hostName(host: HostProfile): string {
  return (host.display_name || host.username || host.discord_id).slice(0, 64);
}

async function serverName(guildId: string): Promise<string | null> {
  const options = await moderationOptions(guildId).catch(() => null);
  return options?.server?.name ?? (isHomeGuild(guildId) ? (process.env.DISCORD_GUILD_NAME ?? null) : null);
}

// --- MySQL ------------------------------------------------------------------

interface PresetRow extends RowDataPacket {
  preset_id: string;
  guild_id: string;
  guild_name: string | null;
  mode: string;
  name: string;
  description: string | null;
  created_by: string;
  created_by_name: string | null;
  shared: number | boolean;
  copied_from: string | null;
  uses: number | string;
  data: unknown;
  created_at: number | string;
  updated_at: number | string;
}

const COLUMNS = `preset_id, guild_id, guild_name, mode, name, description,
  CAST(created_by AS CHAR) AS created_by, created_by_name, shared, copied_from, uses, data,
  created_at, updated_at`;

function fromRow(row: PresetRow): StoredPreset {
  return {
    preset_id: row.preset_id,
    guild_id: String(row.guild_id),
    guild_name: row.guild_name,
    mode: row.mode,
    name: row.name,
    description: row.description,
    created_by: String(row.created_by),
    created_by_name: row.created_by_name,
    shared: Boolean(row.shared),
    copied_from: row.copied_from,
    uses: num(row.uses),
    data: parsePresetData(row.data),
    created_at: num(row.created_at),
    updated_at: num(row.updated_at),
  };
}

async function query(sql: string, params: unknown[]): Promise<StoredPreset[]> {
  await ensureTable();
  try {
    const [rows] = await getPool().query<PresetRow[]>(sql, params);
    return rows.map(fromRow);
  } catch (error) {
    rethrow(error);
  }
}

async function execute(sql: string, params: unknown[]): Promise<void> {
  await ensureTable();
  try {
    await getPool().query(sql, params);
  } catch (error) {
    rethrow(error);
  }
}

const mysqlStore = {
  async list(guildId: string, mode: string | null) {
    return query(
      `SELECT ${COLUMNS} FROM game_presets WHERE guild_id = ?${mode ? " AND mode = ?" : ""}
       ORDER BY updated_at DESC LIMIT ${PRESET_LIMITS.perServer}`,
      mode ? [guildId, mode] : [guildId],
    );
  },
  async library(mode: string | null, search: string | null) {
    const where = ["shared = 1"];
    const params: unknown[] = [];
    if (mode) {
      where.push("mode = ?");
      params.push(mode);
    }
    if (search) {
      where.push("(name LIKE ? OR description LIKE ? OR guild_name LIKE ?)");
      const like = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      params.push(like, like, like);
    }
    return query(
      `SELECT ${COLUMNS} FROM game_presets WHERE ${where.join(" AND ")}
       ORDER BY uses DESC, updated_at DESC LIMIT 100`,
      params,
    );
  },
  async get(id: string) {
    return (await query(`SELECT ${COLUMNS} FROM game_presets WHERE preset_id = ?`, [id]))[0] ?? null;
  },
  async count(guildId: string) {
    await ensureTable();
    try {
      const [rows] = await getPool().query<(RowDataPacket & { total: number })[]>(
        "SELECT COUNT(*) AS total FROM game_presets WHERE guild_id = ?",
        [guildId],
      );
      return Number(rows[0]?.total ?? 0);
    } catch (error) {
      rethrow(error);
    }
  },
  async insert(row: StoredPreset) {
    await execute(
      `INSERT INTO game_presets (preset_id, guild_id, guild_name, mode, name, description, created_by,
         created_by_name, shared, copied_from, uses, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS UNSIGNED), ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.preset_id, row.guild_id, row.guild_name, row.mode, row.name, row.description, row.created_by,
        row.created_by_name, row.shared ? 1 : 0, row.copied_from, row.uses, JSON.stringify(row.data),
        row.created_at, row.updated_at,
      ],
    );
  },
  async update(row: StoredPreset) {
    await execute(
      `UPDATE game_presets SET mode = ?, name = ?, description = ?, shared = ?, data = ?, guild_name = ?,
         updated_at = ? WHERE preset_id = ? AND guild_id = ?`,
      [row.mode, row.name, row.description, row.shared ? 1 : 0, JSON.stringify(row.data), row.guild_name,
        row.updated_at, row.preset_id, row.guild_id],
    );
  },
  async remove(guildId: string, id: string) {
    await execute("DELETE FROM game_presets WHERE preset_id = ? AND guild_id = ?", [id, guildId]);
  },
  async bumpUses(guildId: string, id: string) {
    await execute("UPDATE game_presets SET uses = uses + 1 WHERE preset_id = ? AND guild_id = ?", [id, guildId]);
  },
};

// --- Preview mode (in-memory) -----------------------------------------------

const OTHER_SERVER = "777000000000000777";

function demoDefaults(mode: string): ModeDefaults | undefined {
  return modeDefaultsFrom(demoModerationOptions(), mode);
}

function demoSeed(): StoredPreset[] {
  const now = nowSec();
  const make = (
    mode: string,
    name: string,
    extra: Omit<Partial<StoredPreset>, "data"> & { keep?: string[]; data?: Partial<PresetData> },
  ): StoredPreset => {
    const { keep, data, ...rest } = extra;
    const layout = keep
      ? layoutFromDefaults(demoDefaults(mode)).map((group) => ({ ...group, enabled: keep.includes(group.name) }))
      : null;
    return {
      preset_id: crypto.randomBytes(16).toString("hex"),
      guild_id: HOME_GUILD_ID,
      guild_name: "Preview Server",
      mode,
      name,
      description: null,
      created_by: DEMO_HOST.discord_id,
      created_by_name: DEMO_HOST.display_name,
      shared: false,
      copied_from: null,
      uses: 0,
      created_at: now - 9 * 86_400,
      updated_at: now - 2 * 86_400,
      ...rest,
      data: {
        layout,
        nation_locks: [],
        major_lock_level: "Trusted",
        minor_lock_level: "All Users",
        rules: null,
        mods: null,
        ...data,
      },
    };
  };
  const axis = make("Roleplay", "Axis vs Allies", {
    description: "Three factions instead of regions; South America and Africa stay out.",
    created_by: "200000000000000002",
    created_by_name: "Senior Host",
    uses: 6,
  });
  axis.data.layout = [
    { id: "g-axis", name: "Axis", enabled: true, builtin: false, tiers: [
      { label: "Leaders", nations: ["Germany", "Italy", "Japan"] },
      { label: null, nations: ["Hungary", "Romania", "Bulgaria", "Finland", "Manchuria", "Siam"] },
    ] },
    { id: "g-allies", name: "Allies", enabled: true, builtin: false, tiers: [
      { label: "Leaders", nations: ["United Kingdom", "France", "U.S.A"] },
      { label: null, nations: ["Poland", "Canada", "Australia", "British Raj", "Netherlands", "Belgium", "Norway", "Greece", "Yugoslavia", "China"] },
    ] },
    { id: "g-comintern", name: "Comintern", enabled: true, builtin: false, tiers: [
      { label: null, nations: ["Soviet Union", "Chinese Soviet Republic"] },
    ] },
    { id: "g-neutral", name: "Neutral", enabled: true, builtin: false, tiers: [
      { label: null, nations: ["Spain", "Portugal", "Sweden", "Switzerland", "Turkey", "Ireland", "Iran"] },
    ] },
  ];
  return [
    make("Roleplay", "Europe only", {
      description: "Majors and Europe — every other region is turned off.",
      keep: ["Majors", "Europe"],
      uses: 11,
      data: {
        nation_locks: [{ label: "Majors until 12h before", nations: ["Germany", "Soviet Union"], release_hours_before: 12 }],
        mods: [
          { name: "Road to 56 Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=820260968" },
          { name: "The Road to 56 RP Submod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=2790635823" },
          { name: "Better Europe Map", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=1000000001" },
        ],
      },
    }),
    axis,
    make("Historical (Vanilla)", "Competitive Vanilla", {
      description: "Tournament rules: Verified+ only, extra ruleset.",
      shared: true,
      uses: 23,
      data: {
        major_lock_level: "Verified",
        minor_lock_level: "Verified",
        rules: [
          { name: "Historical Ruleset", link: "https://docs.google.com/document/d/1lstrrv8anR71-eaFWZP39Fg3dYK-c9MYLMvlZIBy2eM/edit?usp=sharing" },
          { name: "Tournament addendum", link: "https://docs.google.com/document/d/example-tournament" },
        ],
      },
    }),
    make("Historical (TFB)", "Pacific Theater", {
      guild_id: OTHER_SERVER,
      guild_name: "Iron Front HOI4",
      created_by: "500000000000000005",
      created_by_name: "PacificAdmiral",
      description: "Only Japan's side and the Allies — Europe is off the table.",
      shared: true,
      uses: 41,
      keep: ["Allies", "GEACPS"],
      created_at: now - 30 * 86_400,
      updated_at: now - 6 * 86_400,
    }),
    make("Roleplay", "Cold open (private)", {
      guild_id: OTHER_SERVER,
      guild_name: "Iron Front HOI4",
      created_by: "500000000000000005",
      created_by_name: "PacificAdmiral",
      description: "Not shared — preview check that other servers' private presets never show.",
    }),
    make("Kaiserreich (FFA)", "Syndicalist Revolution", {
      guild_id: "888000000000000888",
      guild_name: "Kaiserreich Central",
      created_by: "600000000000000006",
      created_by_name: "Totalist",
      description: "Third International and Entente only; the Reichspakt sits this one out.",
      shared: true,
      uses: 9,
      keep: ["Entente", "Third International"],
    }),
  ];
}

function demoRows(): StoredPreset[] {
  const holder = globalThis as { __gmPresetsDemoV1?: StoredPreset[] };
  if (!holder.__gmPresetsDemoV1) holder.__gmPresetsDemoV1 = demoSeed();
  return holder.__gmPresetsDemoV1;
}

const demoStore = {
  async list(guildId: string, mode: string | null) {
    return demoRows()
      .filter((row) => row.guild_id === guildId && (!mode || row.mode === mode))
      .sort((a, b) => b.updated_at - a.updated_at);
  },
  async library(mode: string | null, search: string | null) {
    const needle = search?.toLowerCase() ?? "";
    return demoRows()
      .filter((row) => row.shared && (!mode || row.mode === mode))
      .filter((row) => !needle || `${row.name} ${row.description ?? ""} ${row.guild_name ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => b.uses - a.uses || b.updated_at - a.updated_at);
  },
  async get(id: string) {
    return demoRows().find((row) => row.preset_id === id) ?? null;
  },
  async count(guildId: string) {
    return demoRows().filter((row) => row.guild_id === guildId).length;
  },
  async insert(row: StoredPreset) {
    demoRows().push(structuredClone(row));
  },
  async update(row: StoredPreset) {
    const rows = demoRows();
    const index = rows.findIndex((entry) => entry.preset_id === row.preset_id && entry.guild_id === row.guild_id);
    if (index >= 0) rows[index] = structuredClone(row);
  },
  async remove(guildId: string, id: string) {
    const holder = globalThis as { __gmPresetsDemoV1?: StoredPreset[] };
    holder.__gmPresetsDemoV1 = demoRows().filter((row) => !(row.preset_id === id && row.guild_id === guildId));
  },
  async bumpUses(guildId: string, id: string) {
    const row = demoRows().find((entry) => entry.preset_id === id && entry.guild_id === guildId);
    if (row) row.uses += 1;
  },
};

function store() {
  return isSchedulerDemo() ? demoStore : mysqlStore;
}

// --- Public API -------------------------------------------------------------

/** JSON error for the /api/presets routes. */
export function presetErrorResponse(error: unknown, label: string): Response {
  if (error instanceof PresetError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SchedulerSetupError || (error as Error)?.name === "DatabaseConfigError") {
    return Response.json({ error: (error as Error).message }, { status: 503 });
  }
  console.error(`[presets] ${label} failed:`, error);
  return Response.json({ error: "Database unavailable — try again shortly." }, { status: 503 });
}

function modeDefaultsFrom(
  options: Awaited<ReturnType<typeof moderationOptions>>,
  mode: string,
): ModeDefaults | undefined {
  const groups = options?.mode_layouts?.[mode];
  const nations = options?.mode_nations?.[mode];
  if (!groups || !nations) return undefined;
  const resources = options?.mode_resources?.[mode];
  return {
    groups: groups.map((group) => ({
      name: group.name,
      tiers: group.tiers.map((tier) => ({ label: tier.label ?? null, nations: [...tier.nations] })),
    })),
    majors: [...nations.majors],
    minors: [...nations.minors],
    mods: resources?.mods ?? [],
    rules: resources?.rules ?? [],
  };
}

/** Each mode's standard groups, nations, rules and mods (from the bot), on a server. */
export async function getPresetDefaults(modes: string[], guildId?: string): Promise<PresetDefaults> {
  const guild = guildId ?? (await currentGuildId());
  const options = await moderationOptions(guild).catch(() => null);
  const out: PresetDefaults["modes"] = {};
  for (const mode of modes) {
    const defaults = modeDefaultsFrom(options, mode);
    if (defaults) out[mode] = defaults;
  }
  return {
    ready: Object.keys(out).length > 0,
    modes: out,
    server: {
      id: guild,
      name: options?.server?.name ?? (isHomeGuild(guild) ? (process.env.DISCORD_GUILD_NAME ?? null) : null),
    },
  };
}

/** The mode's nation names (to check a preset against), or null when unknown. */
export async function modeNationNames(mode: string, guildId?: string): Promise<string[] | null> {
  const lists = (await moderationOptions(guildId).catch(() => null))?.mode_nations?.[mode];
  return lists ? [...lists.majors, ...lists.minors] : null;
}

/** This server's presets (optionally one mode's). */
export async function listPresets(host: HostProfile, mode: string | null): Promise<GamePreset[]> {
  return (await store().list(host.guild_id, mode)).map((row) => toPublic(row, host));
}

/** Shared presets of every server (the public library). */
export async function listLibrary(host: HostProfile, mode: string | null, search: string | null): Promise<GamePreset[]> {
  return (await store().library(mode, search)).map((row) => toPublic(row, host));
}

/** One preset this server may see: its own, or a shared one. */
export async function getPreset(host: HostProfile, id: string): Promise<GamePreset | null> {
  const row = await store().get(id);
  if (!row || (row.guild_id !== host.guild_id && !row.shared)) return null;
  return toPublic(row, host);
}

async function editable(host: HostProfile, id: string): Promise<StoredPreset> {
  const row = await store().get(id);
  if (!row || (row.guild_id !== host.guild_id && !row.shared)) throw new PresetError("That preset no longer exists.", 404);
  if (row.guild_id !== host.guild_id) throw new PresetError("This preset belongs to another server — copy it to change it.", 403);
  if (row.created_by !== host.discord_id && !host.is_staff) {
    throw new PresetError(`Only ${row.created_by_name ?? "its creator"} or staff can change this preset.`, 403);
  }
  return row;
}

export async function createPreset(host: HostProfile, input: PresetInput, copiedFrom: string | null = null): Promise<GamePreset> {
  if ((await store().count(host.guild_id)) >= PRESET_LIMITS.perServer) {
    throw new PresetError(`This server already has ${PRESET_LIMITS.perServer} presets — delete some first.`, 409);
  }
  const now = nowSec();
  const row: StoredPreset = {
    preset_id: crypto.randomBytes(16).toString("hex"),
    guild_id: host.guild_id,
    guild_name: isSchedulerDemo() ? "Preview Server" : await serverName(host.guild_id),
    mode: input.mode,
    name: input.name,
    description: input.description,
    created_by: host.discord_id,
    created_by_name: hostName(host),
    shared: input.shared,
    copied_from: copiedFrom,
    uses: 0,
    data: input.data,
    created_at: now,
    updated_at: now,
  };
  await store().insert(row);
  return toPublic(row, host);
}

export async function updatePreset(host: HostProfile, id: string, input: PresetInput): Promise<GamePreset> {
  const row = await editable(host, id);
  const next: StoredPreset = {
    ...row,
    mode: input.mode,
    name: input.name,
    description: input.description,
    shared: input.shared,
    data: input.data,
    guild_name: isSchedulerDemo() ? row.guild_name : ((await serverName(row.guild_id)) ?? row.guild_name),
    updated_at: nowSec(),
  };
  await store().update(next);
  return toPublic(next, host);
}

export async function deletePreset(host: HostProfile, id: string): Promise<void> {
  await editable(host, id);
  await store().remove(host.guild_id, id);
}

/** Copy a library preset (or one of ours) into this server's list. */
export async function copyPreset(host: HostProfile, id: string): Promise<GamePreset> {
  const source = await getPreset(host, id);
  if (!source) throw new PresetError("That preset no longer exists.", 404);
  const name = source.own_server ? `${source.name} (copy)`.slice(0, PRESET_LIMITS.name) : source.name;
  return createPreset(
    host,
    { mode: source.mode, name, description: source.description, shared: false, data: structuredClone(source.data) },
    source.preset_id,
  );
}

/** A game was scheduled with this preset (best effort). */
export async function notePresetUsed(id: string, guildId?: string): Promise<void> {
  try {
    await store().bumpUses(guildId ?? (await currentGuildId()), id);
  } catch (error) {
    console.warn("[presets] could not count a use:", (error as Error)?.message ?? error);
  }
}
