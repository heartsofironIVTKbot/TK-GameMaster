import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { DEFAULT_AI_RULES, type AiPlayerResult, type AiRules, type AiStatus, type GameAiAnalysis } from "@/lib/aiAnalysisTypes";
import { chatLogMeta } from "@/lib/chatLogs";
import { getPool } from "@/lib/db";
import { GAME_COLUMNS, rawGames, stableId, type GameRow, type RawAttendanceGame } from "@/lib/attendance";
import { demoControlRaw } from "@/lib/gameControlDemo";
import {
  ACCESS_LEVELS,
  type AccessLevel,
  type GameAccessOp,
  type GameControl,
  type GameControlPlayer,
  type GameControlSummary,
  type GamePhase,
  type LifecycleAction,
  type ReminderKind,
} from "@/lib/gameControlTypes";
import { buildLobbyDraft, draftNotes } from "@/lib/draft";
import { parseHotJoin } from "@/lib/hotJoinTypes";
import { lookupMembers } from "@/lib/memberDirectory";
import type { GameMessageRecipient } from "@/lib/messageTypes";
import { moderationOptions } from "@/lib/playerIndex";
import type { ResourceEntry } from "@/lib/presetTypes";
import { parsePresetData } from "@/lib/presetValidation";
import { parseRequireIronLegion } from "@/lib/ironlegion";
import { settingsOf } from "@/lib/serverSettings";
import { prettySlot } from "@/lib/playerProfile";
import { isSchedulerDemo, listInFlightLifecycle, type InFlightLifecycle } from "@/lib/scheduleStore";
import type { DirectoryMember, HostProfile } from "@/lib/scheduleTypes";

/**
 * Games page data: every announced or running game (plus the last two days
 * of finished ones) from the bot's `games` table, with the start / end /
 * cancel requests still in flight. The phase rules mirror the bot's
 * _process_web_game_lifecycle checks so the page only offers what it allows.
 * One server at a time (multi-server): the viewer's current server.
 */
/** /game_start's own guard: a start older than this was cut off and may be retried. */
const START_RETRY_SEC = 600;
/** Finished games stay listed this long. */
const RECENT_SEC = 2 * 86_400;

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const ids = (value: unknown): Set<string> => new Set(Array.isArray(value) ? value.map(String) : []);

export function phaseOf(raw: RawAttendanceGame, nowSec: number): GamePhase {
  const data = raw.data;
  const status = String(raw.status ?? "").toLowerCase();
  if (status === "cancelled") return "cancelled";
  if (num(data.game_end_completed_at)) return "ended";
  if (status === "ended") {
    // Games ended before the bot recorded completion: treat old ones as done.
    const started = num(data.game_end_started_at);
    return started && nowSec - started < RECENT_SEC ? "ending" : "ended";
  }
  if (data.game_started) return "live";
  const starting = num(data.game_start_started_at);
  if (starting && nowSec - starting < START_RETRY_SEC) return "starting";
  return "announced";
}

function nameOf(names: Map<string, DirectoryMember>, id: string | null): string | null {
  if (!id) return null;
  const member = names.get(id);
  return member ? member.ingame_nickname || member.display_name || member.username || `#${id}` : `#${id}`;
}

function keysOf(raw: RawAttendanceGame): string[] {
  return [raw.storage_key, String(raw.data.lobby_thread_id ?? ""), String(raw.data.original_thread_id ?? "")].filter(Boolean);
}

function inFlightFor(raw: RawAttendanceGame, inFlight: InFlightLifecycle[]): InFlightLifecycle | null {
  const keys = new Set(keysOf(raw));
  return inFlight.find((request) => keys.has(request.thread_id)) ?? null;
}

function scheduledAt(raw: RawAttendanceGame): number | null {
  return num(raw.start_timestamp) || num(raw.data.start_timestamp) || num(raw.data.game_timestamp) || null;
}

function summaryOf(
  raw: RawAttendanceGame,
  names: Map<string, DirectoryMember>,
  viewer: HostProfile,
  inFlight: InFlightLifecycle | null,
  nowSec: number,
): GameControlSummary {
  return {
    id: stableId(raw),
    name: (raw.thread_name || `${raw.mode ?? "Game"} ${stableId(raw)}`).replace(/\s*Reservations\s*$/i, ""),
    mode: raw.mode || "Unknown",
    host_id: raw.host_id,
    host_name: nameOf(names, raw.host_id),
    phase: phaseOf(raw, nowSec),
    scheduled_at: scheduledAt(raw),
    started_at: num(raw.data.game_started_at) || null,
    players: new Set(Object.values(raw.reservations)).size,
    mine: raw.host_id === viewer.discord_id,
    in_flight: inFlight?.action ?? null,
  };
}

