import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { HOME_GUILD_ID, playerRecords } from "@/lib/currentGuild";
import { getPool, DatabaseConfigError } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canonicalName } from "@/data/nationCategories";
import { demoLobbyState } from "@/lib/liveDemo";
import { liveHub } from "@/lib/live/hub";
import { lobbySnapshot, lobbyVersion, versionOf } from "@/lib/lobbySnapshot";
import { memberRoleIds } from "@/lib/memberRoles";
import { categoryOfMode } from "@/lib/scheduleOptions";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import tagToSlotJson from "@/lib/tag_to_slot.json";

/** Owner tag -> playable country slot name (bot's canonical naming). */
const tagToSlot = tagToSlotJson as Record<string, string>;

/**
 * /api/reserve
 *
 * GET  ?thread_id=<id>  — reservations + lobby metadata for one game thread.
 * POST {thread_id, slot_key} — atomically record a reservation.
 *
 * ``slot_key`` must be a playable country slot name in the bot's convention
 * (e.g. "Germany", "Soviet Union", "British RAJ"), NOT a map state name or
 * owner tag. Raw owner tags are translated here as a convenience ("GER" ->
 * "Germany") using lib/tag_to_slot.json, and the map UI resolves tags before
 * posting.
 *
 * POST mirrors the bot's `_commit_reservation_mysql` transaction: lock the
 * games row and reservation rows, validate (started/ended, lockdown,
 * duplicate slot, duplicate user, coop parent, optional capacity), insert
 * into `game_reservations`, bump `games.reservations_rev`, enqueue a
 * `reservation_sync_queue` event, and commit. The bot's 10s
 * `reservation_sync_loop` then merges the row into the game document and
 * re-renders the Discord reservation board.
 *
 * DELETE {thread_id} removes the caller's reservation for that game: it
 * deletes their `game_reservations` row, bumps `reservations_rev`, and
 * enqueues an unreserve event (action='unreserve') that the bot's sync loop
 * consumes to strip the user from the game document and re-render the board.
 */

const THREAD_ID_RE = /^\d{10,}$/;

interface GamesRow extends RowDataPacket {
  thread_id: string;
  /** The game's Discord server (multi-server). */
  guild_id?: string | null;
  mode: string | null;
  status: string | null;
  game_started: number | boolean;
  game_data: unknown;
}

interface UserRow extends RowDataPacket {
  hoi4_verified: number | boolean;
  /** Missing until the bot has added the column (then Historical falls back to hoi4_verified). */
  hist_verified?: number | boolean;
  banned: number | boolean;
}

interface SlotRow extends RowDataPacket {
  slot_key: string;
  user_id: string | number;
}

interface GameDataDocument {
  lockdown?: unknown;
  capacity?: unknown;
  locked_regions?: unknown;
  layout_disabled_nations?: unknown;
  is_draft?: unknown;
}

