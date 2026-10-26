import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSession, publicSessionUser } from "@/lib/session";
import { getPool } from "@/lib/db";

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated Discord user from the session cookie
 * (or 401 when no valid session exists), plus a best-effort ``profile``
 * read from the bot's `users` table: in-game nickname, HOI4 verification
 * and host tier (badges for the roster/player popover). The profile is
 * ``null`` when the database is unreachable — the client then skips the
 * nickname onboarding modal rather than nagging a user who may already
 * have one set.
 */

interface UserRow extends RowDataPacket {
  discord_id: string;
  ingame_nickname: string | null;
  hoi4_verified: number | boolean;
  hoi4_host_tier: string | null;
  merit_points: number;
}

export interface MeProfile {
  ingame_nickname: string | null;
  hoi4_verified: boolean;
  host_tier: string | null;
  merit_points: number;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let profile: MeProfile | null = null;
  try {
    const pool = getPool();
    const [rows] = await pool.query<UserRow[]>(
      `SELECT discord_id, ingame_nickname, hoi4_verified, hoi4_host_tier,
              merit_points
       FROM users WHERE discord_id = ?`,
      [session.discord_id],
    );
    const row = rows[0] ?? null;
    if (row) {
      profile = {
        ingame_nickname: row.ingame_nickname ?? null,
        hoi4_verified: Boolean(row.hoi4_verified),
        host_tier: row.hoi4_host_tier ?? null,
        merit_points: Number(row.merit_points ?? 0),
      };
    }
  } catch (error) {
    // Database unreachable (or the `ingame_nickname` column not migrated
    // yet): the session still authenticates, only badges/nickname go dark.
    console.error("[auth/me] profile lookup failed:", error);
    profile = null;
  }

  const ingameNickname =
    session.ingame_nickname ?? profile?.ingame_nickname ?? null;

  return NextResponse.json({
    authenticated: true,
    user: {
      ...publicSessionUser(session),
      ingame_nickname: ingameNickname,
    },
    profile,
  });
}