const PHASE_RANK: Record<GamePhase, number> = { starting: 0, live: 0, ending: 0, announced: 1, ended: 2, cancelled: 2 };

async function loadRaws(guildId: string): Promise<RawAttendanceGame[]> {
  // The sample games belong to the home server; other sample servers have none.
  if (isSchedulerDemo()) return guildId === HOME_GUILD_ID ? demoControlRaw() : [];
  const [rows] = await getPool().query<GameRow[]>(
    `SELECT ${GAME_COLUMNS} FROM games
     WHERE guild_id = ? AND ((status IS NULL OR status NOT IN ('ended', 'cancelled'))
        OR updated_at >= NOW() - INTERVAL 2 DAY)
     ORDER BY updated_at DESC LIMIT 60`,
    [guildId],
  );
  return rawGames(rows);
}

/** Announced, running and recently finished games — running first, then by start time. */
export async function listControlGames(viewer: HostProfile): Promise<GameControlSummary[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const [raws, inFlight] = await Promise.all([loadRaws(viewer.guild_id), listInFlightLifecycle()]);
  const names = await lookupMembers(raws.map((raw) => raw.host_id ?? ""), viewer.guild_id);
  return raws
    .map((raw) => summaryOf(raw, names, viewer, inFlightFor(raw, inFlight), nowSec))
    .sort(
      (a, b) =>
        PHASE_RANK[a.phase] - PHASE_RANK[b.phase] ||
        (a.phase === "announced"
          ? (a.scheduled_at ?? Infinity) - (b.scheduled_at ?? Infinity)
          : (b.started_at ?? b.scheduled_at ?? 0) - (a.started_at ?? a.scheduled_at ?? 0)),
    );
}

/** One game on a server (an id from another server is "not found"). */
async function loadRaw(gameId: string, guildId: string): Promise<RawAttendanceGame | null> {
  if (isSchedulerDemo()) {
    if (guildId !== HOME_GUILD_ID) return null;
    return demoControlRaw().find((raw) => keysOf(raw).includes(gameId)) ?? null;
  }
  const [rows] = await getPool().query<GameRow[]>(
    `SELECT ${GAME_COLUMNS} FROM games
     WHERE guild_id = ? AND (thread_id = ?
        OR JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.lobby_thread_id')) = ?
        OR JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.original_thread_id')) = ?)
     ORDER BY (thread_id = ?) DESC LIMIT 1`,
    [guildId, gameId, gameId, gameId, gameId],
  );
  return (await rawGames(rows))[0] ?? null;
}

