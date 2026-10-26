import {
  DISHONORED_MAX_DAYS,
  DISHONORED_MIN_DAYS,
  HOST_RATING_MAX_AMOUNT,
  MIN_REASON_LENGTH,
  MODERATION_MAX_AMOUNT,
  PORTFOLIO_MODES,
  type DishonoredPayload,
  type HostRatingPayload,
  type ModerationKind,
  type ModerationOp,
  type ModerationPayload,
} from "@/lib/moderationTypes";
import { HOST_BRANCH_VALUES } from "@/lib/hostBranches";
import type { PortfolioMode } from "@/lib/playerTypes";
import type { AttendanceGamePayload, AttendanceOverridePayload } from "@/lib/attendanceTypes";
import {
  HOST_TIERS,
  LINK_RE,
  MEMBER_ROLE_OPS,
  VERIFIED_TRACKS,
  VIP_CATEGORIES,
  VIP_LINK_MAX_LEN,
  VIP_MAX_LINKS,
  VIP_NOTE_MAX,
  VIP_REASON_MAX,
  VIP_REASON_MIN,
  type MemberRolesPayload,
} from "@/lib/memberRolesTypes";

/**
 * Checks for Database page requests before they're queued for the bot (the
 * bot's moderation engine re-checks everything against live data).
 */

const SNOWFLAKE_RE = /^\d{5,25}$/;
const MAX_REASON_LENGTH = 1000;
const MAX_NATIONS = 60;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function reasonOf(raw: unknown): Result<string> {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, error: "Please give a reason (at least a few words)." };
  if (reason.length > MAX_REASON_LENGTH) return { ok: false, error: `Keep the reason under ${MAX_REASON_LENGTH} characters.` };
  return { ok: true, value: reason };
}

function gameIdOf(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  return typeof raw === "string" && SNOWFLAKE_RE.test(raw) ? raw : undefined;
}

function modeOf(raw: unknown): PortfolioMode | null {
  return PORTFOLIO_MODES.find((mode) => mode === raw) ?? null;
}

export function validateModeration(raw: unknown, hostId: string): Result<ModerationPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const userId = typeof body.user_id === "string" && SNOWFLAKE_RE.test(body.user_id) ? body.user_id : null;
  if (!userId) return { ok: false, error: "Invalid player." };
  if (userId === hostId) return { ok: false, error: "You can't moderate yourself — ask another host." };
  const op = (["give", "take", "redeem"] as const).find((value) => value === body.op) as ModerationOp | undefined;
  if (!op) return { ok: false, error: "Unknown action." };
  const kind = (op === "redeem"
    ? "warn"
    : (["commend", "merit", "warn", "ban"] as const).find((value) => value === body.kind)) as
    | ModerationKind
    | undefined;
  if (!kind) return { ok: false, error: "Unknown action type." };
  const mode = kind === "merit" ? null : modeOf(body.mode);
  if (kind !== "merit" && !mode) return { ok: false, error: "Pick a mode: Roleplay or Historical." };
  const counted = kind === "commend" || kind === "merit" || kind === "warn";
  const amount = counted ? Number(body.amount) : 1;
  if (!Number.isInteger(amount) || amount < 1 || amount > MODERATION_MAX_AMOUNT) {
    return { ok: false, error: `Amount must be between 1 and ${MODERATION_MAX_AMOUNT}.` };
  }
  const reason = reasonOf(body.reason);
  if (!reason.ok) return reason;
  const gameId = op === "redeem" ? null : gameIdOf(body.game_id);
  if (gameId === undefined) return { ok: false, error: "Invalid game." };
  const aiReward = body.ai_reward === true && op === "give" && (kind === "commend" || kind === "merit") && gameId !== null;
  return {
    ok: true,
    value: { user_id: userId, op, kind, mode, amount, reason: reason.value, game_id: gameId, ...(aiReward ? { ai_reward: true } : {}) },
  };
}

