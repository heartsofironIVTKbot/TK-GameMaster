import { isCasinoGame } from "@/lib/casinoSettings";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool, DatabaseConfigError } from "@/lib/db";
import { getSession } from "@/lib/session";
import { demoLobbyState } from "@/lib/liveDemo";
import { liveHub } from "@/lib/live/hub";
import { accessDenied, mapAccessFor } from "@/lib/mapAccess";
import { coopPromotions } from "@/lib/coopPromote";
import { recordAudit } from "@/lib/auditLog";
import { lobbySnapshot, lobbyVersion, versionOf } from "@/lib/lobbySnapshot";
import { gameGuildOf, isSchedulerDemo } from "@/lib/scheduleStore";
import { gameClosedRefusal, isCoopSlot, isFillerSlot, nationRefusal, parseGameData } from "@/lib/reserveRules";
import { botNationName } from "@/lib/botNation";
import { moderationOptions } from "@/lib/playerIndex";
import tagToSlotJson from "@/lib/tag_to_slot.json";

/** Owner tag -> playable country slot name (bot's canonical naming). */
const tagToSlot = tagToSlotJson as Record<string, string>;

/**
 * /api/reserve
 *
 * GET  ?thread_id=<id>  — reservations + lobby metadata for one game thread.
 * POST {thread_id, slot_key, tag?, switch?} — atomically record a reservation
 *      (`switch: true`: leave the player's current nation for it in the same
 *      step, as long as the host hasn't locked them on it). `tag`
 *      = the map nation's tag, so a lock on the bot's name for it ("Australia")
 *      also covers the map's ("Commonwealth of Australia").
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
  thread_name?: string | null;
  mode: string | null;
  status: string | null;
  game_started: number | boolean;
  start_timestamp?: number | null;
  game_data: unknown;
}

interface SlotRow extends RowDataPacket {
  slot_key: string;
  user_id: string | number;
}

/**
 * The main player left these slots: move their nations' co-op players up
 * (the first co-op becomes main, lib/coopPromote.ts) in the same transaction,
 * and queue each move for the bot (which DMs the new main).
 */