/** One game with its roster, start readiness and what the viewer may do. */
export async function getGameControl(gameId: string, viewer: HostProfile): Promise<GameControl | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  const [raw, inFlightAll] = await Promise.all([loadRaw(gameId, viewer.guild_id), listInFlightLifecycle()]);
  if (!raw) return null;
  const data = raw.data;
  const inFlight = inFlightFor(raw, inFlightAll);
  const reminderHistory = Array.isArray(data.reminder_history) ? data.reminder_history.map(obj) : [];
  const lastReminder = reminderHistory[reminderHistory.length - 1] ?? null;
  const messageHistory = (Array.isArray(data.message_history) ? data.message_history.map(obj) : []).slice(-5).reverse();
  const draftRaw = obj(data.draft);
  const [chatLog, serverSettings] = await Promise.all([chatLogMeta(keysOf(raw)).catch(() => null), settingsOf(viewer.guild_id)]);
  const hotJoins = parseHotJoin(data.hotjoin_requests).slice(0, 15);
  const aiRaw = obj(data.ai_analysis);
  const aiPlayers = Array.isArray(aiRaw.players) ? aiRaw.players.map(obj) : [];
  const aiGiven = obj(data.ai_rewards_given);
  const names = await lookupMembers([
    ...aiPlayers.map((player) => String(player.user_id ?? "")),
    ...Object.values(aiGiven).map((entry) => String(obj(entry).by ?? "")),
    String(aiRaw.by ?? ""),
    chatLog?.uploaded_by ?? "",
    ...hotJoins.flatMap((entry) => [entry.user_id, entry.decided_by ?? ""]),
    ...Object.values(raw.reservations),
    raw.host_id ?? "",
    String(data.cancelled_by ?? ""),
    String(lastReminder?.by ?? ""),
    ...messageHistory.map((entry) => String(entry.by ?? "")),
    ...Object.keys(obj(draftRaw.pool)),
    ...(Array.isArray(draftRaw.teams) ? draftRaw.teams.map((team) => String(obj(team).captain_id ?? "")) : []),
  ], viewer.guild_id);
  const summary = summaryOf(raw, names, viewer, inFlight, nowSec);
  const started = Boolean(data.game_started);
  const confirmed = ids(data.confirmed_ids);

  const bySlot = new Map<string, string[]>();
  for (const [slot, userId] of Object.entries(raw.reservations)) bySlot.set(userId, [...(bySlot.get(userId) ?? []), slot]);
  const roster: GameControlPlayer[] = [...bySlot.entries()]
    .map(([userId, slots]) => {
      const member = names.get(userId);
      return {
        user_id: userId,
        name: nameOf(names, userId) ?? `#${userId}`,
        username: member?.username ?? null,
        avatar_url: member?.avatar_url ?? null,
        slot: slots.map(prettySlot).join(" + "),
        confirmed: started ? confirmed.has(userId) : null,
      };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot));

  const samples = Array.isArray(data.presence_snapshots) ? data.presence_snapshots.length : 0;
  const level = (value: unknown): AccessLevel => ACCESS_LEVELS.find((entry) => entry === value) ?? "All Users";
  const options = await moderationOptions(viewer.guild_id).catch(() => null);
  // A preset's not-playable nations: locked for good, so they're kept out of the access tools.
  const notPlayable = Array.isArray(data.layout_disabled_nations) ? data.layout_disabled_nations.map(String) : [];
  const hidden = new Set(notPlayable);
  const allNations = options?.mode_nations?.[raw.mode ?? ""] ?? null;
  const modeNations = allNations
    ? { majors: allNations.majors.filter((name) => !hidden.has(name)), minors: allNations.minors.filter((name) => !hidden.has(name)) }
    : null;
  const layout = parsePresetData({ layout: data.nation_layout ?? null }).layout;
  const standard = options?.mode_resources?.[raw.mode ?? ""];
  // `chaos`: All Add-ons games announced before that add-on was removed.
  const casino = Boolean(data.randomizer_only || data.chaos);
  // Draft games: teams, turn and the pool (notes too — this page is hosts only).
  const lobbyDraft = buildLobbyDraft(
    data,
    (id) => ({ name: nameOf(names, id), avatar_url: names.get(id)?.avatar_url ?? null }),
    modeNations,
  );
  const draft = lobbyDraft
    ? { ...lobbyDraft, complete: lobbyDraft.phase === "COMPLETE", pool_left: lobbyDraft.pool.length, notes: draftNotes(data) }
    : null;
  const threadOpen = summary.phase !== "ended" && summary.phase !== "cancelled";
  const checksum = typeof data.scheduled_checksum === "string" ? data.scheduled_checksum.toUpperCase() : null;

  return {
    ...summary,
    storage_key: raw.storage_key,
    logging_mode: String(data.logging_mode || "Strict"),
    add_on: typeof data.add_on === "string" && data.add_on !== "none" ? data.add_on : null,
    ended_at: num(data.ended_at) || null,
    cancelled_at: num(data.cancelled_at) || null,
    cancel_reason: typeof data.cancel_reason === "string" ? data.cancel_reason : null,
    cancelled_by: nameOf(names, data.cancelled_by ? String(data.cancelled_by) : null),
    interval_minutes: num(data.snapshot_interval_minutes) || null,
    samples_done: samples,
    present: ids(data.present_ids).size || (started ? confirmed.size : 0),
    roster,
    draft,
    scheduled_checksum: checksum && /^[A-Z0-9]{4}$/.test(checksum) ? checksum : null,
    discord_url: discordUrl(raw, viewer.guild_id, threadOpen, summary.phase),
    has_thread: !raw.data.no_thread,
    can_manage: viewer.is_staff || viewer.discord_id === raw.host_id,
    in_flight_request: inFlight
      ? { request_id: inFlight.request_id, action: inFlight.action, mine: inFlight.host_id === viewer.discord_id }
      : null,
    access: {
      major_level: level(data.major_lock_level),
      minor_level: level(data.minor_lock_level),
      lockdown: Boolean(data.lockdown),
      locked_nations: Array.isArray(data.locked_regions) ? data.locked_regions.map(String).filter((name) => !hidden.has(name)) : [],
      require_ironlegion: parseRequireIronLegion(data.require_ironlegion),
      server_requires_ironlegion: Boolean(serverSettings?.features.ironlegion),
    },
    nations: modeNations,
    preset:
      data.preset_name || layout
        ? {
            name: typeof data.preset_name === "string" ? data.preset_name : null,
            groups: layout
              ? layout.map((group) => ({ name: group.name, count: group.tiers.reduce((sum, tier) => sum + tier.nations.length, 0) }))
              : null,
            not_playable: notPlayable,
          }
        : null,
    resources: {
      mods: gameResourceEntries(data, "mods", standard?.mods ?? [], casino),
      rules: gameResourceEntries(data, "rules", standard?.rules ?? [], casino),
      casino,
    },
    message_recipients: messageRecipients(raw, (id) => ({
      name: nameOf(names, id) ?? `#${id}`,
      avatar_url: names.get(id)?.avatar_url ?? null,
    })),
    messages: messageHistory.map((entry) => ({
      ts: num(entry.ts),
      by_name: nameOf(names, entry.by ? String(entry.by) : null),
      text: String(entry.text ?? ""),
      sent: num(entry.sent),
      failed: num(entry.failed),
      total: num(entry.total),
    })),
    chat_log: chatLog
      ? {
          filename: chatLog.filename,
          bytes: chatLog.bytes,
          uploaded_at: chatLog.uploaded_at,
          uploaded_by_name: nameOf(names, chatLog.uploaded_by),
        }
      : null,
    ai_analysis: parseAiAnalysis(aiRaw, aiPlayers, aiGiven, names),
    hotjoin: hotJoins.map((entry) => ({
      ...entry,
      name: nameOf(names, entry.user_id) ?? `#${entry.user_id}`,
      avatar_url: names.get(entry.user_id)?.avatar_url ?? null,
      decided_by_name: nameOf(names, entry.decided_by),
    })),
    reminders: {
      automatic: Boolean(data.automatic_reminder),
      automatic_sent_at: num(data.automatic_reminder_sent_at) || null,
      last:
        lastReminder && (lastReminder.kind === "early" || lastReminder.kind === "late")
          ? {
              kind: lastReminder.kind,
              ts: num(lastReminder.ts),
              by_name: nameOf(names, lastReminder.by ? String(lastReminder.by) : null),
              sent: num(lastReminder.sent),
              failed: num(lastReminder.failed),
            }
          : null,
    },
  };
}

