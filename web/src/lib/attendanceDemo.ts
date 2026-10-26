import type { RawAttendanceEvent, RawAttendanceGame } from "@/lib/attendance";
import { ATTENDANCE_REQUIRED_PRESENT, ATTENDANCE_SAMPLE_COUNT } from "@/lib/attendanceTypes";
import { demoDirectory } from "@/lib/liveDemo";
import type { RequestState, ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * Preview mode (SCHEDULER_DEMO=1) for the Attendance page: a live Roleplay
 * game two samples in, and a finalized Historical game from yesterday, plus
 * a simulated bot for att_check / att_sample / att_override / att_finalize
 * that follows the same rules as bot.py.py.
 */

interface DemoEntry {
  game: RawAttendanceGame;
  events: RawAttendanceEvent[];
}

const MAJORS = new Set(["Germany", "Soviet Union", "United Kingdom", "U.S.A", "Italy", "Japan", "France", "USA"]);

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function penaltyOf(slot: string, loggingMode: string): number {
  const base = slot.replace("_FILL_", "").split("_coop")[0];
  const major = MAJORS.has(base) && !slot.includes("_coop") && !slot.startsWith("_FILL_");
  if (loggingMode === "Casual" && !major) return 0;
  return major ? 2 : 1;
}

type State = "present" | "lobby" | "no_pass" | "no_voice";

function sampleOf(index: number, ts: number, states: Record<string, State>, extra: Record<string, unknown> = {}) {
  const present = Object.entries(states).filter(([, s]) => s === "present").map(([id]) => id);
  return {
    index,
    ts,
    present_ids: present,
    count: present.length,
    states: Object.fromEntries(
      Object.entries(states).map(([id, state]) => [
        id,
        { state, vc: state === "present" ? "Game VC" : state === "lobby" ? "Lobby" : state === "no_pass" ? "Hangout" : null, pass: state !== "no_pass", status: state === "no_voice" ? "offline" : "online" },
      ]),
    ),
    ...extra,
  };
}

function build(): DemoEntry[] {
  const members = demoDirectory();
  const id = (index: number) => members[index].discord_id;
  const now = nowSec();
  const min = 60;
  let eventId = 1;
  const ev = (kind: string, created_at: number, extra: Partial<RawAttendanceEvent> = {}): RawAttendanceEvent => ({
    id: eventId++, kind, user_id: null, actor_id: null, details: {}, created_at, ...extra,
  });

  // --- Live Roleplay game: started 50 min ago, 20-min interval, 2 samples in.
  const liveStart = now - 50 * min;
  const liveSlots: Record<string, string> = {
    Germany: id(4), "Soviet Union": id(2), "United Kingdom": id(7), Italy: id(1), Japan: id(6),
    Poland: id(5), Romania: id(3), Spain: id(9), "Germany_coop": id(11), _FILL_Filler: id(12), France: id(13),
  };
  const s1: Record<string, State> = {
    [id(4)]: "present", [id(2)]: "present", [id(7)]: "present", [id(1)]: "lobby", [id(6)]: "present",
    [id(5)]: "present", [id(3)]: "no_voice", [id(9)]: "present", [id(11)]: "present", [id(12)]: "no_pass", [id(13)]: "no_voice",
  };
  const s2: Record<string, State> = { ...s1, [id(1)]: "present", [id(12)]: "present", [id(3)]: "no_voice", [id(13)]: "no_voice" };
  const liveSamples = [sampleOf(1, liveStart + 20 * min, s1), sampleOf(2, liveStart + 40 * min, s2)];
  const live: RawAttendanceGame = {
    storage_key: "910000000000000001",
    mode: "Roleplay",
    status: "active",
    thread_name: "Roleplay #87 — Road to 56",
    host_id: id(0),
    reservations: liveSlots,
    data: {
      game_started: true,
      game_started_at: liveStart,
      lobby_thread_id: "910000000000000001",
      snapshot_interval_minutes: 20,
      logging_mode: "Strict",
      confirmed_ids: [id(4), id(2), id(7), id(1), id(6), id(5), id(9), id(11), id(12)],
      declined_ids: [id(13)],
      dropped_out: [],
      drop_reasons: { [id(13)]: "Power cut at home, sorry!" },
      presence_snapshots: liveSamples,
      snapshot_samples_done: 2,
      snapshot_done: false,
      present_ids: [],
      attendance_penalties: Object.fromEntries(Object.keys(liveSlots).map((slot) => [slot, penaltyOf(slot, "Strict")])),
      attendance_vip_ids: [id(4)],
      attendance_overrides: {},
      late_join_nations: ["_FILL_Filler"],
    },
  };
  const liveEvents = [
    ev("game_started", liveStart, { actor_id: id(0), details: { interval_minutes: 20, samples: 5, required: 2, logging_mode: "Strict", players: 11 } }),
    ...[4, 2, 7, 6, 5, 9, 11, 1].map((index, n) => ev("participation_yes", liveStart + 60 + n * 40, { user_id: id(index), details: {} })),
    ev("participation_no", liveStart + 9 * min, { user_id: id(13), details: { nation: "France", reason: "Power cut at home, sorry!", major: true, outcome: "declined" } }),
    ev("sample", liveStart + 20 * min, { details: { index: 1, count: liveSamples[0].count, manual: false } }),
    ev("late_join", liveStart + 31 * min, { user_id: id(12), details: { nation: "_FILL_Filler", kind: "Hot Join" } }),
    ev("participation_yes", liveStart + 32 * min, { user_id: id(12), details: {} }),
    ev("sample", liveStart + 40 * min, { details: { index: 2, count: liveSamples[1].count, manual: false } }),
  ].reverse();

  // --- Finalized Historical game from yesterday.
  const endStart = now - 26 * 3600;
  const endSlots: Record<string, string> = {
    USA: id(7), "United Kingdom": id(8), "Soviet Union": id(2), Germany: id(3), Italy: id(1), Japan: id(6), Romania: id(10), Hungary: id(9),
  };
  const full: Record<string, State> = Object.fromEntries(Object.values(endSlots).map((uid) => [uid, "present"]));
  const fin = (i: number, change: Record<string, State>) => sampleOf(i, endStart + i * 30 * min, { ...full, ...change });
  const endSamples = [
    fin(1, { [id(3)]: "no_voice", [id(9)]: "lobby" }),
    fin(2, { [id(3)]: "no_voice", [id(9)]: "lobby" }),
    fin(3, { [id(3)]: "no_voice" }),
    fin(4, { [id(3)]: "no_voice", [id(10)]: "no_pass" }),
    fin(5, { [id(3)]: "no_voice", [id(10)]: "no_pass" }),
  ];
  const ended: RawAttendanceGame = {
    storage_key: "920000000000000002",
    mode: "Historical (Vanilla)",
    status: "ended",
    thread_name: "Historical #41 — Vanilla 1936",
    host_id: id(1),
    reservations: endSlots,
    data: {
      game_started: true,
      game_started_at: endStart,
      lobby_thread_id: "920000000000000002",
      snapshot_interval_minutes: 30,
      logging_mode: "Strict",
      confirmed_ids: Object.values(endSlots),
      presence_snapshots: endSamples,
      snapshot_samples_done: 5,
      snapshot_done: true,
      present_ids: [id(7), id(8), id(2), id(1), id(6), id(10), id(9)],
      presence_hit_counts: { [id(7)]: 5, [id(8)]: 5, [id(2)]: 5, [id(3)]: 0, [id(1)]: 5, [id(6)]: 5, [id(10)]: 3, [id(9)]: 3 },
      applied_warns: { [id(3)]: 2 },
      attendance_penalties: Object.fromEntries(Object.keys(endSlots).map((slot) => [slot, penaltyOf(slot, "Strict")])),
      attendance_vip_ids: [],
      attendance_overrides: {},
      attendance_confident: true,
      attendance_finalized_at: endStart + 150 * min,
      attendance_finalized_by: "auto",
      attendance_log_suggestions: [{ user_id: id(3), tag: "GER", nation: "Germany", hits: 0, ts: endStart + 200 * min }],
    },
  };
  const endEvents = [
    ev("game_started", endStart, { actor_id: id(1), details: { interval_minutes: 30, samples: 5, required: 2, logging_mode: "Strict", players: 8 } }),
    ...endSamples.map((sample) => ev("sample", sample.ts, { details: { index: sample.index, count: sample.count, manual: false } })),
    ev("no_show_warning", endStart + 150 * min, { user_id: id(3), details: { amount: 2, nation: "Germany", reason: "Seen in 0/5 sample(s) taken (need 2+ of 5)" } }),
    ev("finalized", endStart + 150 * min, { details: { present: 7, absent: 1, samples: 5, confident: true, warnings: 2, how: "full" } }),
    ev("chatlog_hint", endStart + 200 * min, { user_id: id(3), details: { tag: "GER", nation: "Germany", hits: 0 } }),
  ].reverse();

  return [
    { game: live, events: liveEvents },
    { game: ended, events: endEvents },
  ];
}

function store(): DemoEntry[] {
  const holder = globalThis as { __gmAttendanceDemoV4?: DemoEntry[] };
  if (!holder.__gmAttendanceDemoV4) holder.__gmAttendanceDemoV4 = build();
  return holder.__gmAttendanceDemoV4;
}

export function demoAttendanceRaw(): DemoEntry[] {
  for (const entry of store()) autoSample(entry);
  return store();
}

/** Who's in voice at `at`: the last sample with a small, deterministic drift so it feels live. */
function driftStates(entry: DemoEntry, at: number): Record<string, State> {
  const samples = (entry.game.data.presence_snapshots as ReturnType<typeof sampleOf>[]) ?? [];
  const last = samples[samples.length - 1];
  return Object.fromEntries(
    [...new Set(Object.values(entry.game.reservations))].map((uid, n) => {
      const before = (last?.states?.[uid]?.state as State | undefined) ?? "no_voice";
      const flip = Math.floor(at / 60 + n) % 7 === 0;
      return [uid, flip ? (before === "present" ? "lobby" : "present") : before];
    }),
  );
}

/** The bot's sampling loop: take every sample that has come due, finalize after the last. */
function autoSample(entry: DemoEntry) {
  const data = entry.game.data;
  if (data.snapshot_done || entry.game.status === "ended" || entry.game.status === "cancelled") return;
  const interval = Number(data.snapshot_interval_minutes) || 20;
  let added = false;
  for (;;) {
    const samples = (data.presence_snapshots as ReturnType<typeof sampleOf>[]) ?? [];
    if (samples.length >= ATTENDANCE_SAMPLE_COUNT) {
      finalize(entry, null);
      break;
    }
    const due = (samples.length ? samples[samples.length - 1].ts : Number(data.game_started_at)) + interval * 60;
    if (due > nowSec()) break;
    const sample = sampleOf(samples.length + 1, due, driftStates(entry, due));
    data.presence_snapshots = [...samples, sample];
    data.snapshot_samples_done = sample.index;
    entry.events.unshift({
      id: Date.now() + Math.random(), kind: "sample", user_id: null, actor_id: null,
      details: { index: sample.index, count: sample.count, manual: false }, created_at: due,
    });
    added = true;
  }
  if (added) entry.events.sort((a, b) => b.created_at - a.created_at);
}

// --- Games page preview: start / end / cancel ----------------------------------

function demoEvent(kind: string, actorId: string | null, details: Record<string, unknown>): RawAttendanceEvent {
  return { id: Date.now() + Math.random(), kind, user_id: null, actor_id: actorId, details, created_at: nowSec() };
}

/** A game started on the Games page joins the attendance preview. */
export function demoAttendanceStart(raw: RawAttendanceGame, intervalMinutes: number, hostId: string) {
  const now = nowSec();
  const logging = String(raw.data.logging_mode || "Strict");
  const vips = demoDirectory()
    .filter((member) => member.is_vip && Object.values(raw.reservations).includes(member.discord_id))
    .map((member) => member.discord_id);
  const game: RawAttendanceGame = {
    ...raw,
    status: "active",
    data: {
      ...raw.data,
      game_started: true,
      game_started_at: now,
      lobby_thread_id: raw.storage_key,
      original_thread_id: raw.storage_key,
      snapshot_interval_minutes: intervalMinutes,
      logging_mode: logging,
      confirmed_ids: [],
      declined_ids: [],
      dropped_out: [],
      drop_reasons: {},
      presence_snapshots: [],
      snapshot_samples_done: 0,
      snapshot_done: false,
      present_ids: [],
      attendance_penalties: Object.fromEntries(Object.keys(raw.reservations).map((slot) => [slot, penaltyOf(slot, logging)])),
      attendance_vip_ids: vips,
      attendance_overrides: {},
    },
  };
  const players = new Set(Object.values(raw.reservations)).size;
  store().unshift({
    game,
    events: [demoEvent("game_started", hostId, { interval_minutes: intervalMinutes, samples: 5, required: 2, logging_mode: logging, players })],
  });
}

/** Ending: a bonus voice scan, finalize (if the samples didn't), then ended. */
export function demoAttendanceEnd(gameId: string, hostId: string): { present: number; players: number } | null {
  const entry = store().find((item) => String(item.game.data.lobby_thread_id) === gameId);
  if (!entry) return null;
  const data = entry.game.data;
  const now = nowSec();
  if (!data.snapshot_done) {
    const samples = (data.presence_snapshots as ReturnType<typeof sampleOf>[]) ?? [];
    const bonus = sampleOf(samples.length + 1, now, driftStates(entry, now), { final_bonus: true });
    data.presence_snapshots = [...samples, bonus];
    finalize(entry, null);
  }
  Object.assign(data, { ended_at: now, game_end_started_at: now, game_end_completed_at: now });
  entry.game.status = "ended";
  const present = ids(data.present_ids).length;
  const players = new Set(Object.values(entry.game.reservations)).size;
  entry.events.unshift(demoEvent("game_ended", hostId, { present, players }));
  return { present, players };
}

/** A late join from the website: the slot, the late-join mark and an audit event. Null = done. */
export function demoAttendanceLateJoin(gameId: string, userId: string, slotKey: string): string | null {
  const entry = store().find((item) => String(item.game.data.lobby_thread_id) === gameId);
  if (!entry) return "❌ Game not found.";
  const reservations = entry.game.reservations;
  const holder = reservations[slotKey];
  if (holder && holder !== userId && !slotKey.startsWith("_FILL_")) {
    return `❌ **${slotKey}** is taken — remove that player first (a late join can't swap or replace).`;
  }
  for (const [key, uid] of Object.entries(reservations)) if (uid === userId) delete reservations[key];
  reservations[slotKey] = userId;
  const data = entry.game.data;
  const late = Array.isArray(data.late_join_nations) ? data.late_join_nations.map(String) : [];
  data.late_join_nations = [...new Set([...late, slotKey])];
  const penalties = (data.attendance_penalties ?? {}) as Record<string, number>;
  data.attendance_penalties = { ...penalties, [slotKey]: penaltyOf(slotKey, String(data.logging_mode || "Strict")) };
  entry.events.unshift({ ...demoEvent("late_join", null, { nation: slotKey, kind: "Late Join" }), user_id: userId });
  return null;
}

export function demoAttendanceCancel(gameId: string, hostId: string, reason: string) {
  const entry = store().find((item) => String(item.game.data.lobby_thread_id) === gameId);
  if (!entry) return;
  entry.game.status = "cancelled";
  Object.assign(entry.game.data, { cancel_reason: reason, cancelled_at: nowSec(), cancelled_by: hostId, applied_warns: {} });
  entry.events.unshift(demoEvent("game_cancelled", hostId, { reason }));
}

// --- the simulated bot --------------------------------------------------------

type DemoOutcome = { status: RequestState; result: ScheduleRequestStatus["result"]; error: string | null };
const refuse = (error: string): DemoOutcome => ({ status: "error", result: null, error });
const done = (title: string, summary: string, notes: string[] = []): DemoOutcome => ({
  status: "done",
  result: { attendance: { title, summary, notes, stats: {}, log_url: null } },
  error: null,
});

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

function finalize(entry: DemoEntry, by: string | null) {
  const data = entry.game.data;
  const samples = (data.presence_snapshots as { present_ids: string[] }[]) ?? [];
  const dropped = new Set(ids(data.dropped_out));
  const overrides = (data.attendance_overrides ?? {}) as Record<string, { verdict: string }>;
  const hits: Record<string, number> = {};
  for (const sample of samples) for (const uid of sample.present_ids) hits[uid] = (hits[uid] ?? 0) + 1;
  const present = new Set(ids(data.present_ids));
  for (const [uid, count] of Object.entries(hits)) if (count >= ATTENDANCE_REQUIRED_PRESENT && !dropped.has(uid)) present.add(uid);
  for (const [uid, o] of Object.entries(overrides)) {
    if (o.verdict === "present") present.add(uid);
    if (o.verdict === "absent" || o.verdict === "excused") present.delete(uid);
  }
  const applied: Record<string, number> = {};
  const vip = new Set(ids(data.attendance_vip_ids));
  const penalties = (data.attendance_penalties ?? {}) as Record<string, number>;
  for (const [slot, uid] of Object.entries(entry.game.reservations)) {
    if (present.has(uid) || dropped.has(uid) || overrides[uid]?.verdict === "excused" || vip.has(uid)) continue;
    const penalty = penalties[slot] ?? 1;
    if (penalty) applied[uid] = (applied[uid] ?? 0) + penalty;
  }
  Object.assign(data, {
    present_ids: [...present],
    presence_hit_counts: hits,
    applied_warns: applied,
    snapshot_done: true,
    attendance_confident: samples.length >= ATTENDANCE_REQUIRED_PRESENT,
    attendance_early_ended: samples.length < ATTENDANCE_SAMPLE_COUNT,
    attendance_finalized_at: nowSec(),
    attendance_finalized_by: by ?? "auto",
  });
  const players = new Set(Object.values(entry.game.reservations)).size;
  for (const [uid, amount] of Object.entries(applied)) {
    entry.events.unshift({ id: Date.now() + Math.random(), kind: "no_show_warning", user_id: uid, actor_id: null, details: { amount }, created_at: nowSec() });
  }
  entry.events.unshift({
    id: Date.now() + Math.random(), kind: "finalized", user_id: null, actor_id: by,
    details: { present: present.size, absent: players - present.size, samples: samples.length, confident: samples.length >= 2,
      warnings: Object.values(applied).reduce((a, b) => a + b, 0), how: by ? "web" : "full" },
    created_at: nowSec(),
  });
  return present.size;
}

/** The simulated bot for att_* requests. */
export function applyDemoAttendance(action: string, payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const entry = store().find((item) => String(item.game.data.lobby_thread_id) === String(payload.game_id));
  if (!entry) return refuse("❌ Game not found.");
  const data = entry.game.data;
  const now = nowSec();
  const log = (kind: string, extra: Partial<RawAttendanceEvent> = {}) =>
    entry.events.unshift({ id: Date.now() + Math.random(), kind, user_id: null, actor_id: hostId, details: {}, created_at: now, ...extra });
  const players = new Set(Object.values(entry.game.reservations));
  const samples = (data.presence_snapshots as ReturnType<typeof sampleOf>[]) ?? [];
  const currentStates = () => driftStates(entry, now);

  if (action === "att_check") {
    const states = currentStates();
    const sample = sampleOf(0, now, states);
    data.attendance_live_check = { ts: now, by: hostId, present_ids: sample.present_ids, players: sample.states };
    log("live_check", { details: { in_voice: sample.count, players: players.size } });
    return done("🎧 Voice check", `${sample.count} of ${players.size} players are in voice with the Gamer Pass`);
  }
  if (action === "att_sample") {
    if (data.snapshot_done) return refuse("ℹ️ Attendance is already finalized.");
    if (entry.game.status === "ended") return refuse("ℹ️ The game is over — attendance finalizes from the samples already taken.");
    if (samples.length >= ATTENDANCE_SAMPLE_COUNT) return refuse("ℹ️ All samples are already taken.");
    const sample = sampleOf(samples.length + 1, now, currentStates(), { manual: true, by: hostId });
    data.presence_snapshots = [...samples, sample];
    data.snapshot_samples_done = samples.length + 1;
    log("sample", { details: { index: sample.index, count: sample.count, manual: true } });
    const notes = ["The next sample is due one interval from now."];
    if (sample.index >= ATTENDANCE_SAMPLE_COUNT) {
      finalize(entry, null);
      notes.splice(0, 1, "That was the last sample — attendance is finalized.");
    }
    return done("📸 Sample taken", `Sample ${sample.index}/${ATTENDANCE_SAMPLE_COUNT}: ${sample.count} of ${players.size} present`, notes);
  }
  if (action === "att_override") {
    const uid = String(payload.user_id ?? "");
    const verdict = String(payload.verdict ?? "");
    const reason = String(payload.reason ?? "").trim();
    if (!players.has(uid)) return refuse("❌ That player has no reservation in this game.");
    if (reason.length < 3) return refuse("❌ Please give a reason (at least a few words).");
    if (!["present", "absent", "excused", "auto"].includes(verdict)) return refuse("❌ Pick Present, Absent or Excused.");
    const labels: Record<string, string> = { present: "Present", absent: "Absent", excused: "Excused", auto: "Automatic" };
    const overrides = { ...((data.attendance_overrides ?? {}) as Record<string, unknown>) };
    const notes: string[] = [];
    let summary: string;
    let before = (overrides[uid] as { verdict?: string } | undefined)?.verdict ?? "auto";
    if (!data.snapshot_done) {
      if (verdict === "auto") {
        delete overrides[uid];
        notes.push("Back to automatic — the samples decide.");
      } else {
        overrides[uid] = { verdict, reason, by: hostId, ts: now };
        notes.push("Saved — it applies when attendance is finalized.");
      }
      summary = `${labels[verdict]} (applies at finalize)`;
    } else {
      if (verdict === "auto") return refuse("ℹ️ Attendance is finalized — pick Present, Absent or Excused.");
      const present = new Set(ids(data.present_ids));
      const applied = { ...((data.applied_warns ?? {}) as Record<string, number>) };
      before = before === "excused" ? "excused" : present.has(uid) ? "present" : "absent";
      if (before === verdict) return refuse(`ℹ️ They're already ${verdict}.`);
      if (before === "absent" && applied[uid]) {
        notes.push(`Removed the ${applied[uid]} no-show warning(s) this game gave.`);
        log("warning_reverted", { user_id: uid, details: { amount: applied[uid] } });
        delete applied[uid];
      }
      if (verdict === "present") present.add(uid);
      else present.delete(uid);
      if (verdict === "absent") {
        const vip = ids(data.attendance_vip_ids).includes(uid);
        const penalties = (data.attendance_penalties ?? {}) as Record<string, number>;
        const penalty = vip ? 0 : Object.entries(entry.game.reservations).filter(([, holder]) => holder === uid).reduce((sum, [slot]) => sum + (penalties[slot] ?? 1), 0);
        if (penalty) {
          applied[uid] = penalty;
          notes.push(`No-show: +${penalty} warning(s).`);
          log("no_show_warning", { user_id: uid, details: { amount: penalty, reason } });
        } else notes.push(vip ? "VIP — no no-show warning." : "No warning for this slot.");
      }
      if (verdict === "excused") notes.push("Excused — not counted as attended, no warning.");
      data.present_ids = [...present];
      data.applied_warns = applied;
      overrides[uid] = { verdict, reason, by: hostId, ts: now };
      summary = `${labels[before]} → ${labels[verdict]}`;
    }
    data.attendance_overrides = overrides;
    log("override", { user_id: uid, details: { from: before, to: verdict, reason, finalized: Boolean(data.snapshot_done), notes } });
    return done("📝 Attendance changed", summary, notes);
  }
  if (action === "att_finalize") {
    if (data.snapshot_done) return refuse("ℹ️ Attendance is already finalized.");
    if (samples.length < ATTENDANCE_REQUIRED_PRESENT) return refuse(`⚠️ Take at least ${ATTENDANCE_REQUIRED_PRESENT} samples first (or end the game).`);
    const present = finalize(entry, hostId);
    return done("✅ Attendance finalized", `${present} of ${players.size} present (from ${samples.length} samples)`);
  }
  return refuse(`❌ Unknown attendance action: ${action}.`);
}
