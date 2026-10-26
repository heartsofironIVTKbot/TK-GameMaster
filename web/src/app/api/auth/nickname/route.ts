import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getSession, createSession, publicSessionUser } from "@/lib/session";
import { getPool, DatabaseConfigError } from "@/lib/db";

/**
 * POST /api/auth/nickname
 *
 * Saves the authenticated user's HOI4 in-game nickname to the bot's `users`
 * table (`ingame_nickname` — the web adds the column on first use the same
 * way the bot's `_ensure_users_schema_mysql` does, so no manual migration
 * is required) and re-seals the session cookie so subsequent /api/auth/me
 * calls return it without a database round-trip.
 */

const NICKNAME_MAX = 32;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

interface ColumnRow extends RowDataPacket {
  COLUMN_NAME: string;
}

/** Best-effort: add `users.ingame_nickname` when the column is missing. */
async function ensureNicknameColumn(): Promise<void> {
  try {
    const pool = getPool();
    const [dbRows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS db");
    const dbName = dbRows[0]?.db as string | undefined;
    if (!dbName) return;
    const [columns] = await pool.query<ColumnRow[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
      [dbName],
    );
    if (columns.some((row) => row.COLUMN_NAME === "ingame_nickname")) return;
    await pool.query(
      "ALTER TABLE users ADD COLUMN ingame_nickname VARCHAR(64) NULL",
    );
    console.info("[auth/nickname] added users.ingame_nickname column");
  } catch (error) {
    // Non-fatal: the UPDATE below surfaces the real error when it matters.
    console.error("[auth/nickname] ensure column failed:", error);
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return jsonError("Not authenticated — log in with Discord first", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const payload = (body ?? {}) as Record<string, unknown>;
  const rawNickname = typeof payload.nickname === "string" ? payload.nickname : "";
  const nickname = rawNickname.trim().replace(/\s+/g, " ");

  if (!nickname) {
    return jsonError("Nickname must not be empty", 400);
  }
  if (nickname.length > NICKNAME_MAX) {
    return jsonError(`Nickname must be at most ${NICKNAME_MAX} characters`, 400);
  }

  try {
    await ensureNicknameColumn();

    const pool = getPool();
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE users SET ingame_nickname = ? WHERE discord_id = ?",
      [nickname, session.discord_id],
    );
    if (result.affectedRows === 0) {
      // No user row yet (never played a game): create a minimal one.
      try {
        await pool.query(
          "INSERT INTO users (discord_id, ingame_nickname) VALUES (?, ?)",
          [session.discord_id, nickname],
        );
      } catch (insertError) {
        console.error("[auth/nickname] insert failed:", insertError);
        return jsonError("Could not save the nickname (no player record)", 500);
      }
    }
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      console.error("[auth/nickname] database configuration error:", error.message);
      return jsonError(error.message, 503);
    }
    console.error("[auth/nickname] save failed:", error);
    return jsonError("Database unavailable", 503);
  }

  // Re-seal the session so the nickname survives page reloads without a
  // database round-trip.
  const updated = { ...session, ingame_nickname: nickname };
  await createSession(updated);

  return NextResponse.json({ ok: true, user: publicSessionUser(updated) });
}