/**
 * The game in Discord. Newer games have no reservation thread — link their
 * announcement post (gone once cancelled); older ones keep their thread until
 * they end.
 */
function discordUrl(raw: RawAttendanceGame, viewerGuild: string, threadOpen: boolean, phase: GamePhase): string | null {
  const guild = raw.guild_id ?? viewerGuild;
  if (raw.data.no_thread) {
    const channel = raw.data.announcement_channel_id;
    const message = raw.data.announcement_message_id;
    return phase !== "cancelled" && channel && message ? `https://discord.com/channels/${guild}/${channel}/${message}` : null;
  }
  return threadOpen ? `https://discord.com/channels/${guild}/${raw.storage_key}` : null;
}

/** Hot-join decisions the bot will accept now (mirrors _web_hotjoin_decide). */
export function hotJoinRefusal(game: GameControl, userId: string): string | null {
  if (!game.can_manage) return "Only the game's host or Host Management can decide hot-join requests.";
  if (game.phase !== "live") return "Hot-join is only for a game that is running.";
  if (!game.hotjoin.some((entry) => entry.user_id === userId && entry.status === "pending")) {
    return "This request isn't waiting any more — the player may have withdrawn it.";
  }
  return null;
}

const AI_STATUSES: AiStatus[] = ["rewarded", "minimal", "no_rp", "toxic", "ungraded"];

function aiRules(raw: unknown): AiRules {
  const rules = obj(raw);
  const tiers = (value: unknown, fallback: [number, number][]) =>
    Array.isArray(value) && value.every((tier) => Array.isArray(tier) && tier.length === 2)
      ? (value as unknown[][]).map((tier) => [num(tier[0]), num(tier[1])] as [number, number])
      : fallback;
  return {
    commend_tiers: tiers(rules.commend_tiers, DEFAULT_AI_RULES.commend_tiers),
    merit_tiers: tiers(rules.merit_tiers, DEFAULT_AI_RULES.merit_tiers),
    commend_min_creativity: num(rules.commend_min_creativity) || DEFAULT_AI_RULES.commend_min_creativity,
    merit_min_creativity: num(rules.merit_min_creativity) || DEFAULT_AI_RULES.merit_min_creativity,
    toxic_from: num(rules.toxic_from) || DEFAULT_AI_RULES.toxic_from,
  };
}

