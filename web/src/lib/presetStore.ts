import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID, currentGuildId, isHomeGuild } from "@/lib/currentGuild";
import officialJson from "@/data/officialPresets.json";
import { getPool } from "@/lib/db";
import { demoModerationOptions } from "@/lib/databaseDemo";
import { moderationOptions } from "@/lib/playerIndex";
import {
  PRESET_LIMITS,
  layoutFromDefaults,
  presetDiff,
  type GamePreset,
  type ModeDefaults,
  type PresetData,
  type PresetDefaults,
  type PresetInput,
  type PresetUpdateCheck,
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
 * GameMaster's own presets (official = 1) are TommyKay's curated lists from
 * the bot (data/officialPresets.json, written by
 * scripts/export_map_nations.py). They belong to the home server, are
 * written here on start-up and never change from the website: editing one
 * saves a copy. Road to 56 and FFA stay TommyKay's; the rest are in the
 * library. On the home server each one is its mode's default until staff
 * pick another.
 *
 * A copy remembers its original (copied_from), the original's updated_at
 * when it was copied or last updated (copied_version) and a fingerprint of
 * its own data then (copied_hash): a newer original means "Update
 * available", a different fingerprint means the copy was changed since.
 *
 * Each server's default preset per mode (the calendar loads it first) is
 * in game_preset_defaults; preset_id "" = no default.
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
    official TINYINT(1) NOT NULL DEFAULT 0,
    copied_version BIGINT NULL,
    copied_hash VARCHAR(16) NULL,
    INDEX idx_game_presets_guild (guild_id, mode),
    INDEX idx_game_presets_shared (shared, updated_at)
)`;

/** Columns added after the table first shipped. */
const PRESETS_COLUMNS = [
  "official TINYINT(1) NOT NULL DEFAULT 0",
  "copied_version BIGINT NULL",
  "copied_hash VARCHAR(16) NULL",
];

const DEFAULTS_DDL = `CREATE TABLE IF NOT EXISTS game_preset_defaults (
    guild_id VARCHAR(32) NOT NULL,
    mode VARCHAR(64) NOT NULL,
    preset_id VARCHAR(32) NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (guild_id, mode)
)`;

let tableReady: Promise<void> | null = null;

/** Create the tables and GameMaster's presets once per server process. */
async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const pool = getPool();
      try {
        await pool.query(PRESETS_DDL);
      } catch (error) {
        // No CREATE permission is fine when the bot made the table already.
        console.warn("[presets] could not create game_presets:", (error as Error)?.message ?? error);
      }
      for (const column of PRESETS_COLUMNS) {
        try {
          await pool.query(`ALTER TABLE game_presets ADD COLUMN ${column}`);
        } catch (error) {
          if ((error as { errno?: number })?.errno !== 1060) {
            console.warn("[presets] could not add a column:", (error as Error)?.message ?? error);
          }
        }
      }
      try {
        await pool.query(DEFAULTS_DDL);
      } catch (error) {
        console.warn("[presets] could not create game_preset_defaults:", (error as Error)?.message ?? error);
      }
      try {
        await seedOfficial();
      } catch (error) {
        console.warn("[presets] could not write GameMaster's presets:", (error as Error)?.message ?? error);
      }
    })();
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

/** A short fingerprint of a preset's settings (same settings, same fingerprint). */
export function presetHash(data: PresetData): string {
  return crypto.createHash("sha256").update(JSON.stringify(parsePresetData(data))).digest("hex").slice(0, 16);
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
  official: boolean;
  copied_version: number | null;
  copied_hash: string | null;
}

/** What the viewer's server knows about a row besides the row itself. */
interface RowContext {
  defaults: Map<string, string>;
  /** Originals of this server's copies (only ones the server may still see). */
  sources: Map<string, StoredPreset>;
}

function updateAvailable(row: StoredPreset, sources: Map<string, StoredPreset>): boolean {
  const source = row.copied_from ? sources.get(row.copied_from) : undefined;
  return Boolean(source && row.copied_version !== null && source.updated_at > row.copied_version);
}

function toPublic(row: StoredPreset, viewer: HostProfile, context?: RowContext): GamePreset {
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
    server_name: row.official ? "GameMaster" : row.guild_name,
    own_server: own,
    can_edit: own && !row.official && (row.created_by === viewer.discord_id || viewer.is_staff),
    official: row.official,
    is_default: own && context?.defaults.get(row.mode) === row.preset_id,
    update_available: own && context ? updateAvailable(row, context.sources) : false,
  };
}

function hostName(host: HostProfile): string {
  return (host.display_name || host.username || host.discord_id).slice(0, 64);
}

async function serverName(guildId: string): Promise<string | null> {
  const options = await moderationOptions(guildId).catch(() => null);
  return options?.server?.name ?? (isHomeGuild(guildId) ? (process.env.DISCORD_GUILD_NAME ?? null) : null);
}

// --- GameMaster's own presets -------------------------------------------------

interface OfficialEntry {
  preset_id: string;
  mode: string;
  name: string;
  description: string;
  home_only: boolean;
  data: unknown;
}

const OFFICIAL = (officialJson as { presets: OfficialEntry[] }).presets;
const OFFICIAL_IDS = new Set(OFFICIAL.map((entry) => entry.preset_id));

/** GameMaster's presets as rows of the home server (dates filled in when written). */
function officialRows(at: number): StoredPreset[] {
  return OFFICIAL.map((entry) => ({
    preset_id: entry.preset_id,
    guild_id: HOME_GUILD_ID,
    guild_name: "GameMaster",
    mode: entry.mode,
    name: entry.name,
    description: entry.description,
    created_by: "0",
    created_by_name: "GameMaster",
    shared: !entry.home_only,
    copied_from: null,
    uses: 0,
    data: parsePresetData(entry.data),
    created_at: at,
    updated_at: at,
    official: true,
    copied_version: null,
    copied_hash: null,
  }));
}

/** On the home server, GameMaster's preset of a mode is its default until staff pick another. */
function implicitDefault(guildId: string, mode: string): string | undefined {
  if (!isHomeGuild(guildId)) return undefined;
  return OFFICIAL.find((entry) => entry.mode === mode)?.preset_id;
}

/** Write GameMaster's presets; one only changes (and gets a newer date) when its settings did. */
async function seedOfficial(): Promise<void> {
  if (!HOME_GUILD_ID || OFFICIAL.length === 0) return;
  const pool = getPool();
  const [rows] = await pool.query<PresetRow[]>(`SELECT ${COLUMNS} FROM game_presets WHERE preset_id IN (?)`, [
    [...OFFICIAL_IDS],
  ]);
  const stored = new Map(rows.map((row) => [row.preset_id, fromRow(row)]));
  const now = nowSec();
  for (const row of officialRows(now)) {
    const current = stored.get(row.preset_id);
    if (!current) {
      await mysqlStore.insert(row);
      continue;
    }
    const same =
      current.official &&
      current.guild_id === row.guild_id &&
      current.name === row.name &&
      current.description === row.description &&
      current.shared === row.shared &&
      presetHash(current.data) === presetHash(row.data);
    if (!same) {
      await pool.query(
        `UPDATE game_presets SET guild_id = ?, guild_name = ?, mode = ?, name = ?, description = ?, shared = ?,
           data = ?, official = 1, updated_at = ? WHERE preset_id = ?`,
        [row.guild_id, row.guild_name, row.mode, row.name, row.description, row.shared ? 1 : 0, JSON.stringify(row.data),
          now, row.preset_id],
      );
    }
  }
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
  official: number | boolean | null;
  copied_version: number | string | null;
  copied_hash: string | null;
}

const COLUMNS = `preset_id, guild_id, guild_name, mode, name, description,
  CAST(created_by AS CHAR) AS created_by, created_by_name, shared, copied_from, uses, data,
  created_at, updated_at, official, copied_version, copied_hash`;

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
    official: Boolean(row.official),
    copied_version: row.copied_version === null || row.copied_version === undefined ? null : num(row.copied_version),
    copied_hash: row.copied_hash ?? null,
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
       ORDER BY official DESC, updated_at DESC LIMIT ${PRESET_LIMITS.perServer + OFFICIAL.length}`,
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
       ORDER BY official DESC, uses DESC, updated_at DESC LIMIT 100`,
      params,
    );
  },
  async get(id: string) {
    return (await query(`SELECT ${COLUMNS} FROM game_presets WHERE preset_id = ?`, [id]))[0] ?? null;
  },
  async getMany(ids: string[]) {
    if (ids.length === 0) return [];
    return query(`SELECT ${COLUMNS} FROM game_presets WHERE preset_id IN (?)`, [ids]);
  },
  async count(guildId: string) {
    await ensureTable();
    try {
      const [rows] = await getPool().query<(RowDataPacket & { total: number })[]>(
        "SELECT COUNT(*) AS total FROM game_presets WHERE guild_id = ? AND official = 0",
        [guildId],
      );
      return Number(rows[0]?.total ?? 0);
    } catch (error) {
      rethrow(error);
    }
  },
  async insert(row: StoredPreset) {
    await getPool().query(
      `INSERT INTO game_presets (preset_id, guild_id, guild_name, mode, name, description, created_by,
         created_by_name, shared, copied_from, uses, data, created_at, updated_at, official, copied_version, copied_hash)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS UNSIGNED), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.preset_id, row.guild_id, row.guild_name, row.mode, row.name, row.description, row.created_by,
        row.created_by_name, row.shared ? 1 : 0, row.copied_from, row.uses, JSON.stringify(row.data),
        row.created_at, row.updated_at, row.official ? 1 : 0, row.copied_version, row.copied_hash,
      ],
    );
  },
  async update(row: StoredPreset) {
    await execute(
      `UPDATE game_presets SET mode = ?, name = ?, description = ?, shared = ?, data = ?, guild_name = ?,
         updated_at = ?, copied_version = ?, copied_hash = ? WHERE preset_id = ? AND guild_id = ? AND official = 0`,
      [row.mode, row.name, row.description, row.shared ? 1 : 0, JSON.stringify(row.data), row.guild_name,
        row.updated_at, row.copied_version, row.copied_hash, row.preset_id, row.guild_id],
    );
  },
  async remove(guildId: string, id: string) {
    await execute("DELETE FROM game_presets WHERE preset_id = ? AND guild_id = ? AND official = 0", [id, guildId]);
  },
  async bumpUses(guildId: string, id: string) {
    await execute("UPDATE game_presets SET uses = uses + 1 WHERE preset_id = ? AND guild_id = ?", [id, guildId]);
  },
  async defaults(guildId: string) {
    await ensureTable();
    try {
      const [rows] = await getPool().query<(RowDataPacket & { mode: string; preset_id: string })[]>(
        "SELECT mode, preset_id FROM game_preset_defaults WHERE guild_id = ?",
        [guildId],
      );
      return new Map(rows.map((row) => [row.mode, row.preset_id]));
    } catch (error) {
      rethrow(error);
    }
  },
  async setDefault(guildId: string, mode: string, presetId: string) {
    await execute(
      `INSERT INTO game_preset_defaults (guild_id, mode, preset_id, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE preset_id = VALUES(preset_id), updated_at = VALUES(updated_at)`,
      [guildId, mode, presetId, nowSec()],
    );
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
      official: false,
      copied_version: null,
      copied_hash: null,
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
  // GameMaster's presets, as the home server has them; one of them changed last week.
  const official = officialRows(now - 40 * 86_400).map((row, index) => ({
    ...row,
    uses: [48, 17, 41, 6, 22, 160, 213, 74, 12, 30][index] ?? 0,
  }));
  const tfb = official.find((row) => row.mode === "Historical (TFB)");
  if (tfb) tfb.updated_at = now - 7 * 86_400;
  // A copy of it from before that change (and edited since): "Update available".
  const tfbCopy = tfb
    ? make("Historical (TFB)", "Main factions", {
        description: "Copied from GameMaster: Allies, Comintern, Axis and GEACPS.",
        copied_from: tfb.preset_id,
        copied_version: now - 30 * 86_400,
        copied_hash: "edited",
        created_at: now - 30 * 86_400,
        updated_at: now - 12 * 86_400,
        uses: 9,
        data: {
          ...structuredClone(tfb.data),
          layout: (tfb.data.layout ?? []).map((group) => ({
            ...group,
            tiers: group.tiers.map((tier) => ({
              ...tier,
              nations: tier.nations.filter((nation) => nation !== "Mexico" && nation !== "Siam"),
            })),
          })),
          major_lock_level: "Verified",
          nation_locks: [{ label: "Majors until 12h before", nations: ["Germany", "Soviet Union"], release_hours_before: 12 }],
        },
      })
    : null;
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
    ...official,
    ...(tfbCopy ? [tfbCopy] : []),
    make("Roleplay", "Europe only", {
      description: "Majors and Europe; every other region is turned off.",
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
      description: "Only Japan's side and the Allies; Europe is off the table.",
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
      description: "Not shared: preview check that other servers' private presets never show.",
    }),
    make("Kaiserreich (FFA)", "Syndicalist Revolution", {
      guild_id: "888000000000000888",
      guild_name: "Kaiserreich Central",
      created_by: "600000000000000006",
      created_by_name: "Totalist",
      description: "Third International and Entente only; the Reichspakt sits this one out.",
      shared: true,
      uses: 9,
      data: {
        layout: (official.find((row) => row.mode === "Kaiserreich (FFA)")?.data.layout ?? []).map((group) => ({
          ...group,
          enabled: group.name === "Entente" || group.name === "Third International",
        })),
      },
    }),
  ];
}

