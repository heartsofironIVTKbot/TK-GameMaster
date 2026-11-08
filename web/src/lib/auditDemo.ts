import type { AuditEvent } from "@/lib/auditTypes";

/** Preview mode (SCHEDULER_DEMO=1): sample audit events plus whatever demo actions add. */

const PEOPLE = {
  anna: ["100000000000000001", "Anna (Host)"],
  ben: ["100000000000000002", "Ben"],
  ivan: ["100000000000000003", "Ivan"],
  mira: ["100000000000000004", "Mira"],
  kurt: ["100000000000000005", "Kurt (Senior Host)"],
  zoe: ["100000000000000006", "Zoe"],
} as const;

type Who = keyof typeof PEOPLE;
const GAME = "1300000000000000001";
const GAME_B = "1300000000000000002";

const SAMPLES: [number, string, string, Who | null, Who | null, string | null, string, string][] = [
  // minutes ago, category, action, actor, target, game, summary, source
  [2, "reservation", "reserve", "ivan", null, GAME, "Ivan reserved Germany in Sunday Vanilla", "web"],
  [4, "reservation", "unreserve", "zoe", null, GAME, "Zoe unreserved Italy in Sunday Vanilla", "web"],
  [6, "roster", "roster_move", "anna", "ben", GAME, "Anna (Host) moved Ben from Romania to Hungary in Sunday Vanilla", "web"],
  [9, "roster", "roster_swap", "anna", "mira", GAME, "Anna (Host) swapped Mira (Japan) with Ivan (Germany) in Sunday Vanilla", "web"],
  [12, "reservation", "reserve_coop", "mira", null, GAME, "Mira reserved the Soviet Union co-op slot in Sunday Vanilla", "web"],
  [15, "moderation", "warn", "kurt", "zoe", GAME_B, "Kurt (Senior Host) gave Zoe 1 warning(s) (Roleplay) — no-show", "web"],
  [21, "moderation", "commend", "anna", "ben", GAME_B, "Anna (Host) gave Ben 2 commend(s) (Roleplay) — great diplomacy", "web"],
  [26, "game", "started", "anna", null, GAME_B, "Anna (Host) started Saturday RP", "web"],
  [31, "roster", "late_join", "anna", "ivan", GAME_B, "Anna (Host) added Ivan to the running game Saturday RP as Brazil", "web"],
  [40, "game", "reminder_sent", "anna", null, GAME, "Anna (Host) sent a reminder in Sunday Vanilla — Reminder sent — 18 players", "web"],
  [48, "draft", "draft_pick", "ben", "zoe", GAME, "Ben made a draft pick in Sunday Vanilla — Zoe joins the Allies", "web"],
  [55, "host", "acclamation", "kurt", "anna", null, "Kurt (Senior Host) gave Anna (Host) 1 Acclamation(s) (RP) — smooth game", "web"],
  [63, "roles", "verify", "kurt", "zoe", null, "Kurt (Senior Host) verified Zoe (RP)", "web"],
  [70, "message", "host_message", "anna", "ben", null, "Anna (Host) sent a direct message to Ben", "web"],
  [78, "settings", "settings_saved", "kurt", null, null, "Kurt (Senior Host) saved the server settings: Changed 2 settings (Roles)", "web"],
  [85, "system", "command_used", "mira", null, null, "Mira used /info in #general", "discord"],
  [92, "reservation", "nickname_set", "ivan", null, null, "Ivan set their in-game nickname to IvanTheGreat", "web"],
  [101, "roster", "hotjoin_request", "zoe", null, GAME_B, "Zoe asked to hot-join in Saturday RP", "web"],
  [109, "roster", "hotjoin_decided", "anna", null, GAME_B, "Anna (Host) answered a hot-join request in Saturday RP — Approved", "web"],
  [118, "game", "access_changed", "anna", null, GAME, "Anna (Host) changed who can reserve in Sunday Vanilla — Locked to Verified", "web"],
  [130, "moderation", "ban", null, "zoe", GAME_B, "GameMaster game-banned Zoe (Roleplay) — Automatic: reached 3 Roleplay warnings", "bot"],
  [141, "roster", "roster_remove", "anna", "zoe", GAME, "Anna (Host) removed Zoe from Italy in Sunday Vanilla", "web"],
  [155, "game", "scheduled", "anna", null, GAME, "Anna (Host) scheduled a game: Sunday Vanilla", "web"],
  [170, "roles", "vip", "kurt", "mira", null, "Kurt (Senior Host) gave Mira VIP", "web"],
  [190, "host", "host_rank_set", "kurt", "anna", null, "Kurt (Senior Host) set Anna (Host)'s host rank (RP): Assistant → Full", "web"],
  [210, "system", "bot_log", null, null, null, "Daily role check · Checked 412 members · 3 roles changed", "discord"],
  [240, "moderation", "merit", "kurt", "ivan", null, "Kurt (Senior Host) gave Ivan 5 Merit — crash report", "web"],
  [270, "game", "ended", "anna", null, GAME_B, "Anna (Host) ended Friday Historical", "web"],
  [300, "game", "attendance_finalized", "anna", null, GAME_B, "Anna (Host) finalized attendance in Friday Historical", "web"],
  [330, "draft", "draft_join", "zoe", null, GAME, "Zoe joined the draft in Sunday Vanilla", "web"],
  [360, "reservation", "reserve_filler", "ben", null, GAME, "Ben reserved a filler slot (Spare) in Sunday Vanilla", "web"],
  [400, "moderation", "take", "kurt", "ben", null, "Kurt (Senior Host) removed 1 warning(s) (Roleplay) from Ben — mistake", "web"],
  [450, "roster", "roster_add", "anna", "mira", GAME, "Anna (Host) added Mira as Japan in Sunday Vanilla", "web"],
  [520, "game", "cancelled", "kurt", null, GAME_B, "Kurt (Senior Host) cancelled Thursday RP — host is ill", "web"],
  [600, "roles", "role_scan", "kurt", null, null, "Kurt (Senior Host) ran the role check", "web"],
  [700, "system", "crash_report", "ivan", null, GAME_B, "Ivan sent a crash report in Friday Historical", "web"],
  [800, "host", "violation", "kurt", "anna", null, "Kurt (Senior Host) gave Anna (Host) 1 Violation(s) (HIST) — late start", "web"],
  [950, "message", "players_messaged", "anna", null, GAME, "Anna (Host) messaged a game's players in Sunday Vanilla", "web"],
  [1100, "settings", "setup_finished", "kurt", null, null, "Kurt (Senior Host) changed the server setup", "web"],
  [1300, "game", "schedule_edited", "anna", null, GAME, "Anna (Host) edited a scheduled game in Sunday Vanilla", "web"],
];

function seed(): AuditEvent[] {
  const now = Math.floor(Date.now() / 1000);
  return SAMPLES.map(([minutes, category, action, actor, target, game, summary, source], index) => ({
    id: SAMPLES.length - index,
    created_at: now - minutes * 60,
    category,
    action,
    actor_id: actor ? PEOPLE[actor][0] : null,
    actor_name: actor ? PEOPLE[actor][1] : null,
    target_id: target ? PEOPLE[target][0] : null,
    target_name: target ? PEOPLE[target][1] : null,
    game_id: game,
    summary,
    details: action === "roster_move" ? { slot: "Hungary", from: "Romania", notified: true } : null,
    source,
  }));
}

/** Newest first; demo actions unshift onto it. */
export function demoAuditEvents(): AuditEvent[] {
  const holder = globalThis as { __gmAuditDemoV1?: AuditEvent[] };
  holder.__gmAuditDemoV1 ??= seed();
  return holder.__gmAuditDemoV1;
}