/** The bot's stored analysis (game_data.ai_analysis) for the Games page. */
function parseAiAnalysis(
  raw: Record<string, unknown>,
  players: Record<string, unknown>[],
  given: Record<string, unknown>,
  names: Map<string, DirectoryMember>,
): GameAiAnalysis | null {
  if (!num(raw.at) || players.length === 0) return null;
  const log = obj(raw.log);
  return {
    at: num(raw.at),
    by_name: nameOf(names, raw.by ? String(raw.by) : null),
    merit_enabled: raw.merit_enabled !== false,
    rules: aiRules(raw.rules),
    log: log.filename ? { filename: String(log.filename), bytes: num(log.bytes), uploaded_at: num(log.uploaded_at) } : null,
    players: players.map((player): AiPlayerResult => {
      const userId = player.user_id ? String(player.user_id) : null;
      const reward = obj(player.reward);
      const gift = userId ? obj(given[userId]) : {};
      const role = player.role === "COOP" || player.role === "UNRESERVED" ? player.role : "MAIN";
      return {
        tag: String(player.tag ?? ""),
        nation: String(player.nation ?? ""),
        user_id: userId,
        role,
        name: userId ? (nameOf(names, userId) ?? (player.name ? String(player.name) : null)) : null,
        avatar_url: userId ? (names.get(userId)?.avatar_url ?? null) : null,
        lines: num(player.lines),
        words: num(player.words),
        meaningful_words: num(player.meaningful_words),
        in_character_share: num(player.in_character_share),
        creativity: num(player.creativity),
        toxicity: num(player.toxicity),
        low_effort: Boolean(player.low_effort),
        left_early: Boolean(player.left_early),
        graded: player.graded !== false,
        summary: String(player.summary ?? ""),
        snippets: Array.isArray(player.snippets) ? player.snippets.map(String).slice(0, 3) : [],
        reward: { commends: num(reward.commends), merit: num(reward.merit), why: String(reward.why ?? "") },
        status: AI_STATUSES.find((status) => status === player.status) ?? "minimal",
        given:
          gift.kind === "commend" || gift.kind === "merit"
            ? { kind: gift.kind, amount: num(gift.amount), by_name: nameOf(names, gift.by ? String(gift.by) : null), at: num(gift.at) }
            : null,
      };
    }),
  };
}

/** AI analysis runs only on games that were played. */
export function logAnalysisRefusal(game: GameControl): string | null {
  if (!game.can_manage) return "Only the game's host or Host Management can run its AI analysis.";
  if (game.phase === "announced" || game.phase === "cancelled") return "The AI reads the chat log of a game that was played — start it first.";
  if (!game.chat_log) return "Upload the game's chat log (.txt) first.";
  return null;
}

/** Bot's _reminder_slot_label: "_FILL_Filler_1" → "Filler 1", "Italy_coop" → "Italy (Co-op)". */
function messageSlotLabel(slot: string): string {
  if (slot.startsWith("_FILL_")) return slot.slice(6).replace(/_/g, " ");
  if (slot.includes("_coop")) return `${slot.split("_coop")[0]} (Co-op)`;
  return slot;
}

/** Everyone a game message reaches (mirrors the bot's _game_message_recipients):
 *  reserved players (co-ops and fillers too), then the draft pool. */