interface DemoState {
  rows: StoredPreset[];
  defaults: Map<string, string>;
}

function demoState(): DemoState {
  const holder = globalThis as { __gmPresetsDemoV2?: DemoState };
  if (!holder.__gmPresetsDemoV2) holder.__gmPresetsDemoV2 = { rows: demoSeed(), defaults: new Map() };
  return holder.__gmPresetsDemoV2;
}

const demoStore = {
  async list(guildId: string, mode: string | null) {
    return demoState()
      .rows.filter((row) => row.guild_id === guildId && (!mode || row.mode === mode))
      .sort((a, b) => Number(b.official) - Number(a.official) || b.updated_at - a.updated_at);
  },
  async library(mode: string | null, search: string | null) {
    const needle = search?.toLowerCase() ?? "";
    return demoState()
      .rows.filter((row) => row.shared && (!mode || row.mode === mode))
      .filter((row) => !needle || `${row.name} ${row.description ?? ""} ${row.guild_name ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.official) - Number(a.official) || b.uses - a.uses || b.updated_at - a.updated_at);
  },
  async get(id: string) {
    return demoState().rows.find((row) => row.preset_id === id) ?? null;
  },
  async getMany(ids: string[]) {
    return demoState().rows.filter((row) => ids.includes(row.preset_id));
  },
  async count(guildId: string) {
    return demoState().rows.filter((row) => row.guild_id === guildId && !row.official).length;
  },
  async insert(row: StoredPreset) {
    demoState().rows.push(structuredClone(row));
  },
  async update(row: StoredPreset) {
    const rows = demoState().rows;
    const index = rows.findIndex((entry) => entry.preset_id === row.preset_id && entry.guild_id === row.guild_id && !entry.official);
    if (index >= 0) rows[index] = structuredClone(row);
  },
  async remove(guildId: string, id: string) {
    const state = demoState();
    state.rows = state.rows.filter((row) => !(row.preset_id === id && row.guild_id === guildId && !row.official));
  },
  async bumpUses(guildId: string, id: string) {
    const row = demoState().rows.find((entry) => entry.preset_id === id && entry.guild_id === guildId);
    if (row) row.uses += 1;
  },
  async defaults(guildId: string) {
    const out = new Map<string, string>();
    for (const [key, presetId] of demoState().defaults) {
      const [guild, mode] = key.split("|");
      if (guild === guildId) out.set(mode, presetId);
    }
    return out;
  },
  async setDefault(guildId: string, mode: string, presetId: string) {
    demoState().defaults.set(`${guildId}|${mode}`, presetId);
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

/** Each mode's whole map (its standard groups), nations, rules and mods (from the bot), on a server. */
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

/** A server's default preset per mode (its own choice, else GameMaster's on the home server). */
async function serverDefaults(guildId: string, modes: Iterable<string>): Promise<Map<string, string>> {
  const chosen = await store().defaults(guildId);
  const out = new Map<string, string>();
  for (const mode of modes) {
    const id = chosen.has(mode) ? chosen.get(mode) : implicitDefault(guildId, mode);
    if (id) out.set(mode, id);
  }
  return out;
}

/** The originals of these copies that the server may still see. */
async function sourcesOf(rows: StoredPreset[], guildId: string): Promise<Map<string, StoredPreset>> {
  const ids = [...new Set(rows.map((row) => row.copied_from).filter((id): id is string => Boolean(id)))];
  const sources = await store().getMany(ids);
  return new Map(
    sources.filter((source) => source.shared || source.guild_id === guildId).map((source) => [source.preset_id, source]),
  );
}

/** GameMaster's presets in the calendar's mode order, then the rest (newest first, as stored). */
function officialFirst(rows: StoredPreset[]): StoredPreset[] {
  const order = (row: StoredPreset) => (row.official ? OFFICIAL.findIndex((entry) => entry.preset_id === row.preset_id) : OFFICIAL.length);
  return rows.map((row, index) => ({ row, index })).sort((a, b) => order(a.row) - order(b.row) || a.index - b.index).map(({ row }) => row);
}

/** This server's presets (optionally one mode's), GameMaster's first. */
export async function listPresets(host: HostProfile, mode: string | null): Promise<GamePreset[]> {
  const rows = officialFirst(await store().list(host.guild_id, mode));
  const context: RowContext = {
    defaults: await serverDefaults(host.guild_id, new Set(rows.map((row) => row.mode))),
    sources: await sourcesOf(rows, host.guild_id),
  };
  return rows.map((row) => toPublic(row, host, context));
}

/** Shared presets of every server (the public library), GameMaster's first. */
export async function listLibrary(host: HostProfile, mode: string | null, search: string | null): Promise<GamePreset[]> {
  return officialFirst(await store().library(mode, search)).map((row) => toPublic(row, host));
}

async function visible(host: HostProfile, id: string): Promise<StoredPreset | null> {
  const row = await store().get(id);
  return row && (row.guild_id === host.guild_id || row.shared) ? row : null;
}

/** One preset this server may see: its own, or a shared one. */
export async function getPreset(host: HostProfile, id: string): Promise<GamePreset | null> {
  const row = await visible(host, id);
  if (!row) return null;
  if (row.guild_id !== host.guild_id) return toPublic(row, host);
  return toPublic(row, host, {
    defaults: await serverDefaults(host.guild_id, [row.mode]),
    sources: await sourcesOf([row], host.guild_id),
  });
}

async function editable(host: HostProfile, id: string): Promise<StoredPreset> {
  const row = await visible(host, id);
  if (!row) throw new PresetError("That preset no longer exists.", 404);
  if (row.official) throw new PresetError("GameMaster's presets don't change. Saving makes your own copy.", 403);
  if (row.guild_id !== host.guild_id) throw new PresetError("This preset belongs to another server. Saving makes your own copy.", 403);
  if (row.created_by !== host.discord_id && !host.is_staff) {
    throw new PresetError(`Only ${row.created_by_name ?? "its creator"} or staff can change this preset.`, 403);
  }
  return row;
}

/**
 * Save a new preset. `copiedFrom` = the preset it was made from (a copy, or
 * an edited GameMaster / other server's preset): the new one remembers it
 * so it can offer that preset's later changes.
 */
export async function createPreset(host: HostProfile, input: PresetInput, copiedFrom: string | null = null): Promise<GamePreset> {
  if ((await store().count(host.guild_id)) >= PRESET_LIMITS.perServer) {
    throw new PresetError(`This server already has ${PRESET_LIMITS.perServer} presets — delete some first.`, 409);
  }
  const source = copiedFrom ? await visible(host, copiedFrom) : null;
  if (copiedFrom && !source) throw new PresetError("The preset you started from no longer exists.", 404);
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
    copied_from: source?.preset_id ?? null,
    uses: 0,
    data: input.data,
    created_at: now,
    updated_at: now,
    official: false,
    // A copy that starts out changed counts as changed: its fingerprint is the original's.
    copied_version: source ? source.updated_at : null,
    copied_hash: source ? presetHash(source.data) : null,
  };
  // The MySQL insert skips `execute` (writing GameMaster's presets uses it too, inside ensureTable).
  if (!isSchedulerDemo()) await ensureTable();
  try {
    await store().insert(row);
  } catch (error) {
    rethrow(error);
  }
  return (await getPreset(host, row.preset_id)) ?? toPublic(row, host);
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
  return (await getPreset(host, id)) ?? toPublic(next, host);
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

/** Make a preset this server's default for its mode, or (`on` false) have no default for that mode. */
export async function setDefaultPreset(host: HostProfile, id: string, on: boolean): Promise<GamePreset> {
  if (!host.is_staff) throw new PresetError("Only staff can choose the default preset.", 403);
  const row = await visible(host, id);
  if (!row || row.guild_id !== host.guild_id) throw new PresetError("That preset no longer exists.", 404);
  await store().setDefault(host.guild_id, row.mode, on ? row.preset_id : "");
  return (await getPreset(host, id)) ?? toPublic(row, host);
}

async function ownCopy(host: HostProfile, id: string): Promise<{ row: StoredPreset; source: StoredPreset }> {
  const row = await editable(host, id);
  const source = row.copied_from ? (await sourcesOf([row], host.guild_id)).get(row.copied_from) : undefined;
  if (!source) throw new PresetError("The preset this was copied from is gone or no longer shared.", 404);
  return { row, source };
}

/** What updating a copy from its original would change. */
export async function checkPresetUpdate(host: HostProfile, id: string): Promise<PresetUpdateCheck> {
  const { row, source } = await ownCopy(host, id);
  return {
    source: toPublic(source, host),
    changes: presetDiff(row.data, source.data),
    own_edits: row.copied_hash !== null && presetHash(row.data) !== row.copied_hash,
  };
}

/**
 * Answer "Update available": `update` takes the original's settings (the
 * copy keeps its name and sharing), `new` saves them as another preset and
 * leaves this one as it is, `keep` keeps this one and stops asking until
 * the original changes again.
 */
export async function syncPreset(host: HostProfile, id: string, action: "update" | "new" | "keep"): Promise<GamePreset> {
  const { row, source } = await ownCopy(host, id);
  const synced: StoredPreset = { ...row, copied_version: source.updated_at };
  if (action === "update") {
    synced.data = structuredClone(source.data);
    synced.copied_hash = presetHash(source.data);
    synced.updated_at = nowSec();
  }
  await store().update(synced);
  if (action === "new") {
    return createPreset(
      host,
      {
        mode: source.mode,
        name: `${source.name} (updated)`.slice(0, PRESET_LIMITS.name),
        description: source.description,
        shared: false,
        data: structuredClone(source.data),
      },
      source.preset_id,
    );
  }
  return (await getPreset(host, id)) ?? toPublic(synced, host);
}

/** The server's default preset for a mode, if it has one. */
export async function defaultPreset(host: HostProfile, mode: string): Promise<GamePreset | null> {
  const id = (await serverDefaults(host.guild_id, [mode])).get(mode);
  return id ? getPreset(host, id) : null;
}

/** A game was scheduled with this preset (best effort). */
export async function notePresetUsed(id: string, guildId?: string): Promise<void> {
  try {
    await store().bumpUses(guildId ?? (await currentGuildId()), id);
  } catch (error) {
    console.warn("[presets] could not count a use:", (error as Error)?.message ?? error);
  }
}
