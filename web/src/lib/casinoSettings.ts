import type { LockLevel } from "@/lib/scheduleOptions";

/**
 * A Casino game's settings, set in GameMaster's game setup (Extras → Casino)
 * and saved in the exact format tkcasino.online reads from `host_settings`
 * (the Casino's lib/host-config.ts HostScheduleConfig; its /api/host/sync
 * sanitizer is mirrored by sanitizeCasinoConfig below). See
 * docs/casino-integration.md.
 *
 * Who may roll at first (randomizers.nation.entry) isn't set here: it's the
 * Players tab's "who can reserve" levels, copied in when the game is saved.
 */

/** The Casino's names for GameMaster's lock levels. */
export type CasinoLevel = "vip" | "trusted" | "verified" | "all";

export interface ReRolls {
  major: number;
  minor: number;
}

export interface CasinoConfig {
  randomizers: {
    nation: { enabled: boolean; rerolls: ReRolls; entry: { major: CasinoLevel; minor: CasinoLevel } };
    ideology: { enabled: boolean; rerolls: ReRolls };
    path: { enabled: boolean; rerolls: ReRolls };
    doctrine: { enabled: boolean; rerolls: ReRolls };
    build: { enabled: boolean; rerolls: { land: ReRolls; navyAir: ReRolls } };
    achievements: { enabled: boolean; rerolls: ReRolls; tierFilter: number[] };
  };
  /** One step down in who may roll, some time before the game. */
  locks: {
    enabled: boolean;
    /** "hours": seconds before the game; "custom": an exact time (epoch seconds; older Casino saves). */
    threshold: { mode: "hours" | "custom"; seconds: number };
    degraded: { major: CasinoLevel; minor: CasinoLevel };
  };
}

export type CasinoRoom = keyof CasinoConfig["randomizers"];

/** The rooms in the Casino's order, with what each one rolls. */
export const CASINO_ROOMS: { key: CasinoRoom; label: string; hint: string }[] = [
  { key: "nation", label: "Nation", hint: "The wheel picks their nation." },
  { key: "ideology", label: "Ideology", hint: "The government they play." },
  { key: "path", label: "Path", hint: "The focus tree path they follow." },
  { key: "doctrine", label: "Doctrine", hint: "Their military doctrines." },
  { key: "build", label: "Build", hint: "Their land, navy and air builds (two reels)." },
  { key: "achievements", label: "Achievements", hint: "A challenge to complete, from the tiers below." },
];

export const MAX_REROLLS = 10;
export const ACHIEVEMENT_TIERS = [1, 2, 3, 4, 5];
/** When the step-down happens: hours before the game (the Casino's presets). */
export const STEP_DOWN_HOURS = [48, 24, 12, 6];

const LEVEL_TO_CASINO: Record<LockLevel, CasinoLevel> = { VIP: "vip", Trusted: "trusted", Verified: "verified", "All Users": "all" };
const CASINO_TO_LEVEL: Record<CasinoLevel, LockLevel> = { vip: "VIP", trusted: "Trusted", verified: "Verified", all: "All Users" };

export const toCasinoLevel = (level: LockLevel): CasinoLevel => LEVEL_TO_CASINO[level];
export const fromCasinoLevel = (level: CasinoLevel): LockLevel => CASINO_TO_LEVEL[level];

/** A new Casino game: every room on, no re-rolls, no step-down (the Casino's own defaults). */
export function defaultCasinoConfig(): CasinoConfig {
  const none = (): ReRolls => ({ major: 0, minor: 0 });
  return {
    randomizers: {
      nation: { enabled: true, rerolls: none(), entry: { major: "trusted", minor: "all" } },
      ideology: { enabled: true, rerolls: none() },
      path: { enabled: true, rerolls: none() },
      doctrine: { enabled: true, rerolls: none() },
      build: { enabled: true, rerolls: { land: none(), navyAir: none() } },
      achievements: { enabled: true, rerolls: none(), tierFilter: [...ACHIEVEMENT_TIERS] },
    },
    locks: { enabled: false, threshold: { mode: "hours", seconds: 24 * 3600 }, degraded: { major: "verified", minor: "all" } },
  };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_REROLLS, Math.max(0, Math.trunc(parsed))) : 0;
}

function rerolls(value: unknown): ReRolls {
  const source = record(value);
  return { major: count(source.major), minor: count(source.minor) };
}

function level(value: unknown, fallback: CasinoLevel): CasinoLevel {
  const text = String(value ?? "").toLowerCase();
  return text === "vip" || text === "trusted" || text === "verified" || text === "all" ? text : fallback;
}

/** Up to 30 days before the game, or an exact time up to the year 2100 (the Casino's limits). */
function seconds(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(4_102_444_800, Math.trunc(parsed))) : fallback;
}

/** Whatever arrives, a complete config the Casino accepts (its /api/host/sync rules). */
export function sanitizeCasinoConfig(raw: unknown): CasinoConfig {
  const fallback = defaultCasinoConfig();
  const source = record(raw);
  const boxes = record(source.randomizers);
  const box = (key: CasinoRoom) => record(boxes[key]);
  const enabled = (key: CasinoRoom) => (typeof box(key).enabled === "boolean" ? (box(key).enabled as boolean) : fallback.randomizers[key].enabled);
  const nationEntry = record(box("nation").entry);
  const build = record(box("build").rerolls);
  const tiers = Array.isArray(box("achievements").tierFilter)
    ? [...new Set((box("achievements").tierFilter as unknown[]).map(count).filter((tier) => ACHIEVEMENT_TIERS.includes(tier)))].sort((a, b) => a - b)
    : [];
  const locks = record(source.locks);
  const threshold = record(locks.threshold);
  const degraded = record(locks.degraded);
  return {
    randomizers: {
      nation: {
        enabled: enabled("nation"),
        rerolls: rerolls(box("nation").rerolls),
        entry: { major: level(nationEntry.major, "trusted"), minor: level(nationEntry.minor, "all") },
      },
      ideology: { enabled: enabled("ideology"), rerolls: rerolls(box("ideology").rerolls) },
      path: { enabled: enabled("path"), rerolls: rerolls(box("path").rerolls) },
      doctrine: { enabled: enabled("doctrine"), rerolls: rerolls(box("doctrine").rerolls) },
      build: { enabled: enabled("build"), rerolls: { land: rerolls(build.land), navyAir: rerolls(build.navyAir) } },
      achievements: {
        enabled: enabled("achievements"),
        rerolls: rerolls(box("achievements").rerolls),
        tierFilter: tiers.length > 0 ? tiers : [...ACHIEVEMENT_TIERS],
      },
    },
    locks: {
      enabled: locks.enabled === true,
      threshold: { mode: threshold.mode === "custom" ? "custom" : "hours", seconds: seconds(threshold.seconds, 24 * 3600) },
      degraded: { major: level(degraded.major, "verified"), minor: level(degraded.minor, "all") },
    },
  };
}

/** Hours before the game the step-down happens (an exact-time save counts from the game's time). */
export function stepDownHours(config: CasinoConfig, gameSec: number): number {
  const { mode, seconds: value } = config.locks.threshold;
  const secondsBefore = mode === "custom" ? gameSec - value : value;
  return Math.max(1, Math.round(secondsBefore / 3600));
}

/** Most co-hosts a Casino game can have. */
export const MAX_CO_HOSTS = 5;
