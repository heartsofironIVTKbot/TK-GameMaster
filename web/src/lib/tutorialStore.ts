import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

/**
 * Which guided tours each account has finished or skipped, and whether
 * tours start by themselves (docs/tutorial.md). One row per Discord account,
 * the same on every server. The table is created on first use.
 */

const DDL = `CREATE TABLE IF NOT EXISTS web_tutorial_progress (
    discord_id BIGINT NOT NULL PRIMARY KEY,
    auto_start TINYINT(1) NOT NULL DEFAULT 1,
    tours TEXT NOT NULL,
    updated_at BIGINT NOT NULL
)`;

let ready: Promise<void> | null = null;
async function ensureTable(): Promise<void> {
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

export interface StoredTutorial {
  autoStart: boolean;
  tours: unknown;
}

interface Row extends RowDataPacket {
  auto_start: number;
  tours: string;
}

export async function readTutorial(discordId: string): Promise<StoredTutorial | null> {
  await ensureTable();
  const [rows] = await getPool().query<Row[]>(
    "SELECT auto_start, tours FROM web_tutorial_progress WHERE discord_id = ?",
    [discordId],
  );
  const row = rows[0];
  if (!row) return null;
  let tours: unknown = {};
  try {
    tours = JSON.parse(row.tours);
  } catch {
    tours = {};
  }
  return { autoStart: Boolean(row.auto_start), tours };
}

export async function writeTutorial(discordId: string, autoStart: boolean, tours: object): Promise<void> {
  await ensureTable();
  await getPool().query(
    `INSERT INTO web_tutorial_progress (discord_id, auto_start, tours, updated_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE auto_start = VALUES(auto_start), tours = VALUES(tours), updated_at = VALUES(updated_at)`,
    [discordId, autoStart ? 1 : 0, JSON.stringify(tours), Math.floor(Date.now() / 1000)],
  );
}