export function validateHostRating(raw: unknown, hostId: string): Result<HostRatingPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const userId = typeof body.user_id === "string" && SNOWFLAKE_RE.test(body.user_id) ? body.user_id : null;
  if (!userId) return { ok: false, error: "Invalid host." };
  if (userId === hostId) return { ok: false, error: "You can't rate yourself — ask another senior." };
  const op = body.op === "give" || body.op === "take" ? body.op : null;
  if (!op) return { ok: false, error: "Unknown action." };
  const kind = body.kind === "acclamation" || body.kind === "violation" ? body.kind : null;
  if (!kind) return { ok: false, error: "Pick Acclamation or Violation." };
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > HOST_RATING_MAX_AMOUNT) {
    return { ok: false, error: `Amount must be between 1 and ${HOST_RATING_MAX_AMOUNT}.` };
  }
  const branch = HOST_BRANCH_VALUES.find((value) => value === body.branch);
  if (!branch) return { ok: false, error: "Pick a host branch: RP or HIST." };
  const reason = reasonOf(body.reason);
  if (!reason.ok) return reason;
  return { ok: true, value: { user_id: userId, op, kind, amount, reason: reason.value, branch } };
}

/** Verification / VIP requests (the bot's _process_web_member_roles re-checks everything). */
export function validateMemberRoles(raw: unknown, hostId: string): Result<MemberRolesPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const userId = typeof body.user_id === "string" && SNOWFLAKE_RE.test(body.user_id) ? body.user_id : null;
  if (!userId) return { ok: false, error: "Invalid player." };
  const op = MEMBER_ROLE_OPS.find((value) => value === body.op);
  if (!op) return { ok: false, error: "Unknown role action." };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, VIP_REASON_MAX) : "";
  if (op === "verify" || op === "unverify") {
    const track = VERIFIED_TRACKS.find((entry) => entry.track === body.track)?.track;
    if (!track) return { ok: false, error: "Pick RP Verified or Hist Verified." };
    if (op === "unverify" && reason.length < MIN_REASON_LENGTH) {
      return { ok: false, error: "Please give a reason for taking it away." };
    }
    return { ok: true, value: { user_id: userId, op, track, reason: reason.slice(0, 300) } };
  }
  if (op === "host_tier") {
    if (userId === hostId) return { ok: false, error: "You can't change your own host role — ask another Host Management member." };
    const branch = HOST_BRANCH_VALUES.find((value) => value === body.branch);
    if (!branch) return { ok: false, error: "Pick a host branch: RP or HIST." };
    const tier = HOST_TIERS.find((entry) => entry.value === body.tier)?.value;
    if (!tier) return { ok: false, error: "Pick a host rank: Assistant, Full, Senior or none." };
    if (tier === "None" && reason.length < MIN_REASON_LENGTH) {
      return { ok: false, error: "Please give a reason for taking the host role away." };
    }
    return { ok: true, value: { user_id: userId, op, tier, branch, ...(reason ? { reason: reason.slice(0, 300) } : {}) } };
  }
  if (op === "vip_grant") {
    if (userId === hostId) return { ok: false, error: "You can't give yourself VIP — ask another Host Management member." };
    const category = VIP_CATEGORIES.find((entry) => entry.value === body.category)?.value;
    if (!category) return { ok: false, error: "Pick a VIP category: Content Creator, PDX Staff or Highly Trusted." };
    if (category === "content_creator") {
      const links = (Array.isArray(body.links) ? body.links : []).map((link) => String(link ?? "").trim()).filter(Boolean);
      if (links.length === 0) return { ok: false, error: "Add at least one channel link (YouTube, Twitch, Kick…)." };
      if (links.length > VIP_MAX_LINKS) return { ok: false, error: `At most ${VIP_MAX_LINKS} links.` };
      const bad = links.find((link) => link.length > VIP_LINK_MAX_LEN || !LINK_RE.test(link));
      if (bad) return { ok: false, error: `"${bad.slice(0, 60)}" isn't a valid link — use the full https:// address.` };
      return { ok: true, value: { user_id: userId, op, category, links } };
    }
    if (category === "highly_trusted") {
      if (reason.length < VIP_REASON_MIN) {
        return { ok: false, error: `Say why they're highly trusted (at least ${VIP_REASON_MIN} characters).` };
      }
      return { ok: true, value: { user_id: userId, op, category, reason } };
    }
    const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, VIP_NOTE_MAX) : "";
    return { ok: true, value: { user_id: userId, op, category, ...(note ? { note } : {}) } };
  }
  if (op === "vip_remove" && reason.length < MIN_REASON_LENGTH) {
    return { ok: false, error: "Please give a reason (at least a few words)." };
  }
  return { ok: true, value: { user_id: userId, op, ...(reason ? { reason: reason.slice(0, 300) } : {}) } };
}