function messageRecipients(
  raw: RawAttendanceGame,
  who: (id: string) => { name: string; avatar_url: string | null },
): GameMessageRecipient[] {
  const labels = new Map<string, string[]>();
  for (const [slot, userId] of Object.entries(raw.reservations)) {
    if (/^\d+$/.test(userId)) labels.set(userId, [...(labels.get(userId) ?? []), messageSlotLabel(slot)]);
  }
  for (const userId of Object.keys(obj(obj(raw.data.draft).pool))) {
    if (/^\d+$/.test(userId) && !labels.has(userId)) labels.set(userId, ["Draft pool"]);
  }
  return [...labels.entries()]
    .map(([userId, slots]) => ({ user_id: userId, ...who(userId), label: slots.join(", ") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Game messages the bot will send now (mirrors _process_web_game_message). */
export function gameMessageRefusal(game: GameControl, recipients: string[] | null): string | null {
  if (!game.can_manage) return "Only the game's host or Host Management can message its players.";
  if (game.message_recipients.length === 0) return "Nobody has signed up for this game yet — there's no one to message.";
  if (recipients) {
    const known = new Set(game.message_recipients.map((entry) => entry.user_id));
    if (!recipients.some((id) => known.has(id))) return "None of the players you picked are in this game any more.";
  }
  return null;
}

const CASINO_RULES: ResourceEntry = {
  name: "Casino / Casino Protocol Rules",
  link: "https://docs.google.com/document/d/1xtIZYGCW4HOGbt8_LVyrUFhxjy5uTtlYu4YRD8bSM3s/edit?usp=sharing",
};

/**
 * A game's current mods / rules list (mirrors the bot's _game_resource_entries):
 * the list it was announced or last edited with, else — for games announced
 * before presets — the mode's standard list (+ casino rules, + old custom ones).
 */
function gameResourceEntries(
  data: Record<string, unknown>,
  kind: "mods" | "rules",
  standard: ResourceEntry[],
  casino: boolean,
): ResourceEntry[] {
  const managed = data[kind === "mods" ? "managed_mods" : "managed_rulesets"];
  const parse = (value: unknown) => (Array.isArray(value) ? value : []).map(obj).filter((entry) => entry.name && entry.link)
    .map((entry) => ({ name: String(entry.name), link: String(entry.link) }));
  if (Array.isArray(managed)) return parse(managed);
  const entries = standard.map((entry) => ({ ...entry }));
  if (kind === "rules" && casino) entries.push({ ...CASINO_RULES });
  return [...entries, ...parse(data[kind === "mods" ? "custom_mods" : "custom_rulesets"])];
}

/** Rules / mods changes the bot will accept now (mirrors _process_web_game_resources). */
export function resourcesRefusal(game: GameControl): string | null {
  if (!game.can_manage) return "Only the game's host or Host Management can change its rules and mods.";
  if (game.phase === "ended" || game.phase === "cancelled" || game.phase === "ending") return "This game has ended or was cancelled.";
  return null;
}

/** Reminders the bot will send now (mirrors _process_web_game_remind / _send_game_reminder). */
export function reminderRefusal(game: GameControl, kind: ReminderKind): string | null {
  if (!game.can_manage) return "Only the game's host or Host Management can send reminders.";
  if (game.phase === "ended" || game.phase === "cancelled" || game.phase === "ending") return "This game has ended or was cancelled.";
  if (game.players === 0) return "Nobody has reserved a nation yet — there's no one to remind.";
  if (kind === "early" && game.phase !== "announced") return "The game has started — send a late reminder instead.";
  if (kind === "late" && game.phase !== "live") return "The game hasn't started — send an early reminder instead.";
  return null;
}

/** What the bot will accept now (mirrors _process_web_game_lifecycle); null = allowed. */
export function lifecycleRefusal(game: GameControl, action: LifecycleAction): string | null {
  if (!game.can_manage) return "Only the game's host or Host Management can do that.";
  if (game.in_flight) return "This game is already being started, ended or cancelled — wait for that to finish.";
  if (action === "game_start") {
    if (game.phase === "live" || game.phase === "starting") return "This game has already started.";
    if (game.phase !== "announced") return "This game has already ended or was cancelled.";
    if (game.draft && !game.draft.complete) return `The draft isn't finished — ${game.draft.pool_left} player(s) are still in the pool.`;
    return null;
  }
  if (action === "game_end") {
    if (game.phase === "cancelled") return "This game was cancelled.";
    if (game.phase === "ended") return "This game has already ended.";
    if (game.phase !== "live" && game.phase !== "ending") return "This game hasn't started — cancel it instead.";
    return null;
  }
  if (game.phase === "cancelled") return "This game is already cancelled.";
  if (game.phase === "ended" || game.phase === "ending") return "This game has already ended — it can't be cancelled.";
  return null;
}

/** Reservation access changes the bot will accept now (mirrors _process_web_game_access). */
export function accessRefusal(game: GameControl, op: GameAccessOp): string | null {
  if (!game.can_manage) return "Only the game's host or Host Management can change who may reserve.";
  if (game.phase === "ended" || game.phase === "cancelled" || game.phase === "ending") {
    return "This game has ended or was cancelled.";
  }
  if (game.in_flight) return "This game is being started, ended or cancelled — try again in a moment.";
  if (op === "clear" && game.phase !== "announced") {
    return "The game has started — clearing it would break its attendance. Remove players one by one, or cancel the game.";
  }
  return null;
}
