import crypto from "node:crypto";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import {
  SchedulerSetupError,
  countPendingRequests,
  gameGuildOf,
  getSlotDetails,
  hostEntryOn,
  insertRequest,
  listHosts,
} from "@/lib/scheduleStore";
import { branchOfMode } from "@/lib/hostBranches";
import type { HostProfile } from "@/lib/scheduleTypes";
import {
  validateDayLock,
  validateRosterAssign,
  validateRosterRemove,
  validateSchedulePayload,
  validateTimeEdit,
} from "@/lib/scheduleValidation";
import {
  ATTENDANCE_ACTIONS,
  validateAttendance,
  validateDishonored,
  validateHostRating,
  validateMemberRoles,
  validateModeration,
} from "@/lib/moderationValidation";
import { getAttendanceGame } from "@/lib/attendance";
import {
  accessRefusal,
  gameMessageRefusal,
  getGameControl,
  hotJoinRefusal,
  lifecycleRefusal,
  logAnalysisRefusal,
  reminderRefusal,
  resourcesRefusal,
} from "@/lib/gameControl";
import { validateGameMessage, validateHostDm } from "@/lib/messageTypes";
import {
  LIFECYCLE_ACTIONS,
  validateGameAccess,
  validateGameLifecycle,
  validateGameRemind,
  validateGameResources,
} from "@/lib/gameControlValidation";
import { notePresetUsed } from "@/lib/presetStore";

/**
 * POST /api/schedule/requests
 *
 *   {action: "create", payload}                — schedule a new game
 *   {action: "update", slot_id, payload}       — edit a game (all settings
 *        before its announcement; only day/time/host afterwards).
 *        payload.new_host_id hands the game to another host.
 *   {action: "cancel", slot_id}                — remove an unannounced game
 *   {action: "lock_day" | "unlock_day", payload: {week, day, reason?}}
 *                                              — staff day locks
 *   {action: "roster_assign", payload: RosterAssignPayload}
 *   {action: "roster_remove", payload: {thread_id, user_id}}
 *                                              — live map host tools
 *                                                (formerly /add, /add_coop,
 *                                                /add_filler, /remove)
 *   {action: "moderation", payload: ModerationPayload}
 *   {action: "dishonored", payload: DishonoredPayload}
 *                                              — Database page (formerly
 *                                                /give, /take, /sentence)
 *   {action: "host_rating", payload: HostRatingPayload}
 *                                              — Senior Hosts + management
 *                                                (formerly /give_host, /take_host)
 *   {action: "role_scan", payload: {mode: "preview" | "apply"}}
 *                                              — Host Management: the role check
 *                                                (formerly /scan); runs in the
 *                                                background ("running" until done)
 *   {action: "member_roles", payload: MemberRolesPayload}
 *                                              — Host Management: RP / Hist Verified
 *                                                and VIP (formerly /verify, /make_vip)
 *   {action: "att_check" | "att_sample" | "att_finalize", payload: {game_id}}
 *   {action: "att_override", payload: AttendanceOverridePayload}
 *                                              — Attendance page (voice
 *                                                check: any host; the rest:
 *                                                the game's host or staff)
 *   {action: "game_start", payload: GameStartPayload}
 *   {action: "game_end", payload: {thread_id}}
 *   {action: "game_cancel", payload: {thread_id, reason}}
 *                                              — Games page (formerly
 *                                                /game_start, /game_end,
 *                                                /game_cancel); the bot runs
 *                                                them in the background and
 *                                                reports progress ("running")
 *   {action: "game_access", payload: GameAccessPayload}
 *                                              — Games page reservation access
 *                                                (formerly /lock, /unlock,
 *                                                /lockdown, /nation_lock,
 *                                                /nation_unlock, /clear)
 *   {action: "game_remind", payload: {thread_id, kind: "early" | "late"}}
 *                                              — Games page reminders
 *                                                (formerly /remind)
 *   {action: "game_resources", payload: {thread_id, resource: "mods" | "rules", entries}}
 *                                              — Games page rules & mods
 *                                                (formerly /post_mods, /post_rules)
 *   {action: "host_dm", payload: {user_id, message, signed}}
 *                                              — any host: DM one member from
 *                                                their Database record (formerly /dm)
 *   {action: "game_message", payload: {thread_id, message, recipients | null}}
 *   {action: "hotjoin_decide", payload: {thread_id, user_id, approve, force?}}
 *                                              — the game's host or staff: approve /
 *                                                decline a hot-join request from the
 *                                                map (formerly the thread's Hot-Join panel)
 *   {action: "game_log_analysis", payload: {thread_id}}  — AI grading of the
 *        uploaded chat log (POST /api/control/games/<id>/chatlog first)
 *                                              — the game's host or staff: DM its
 *                                                players (formerly /dm_participants);
 *                                                runs in the background ("running")
 *
 * roster_assign on a started game is a late join (formerly /late_join): the
 * bot gives the Gamer Pass and a voice channel.
 *
 * Queues a web_schedule_requests row for the bot (it applies the request
 * within a few seconds and records the outcome) and returns {request_id, slot_id};
 * poll GET /api/schedule/requests/<request_id> for the result.
 */