export const ATTENDANCE_ACTIONS = ["att_check", "att_sample", "att_override", "att_finalize"] as const;
export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number];

/** Attendance page requests (the bot's _process_web_attendance re-checks everything). */
export function validateAttendance(
  action: AttendanceAction,
  raw: unknown,
): Result<AttendanceGamePayload | AttendanceOverridePayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const gameId = typeof body.game_id === "string" && SNOWFLAKE_RE.test(body.game_id) ? body.game_id : null;
  if (!gameId) return { ok: false, error: "Invalid game." };
  if (action !== "att_override") return { ok: true, value: { game_id: gameId } };
  const userId = typeof body.user_id === "string" && SNOWFLAKE_RE.test(body.user_id) ? body.user_id : null;
  if (!userId) return { ok: false, error: "Invalid player." };
  const verdict = (["present", "absent", "excused", "auto"] as const).find((value) => value === body.verdict);
  if (!verdict) return { ok: false, error: "Pick Present, Absent, Excused or Automatic." };
  const reason = reasonOf(body.reason);
  if (!reason.ok) return reason;
  return { ok: true, value: { game_id: gameId, user_id: userId, verdict, reason: reason.value } };
}

function nationList(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_NATIONS) return null;
  const names = raw.map((value) => (typeof value === "string" ? value.trim() : ""));
  return names.some((name) => !name || name.length > 100) ? null : [...new Set(names)];
}

export function validateDishonored(raw: unknown, hostId: string): Result<DishonoredPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const userId = typeof body.user_id === "string" && SNOWFLAKE_RE.test(body.user_id) ? body.user_id : null;
  if (!userId) return { ok: false, error: "Invalid player." };
  if (userId === hostId) return { ok: false, error: "You can't moderate yourself — ask another host." };
  const op = body.op === "give" || body.op === "take" ? body.op : null;
  if (!op) return { ok: false, error: "Unknown Dishonored action." };
  const mode = modeOf(body.mode);
  if (!mode) return { ok: false, error: "Pick a mode: Roleplay or Historical." };
  const reason = reasonOf(body.reason);
  if (!reason.ok) return reason;
  const gameId = gameIdOf(body.game_id);
  if (gameId === undefined) return { ok: false, error: "Invalid game." };
  const majors = nationList(body.majors);
  const minors = nationList(body.minors);
  if (!majors || !minors) return { ok: false, error: "Invalid nation list." };
  const allMajors = Boolean(body.all_majors);
  const days = Number(body.days);
  if (op === "give") {
    if (!Number.isInteger(days) || days < DISHONORED_MIN_DAYS || days > DISHONORED_MAX_DAYS) {
      return { ok: false, error: `Duration must be ${DISHONORED_MIN_DAYS}–${DISHONORED_MAX_DAYS} days.` };
    }
    if (!allMajors && majors.length === 0 && minors.length === 0) {
      return { ok: false, error: "Pick at least one restriction: All Majors, a Major or a Minor." };
    }
  }
  return {
    ok: true,
    value: {
      user_id: userId,
      op,
      mode,
      reason: reason.value,
      days: op === "give" ? days : 0,
      all_majors: allMajors,
      majors: allMajors ? [] : majors,
      minors,
      replace: Boolean(body.replace),
      game_id: gameId,
    },
  };
}
