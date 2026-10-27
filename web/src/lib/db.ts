import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";

/**
 * Shared MySQL connection pool for the web app.
 *
 * Connects to the SAME database the Discord bot uses (`MYSQL_*` env vars,
 * mirroring the bot's `_build_db_config`). The pool is created lazily so
 * importing this module (or building the app) never requires credentials;
 * only routes that actually touch the database trigger the connection.
 *
 * Env vars are loaded by Next.js from `web/.env.local` (see
 * `web/.env.example`): MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD,
 * MYSQL_DATABASE, MYSQL_PORT (default 3306), MYSQL_SSL_DISABLED (default
 * true — matches the bot's default), MYSQL_SSL_CA. Key names are case-sensitive.
 */

let pool: Pool | null = null;

/** Env keys the pool cannot start without. */
const REQUIRED_ENV_KEYS = [
  "MYSQL_HOST",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE",
] as const;

/**
 * Thrown when `web/.env.local` is missing required `MYSQL_*` keys (or a key
 * fails to parse). The message only ever names env KEYS — never values — so
 * it is safe to return to clients.
 */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function missingEnvKeys(): string[] {
  return REQUIRED_ENV_KEYS.filter((name) => !process.env[name]);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    const missing = missingEnvKeys();
    throw new DatabaseConfigError(
      `Database is not configured: missing env var(s) ${missing.join(", ")}. ` +
        `Create web/.env.local (copy web/.env.example) and set these keys — ` +
        `names are case-sensitive and must match the bot's MYSQL_* config.`,
    );
  }
  return value;
}

function requirePort(): number {
  const raw = process.env.MYSQL_PORT;
  if (raw === undefined || raw.trim() === "") return 3306;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new DatabaseConfigError(
      `Database is not configured: MYSQL_PORT=${JSON.stringify(raw)} is not ` +
        `a valid port (1-65535). Check web/.env.local.`,
    );
  }
  return port;
}

export function getPool(): Pool {
  if (pool) return pool;

  // Fail fast with an actionable diagnostic before mysql2 masks the real
  // problem as a generic connection error.
  const missing = missingEnvKeys();
  if (missing.length > 0) {
    console.error(
      `[db] Missing MySQL env vars: ${missing.join(", ")}. ` +
        `Create web/.env.local (copy web/.env.example) — keys are case-sensitive.`,
    );
  }

  pool = mysql.createPool({
    host: requireEnv("MYSQL_HOST"),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    database: requireEnv("MYSQL_DATABASE"),
    port: requirePort(),
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    connectTimeout: 10_000,
    ...sslOptions(),
  });
  return pool;
}

/**
 * MYSQL_SSL_CA (the provider's CA certificate as PEM text): encrypted and
 * the server's certificate is checked. Otherwise MYSQL_SSL_DISABLED (default
 * true, like the bot) decides; enabled without a CA skips the check.
 */
function sslOptions() {
  const ca = (process.env.MYSQL_SSL_CA ?? "").replace(/\\n/g, "\n").trim();
  if (ca) return { ssl: { ca, rejectUnauthorized: true } };
  return envBool("MYSQL_SSL_DISABLED", true) ? {} : { ssl: { rejectUnauthorized: false } };
}