const MAX_PENDING_PER_HOST = 5;
const SLOT_ID_RE = /^[0-9a-f]{32}$/;
const SNOWFLAKE_RE = /^\d{5,25}$/;

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

/** RP hosts host Roleplay games, HIST hosts Historical games; staff host
 *  anything. newHostId = the game is being handed to someone else. */
async function branchRefusal(host: HostProfile, mode: string, newHostId: string | null): Promise<string | null> {
  const branch = branchOfMode(mode);
  const kind = branch === "RP" ? "Roleplay" : "Historical";
  if (newHostId) {
    const target = (await listHosts()).find((option) => option.discord_id === newHostId);
    if (target && target.branches.length > 0 && !target.branches.includes(branch)) {
      const name = target.display_name || target.username || "That host";
      return `${name} can't host ${mode}: it's a ${kind} game and they don't have an ${branch} host rank.`;
    }
    return null;
  }
  if (host.is_staff || host.branches.length === 0 || host.branches.includes(branch)) return null;
  return `${mode} is a ${kind} game — you need an ${branch} host rank to host it (Host Management can give one on the Database page).`;
}

export async function POST(request: Request) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const host = status.host;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();

  try {
    if ((await countPendingRequests(host.discord_id)) >= MAX_PENDING_PER_HOST) {
      return jsonError(
        "You already have several requests waiting for the bot — give it a moment.",
        429,
      );
    }

    if (body.action === "create") {
      const validation = validateSchedulePayload(body.payload, nowSec);
      if (!validation.ok) {
        return jsonError(validation.issues[0].message, 400, { issues: validation.issues });
      }
      if (host.disabled_modes.includes(validation.value.mode)) {
        return jsonError(`${validation.value.mode} is turned off in this server's settings.`, 409);
      }
      const refusal = await branchRefusal(host, validation.value.mode, null);
      if (refusal) return jsonError(refusal, 403);
      // Pre-assigned so the bot's save is idempotent and the page can link it.
      const slotId = crypto.randomBytes(16).toString("hex");
      await insertRequest({
        requestId,
        action: "create",
        slotId,
        hostId: host.discord_id,
        payload: { ...validation.value },
      });
      if (validation.value.preset_id) await notePresetUsed(validation.value.preset_id, host.guild_id);
      return Response.json({ request_id: requestId, slot_id: slotId }, { status: 202 });
    }

    if (body.action === "update" || body.action === "cancel") {
      const slotId = typeof body.slot_id === "string" ? body.slot_id : "";
      if (!SLOT_ID_RE.test(slotId)) return jsonError("Invalid slot_id", 400);
      const details = await getSlotDetails(slotId, host.discord_id);
      if (!details) return jsonError("That game is no longer on the schedule.", 404);
      if (!details.slot.mine && !host.is_staff) {
        return jsonError(`You can only ${body.action === "cancel" ? "cancel" : "edit"} games you are hosting.`, 403);
      }

      if (body.action === "cancel") {
        if (details.editable !== "full") {
          return jsonError(
            details.editable === "time_host"
              ? "This game is already announced — cancel it from the Games page."
              : (details.reason ?? "This game can't be cancelled any more."),
            409,
          );
        }
        await insertRequest({ requestId, action: "cancel", slotId, hostId: host.discord_id, payload: null });
        return Response.json({ request_id: requestId, slot_id: slotId }, { status: 202 });
      }

      if (details.editable === "locked") {
        return jsonError(details.reason ?? "This game can't be edited any more.", 409);
      }
      const rawPayload = (typeof body.payload === "object" && body.payload !== null
        ? body.payload
        : {}) as Record<string, unknown>;
      const newHostId = rawPayload.new_host_id;
      if (newHostId !== undefined && newHostId !== null && (typeof newHostId !== "string" || !SNOWFLAKE_RE.test(newHostId))) {
        return jsonError("Invalid new host", 400);
      }
      const validation =
        details.editable === "full"
          ? validateSchedulePayload(rawPayload, nowSec)
          : validateTimeEdit(rawPayload, nowSec);
      if (!validation.ok) {
        return jsonError(validation.issues[0].message, 400, { issues: validation.issues });
      }
      // Hosts host their own branch's games (the bot checks this too).
      const editedMode = String("mode" in validation.value ? validation.value.mode : details.settings.mode);
      const handover = typeof newHostId === "string" && newHostId !== host.discord_id ? newHostId : null;
      if (handover || details.slot.mine) {
        const refusal = await branchRefusal(host, editedMode, handover);
        if (refusal) return jsonError(refusal, 403);
      }
      await insertRequest({
        requestId,
        action: "update",
        slotId,
        hostId: host.discord_id,
        payload: { ...validation.value, new_host_id: newHostId ?? null },
      });
      // A preset newly loaded into an existing game counts as a use too.
      const presetId = "preset_id" in validation.value ? validation.value.preset_id : null;
      if (typeof presetId === "string" && presetId !== details.settings.preset_id) await notePresetUsed(presetId, host.guild_id);
      return Response.json({ request_id: requestId, slot_id: slotId }, { status: 202 });
    }

    if (body.action === "roster_assign" || body.action === "roster_remove") {
      const payload =
        body.action === "roster_assign" ? validateRosterAssign(body.payload) : validateRosterRemove(body.payload);
      if (!payload) return jsonError("Invalid player action", 400);
      // The live map can show a game from another of the host's servers (an
      // announcement link): send it to that game's server, if they host there.
      const gameGuild = await gameGuildOf(payload.thread_id);
      if (!gameGuild) return jsonError("That game no longer exists.", 404);
      if (gameGuild !== host.guild_id && !(await hostEntryOn(host.discord_id, gameGuild))) {
        return jsonError("You're not a host on that game's server.", 403);
      }
      await insertRequest({
        requestId,
        action: body.action,
        slotId: null,
        hostId: host.discord_id,
        payload: { ...payload },
        guildId: gameGuild,
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "moderation" || body.action === "dishonored") {
      const validation =
        body.action === "moderation"
          ? validateModeration(body.payload, host.discord_id)
          : validateDishonored(body.payload, host.discord_id);
      if (!validation.ok) return jsonError(validation.error, 400);
      await insertRequest({
        requestId,
        action: body.action,
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "host_rating") {
      if (!host.can_rate_hosts) return jsonError("Only Senior Hosts and Host Management can rate hosts.", 403);
      const validation = validateHostRating(body.payload, host.discord_id);
      if (!validation.ok) return jsonError(validation.error, 400);
      if (validation.value.op === "take" && !host.is_staff) {
        return jsonError("Only Host Management can take Acclamations or Violations back.", 403);
      }
      if (!host.rate_branches.includes(validation.value.branch)) {
        const branch = validation.value.branch;
        return jsonError(`Only Senior ${branch} Hosts and Host Management can rate ${branch} hosts.`, 403);
      }
      await insertRequest({
        requestId,
        action: "host_rating",
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "role_scan") {
      if (!host.is_staff) return jsonError("Only Host Management (or admins) can run the role check.", 403);
      const raw = (typeof body.payload === "object" && body.payload !== null ? body.payload : {}) as Record<string, unknown>;
      if (raw.mode !== "preview" && raw.mode !== "apply") return jsonError("Choose preview or apply.", 400);
      await insertRequest({ requestId, action: "role_scan", slotId: null, hostId: host.discord_id, payload: { mode: raw.mode } });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "member_roles") {
      if (!host.is_staff) return jsonError("Only Host Management (or admins) can change verification or VIP.", 403);
      const validation = validateMemberRoles(body.payload, host.discord_id);
      if (!validation.ok) return jsonError(validation.error, 400);
      await insertRequest({
        requestId,
        action: "member_roles",
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    const lifecycleAction = LIFECYCLE_ACTIONS.find((action) => action === body.action);
    if (lifecycleAction) {
      const validation = validateGameLifecycle(lifecycleAction, body.payload);
      if (!validation.ok) return jsonError(validation.error, 400);
      const game = await getGameControl(validation.value.thread_id, host);
      if (!game) return jsonError("That game no longer exists.", 404);
      const refusal = lifecycleRefusal(game, lifecycleAction);
      if (refusal) return jsonError(refusal, game.can_manage ? 409 : 403);
      await insertRequest({
        requestId,
        action: lifecycleAction,
        slotId: null,
        hostId: host.discord_id,
        // The bot works on the storage key; the page may know the game by its lobby id.
        payload: { ...validation.value, thread_id: game.storage_key },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "host_dm") {
      const validation = validateHostDm(body.payload);
      if (!validation.ok) return jsonError(validation.error, 400);
      if (validation.value.user_id === host.discord_id) return jsonError("You can't message yourself.", 400);
      await insertRequest({ requestId, action: "host_dm", slotId: null, hostId: host.discord_id, payload: { ...validation.value } });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "game_message") {
      const validation = validateGameMessage(body.payload);
      if (!validation.ok) return jsonError(validation.error, 400);
      const game = await getGameControl(validation.value.thread_id, host);
      if (!game) return jsonError("That game no longer exists.", 404);
      const refusal = gameMessageRefusal(game, validation.value.recipients);
      if (refusal) return jsonError(refusal, game.can_manage ? 409 : 403);
      await insertRequest({
        requestId,
        action: "game_message",
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value, thread_id: game.storage_key },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "game_log_analysis") {
      const raw = (typeof body.payload === "object" && body.payload !== null ? body.payload : {}) as Record<string, unknown>;
      const threadId = typeof raw.thread_id === "string" && /^\d{5,25}$/.test(raw.thread_id) ? raw.thread_id : null;
      if (!threadId) return jsonError("Invalid game.", 400);
      const game = await getGameControl(threadId, host);
      if (!game) return jsonError("That game no longer exists.", 404);
      const refusal = logAnalysisRefusal(game);
      if (refusal) return jsonError(refusal, game.can_manage ? 409 : 403);
      await insertRequest({
        requestId,
        action: "game_log_analysis",
        slotId: null,
        hostId: host.discord_id,
        payload: { thread_id: game.storage_key },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "hotjoin_decide") {
      const raw = (typeof body.payload === "object" && body.payload !== null ? body.payload : {}) as Record<string, unknown>;
      const threadId = typeof raw.thread_id === "string" && SNOWFLAKE_RE.test(raw.thread_id) ? raw.thread_id : null;
      const userId = typeof raw.user_id === "string" && SNOWFLAKE_RE.test(raw.user_id) ? raw.user_id : null;
      if (!threadId || !userId || typeof raw.approve !== "boolean") return jsonError("Invalid hot-join decision.", 400);
      const game = await getGameControl(threadId, host);
      if (!game) return jsonError("That game no longer exists.", 404);
      const refusal = hotJoinRefusal(game, userId);
      if (refusal) return jsonError(refusal, game.can_manage ? 409 : 403);
      await insertRequest({
        requestId,
        action: "hotjoin_decide",
        slotId: null,
        hostId: host.discord_id,
        payload: { thread_id: game.storage_key, user_id: userId, approve: raw.approve, force: raw.force === true },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "game_remind") {
      const validation = validateGameRemind(body.payload);
      if (!validation.ok) return jsonError(validation.error, 400);
      const game = await getGameControl(validation.value.thread_id, host);
      if (!game) return jsonError("That game no longer exists.", 404);
      const refusal = reminderRefusal(game, validation.value.kind);
      if (refusal) return jsonError(refusal, game.can_manage ? 409 : 403);
      await insertRequest({
        requestId,
        action: "game_remind",
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value, thread_id: game.storage_key },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "game_resources") {
      const validation = validateGameResources(body.payload);
      if (!validation.ok) return jsonError(validation.error, 400);
      const game = await getGameControl(validation.value.thread_id, host);
      if (!game) return jsonError("That game no longer exists.", 404);
      const refusal = resourcesRefusal(game);
      if (refusal) return jsonError(refusal, game.can_manage ? 409 : 403);
      await insertRequest({
        requestId,
        action: "game_resources",
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value, thread_id: game.storage_key },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "game_access") {
      const validation = validateGameAccess(body.payload);
      if (!validation.ok) return jsonError(validation.error, 400);
      const game = await getGameControl(validation.value.thread_id, host);
      if (!game) return jsonError("That game no longer exists.", 404);
      const refusal = accessRefusal(game, validation.value.op);
      if (refusal) return jsonError(refusal, game.can_manage ? 409 : 403);
      await insertRequest({
        requestId,
        action: "game_access",
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value, thread_id: game.storage_key },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    const attendanceAction = ATTENDANCE_ACTIONS.find((action) => action === body.action);
    if (attendanceAction) {
      const validation = validateAttendance(attendanceAction, body.payload);
      if (!validation.ok) return jsonError(validation.error, 400);
      const game = await getAttendanceGame(validation.value.game_id, host);
      if (!game) return jsonError("That game hasn't started or no longer exists.", 404);
      // Any host may run a voice check; changing attendance is the game's host or staff.
      if (attendanceAction !== "att_check" && !game.can_edit) {
        return jsonError("Only the game's host or staff can change its attendance.", 403);
      }
      if ((attendanceAction === "att_sample" || attendanceAction === "att_finalize") && game.phase === "finalized") {
        return jsonError("Attendance is already finalized.", 409);
      }
      await insertRequest({
        requestId,
        action: attendanceAction,
        slotId: null,
        hostId: host.discord_id,
        payload: { ...validation.value },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    if (body.action === "lock_day" || body.action === "unlock_day") {
      if (!host.is_staff) return jsonError("Only staff can lock or unlock days.", 403);
      const payload = validateDayLock(body.payload);
      if (!payload) return jsonError("Invalid day", 400);
      await insertRequest({
        requestId,
        action: body.action,
        slotId: null,
        hostId: host.discord_id,
        payload: { ...payload },
      });
      return Response.json({ request_id: requestId, slot_id: null }, { status: 202 });
    }

    return jsonError("Unknown action", 400);
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return jsonError(error.message, 503);
    }
    console.error("[schedule/requests] POST failed:", error);
    return jsonError("Database unavailable", 503);
  }
}