async function promoteCoops(connection: PoolConnection, threadId: string, leftSlots: string[], nowSec: number): Promise<void> {
  const mains = leftSlots.filter((slot) => !isCoopSlot(slot) && !isFillerSlot(slot));
  if (mains.length === 0) return;
  const [rows] = await connection.query<SlotRow[]>(
    "SELECT slot_key, user_id FROM game_reservations WHERE thread_id = ? FOR UPDATE",
    [threadId],
  );
  const moves = coopPromotions(new Map(rows.map((row) => [String(row.slot_key), String(row.user_id)])), mains);
  for (const move of moves) {
    await connection.query("DELETE FROM game_reservations WHERE thread_id = ? AND slot_key = ?", [threadId, move.from]);
  }
  for (const move of moves) {
    await connection.query("INSERT INTO game_reservations (thread_id, slot_key, user_id) VALUES (?, ?, ?)", [threadId, move.to, move.user_id]);
    await connection.query(
      "INSERT INTO reservation_sync_queue (thread_id, user_id, slot_key, created_at) VALUES (?, ?, ?, ?)",
      [threadId, move.user_id, move.to, nowSec],
    );
  }
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** "Germany", "the Germany co-op slot", "a filler slot (Spare)". */
function slotLabel(slotKey: string): string {
  if (isFillerSlot(slotKey)) {
    const name = slotKey.slice("_FILL_".length).replace(/_/g, " ").trim();
    return name ? `a filler slot (${name})` : "a filler slot";
  }
  if (isCoopSlot(slotKey)) return `the ${slotKey.split("_coop", 1)[0]} co-op slot`;
  return slotKey;
}

function auditReservation(
  game: GamesRow,
  threadId: string,
  session: { discord_id: string; username: string; ingame_nickname?: string | null },
  action: "reserve" | "reserve_coop" | "reserve_filler" | "unreserve",
  slotKey: string,
) {
  const who = session.ingame_nickname || session.username;
  const verb = action === "unreserve" ? "unreserved" : "reserved";
  const where = game.thread_name ? ` in ${game.thread_name}` : "";
  void recordAudit({
    guildId: game.guild_id ? String(game.guild_id) : HOME_GUILD_ID,
    category: "reservation",
    action,
    summary: `${who} ${verb} ${slotKey ? slotLabel(slotKey) : "their slot"}${where}`,
    actorId: session.discord_id,
    actorName: who,
    gameId: threadId,
    details: { slot: slotKey || null },
  });
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
    // Only the game's server's members, signed in (lib/mapAccess.ts).
    const access = await mapAccessFor(await gameGuildOf(threadId));
    if (!access.ok) return accessDenied(access);
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
  const mapTag = typeof payload.tag === "string" && /^[A-Z0-9]{2,4}$/.test(payload.tag) ? payload.tag : null;
  const switching = payload.switch === true;

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
  let resolvedSlotKey =
    tagToSlot[slotKey.trim().toUpperCase()] ?? slotKey.trim();

  try {
    const access = await mapAccessFor(await gameGuildOf(threadId));
    if (!access.ok) return accessDenied(access);
  } catch (error) {
    console.error("[reserve] POST access check failed:", error);
    return jsonError("Database unavailable", 503);
  }

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
    // The map's nation name ("German Reich") → the bot's for the game's mode
    // ("Germany"), so the bot accepts it and one nation can't be taken twice.
    const options = await moderationOptions(game.guild_id ? String(game.guild_id) : undefined).catch(() => null);
    resolvedSlotKey = botNationName(options?.mode_nations?.[String(game.mode ?? "")], mapTag, resolvedSlotKey);

    // Closed games, locks, bans, access levels and IronLegion (lib/reserveRules.ts,
    // shared with the map's 30-second hold).
    const refusal =
      gameClosedRefusal(game, gameData) ??
      (await nationRefusal(connection, {
        game,
        gameData,
        slot: resolvedSlotKey,
        mapTag,
        userId: session.discord_id,
        modeMajors: options?.mode_nations?.[String(game.mode ?? "")]?.majors ?? null,
      }));
    if (refusal) {
      await connection.rollback();
      return jsonError(refusal.message, refusal.status);
    }

    // Someone else picked this nation first: it's theirs for 30 s (lib/live/hub.ts).
    // Co-op and filler slots aren't held.
    if (!isFillerSlot(resolvedSlotKey) && !isCoopSlot(resolvedSlotKey)) {
      const holder = liveHub().holderOf(threadId, mapTag);
      if (holder && holder.user_id !== session.discord_id) {
        await connection.rollback();
        const seconds = Math.max(1, Math.ceil(holder.ends_in_ms / 1000));
        return jsonError(`${holder.name} is picking this nation right now. Try again in ${seconds}s if they don't take it.`, 409);
      }
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
    const mine = [...takenSlots.entries()].filter(([, userId]) => userId === Number(session.discord_id)).map(([slot]) => slot);
    if (mine.length > 0 && !switching) {
      await connection.rollback();
      return jsonError("You already have a reservation in this game", 409);
    }
    if (mine.length > 0) {
      // Switching nation: leave the old one in the same step (unless the host placed them).
      const locks = gameData.host_locks && typeof gameData.host_locks === "object" ? (gameData.host_locks as Record<string, unknown>) : {};
      const lockUntil = Number(locks[session.discord_id] ?? -1);
      const nowSec = Math.floor(Date.now() / 1000);
      if (lockUntil === 0 || lockUntil > nowSec) {
        await connection.rollback();
        return jsonError(
          lockUntil === 0
            ? "The host placed you on your nation: ask a host if you need to change it."
            : `The host just placed you on your nation: you can change it in ${lockUntil - nowSec}s.`,
          409,
        );
      }
      await connection.query("DELETE FROM game_reservations WHERE thread_id = ? AND user_id = ?", [threadId, session.discord_id]);
      await connection.query(
        `INSERT INTO reservation_sync_queue (thread_id, user_id, slot_key, action, created_at) VALUES (?, ?, '', 'unreserve', ?)`,
        [threadId, session.discord_id, nowSec],
      );
      for (const slot of mine) takenSlots.delete(slot);
      // Leaving a major: its first co-op takes over.
      await promoteCoops(connection, threadId, mine, nowSec);
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
    liveHub().release(threadId, session.discord_id);
    liveHub().lobbyChanged(threadId);
    auditReservation(
      game,
      threadId,
      session,
      isFillerSlot(resolvedSlotKey) ? "reserve_filler" : isCoopSlot(resolvedSlotKey) ? "reserve_coop" : "reserve",
      resolvedSlotKey,
    );
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
    // Casino games: a plain unreserve would hand out a free re-roll; only
    // Emergency Unreserve (api/casino/<game>/unreserve) or the host can.
    const lockedData = parseGameData(game.game_data);
    if (isCasinoGame(lockedData)) {
      await connection.rollback();
      return jsonError("This is a Casino game: if you can't play, use Emergency Unreserve under your nation.", 409);
    }
    // The Host Tool placed them: they can't undo it themselves for a while (bot _host_lock).
    const locks = lockedData.host_locks && typeof lockedData.host_locks === "object" ? (lockedData.host_locks as Record<string, unknown>) : {};
    const lockUntil = Number(locks[session.discord_id] ?? -1);
    const nowSec = Math.floor(Date.now() / 1000);
    if (lockUntil === 0) {
      await connection.rollback();
      return jsonError("The host placed you on this nation: ask a host if you need to change it.", 409);
    }
    if (lockUntil > nowSec) {
      await connection.rollback();
      return jsonError(`The host just placed you on this nation: you can change it in ${lockUntil - nowSec}s.`, 409);
    }

    const [heldRows] = await connection.query<SlotRow[]>(
      "SELECT slot_key, user_id FROM game_reservations WHERE thread_id = ? AND user_id = ?",
      [threadId, session.discord_id],
    );
    const [result] = await connection.query<ResultSetHeader>(
      "DELETE FROM game_reservations WHERE thread_id = ? AND user_id = ?",
      [threadId, session.discord_id],
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return jsonError("You have no reservation in this game", 404);
    }
    // Leaving a major: its first co-op takes over (drafts: the captains decide).
    if (!lockedData.is_draft) {
      await promoteCoops(connection, threadId, heldRows.map((row) => String(row.slot_key)), nowSec);
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
    auditReservation(game, threadId, session, "unreserve", heldRows.map((row) => String(row.slot_key)).join(", "));
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