function parseGameData(raw: unknown): GameDataDocument {
  if (typeof raw === "string") {
    try {
      return (JSON.parse(raw) ?? {}) as GameDataDocument;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as GameDataDocument;
  }
  return {};
}

function isCoopSlot(slotKey: string): boolean {
  return slotKey.includes("_coop");
}

function isFillerSlot(slotKey: string): boolean {
  return slotKey.startsWith("_FILL_");
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET ?thread_id=<id>[&known=<version>]
 *
 * Lobby state for the live map. Viewers pass the `version` from their last
 * response as `known`; while nothing changed they get a tiny
 * `{ unchanged: true, version }` reply (one cheap primary-key read on our
 * side, shared across viewers). See lib/lobbySnapshot.ts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("thread_id");
  if (!threadId || !THREAD_ID_RE.test(threadId)) {
    return jsonError("thread_id query param is required", 400);
  }
  const known = searchParams.get("known");
  if (isSchedulerDemo()) {
    const demo = demoLobbyState(threadId);
    if (demo) {
      // The preview's start time is "now + 26h" (moves every second), so it
      // stays out of the version.
      const version = versionOf({ game: { ...demo.game, start_timestamp: null }, reservations: demo.reservations });
      return NextResponse.json(known === version ? { unchanged: true, version } : { ...demo, version });
    }
  }

  try {
    const version = await lobbyVersion(threadId);
    if (known === version) return NextResponse.json({ unchanged: true, version });
    const snapshot = await lobbySnapshot(threadId, version);
    return NextResponse.json({ ...snapshot, version });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      console.error("[reserve] database configuration error:", error.message);
      return jsonError(error.message, 503);
    }
    console.error("[reserve] GET failed:", error);
    return jsonError("Database unavailable", 503);
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
  const threadId = payload.thread_id;
  const slotKey = payload.slot_key;

  if (typeof threadId !== "string" || !THREAD_ID_RE.test(threadId)) {
    return jsonError("thread_id must be a valid Discord thread id", 400);
  }
  if (
    typeof slotKey !== "string" ||
    !slotKey.trim() ||
    slotKey.length > 128
  ) {
    return jsonError("slot_key must be a non-empty string (max 128 chars)", 400);
  }

  // Translate raw owner tags to the bot's playable slot names when a client
  // posts a tag (e.g. "GER" -> "Germany").
  const resolvedSlotKey =
    tagToSlot[slotKey.trim().toUpperCase()] ?? slotKey.trim();

  let connection: PoolConnection;
  try {
    connection = await getPool().getConnection();
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      console.error("[reserve] database configuration error:", error.message);
      return jsonError(error.message, 503);
    }
    console.error("[reserve] POST connect failed:", error);
    return jsonError("Database unavailable", 503);
  }
  try {
    await connection.beginTransaction();

    // Lock the game row for the whole reservation.
    const [gameRows] = await connection.query<GamesRow[]>(
      "SELECT * FROM games WHERE thread_id = ? FOR UPDATE",
      [threadId],
    );
    const game = gameRows[0] ?? null;
    if (!game) {
      await connection.rollback();
      return jsonError("Game not found", 404);
    }
    const gameData = parseGameData(game.game_data);

    if (game.game_started || ["ended", "cancelled"].includes(game.status ?? "")) {
      await connection.rollback();
      return jsonError("Reservations are closed — this game has started or ended", 409);
    }
    if (gameData.lockdown) {
      await connection.rollback();
      return jsonError("Reservations are locked down by the host", 409);
    }
    // Draft games are filled through the draft pool (POST /api/draft), not by
    // picking a nation: the captains (or the host) place players.
    if (gameData.is_draft) {
      await connection.rollback();
      return jsonError("This is a draft game — use Join the draft; the team captains place players on nations", 409);
    }

    // Host-locked nations (Games page / calendar) and a preset's not-playable
    // ones can't be claimed — a co-op slot follows its main nation.
    if (!isFillerSlot(resolvedSlotKey)) {
      const lockedKeys = new Set(
        [
          ...(Array.isArray(gameData.locked_regions) ? gameData.locked_regions : []),
          ...(Array.isArray(gameData.layout_disabled_nations) ? gameData.layout_disabled_nations : []),
        ].map((name) => canonicalName(String(name))),
      );
      const mainNation = isCoopSlot(resolvedSlotKey) ? resolvedSlotKey.split("_coop", 1)[0] : resolvedSlotKey;
      if (lockedKeys.has(canonicalName(mainNation))) {
        await connection.rollback();
        return jsonError(`${mainNation} is locked in this game`, 409);
      }
    }

    // Verification gate: the bot gates HOI4 reservations on the Discord
    // "Authenticated" role; the database-side equivalent is the game type's
    // Verified flag — users.hoi4_verified (RP Verified) for Roleplay games,
    // users.hist_verified (Hist Verified) for Historical games once the bot
    // has set that role up. The game's own server's records (multi-server:
    // other servers keep theirs in guild_users).
    const gameGuild = game.guild_id ? String(game.guild_id) : HOME_GUILD_ID;
    const records = playerRecords(gameGuild);
    const [userRows] = await connection.query<UserRow[]>(`SELECT * FROM ${records.table} WHERE ${records.where}`, [
      ...records.whereParams,
      session.discord_id,
    ]);
    const historical =
      categoryOfMode(game.mode ?? "") === "Historical" && Boolean((await memberRoleIds(gameGuild)).hist_verified);
    const user = userRows[0] ?? null;
    if (!user) {
      await connection.rollback();
      return jsonError("No player record found for your Discord account", 403);
    }
    if (user.banned) {
      await connection.rollback();
      return jsonError("You are banned from reserving nations", 403);
    }
    if (historical ? !user.hist_verified : !user.hoi4_verified) {
      await connection.rollback();
      return jsonError(
        historical
          ? "You need Hist Verified before reserving in Historical games — ask the staff (or open a ticket)"
          : "Your HOI4 account must be verified (RP Verified) before reserving",
        403,
      );
    }

    // Lock the reservation rows and validate the slot.
    const [slotRows] = await connection.query<SlotRow[]>(
      "SELECT slot_key, user_id FROM game_reservations WHERE thread_id = ? FOR UPDATE",
      [threadId],
    );
    const takenSlots = new Map<string, number>();
    for (const row of slotRows) {
      takenSlots.set(String(row.slot_key), Number(row.user_id));
    }

    if (takenSlots.has(resolvedSlotKey)) {
      await connection.rollback();
      return jsonError(`${resolvedSlotKey} is already reserved`, 409);
    }
    if ([...takenSlots.values()].includes(Number(session.discord_id))) {
      await connection.rollback();
      return jsonError("You already have a reservation in this game", 409);
    }
    if (isCoopSlot(resolvedSlotKey)) {
      const mainNation = resolvedSlotKey.split("_coop", 1)[0];
      if (!takenSlots.has(mainNation)) {
        await connection.rollback();
        return jsonError(`${mainNation} must be reserved before its co-op slot`, 409);
      }
    }
    // Best-effort capacity check: only when the game document carries a
    // numeric `capacity` (the bot enforces mode-specific caps server-side).
    if (!isCoopSlot(resolvedSlotKey) && !isFillerSlot(resolvedSlotKey)) {
      const capacity = gameData.capacity;
      if (typeof capacity === "number") {
        const nationCount = [...takenSlots.keys()].filter(
          (key) => !isCoopSlot(key) && !isFillerSlot(key),
        ).length;
        if (nationCount >= capacity) {
          await connection.rollback();
          return jsonError("All nation slots are filled", 409);
        }
      }
    }

    try {
      await connection.query(
        "INSERT INTO game_reservations (thread_id, slot_key, user_id) VALUES (?, ?, ?)",
        [threadId, resolvedSlotKey, session.discord_id],
      );
    } catch (error) {
      // UNIQUE(thread_id, slot_key) — concurrent claim lost the race.
      await connection.rollback();
      console.error("[reserve] insert conflict:", error);
      return jsonError(`${resolvedSlotKey} is already reserved`, 409);
    }

    // Bump the optimistic-lock revision so stale bot-side saves cannot
    // overwrite this reservation, and queue the bot's board re-render.
    await connection.query(
      "UPDATE games SET reservations_rev = reservations_rev + 1 WHERE thread_id = ?",
      [threadId],
    );
    await connection.query(
      `INSERT INTO reservation_sync_queue (thread_id, user_id, slot_key, created_at)
       VALUES (?, ?, ?, ?)`,
      [threadId, session.discord_id, resolvedSlotKey, Math.floor(Date.now() / 1000)],
    );

    await connection.commit();
    liveHub().lobbyChanged(threadId);
    return NextResponse.json({
      ok: true,
      reservation: {
        thread_id: threadId,
        slot_key: resolvedSlotKey,
        user_id: session.discord_id,
      },
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      console.error("[reserve] database configuration error:", error.message);
      return jsonError(error.message, 503);
    }
    await connection.rollback().catch(() => {});
    console.error("[reserve] POST failed:", error);
    return jsonError("Database unavailable", 503);
  } finally {
    connection.release();
  }
}

export async function DELETE(request: NextRequest) {
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
  const threadId = payload.thread_id;

  if (typeof threadId !== "string" || !THREAD_ID_RE.test(threadId)) {
    return jsonError("thread_id must be a valid Discord thread id", 400);
  }

  let connection: PoolConnection;
  try {
    connection = await getPool().getConnection();
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      console.error("[reserve] database configuration error:", error.message);
      return jsonError(error.message, 503);
    }
    console.error("[reserve] DELETE connect failed:", error);
    return jsonError("Database unavailable", 503);
  }
  try {
    await connection.beginTransaction();

    // Lock the game row for the whole unreserve.
    const [gameRows] = await connection.query<GamesRow[]>(
      "SELECT * FROM games WHERE thread_id = ? FOR UPDATE",
      [threadId],
    );
    const game = gameRows[0] ?? null;
    if (!game) {
      await connection.rollback();
      return jsonError("Game not found", 404);
    }
    // Mirror the bot's /unreserve guard: reservations are locked once the
    // game has started or ended.
    if (game.game_started || ["ended", "cancelled"].includes(game.status ?? "")) {
      await connection.rollback();
      return jsonError("Reservations are locked — this game has started or ended", 409);
    }

    const [result] = await connection.query<ResultSetHeader>(
      "DELETE FROM game_reservations WHERE thread_id = ? AND user_id = ?",
      [threadId, session.discord_id],
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return jsonError("You have no reservation in this game", 404);
    }

    // Bump the optimistic-lock revision and queue the unreserve so the bot's
    // reservation_sync_loop strips the user from the game document and
    // re-renders the Discord reservation board.
    await connection.query(
      "UPDATE games SET reservations_rev = reservations_rev + 1 WHERE thread_id = ?",
      [threadId],
    );
    await connection.query(
      `INSERT INTO reservation_sync_queue (thread_id, user_id, slot_key, action, created_at)
       VALUES (?, ?, '', 'unreserve', ?)`,
      [threadId, session.discord_id, Math.floor(Date.now() / 1000)],
    );

    await connection.commit();
    liveHub().lobbyChanged(threadId);
    return NextResponse.json({
      ok: true,
      unreserved: {
        thread_id: threadId,
        user_id: session.discord_id,
      },
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      console.error("[reserve] database configuration error:", error.message);
      return jsonError(error.message, 503);
    }
    await connection.rollback().catch(() => {});
    console.error("[reserve] DELETE failed:", error);
    return jsonError("Database unavailable", 503);
  } finally {
    connection.release();
  }
}
