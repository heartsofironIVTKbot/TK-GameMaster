import { DEFAULT_AI_RULES, aiReward } from "@/lib/aiAnalysisTypes";
import type { RawAttendanceGame } from "@/lib/attendance";
import {
  demoAttendanceCancel,
  demoAttendanceEnd,
  demoAttendanceLateJoin,
  demoAttendanceRaw,
  demoAttendanceStart,
} from "@/lib/attendanceDemo";
import { demoModerationOptions } from "@/lib/databaseDemo";
import { demoChatLogText } from "@/lib/chatLogs";
import { buildLobbyDraft, draftSlots, type DraftPhase, type LobbyDraft } from "@/lib/draft";
import { ACCESS_LEVELS, type LifecycleAction } from "@/lib/gameControlTypes";
import { parseHotJoin, type HotJoinEntry } from "@/lib/hotJoinTypes";
import { demoDirectory, demoLobbies, demoLobbyState } from "@/lib/liveDemo";
import type { LifecycleProgress, RequestState, ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * Preview mode (SCHEDULER_DEMO=1) for the Games page: three announced games
 * (one of yours starting soon, one next to the calendar's TFB slot, and a
 * another host's draft game whose draft isn't finished) plus the attendance
 * preview's live / finished games, and a simulated bot that starts, ends and
 * cancels them step by step like bot.py.py's _run_web_game_lifecycle.
 */

const DEMO_HOST_ID = "100000000000000001";
export const DEMO_SOON_GAME_ID = "930000000000000001";
export const DEMO_TFB_GAME_ID = "930000000000000002";
const DEMO_DRAFT_GAME_ID = "930000000000000003";
/** The simulated bot's pace: one progress line every few seconds. */
const STEP_SEC = 2;
const QUEUE_DELAY_SEC = 2;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function build(): RawAttendanceGame[] {
  const members = demoDirectory();
  const id = (index: number) => members[index].discord_id;
  const now = nowSec();
  const inTwoDays = new Date((now + 2 * 86_400) * 1000);
  inTwoDays.setUTCHours(18, 0, 0, 0);
  const game = (
    storageKey: string,
    name: string,
    mode: string,
    hostId: string,
    startAt: number,
    reservations: Record<string, string>,
    data: Record<string, unknown> = {},
  ): RawAttendanceGame => ({
    storage_key: storageKey,
    mode,
    status: "active",
    thread_name: name,
    host_id: hostId,
    start_timestamp: startAt,
    reservations,
    data: { logging_mode: "Strict", game_started: false, ...data },
  });
  return [
    game(DEMO_SOON_GAME_ID, "Roleplay Game - Road to 56 Reservations", "Roleplay", DEMO_HOST_ID, now + 25 * 60, {
      Germany: id(4), "Soviet Union": id(2), "United Kingdom": id(7), Italy: id(1), Japan: id(6),
      Poland: id(5), France: id(8), "Germany_coop": id(11), _FILL_Filler: id(9),
    }, { scheduled_checksum: "R56X", automatic_reminder: true }),
    game(DEMO_TFB_GAME_ID, "Historical (TFB) Game Reservations", "Historical (TFB)", DEMO_HOST_ID,
      Math.floor(inTwoDays.getTime() / 1000), { USA: id(7), Japan: id(10), Manchukuo: id(3) },
      { scheduled_checksum: "TFB4", ...demoPresetGame("Historical (TFB)", "Pacific Theater", ["Allies", "GEACPS"]) }),
    game(DEMO_DRAFT_GAME_ID, "Historical Draft Game Reservations", "Historical (Vanilla)", id(7),
      now + 3 * 3600, {}, { is_draft: true, draft: demoDraftState(id, now) }),
  ];
}

/** A draft in sign-ups: Allies (captain: you) vs Axis, eight players in the pool. */
function demoDraftState(id: (index: number) => string, now: number): Record<string, unknown> {
  const mode = "Historical (Vanilla)";
  const options = demoModerationOptions();
  const layout = options.mode_layouts?.[mode] ?? [];
  const majors = new Set(options.mode_nations?.[mode]?.majors ?? []);
  const team = (key: string, name: string, captainId: string, groups: string[]) => {
    const nations = layout.filter((group) => groups.includes(group.name)).flatMap((group) => group.tiers.flatMap((tier) => tier.nations));
    return { key, name, captain_id: captainId, groups, majors: nations.filter((n) => majors.has(n)), minors: nations.filter((n) => !majors.has(n)) };
  };
  const members = demoDirectory();
  const entry = (index: number, preference: string, note: string, minutesAgo: number) => [
    id(index),
    { preference, note, reserved_by: id(index), reserved_at: now - minutesAgo * 60, name: members[index].display_name },
  ];
  return {
    phase: "ENLISTING",
    teams: [team("A", "Allies", DEMO_HOST_ID, ["Allies", "Comintern"]), team("B", "Axis", id(3), ["Axis", "GEACPS"])],
    coin_flip: true,
    first_picker: null,
    current_turn: null,
    picks_remaining_this_turn: 0,
    pool: Object.fromEntries([
      entry(1, "Major Nation", "Axis please — Germany or Italy.", 95),
      entry(2, "Major Nation", "Comintern, Soviet Union if it's free.", 80),
      entry(6, "Major Nation", "Japan or nothing :)", 64),
      entry(8, "Minor Nation", "I'd like to be on the Allies — France if it counts as a minor here.", 51),
      entry(9, "Filler", "Happy to fill in, I'm still learning.", 40),
      entry(10, "Minor Nation", "Happy anywhere on the Allies.", 33),
      entry(11, "Major Co-op", "Co-op with whoever gets the U.K.", 20),
      entry(13, "Major Nation", "", 9),
    ]),
    // The bot's get_draft_pool_capacity: nations + 2 co-op seats per Major + 10 fillers.
    pool_cap:
      (options.mode_nations?.[mode]?.majors.length ?? 0) * 3 + (options.mode_nations?.[mode]?.minors.length ?? 0) + 10,
    history: [],
  };
}

/** Game fields of a preset game (what the bot copies in at the announcement). */
function demoPresetGame(mode: string, presetName: string, keep: string[]): Record<string, unknown> {
  const options = demoModerationOptions();
  const layout = (options.mode_layouts?.[mode] ?? []).filter((group) => keep.includes(group.name));
  const playable = new Set(layout.flatMap((group) => group.tiers.flatMap((tier) => tier.nations)));
  const lists = options.mode_nations?.[mode];
  const hidden = lists ? [...lists.majors, ...lists.minors].filter((name) => !playable.has(name)) : [];
  return {
    preset_name: presetName,
    nation_layout: layout,
    layout_disabled_nations: hidden,
    locked_regions: hidden,
    managed_mods: options.mode_resources?.[mode]?.mods ?? [],
    managed_rulesets: [
      ...(options.mode_resources?.[mode]?.rules ?? []),
      { name: "Pacific house rules", link: "https://docs.google.com/document/d/example-pacific" },
    ],
  };
}

function store(): RawAttendanceGame[] {
  const holder = globalThis as { __gmGameControlDemoV7?: RawAttendanceGame[] };
  if (!holder.__gmGameControlDemoV7) holder.__gmGameControlDemoV7 = build();
  return holder.__gmGameControlDemoV7;
}

/** Announced games here + the attendance preview's started ones. */
export function demoControlRaw(): RawAttendanceGame[] {
  const raws = [...store(), ...demoAttendanceRaw().map((entry) => entry.game)];
  // The running preview game comes with one hot-join request to decide.
  for (const raw of raws) {
    if (raw.data.game_started && raw.data.hotjoin_requests === undefined) raw.data.hotjoin_requests = seedHotJoin(raw);
  }
  return raws;
}

function findRaw(gameId: string): RawAttendanceGame | undefined {
  return demoControlRaw().find((raw) =>
    [raw.storage_key, String(raw.data.lobby_thread_id ?? ""), String(raw.data.original_thread_id ?? "")].includes(gameId),
  );
}

// --- the simulated bot --------------------------------------------------------

type DemoOutcome = { status: RequestState; result: ScheduleRequestStatus["result"]; error: string | null };

function steps(action: LifecycleAction, raw: RawAttendanceGame): string[] {
  const players = new Set(Object.values(raw.reservations)).size;
  if (action === "game_start") {
    return [
      "⏳ **Creating voice channels and Gamer Pass role…**",
      "✅ **Channels created** — configuring permissions…",
      "✅ **Permissions set** — sending participation DMs…",
      `✅ **Participation DMs sent to ${players} player(s).**`,
      "✅ **Game Started & VCs Created!**",
    ];
  }
  if (action === "game_end") {
    return [
      "⏳ **Finalizing attendance and public log…**",
      "✅ **Log finalized** — cleaning up voice channels…",
      "✅ **Channels cleaned up** — sending conclusion DMs…",
      "✅ Game cleanup complete.",
    ];
  }
  return [`✅ Game cancelled and archived. DMs sent to ${players} players.`];
}

/** The bot's checks (_process_web_game_lifecycle). */
function refusal(action: LifecycleAction, raw: RawAttendanceGame | undefined, payload: Record<string, unknown>, hostId: string) {
  if (!raw) return "❌ Game not found — it may have been removed.";
  if (raw.host_id !== hostId && hostId !== DEMO_HOST_ID) return "❌ Only the game's host or Host Management can do that.";
  const data = raw.data;
  const status = String(raw.status ?? "");
  if (action === "game_start") {
    if (data.game_started) return "ℹ️ This game has already started.";
    if (status === "ended" || status === "cancelled") return "❌ This game has already ended or was cancelled.";
    const draft = (data.draft ?? {}) as { phase?: string; pool?: Record<string, unknown> };
    if (data.is_draft && draft.phase !== "COMPLETE") {
      return `❌ The draft isn't finished — ${Object.keys(draft.pool ?? {}).length} player(s) are still in the pool. Finish it (or clear the pool) first.`;
    }
    if (!/^[A-Z0-9]{4}$/.test(String(payload.checksum ?? "").toUpperCase())) return "❌ The checksum must be exactly four letters or digits.";
    return null;
  }
  if (action === "game_end") {
    if (status === "cancelled") return "❌ This game was cancelled.";
    if (data.game_end_completed_at) return "ℹ️ This game has already ended.";
    if (!data.game_started) return "❌ This game hasn't started — cancel it instead.";
    return null;
  }
  if (status === "cancelled") return "ℹ️ This game is already cancelled.";
  if (status === "ended") return "❌ This game has already ended — it can't be cancelled.";
  return null;
}

function apply(action: LifecycleAction, raw: RawAttendanceGame, payload: Record<string, unknown>, hostId: string) {
  const own = store().includes(raw);
  const id = raw.storage_key;
  if (action === "game_start") {
    const interval = Number(payload.interval_minutes) || 20;
    const holder = globalThis as { __gmGameControlDemoV7?: RawAttendanceGame[] };
    holder.__gmGameControlDemoV7 = store().filter((entry) => entry !== raw);
    demoAttendanceStart({ ...raw, data: { ...raw.data, scheduled_checksum: String(payload.checksum ?? "").toUpperCase() } }, interval, hostId);
    const players = new Set(Object.values(raw.reservations)).size;
    return {
      title: "🎮 Game started",
      summary: `Voice channels are up, ${players} participation DM(s) sent, attendance samples every ${interval} min.`,
      notes: ["Players count as present if seen in 2+ of 5 samples."],
    };
  }
  if (action === "game_end") {
    const counts = demoAttendanceEnd(String(raw.data.lobby_thread_id ?? id), hostId) ?? { present: 0, players: 0 };
    return {
      title: "🏁 Game ended",
      summary: `${counts.present} of ${counts.players} player(s) counted present.`,
      notes: [
        "Voice channels and the Gamer Pass role were removed; the rating poll is posted.",
        "Corrections go through the Attendance page.",
      ],
    };
  }
  const reason = String(payload.reason ?? "").trim();
  if (own) {
    raw.status = "cancelled";
    Object.assign(raw.data, { cancel_reason: reason, cancelled_at: nowSec(), cancelled_by: hostId });
  } else {
    demoAttendanceCancel(String(raw.data.lobby_thread_id ?? id), hostId, reason);
  }
  const players = new Set(Object.values(raw.reservations)).size;
  return { title: "🗑️ Game cancelled", summary: `No penalties. ${players} player(s) were DMed the reason.`, notes: ["0 no-show warning(s) reverted, 0 commend refund(s)."] };
}

const levelLabel = (level: string) =>
  level === "All Users" ? "Everyone" : level === "VIP" ? "VIP+ Only" : `${level}+`;
const access = (title: string, summary: string, notes: string[] = []): DemoOutcome => ({
  status: "done",
  result: { access: { title, summary, notes, stats: {}, log_url: null } },
  error: null,
});
const refuse = (error: string): DemoOutcome => ({ status: "error", result: null, error });

function modeNations(mode: string | null): string[] | null {
  const lists = demoModerationOptions().mode_nations?.[mode ?? ""];
  return lists ? [...lists.majors, ...lists.minors] : null;
}

/** The bot's _process_web_game_access (reservation access from the Games page). */
export function applyDemoAccess(payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const raw = findRaw(String(payload.thread_id ?? ""));
  if (!raw) return refuse("❌ Game not found — it may have been removed.");
  if (raw.host_id !== hostId && hostId !== DEMO_HOST_ID) return refuse("❌ Only the game's host or Host Management can do that.");
  if (raw.status === "ended" || raw.status === "cancelled") return refuse("❌ This game has ended or was cancelled.");
  const data = raw.data;
  const op = String(payload.op ?? "");
  if (op === "levels") {
    const major = ACCESS_LEVELS.find((level) => level === payload.major_level);
    const minor = ACCESS_LEVELS.find((level) => level === payload.minor_level);
    if (!major || !minor) return refuse("❌ Pick who may reserve: VIP+, Trusted+, Verified+ or everyone.");
    Object.assign(data, { major_lock_level: major, minor_lock_level: minor });
    return access("🔒 Reservation access updated", `Majors: ${levelLabel(major)} · Minors: ${levelLabel(minor)}`,
      data.game_started ? ["The game has started, so reservations are already closed — this applies if it's reopened."] : []);
  }
  if (op === "lockdown") {
    data.lockdown = payload.enabled === true;
    return data.lockdown
      ? access("🔒 Lockdown on", "Players can't reserve on the website. Host tools still work.")
      : access("🔓 Lockdown off", "Public reservations are open again.");
  }
  if (op === "ironlegion") {
    const required = typeof payload.required === "boolean" ? payload.required : null;
    data.require_ironlegion = required;
    return access(
      "🛡️ IronLegion verification",
      required === true
        ? "Players need IronLegion's verified role to reserve in this game."
        : required === false
          ? "This game doesn't require IronLegion verification."
          : "This game follows the server's setting.",
    );
  }
  if (op === "nation_lock" || op === "nation_unlock") {
    const asked = String(payload.nation ?? "").trim();
    const locked = Array.isArray(data.locked_regions) ? data.locked_regions.map(String) : [];
    if (op === "nation_lock") {
      const valid = modeNations(raw.mode);
      const nation = valid ? valid.find((name) => name.toLowerCase() === asked.toLowerCase()) : asked;
      if (!nation) return refuse(`❌ '${asked}' isn't a nation in ${raw.mode}.`);
      if (locked.includes(nation)) return refuse(`ℹ️ **${nation}** is already locked.`);
      data.locked_regions = [...locked, nation];
      const holder = raw.reservations[nation];
      const who = demoDirectory().find((member) => member.discord_id === holder)?.display_name ?? "A player";
      return access("🔒 Nation locked", `**${nation}** can't be reserved (it shows ⚫ on the list).`,
        holder ? [`${who} already holds ${nation} — locking doesn't remove them.`] : []);
    }
    const match = locked.find((name) => name.toLowerCase() === asked.toLowerCase());
    if (!match) return refuse(`ℹ️ **${asked}** isn't locked.`);
    if (Array.isArray(data.layout_disabled_nations) && data.layout_disabled_nations.includes(match)) {
      return refuse(`❌ **${match}** isn't playable in this game (its preset leaves it out), so it can't be unlocked.`);
    }
    data.locked_regions = locked.filter((name) => name !== match);
    return access("🔓 Nation unlocked", `**${match}** can be reserved again.`);
  }
  if (op === "clear") {
    if (data.game_started) return refuse("❌ The game has started — clearing it would break its attendance. Remove players one by one, or cancel the game.");
    const count = new Set(Object.values(raw.reservations)).size;
    raw.reservations = {};
    return access("🧹 Reservation list cleared", `Removed ${count} player(s) from the list.`);
  }
  return refuse(`❌ Unknown access change: ${op}.`);
}

/** The bot's _process_web_game_message (formerly /dm_participants); Rookie has DMs closed. */
export function applyDemoGameMessage(payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const raw = findRaw(String(payload.thread_id ?? ""));
  if (!raw) return refuse("❌ Game not found — it may have been removed.");
  if (raw.host_id !== hostId && hostId !== DEMO_HOST_ID) return refuse("❌ Only the game's host or Host Management can message its players.");
  const text = String(payload.message ?? "").trim();
  if (!text) return refuse("❌ Write a message first.");
  const pool = Object.keys((raw.data.draft as { pool?: Record<string, unknown> } | undefined)?.pool ?? {});
  const everyone = [...new Set([...Object.values(raw.reservations), ...pool])];
  if (everyone.length === 0) return refuse("⚠️ Nobody has signed up for this game yet — there's no one to message.");
  const picked = Array.isArray(payload.recipients) ? payload.recipients.map(String) : null;
  const targets = picked ? everyone.filter((id) => picked.includes(id)) : everyone;
  if (targets.length === 0) return refuse("❌ None of the players you picked are in this game any more.");
  const members = demoDirectory();
  const unreachable = targets.filter((id) => id === "500000000000000012");
  const sent = targets.length - unreachable.length;
  const history = Array.isArray(raw.data.message_history) ? raw.data.message_history : [];
  raw.data.message_history = [
    ...history,
    { ts: nowSec(), by: hostId, text: text.slice(0, 500), sent, failed: unreachable.length, total: targets.length },
  ].slice(-20);
  const notes = unreachable.map((id) => {
    const member = members.find((entry) => entry.discord_id === id);
    return `Couldn't reach ${member?.display_name ?? `#${id}`} (DMs closed or left the server).`;
  });
  if (picked && picked.length > targets.length) {
    notes.push(`${picked.length - targets.length} of the players you picked aren't in this game any more — skipped.`);
  }
  return {
    status: "done",
    result: { message: { title: "📢 Message sent", summary: `DMed ${sent} of ${targets.length} player(s).`, notes, stats: {}, log_url: null } },
    error: null,
  };
}

/** A stable small number from a string (preview scores). */
function seedOf(text: string): number {
  let hash = 7;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash;
}

const DEMO_SNIPPETS = [
  "The Reich Chancellery announces that Danzig shall return home — by treaty, or by other means.",
  "Moscow sends its regards to Warsaw, and a reminder that winter is long.",
  "Parliament votes 312 to 290 to rearm. The Prime Minister calls it 'peace through strength'.",
  "Our envoy arrives in Rome with gifts and a quiet question about the Balkans.",
  "lag?",
  "gg wp",
];

/** The bot's run_ai_log_analysis, simulated: steady made-up scores per player,
 *  graded with the real strict rules (aiAnalysisTypes.aiReward). */
export function applyDemoLogAnalysis(payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const gameId = String(payload.thread_id ?? "");
  const raw = findRaw(gameId);
  if (!raw) return refuse("❌ Game not found — it may have been removed.");
  if (raw.host_id !== hostId && hostId !== DEMO_HOST_ID) return refuse("❌ Only the game's host or Host Management can run its AI analysis.");
  if (!raw.data.game_started && raw.status !== "ended") return refuse("❌ The game hasn't started yet — upload the chat log once it's played.");
  const log = demoChatLogText([raw.storage_key, gameId]);
  if (!log) return refuse("❌ Upload the game's chat log (.txt) first.");
  const players = Object.entries(raw.reservations)
    .filter(([slot]) => !slot.startsWith("_FILL_"))
    .map(([slot, userId]) => {
      const seed = seedOf(`${userId}:${raw.storage_key}`);
      const words = [12, 140, 260, 430, 620, 900, 1700][seed % 7];
      const creativity = 4 + ((seed >>> 3) % 6);
      const toxicity = (seed >>> 5) % 9 === 0 ? 5 : (seed >>> 5) % 3;
      const share = 0.55 + ((seed >>> 7) % 40) / 100;
      const meaningful = Math.round(words * share);
      const lowEffort = words < 150;
      const reward =
        words < 20 ? { commends: 0, merit: 0, why: "No real roleplay in the log." } : aiReward(meaningful, creativity, toxicity, lowEffort, true);
      const status = words < 20 ? "no_rp" : toxicity >= 4 ? "toxic" : reward.commends || reward.merit ? "rewarded" : "minimal";
      const nation = slot.split("_coop")[0];
      return {
        tag: nation.slice(0, 3).toUpperCase(),
        nation,
        user_id: userId,
        role: slot.includes("_coop") ? "COOP" : "MAIN",
        name: null,
        lines: Math.max(1, Math.round(words / 14)),
        words,
        meaningful_words: meaningful,
        in_character_share: Math.round(share * 100) / 100,
        creativity,
        toxicity,
        low_effort: lowEffort,
        left_early: seed % 11 === 0,
        graded: true,
        summary:
          status === "rewarded"
            ? "Kept a clear in-character voice with diplomacy and news posts."
            : status === "toxic"
              ? "Some heated out-of-character arguing."
              : status === "no_rp"
                ? "Barely wrote anything."
                : "Some roleplay, but short and mostly out of character.",
        snippets: words < 20 ? [] : [DEMO_SNIPPETS[seed % 4], DEMO_SNIPPETS[4 + (seed % 2)]],
        reward,
        status,
      };
    });
  raw.data.ai_analysis = {
    version: 2,
    at: nowSec(),
    by: hostId,
    merit_enabled: true,
    rules: DEFAULT_AI_RULES,
    players,
    log: { filename: log.filename, bytes: log.bytes, uploaded_at: log.uploaded_at },
  };
  const rewarded = players.filter((player) => player.reward.commends || player.reward.merit);
  const commends = players.reduce((sum, player) => sum + player.reward.commends, 0);
  const merit = players.reduce((sum, player) => sum + player.reward.merit, 0);
  return {
    status: "done",
    result: {
      analysis: {
        title: "🤖 AI analysis done",
        summary: `${rewarded.length} of ${players.length} player(s) recommended: ${commends} commend(s), ${merit} Merit.`,
        notes: ["Archived the log in the public log channel.", `Told ${players.length} player(s) their result is on their profile.`],
        stats: {},
        log_url: null,
      },
    },
    error: null,
  };
}

/** A host gave an AI-recommended reward (the bot's _mark_ai_reward_given). */
export function markDemoAiReward(gameId: string, userId: string, kind: string, amount: number, hostId: string): void {
  const raw = findRaw(gameId);
  if (!raw) return;
  const given = (raw.data.ai_rewards_given && typeof raw.data.ai_rewards_given === "object" ? raw.data.ai_rewards_given : {}) as Record<string, unknown>;
  raw.data.ai_rewards_given = { ...given, [userId]: { kind, amount, by: hostId, at: nowSec() } };
}

/** The bot's _process_web_game_remind (early / late reminder DMs). */
export function applyDemoRemind(payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const raw = findRaw(String(payload.thread_id ?? ""));
  if (!raw) return refuse("❌ Game not found — it may have been removed.");
  if (raw.host_id !== hostId && hostId !== DEMO_HOST_ID) return refuse("❌ Only the game's host or Host Management can do that.");
  if (raw.status === "ended" || raw.status === "cancelled") return refuse("❌ This game has ended or was cancelled.");
  const players = [...new Set(Object.values(raw.reservations))];
  if (players.length === 0) return refuse("⚠️ Nobody has reserved a nation yet — there's no one to remind.");
  const data = raw.data;
  const kind = String(payload.kind ?? "");
  let targets = players;
  if (kind === "early") {
    if (data.game_started) return refuse("ℹ️ The game has started — send a late reminder instead.");
  } else if (kind === "late") {
    if (!data.game_started) return refuse("ℹ️ The game hasn't started — send an early reminder instead.");
    const samples = Array.isArray(data.presence_snapshots) ? (data.presence_snapshots as { present_ids?: string[] }[]) : [];
    const inVoice = new Set((samples[samples.length - 1]?.present_ids ?? []).map(String));
    targets = players.filter((uid) => !inVoice.has(uid));
    if (targets.length === 0) {
      return { status: "done", result: { reminder: { title: "✅ Everyone is here", summary: "All reserved players are in voice with the Gamer Pass.", notes: [], stats: {}, log_url: null } }, error: null };
    }
  } else {
    return refuse("❌ Pick an early or a late reminder.");
  }
  const now = nowSec();
  const history = Array.isArray(data.reminder_history) ? data.reminder_history : [];
  data.reminder_history = [...history, { kind, ts: now, by: hostId, sent: targets.length, failed: 0 }];
  if (kind === "early" && !data.automatic_reminder_sent_at) data.automatic_reminder_sent_at = now;
  return {
    status: "done",
    result: {
      reminder: {
        title: kind === "early" ? "⏰ Early reminder sent" : "🔔 Late reminder sent",
        summary: `DMed ${targets.length} player(s).`,
        notes:
          kind === "early"
            ? ["Counts as the automatic one-hour reminder — players won't get both."]
            : [`${targets.length} player(s) weren't in voice with the Gamer Pass.`],
        stats: {},
        log_url: null,
      },
    },
    error: null,
  };
}

/** The bot's _process_web_game_resources (a game's mods / rules list from the Games page). */
export function applyDemoResources(payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const raw = findRaw(String(payload.thread_id ?? ""));
  if (!raw) return refuse("❌ Game not found — it may have been removed.");
  if (raw.host_id !== hostId && hostId !== DEMO_HOST_ID) return refuse("❌ Only the game's host or Host Management can do that.");
  if (raw.status === "ended" || raw.status === "cancelled") return refuse("❌ This game has ended or was cancelled.");
  const isMods = payload.resource === "mods";
  const entries = Array.isArray(payload.entries) ? (payload.entries as { name: string; link: string }[]) : [];
  raw.data[isMods ? "managed_mods" : "managed_rulesets"] = entries;
  const noun = isMods ? "mod" : "ruleset";
  return {
    status: "done",
    result: {
      resources: {
        title: `${isMods ? "🛠️ Mods" : "📖 Rules"} updated`,
        summary: entries.length
          ? `${entries.length} ${noun}${entries.length === 1 ? "" : "s"} in the public post.`
          : isMods ? "No mods are listed now." : "No rulesets are listed now.",
        notes: [],
        stats: {},
        log_url: null,
        entries,
      },
    },
    error: null,
  };
}

/**
 * Roster changes on a Games page game (null = not one of these games — the
 * live map's preview handles it). A started game takes the late-join path.
 */
export function applyDemoGameRoster(payload: Record<string, unknown>): DemoOutcome | null {
  const raw = findRaw(String(payload.thread_id ?? ""));
  if (!raw) return null;
  const userId = String(payload.user_id ?? "");
  const kind = String(payload.kind ?? "");
  const nation = String(payload.nation ?? "").trim();
  if (kind === "nation") {
    const valid = modeNations(raw.mode);
    if (valid && !valid.includes(nation)) return refuse(`❌ '${nation}' isn't a nation in ${raw.mode}.`);
  }
  const key =
    kind === "filler" ? `_FILL_${String(payload.filler_name ?? "Filler").trim().replace(/ /g, "_")}` : kind === "coop" ? `${nation}_coop` : nation;
  if (raw.data.game_started && kind !== "coop") {
    const error = demoAttendanceLateJoin(String(raw.data.lobby_thread_id ?? raw.storage_key), userId, key);
    if (error) return refuse(error);
    return { status: "done", result: { slot_key: key, late_join: true }, error: null };
  }
  const holder = raw.reservations[key];
  if (holder && holder !== userId) return refuse(`❌ **${nation}** is already taken — choose swap or replace.`);
  for (const [slot, uid] of Object.entries(raw.reservations)) if (uid === userId) delete raw.reservations[slot];
  raw.reservations[key] = userId;
  return { status: "done", result: { slot_key: key }, error: null };
}

// --- Hot-join (the bot's _process_web_hotjoin) ---------------------------------

/** The map preview's lobby that is already running (liveDemo's DEMO_STARTED_LOBBY_ID). */
const DEMO_RUNNING_LOBBY_ID = "900000000000000002";

type DemoHotJoins = Record<string, Record<string, unknown>>;

function seedHotJoin(raw: RawAttendanceGame): DemoHotJoins {
  if (raw.status === "ended" || raw.status === "cancelled") return {};
  const taken = new Set(Object.keys(raw.reservations));
  const free = modeNations(raw.mode)?.find((name) => !taken.has(name));
  const players = new Set(Object.values(raw.reservations));
  const member = demoDirectory().find((entry) => entry.verified && entry.discord_id !== DEMO_HOST_ID && !players.has(entry.discord_id));
  return free && member ? { [member.discord_id]: { nation: free, status: "pending", ts: nowSec() - 240, current: null } } : {};
}

/** A game's hot-join requests: a Games page game's document, else the map preview's lobby. */
function demoHotJoinRecord(gameId: string): DemoHotJoins | null {
  const raw = findRaw(gameId);
  if (raw) {
    if (!raw.data.hotjoin_requests || typeof raw.data.hotjoin_requests !== "object") raw.data.hotjoin_requests = {};
    return raw.data.hotjoin_requests as DemoHotJoins;
  }
  if (gameId !== DEMO_RUNNING_LOBBY_ID) return null;
  const holder = globalThis as { __gmHotJoinDemoV1?: Record<string, DemoHotJoins> };
  holder.__gmHotJoinDemoV1 ??= {};
  holder.__gmHotJoinDemoV1[gameId] ??= {};
  return holder.__gmHotJoinDemoV1[gameId];
}

export interface DemoPlayerGame {
  id: string;
  name: string;
  mode: string;
  host_id: string | null;
  started: boolean;
  finished: boolean;
  requests: HotJoinEntry[];
}

/** Preview: a game as players see it (running? ended?) with its hot-join requests. */
export function demoHotJoinGame(gameId: string): DemoPlayerGame | null {
  const raw = findRaw(gameId);
  if (raw) {
    return {
      id: raw.storage_key,
      name: raw.thread_name ?? raw.storage_key,
      mode: raw.mode ?? "Game",
      host_id: raw.host_id,
      started: Boolean(raw.data.game_started),
      finished: raw.status === "ended" || raw.status === "cancelled" || Boolean(raw.data.game_end_completed_at),
      requests: parseHotJoin(demoHotJoinRecord(gameId)),
    };
  }
  const lobby = demoLobbies(true).find((entry) => entry.thread_id === gameId);
  if (!lobby) return null;
  return {
    id: lobby.thread_id,
    name: lobby.thread_name ?? lobby.thread_id,
    mode: lobby.mode ?? "Game",
    host_id: lobby.host_id,
    started: Boolean(lobby.game_started),
    finished: false,
    requests: gameId === DEMO_RUNNING_LOBBY_ID ? parseHotJoin(demoHotJoinRecord(gameId)) : [],
  };
}

/** The simulated bot for hotjoin_request / hotjoin_cancel / hotjoin_decide. */
export function applyDemoHotJoin(action: string, payload: Record<string, unknown>, userId: string): DemoOutcome {
  const gameId = String(payload.thread_id ?? "");
  const game = demoHotJoinGame(gameId);
  const requests = demoHotJoinRecord(gameId);
  if (!game || !requests) return refuse("❌ This game no longer exists.");
  if (game.finished) return refuse("❌ This game has already ended.");
  if (!game.started) return refuse("❌ The game hasn't started yet — reserve a nation on the map instead.");
  const now = nowSec();
  const raw = findRaw(gameId);

  if (action === "hotjoin_cancel") {
    const entry = requests[userId];
    if (!entry || entry.status !== "pending") return { status: "done", result: { hotjoin: "none" }, error: null };
    Object.assign(entry, { status: "withdrawn", decided_at: now });
    return { status: "done", result: { hotjoin: "withdrawn" }, error: null };
  }

  if (action === "hotjoin_decide") {
    if (raw && raw.host_id !== userId && userId !== DEMO_HOST_ID) {
      return refuse("❌ Only the game's host or Host Management can decide hot-join requests.");
    }
    const target = String(payload.user_id ?? "");
    const entry = requests[target];
    if (!entry || entry.status !== "pending") {
      return refuse("ℹ️ This request isn't waiting any more — the player may have withdrawn it.");
    }
    if (payload.approve !== true) {
      Object.assign(entry, { status: "declined", decided_at: now, by: userId });
      return { status: "done", result: { hotjoin: "declined" }, error: null };
    }
    const outcome = applyDemoGameRoster({ thread_id: gameId, user_id: target, kind: "nation", nation: entry.nation, force: payload.force });
    if (!outcome) return refuse("❌ This game no longer exists.");
    if (outcome.status !== "done") return outcome;
    Object.assign(entry, { status: "approved", decided_at: now, by: userId });
    return { status: "done", result: { ...(outcome.result ?? {}), hotjoin: "approved" }, error: null };
  }

  const nation = String(payload.nation ?? "").trim();
  if (!nation) return refuse("❌ Pick a nation.");
  const reservations: Record<string, string> = raw
    ? raw.reservations
    : Object.fromEntries((demoLobbyState(gameId)?.reservations ?? []).map((entry) => [entry.slot_key, String(entry.user_id)]));
  const holder = reservations[nation];
  if (holder && holder !== userId) return refuse(`❌ **${nation}** is already taken — pick a free nation.`);
  const current = Object.keys(reservations).find((slot) => reservations[slot] === userId) ?? null;
  if (current === nation) return refuse(`ℹ️ You're already playing **${nation}**.`);
  requests[userId] = { nation, status: "pending", ts: now, current };
  return { status: "done", result: { hotjoin: "pending", nation }, error: null };
}

/**
 * Advance one queued / running start, end or cancel: checks first, then a
 * progress line every few seconds, then the effect. Null = nothing new yet.
 */
export function advanceDemoLifecycle(
  action: LifecycleAction,
  payload: Record<string, unknown>,
  hostId: string,
  status: RequestState,
  createdAt: number,
): DemoOutcome | null {
  const now = nowSec();
  const elapsed = now - createdAt - QUEUE_DELAY_SEC;
  if (elapsed < 0) return null;
  const raw = findRaw(String(payload.thread_id ?? ""));
  if (status === "pending") {
    const refused = refusal(action, raw, payload, hostId);
    if (refused) return { status: "error", result: null, error: refused };
  }
  if (!raw) return { status: "error", result: null, error: "❌ Game not found — it may have been removed." };
  const lines = steps(action, raw);
  const shown = Math.min(lines.length, Math.floor(elapsed / STEP_SEC) + 1);
  const progress: LifecycleProgress = {
    action,
    state: "running",
    steps: lines.slice(0, shown).map((text, index) => ({ text, ts: createdAt + QUEUE_DELAY_SEC + index * STEP_SEC })),
    started_at: createdAt,
  };
  if (elapsed < lines.length * STEP_SEC) return { status: "running", result: { lifecycle: progress }, error: null };
  const outcome = apply(action, raw, payload, hostId);
  return {
    status: "done",
    result: { lifecycle: { ...progress, ...outcome, state: "done", finished_at: now } },
    error: null,
  };
}

// --- Draft games (the bot's _process_web_draft) --------------------------------

interface DemoDraftEntry {
  preference: string;
  note: string;
  reserved_by: string;
  reserved_at: number;
  name: string;
}

interface DemoDraft {
  phase: DraftPhase;
  teams: { key: string; name: string; captain_id: string; groups: string[] | null; majors: string[]; minors: string[] }[];
  coin_flip: boolean;
  first_picker: string | null;
  current_turn: string | null;
  picks_remaining_this_turn: number;
  pool: Record<string, DemoDraftEntry>;
  pool_cap: number;
  coin_toss?: { winner: string; ts: number };
  history: Record<string, unknown>[];
}

function demoPlayable(raw: RawAttendanceGame): { majors: string[]; minors: string[] } {
  const lists = demoModerationOptions().mode_nations?.[raw.mode ?? ""];
  const hidden = new Set(Array.isArray(raw.data.layout_disabled_nations) ? raw.data.layout_disabled_nations.map(String) : []);
  return {
    majors: (lists?.majors ?? []).filter((name) => !hidden.has(name)),
    minors: (lists?.minors ?? []).filter((name) => !hidden.has(name)),
  };
}

function demoNameOf(userId: string): { name: string | null; avatar_url: string | null } {
  const member = demoDirectory().find((entry) => entry.discord_id === userId);
  return { name: member ? member.display_name || member.username : null, avatar_url: member?.avatar_url ?? null };
}

function demoLobbyDraft(raw: RawAttendanceGame): LobbyDraft | null {
  return buildLobbyDraft(raw.data, demoNameOf, demoPlayable(raw));
}

function demoSlots(raw: RawAttendanceGame, teamKey: string | null) {
  const lobby = demoLobbyDraft(raw);
  if (!lobby) return [];
  const locked = new Set(Array.isArray(raw.data.locked_regions) ? raw.data.locked_regions.map(String) : []);
  return draftSlots(lobby, new Set(Object.keys(raw.reservations)), locked, teamKey);
}

function demoAdvance(raw: RawAttendanceGame, draft: DemoDraft): void {
  const keys = draft.teams.map((team) => team.key);
  const remaining = Math.max(0, (draft.picks_remaining_this_turn || 1) - 1);
  if (remaining > 0 && draft.current_turn && demoSlots(raw, draft.current_turn).length > 0) {
    draft.picks_remaining_this_turn = remaining;
    return;
  }
  const index = draft.current_turn ? keys.indexOf(draft.current_turn) : -1;
  for (let step = 1; step <= keys.length; step += 1) {
    const candidate = keys[(index + step) % keys.length];
    if (demoSlots(raw, candidate).length > 0) {
      draft.current_turn = candidate;
      draft.picks_remaining_this_turn = 1;
      return;
    }
  }
  draft.current_turn = null;
  draft.picks_remaining_this_turn = 0;
}

function demoCheckComplete(raw: RawAttendanceGame, draft: DemoDraft): boolean {
  const roomLeft = draft.teams.some((team) => demoSlots(raw, team.key).length > 0);
  if (draft.phase === "DRAFTING" && (Object.keys(draft.pool).length === 0 || !roomLeft)) {
    draft.phase = "COMPLETE";
    draft.current_turn = null;
    draft.picks_remaining_this_turn = 0;
    return true;
  }
  return false;
}

const draftDone = (title: string, summary: string): DemoOutcome => ({
  status: "done",
  result: { draft: { title, summary, notes: [], stats: {}, log_url: null } },
  error: null,
});

/**
 * Place a pool player (a captain's team slot, or anything playable for the
 * host). A co-op / filler seat taken a moment ago moves to the next free one
 * (the bot's _draft_free_seat). Returns [error, the slot used].
 */
function demoPlace(
  raw: RawAttendanceGame,
  draft: DemoDraft,
  userId: string,
  requested: string,
  teamKey: string | null,
): [string | null, string] {
  if (!draft.pool[userId]) return ["❌ That player isn't in the draft pool any more.", requested];
  const valid = demoSlots(raw, teamKey).map((entry) => entry.key);
  let slot = requested;
  if (!valid.includes(slot) && slot.startsWith("_FILL_")) slot = valid.find((key) => key.startsWith("_FILL_")) ?? slot;
  if (!valid.includes(slot) && slot.includes("_coop")) {
    const base = slot.split("_coop")[0];
    slot = valid.find((key) => key.includes("_coop") && key.split("_coop")[0] === base) ?? slot;
  }
  if (!valid.includes(slot)) {
    return [
      teamKey !== null
        ? "❌ That slot is taken, locked or not part of your team — pick another."
        : "❌ That slot is taken or isn't playable in this game.",
      slot,
    ];
  }
  delete draft.pool[userId];
  raw.reservations[slot] = userId;
  draft.history.push({ ts: nowSec(), kind: teamKey ? "pick" : "host_place", user_id: userId, slot, team: teamKey });
  return [null, slot];
}

/** The bot's DRAFT_POOL_CHOICES. */
const DEMO_POOL_CHOICES: Record<string, string> = {
  major: "Major Nation",
  minor: "Minor Nation",
  coop: "Major Co-op",
  filler: "Filler",
};

/** The bot's _process_web_draft: join / leave / captain picks / host controls. */
export function applyDemoDraft(action: string, payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const raw = findRaw(String(payload.thread_id ?? ""));
  if (!raw || !raw.data.is_draft) return refuse("❌ This isn't a draft game (or it no longer exists).");
  if (raw.status === "ended" || raw.status === "cancelled") return refuse("❌ This game has ended or was cancelled.");
  if (raw.data.game_started) return refuse("❌ The game has started — the draft is closed.");
  const draft = raw.data.draft as DemoDraft;
  const pool = draft.pool;
  const label = (slot: string) =>
    slot.replace(/^_FILL_/, "").replace(/_coop(?:_(\d+))?$/, (_match, index?: string) => ` (Co-op${index ? ` ${index}` : ""})`);
  const nameOf = (id: string) => demoNameOf(id).name ?? "A player";

  if (action === "draft_join") {
    const choice = DEMO_POOL_CHOICES[String(payload.preference ?? "")] ?? null;
    if (!choice) return refuse("❌ Choose Major, Minor, Major Co-op or Filler.");
    if (draft.phase !== "ENLISTING") return refuse("❌ The draft has already begun — the pool is closed. Ask the host if you still want in.");
    if (raw.data.lockdown) return refuse("🔒 **Reservation Lockdown:** Reservations are closed. Please ask a host if you need to be added.");
    if (Object.values(raw.reservations).includes(hostId)) return refuse("⚠️ You already have a slot in this game.");
    const updating = Boolean(pool[hostId]);
    if (!updating && Object.keys(pool).length >= draft.pool_cap) return refuse(`❌ The draft pool is full (${Object.keys(pool).length}/${draft.pool_cap}).`);
    pool[hostId] = {
      preference: choice,
      note: String(payload.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      reserved_by: hostId,
      reserved_at: pool[hostId]?.reserved_at ?? nowSec(),
      name: nameOf(hostId),
    };
    return draftDone(
      updating ? "🎯 Entry updated" : "🎯 You're in the draft pool",
      `As a ${choice.replace(" Nation", "")} · ${Object.keys(pool).length}/${draft.pool_cap} in the pool. The captains pick once the host starts the draft.`,
    );
  }
  if (action === "draft_leave") {
    if (!pool[hostId]) return refuse("ℹ️ You aren't in the draft pool.");
    delete pool[hostId];
    demoCheckComplete(raw, draft);
    return draftDone("👋 You left the draft pool", "You can join again while sign-ups are open.");
  }
  if (action === "draft_pick") {
    if (draft.phase !== "DRAFTING") return refuse("❌ The draft isn't running — the host starts it from the Games page.");
    const team = draft.teams.find((entry) => entry.key === draft.current_turn);
    if (!team) return refuse("❌ Nobody is on the clock right now.");
    if (team.captain_id !== hostId) {
      return refuse(draft.teams.some((entry) => entry.captain_id === hostId) ? `❌ It's ${team.name}'s turn — wait for your pick.` : "❌ Only the team captains pick players.");
    }
    const userId = String(payload.user_id ?? "");
    const [error, slot] = demoPlace(raw, draft, userId, String(payload.slot ?? ""), team.key);
    if (error) return refuse(error);
    demoAdvance(raw, draft);
    demoCheckComplete(raw, draft);
    return draftDone("✅ Drafted", `${nameOf(userId)} → ${label(slot)} for ${team.name}.`);
  }
  if (action !== "draft_control") return refuse(`❌ Unknown draft request: ${action}.`);

  const op = String(payload.op ?? "");
  if (op === "start") {
    if (draft.phase !== "ENLISTING") return refuse("ℹ️ The draft has already started.");
    if (Object.keys(pool).length === 0) return refuse("❌ Nobody is in the draft pool yet.");
    draft.phase = "DRAFTING";
    let opener: string;
    if (draft.coin_flip) {
      const first = draft.teams[Math.floor(Math.random() * draft.teams.length)];
      draft.current_turn = first.key;
      draft.picks_remaining_this_turn = 3;
      draft.coin_toss = { winner: first.key, ts: nowSec() };
      opener = `🪙 The coin toss went to ${first.name} — they open with 3 picks, then the teams alternate.`;
    } else {
      const first = draft.teams.find((team) => team.key === draft.first_picker) ?? draft.teams[0];
      draft.current_turn = first.key;
      draft.picks_remaining_this_turn = 1;
      opener = `${first.name} picks first, then the teams alternate.`;
    }
    if (draft.current_turn && demoSlots(raw, draft.current_turn).length === 0) {
      draft.picks_remaining_this_turn = 1;
      demoAdvance(raw, draft);
    }
    demoCheckComplete(raw, draft);
    return draftDone("🚨 Draft started", opener);
  }
  if (op === "finish") {
    const cleared = Object.keys(pool).length;
    draft.pool = {};
    draft.phase = "COMPLETE";
    draft.current_turn = null;
    draft.picks_remaining_this_turn = 0;
    return draftDone("🏁 Draft finished", `Cleared ${cleared} player(s) from the pool. The game can be started now.`);
  }
  if (op === "remove") {
    const userId = String(payload.user_id ?? "");
    if (!pool[userId]) return refuse("ℹ️ That player isn't in the pool.");
    delete pool[userId];
    demoCheckComplete(raw, draft);
    return draftDone("🗑️ Removed from the pool", `${nameOf(userId)} is out of the draft pool.`);
  }
  if (op === "assign") {
    const userId = String(payload.user_id ?? "");
    const [error, slot] = demoPlace(raw, draft, userId, String(payload.slot ?? ""), null);
    if (error) return refuse(error);
    demoCheckComplete(raw, draft);
    return draftDone("✅ Player placed", `${nameOf(userId)} → ${label(slot)}. Captains' turns are unchanged.`);
  }
  if (op === "captain") {
    const team = draft.teams.find((entry) => entry.key === payload.team);
    const userId = String(payload.user_id ?? "");
    if (!team) return refuse("❌ Pick a team.");
    if (!demoDirectory().some((member) => member.discord_id === userId)) return refuse("❌ The new captain has to be a member of the server.");
    if (draft.teams.some((entry) => entry !== team && entry.captain_id === userId)) return refuse("❌ They already captain the other team.");
    team.captain_id = userId;
    return draftDone("🎖️ Captain changed", `${nameOf(userId)} captains ${team.name}.`);
  }
  return refuse(`❌ Unknown draft action: ${op}.`);
}

/** The preview draft game as a live-map lobby (GET /api/reserve). */
export function demoDraftLobbyState(threadId: string) {
  const raw = store().find((entry) => entry.storage_key === threadId && entry.data.is_draft);
  if (!raw) return null;
  const members = demoDirectory();
  return {
    game: {
      thread_id: raw.storage_key,
      mode: raw.mode,
      status: raw.status,
      thread_name: raw.thread_name,
      game_started: raw.data.game_started ? 1 : 0,
      host_id: raw.host_id,
      start_timestamp: raw.start_timestamp,
      lockdown: Boolean(raw.data.lockdown),
      locked_regions: Array.isArray(raw.data.locked_regions) ? raw.data.locked_regions.map(String) : [],
      nation_layout: null,
      layout_disabled_nations: [],
      draft: demoLobbyDraft(raw),
    },
    reservations: Object.entries(raw.reservations).map(([slotKey, userId]) => {
      const member = members.find((entry) => entry.discord_id === userId);
      return {
        slot_key: slotKey,
        user_id: userId,
        rerolls_used: 0,
        ingame_nickname: member?.ingame_nickname ?? null,
        hoi4_verified: member?.verified ?? null,
        host_tier: null,
        username: member?.username ?? null,
        display_name: member?.display_name ?? null,
        avatar_url: member?.avatar_url ?? null,
      };
    }),
  };
}

/** The preview draft game in the map's lobby list. */
export function demoDraftLobbyListing() {
  const raw = store().find((entry) => entry.storage_key === DEMO_DRAFT_GAME_ID);
  if (!raw || raw.status === "ended" || raw.status === "cancelled" || raw.data.game_started) return [];
  return [{
    thread_id: raw.storage_key,
    mode: raw.mode,
    status: "open",
    thread_name: raw.thread_name,
    game_started: 0,
    host_id: raw.host_id,
    start_timestamp: raw.start_timestamp,
  }];
}

/** The preview draft game's document (GET /api/draft — notes, captains). */
export function demoDraftRaw(threadId: string): RawAttendanceGame | null {
  return store().find((entry) => entry.storage_key === threadId && entry.data.is_draft) ?? null;
}
