import demoModeDefaults from "@/data/demoModeDefaults.json";
import { demoDirectory } from "@/lib/liveDemo";
import { demoHostTier, demoIsVerified, setDemoHostTier } from "@/lib/memberRolesDemo";
import { HOST_BRANCH_VALUES, type HostBranch, type HostRank } from "@/lib/hostBranches";
import {
  DISHONORED_MAX_DAYS,
  DISHONORED_MIN_DAYS,
  HOST_RATING_MAX_AMOUNT,
  HOST_RATING_RULES,
  MIN_REASON_LENGTH,
  MODERATION_MAX_AMOUNT,
  PORTFOLIO_MODES,
  type ActivityItem,
  type DatabasePlayer,
  type HostStanding,
  type ModerationOptions,
  type ModerationOutcome,
} from "@/lib/moderationTypes";
import {
  MERIT_RULES,
  MODERATION_ACTION_LABELS,
  TRUSTED_COMMENDS,
  WARN_BAN_LIMIT,
  type DishonoredRestriction,
  type ModerationEvent,
  type PlayerPortfolio,
  type PortfolioGame,
  type PortfolioMode,
} from "@/lib/playerTypes";
import type { RequestState, ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * Preview mode (SCHEDULER_DEMO=1, `next dev` only) for the Database page:
 * mutable player records for the demo members, the portfolio built from
 * them, and a simulated bot that applies moderation requests with the SAME
 * rules as bot.py.py's apply_moderation_action / apply_dishonored_action.
 * Showcases: Wilhelm has Hearts of Valor + RP Trusted, Rookie is RP
 * game-banned (3 warnings), Carl is Dishonored, and one member has no
 * history yet (only found by searching).
 */

const DEMO_LOG_URL = "https://discord.com/channels/@me";
/** Demo member with no history at all. */
const NO_HISTORY_INDEX = 10;

interface ModeStats {
  commends: number;
  warns: number;
  banned: boolean;
}

interface DemoRecord {
  index: number;
  modes: Record<PortfolioMode, ModeStats>;
  merit: number;
  totalGames: number;
  attended: number;
  tracked: number;
  history: PortfolioGame[];
  dishonored: Partial<Record<PortfolioMode, DishonoredRestriction>>;
  /** Holds the Hearts of Valor role, and the Trusted pick the host team approved. */
  valorHeld?: boolean;
  valorTrusted?: PortfolioMode | null;
  /** Newest first. */
  events: ModerationEvent[];
  /** Host ratings per branch (null = never a host). Ranks live in memberRolesDemo. */
  host: DemoHostStats | null;
}

interface DemoHostStats {
  hosted_games: number;
  ratings: Record<HostBranch, { acclamations: number; violations: number }>;
}

const HISTORY_MODES = ["Roleplay", "Historical (Vanilla)", "Kaiserreich (FFA)", "Roleplay (Millennium Dawn)"];
const HISTORY_NATIONS = ["German Reich", "Kingdom of Italy", "Republic of Poland", "Empire of Japan", "Filler", "United Kingdom (Co-op)"];

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function event(at: number, action: string, extra: Partial<ModerationEvent> = {}): ModerationEvent {
  return {
    action,
    label: MODERATION_ACTION_LABELS[action] ?? action,
    mode: "Roleplay",
    amount: null,
    reason: null,
    issued_by: "Demo Host",
    automatic: false,
    created_at: at,
    log_url: DEMO_LOG_URL,
    ...extra,
  };
}

function emptyRecord(index: number): DemoRecord {
  return {
    index,
    modes: {
      Roleplay: { commends: 0, warns: 0, banned: false },
      Historical: { commends: 0, warns: 0, banned: false },
    },
    merit: 0,
    totalGames: 0,
    attended: 0,
    tracked: 0,
    history: [],
    dishonored: {},
    events: [],
    host: null,
  };
}

/** Demo host ratings per branch (their ranks live in memberRolesDemo): Demo Host
 *  Senior in both, Erwin Full RP + Assistant HIST, Winston Assistant RP, Lena Senior HIST. */
function initialHost(index: number): DemoHostStats | null {
  const stats = (hosted: number, rp: [number, number], hist: [number, number]): DemoHostStats => ({
    hosted_games: hosted,
    ratings: { RP: { acclamations: rp[0], violations: rp[1] }, HIST: { acclamations: hist[0], violations: hist[1] } },
  });
  if (index === 0) return stats(42, [5, 0], [4, 0]);
  if (index === 3) return stats(18, [3, 1], [1, 0]);
  if (index === 7) return stats(4, [1, 0], [0, 0]);
  if (index === 9) return stats(31, [0, 0], [4, 0]);
  return null;
}

function initialRecord(index: number): DemoRecord {
  if (index === NO_HISTORY_INDEX) return emptyRecord(index);
  const now = nowSec();
  const day = 86_400;
  const gameCount = 4 + ((index * 7) % 23);
  const totalGames = index === 4 ? 112 : gameCount;
  const tracked = Math.max(0, totalGames - 1);
  const history = Array.from({ length: Math.min(gameCount, 20) }, (_, game) => ({
    thread_id: String(BigInt("1400000000000000000") + BigInt(index * 100 + game)),
    mode: HISTORY_MODES[(index + game) % HISTORY_MODES.length],
    nation: HISTORY_NATIONS[(index * 3 + game) % HISTORY_NATIONS.length],
    present: game === 0 ? null : (index + game) % 5 !== 0,
    ts: now - game * 3 * day + day,
  }));
  const events: ModerationEvent[] = [];
  if (index === 12) {
    events.push(
      event(now - 6 * day, "ban", { reason: "Automatic: reached 3 Roleplay warnings (no-show)", automatic: true, issued_by: null }),
      event(now - 6 * day, "warn", { amount: 1, reason: "No-show: present in 0/5 attendance checks", automatic: true, issued_by: null }),
      event(now - 20 * day, "warn", { amount: 2, reason: "Left the game early as a Major" }),
    );
  }
  if (index === 13) {
    events.push(
      event(now - 5 * day, "dishonored_give", { reason: "Left two Major games early in a row." }),
      event(now - 8 * day, "warn", { mode: "Historical", amount: 2, reason: "Ignored host instructions" }),
    );
  }
  if (index % 3 === 1) events.push(event(now - 10 * day, "commend", { amount: 1, reason: "Great RP and diplomacy" }));
  if (index % 2 === 0) events.push(event(now - 14 * day, "merit", { mode: null, amount: 3, reason: "Helped new players set up" }));
  events.push(event(now - 30 * day, "commend", { mode: "Historical", amount: 1, reason: "Solid front-line play" }));

  return {
    index,
    modes: {
      // A game ban already wiped Rookie's (12) Roleplay commends and Merit.
      Roleplay: { commends: index === 4 ? 6 : index === 12 ? 0 : (index * 3) % 6, warns: index === 12 ? 3 : index % 3, banned: index === 12 },
      Historical: { commends: index % 5, warns: index === 13 ? 2 : 0, banned: false },
    },
    merit: index === 4 ? 31 : index === 12 ? 0 : (index * 4) % 20,
    totalGames,
    attended: Math.round(tracked * (0.7 + (index % 4) * 0.1)),
    tracked,
    history,
    dishonored:
      index === 13
        ? {
            Roleplay: {
              category: "Roleplay",
              all_majors: true,
              majors: [],
              minors: [],
              reason: "Left two Major games early in a row.",
              since: now - 5 * day,
              expires_at: now + 9 * day,
              log_url: DEMO_LOG_URL,
            },
          }
        : {},
    // Wilhelm earned Valor (and had his Roleplay Trusted pick approved)
    // before his current warning.
    valorHeld: index === 4,
    valorTrusted: index === 4 ? "Roleplay" : null,
    events,
    host: initialHost(index),
  };
}

function records(): Map<string, DemoRecord> {
  const holder = globalThis as { __gmDatabaseDemoV5?: Map<string, DemoRecord> };
  if (!holder.__gmDatabaseDemoV5) {
    holder.__gmDatabaseDemoV5 = new Map(demoDirectory().map((member, index) => [member.discord_id, initialRecord(index)]));
  }
  return holder.__gmDatabaseDemoV5;
}

function activeDishonored(record: DemoRecord): DishonoredRestriction[] {
  const now = nowSec();
  return Object.values(record.dishonored).filter(
    (entry): entry is DishonoredRestriction => Boolean(entry) && (!entry!.expires_at || entry!.expires_at > now),
  );
}

function bannedAnywhere(record: DemoRecord): boolean {
  return PORTFOLIO_MODES.some((mode) => record.modes[mode].banned);
}

function meetsValor(record: DemoRecord): boolean {
  return record.merit >= MERIT_RULES.valor_merit && record.attended >= MERIT_RULES.valor_attended;
}

/** The bot's _sync_valor_role: granted at 25 Merit + 50 attended games with no
 *  current warning; lost when the requirements stop being met or on a ban. */
function syncValor(record: DemoRecord, notes: string[]) {
  const warned = PORTFOLIO_MODES.some((mode) => record.modes[mode].warns > 0);
  if (record.valorHeld && (bannedAnywhere(record) || !meetsValor(record))) {
    record.valorHeld = false;
    record.valorTrusted = null;
    notes.push("Hearts of Valor removed — requirements no longer met.");
  } else if (!record.valorHeld && !bannedAnywhere(record) && meetsValor(record)) {
    if (warned) {
      notes.push("Meets the Hearts of Valor requirements, but a current warning holds the promotion back.");
    } else {
      record.valorHeld = true;
      notes.push("🎖️ Hearts of Valor earned — perks DM sent (Trusted role pick goes to the host team).");
      record.events.unshift(event(nowSec(), "valor_earned", { mode: null, automatic: true, issued_by: null }));
    }
  }
}

/** Valor and Trusted: a game ban in ANY mode blocks every positive role. */
function valor(record: DemoRecord): boolean {
  return !bannedAnywhere(record) && Boolean(record.valorHeld);
}

function hasTrusted(record: DemoRecord, mode: PortfolioMode, verified: boolean): boolean {
  if (!verified || bannedAnywhere(record)) return false;
  return record.modes[mode].commends >= TRUSTED_COMMENDS || (valor(record) && record.valorTrusted === mode);
}

function hasHistory(record: DemoRecord): boolean {
  return (
    record.totalGames > 0 ||
    record.merit > 0 ||
    record.events.length > 0 ||
    activeDishonored(record).length > 0 ||
    PORTFOLIO_MODES.some((mode) => record.modes[mode].commends > 0 || record.modes[mode].warns > 0 || record.modes[mode].banned)
  );
}

// --- reads -----------------------------------------------------------------

export function demoPlayerPortfolio(userId: string): PlayerPortfolio {
  const record = records().get(userId) ?? initialRecord(0);
  // Each Trusted road needs that game type's Verified role (RP / Hist).
  const verifiedIn = (mode: PortfolioMode) => demoIsVerified(userId, mode);
  const dishonored = activeDishonored(record);
  const latestBan = (mode: PortfolioMode) => record.events.find((entry) => entry.action === "ban" && entry.mode === mode);

  return {
    discord_id: userId,
    total_games: record.totalGames,
    attended: record.attended,
    attendance_tracked: record.tracked,
    standings: PORTFOLIO_MODES.map((mode) => {
      const stats = record.modes[mode];
      return { mode, status: stats.banned ? "banned" : "clear", commends: stats.commends, warns: stats.warns };
    }),
    merit_points: record.merit,
    hearts_of_valor: valor(record),
    merit_rules: { ...MERIT_RULES },
    trusted: PORTFOLIO_MODES.map((mode) => ({
      mode,
      commends: record.modes[mode].commends,
      required: TRUSTED_COMMENDS,
      has_role: hasTrusted(record, mode, verifiedIn(mode)),
      verified: verifiedIn(mode),
      banned: record.modes[mode].banned,
    })),
    bans: PORTFOLIO_MODES.map((mode) => ({
      mode,
      warns: record.modes[mode].warns,
      limit: WARN_BAN_LIMIT,
      banned: record.modes[mode].banned,
    })),
    game_bans: PORTFOLIO_MODES.filter((mode) => record.modes[mode].banned).map((mode) => {
      const ban = latestBan(mode);
      return {
        mode,
        automatic: ban?.automatic ?? record.modes[mode].warns >= WARN_BAN_LIMIT,
        warns: record.modes[mode].warns,
        game: null,
        reason: ban?.reason ?? null,
        issued_by: ban?.issued_by ?? null,
        issued_at: ban?.created_at ?? null,
        log_url: ban?.log_url ?? null,
      };
    }),
    dishonored,
    history: record.history,
    events: record.events.slice(0, 20),
    host: demoHostCard(userId, record.host),
  };
}

/** The Host standing card: ratings from the record, ranks from the roles panel's state. */
function demoHostCard(userId: string, host: DemoHostStats | null): HostStanding | null {
  const ranks = { RP: demoHostTier(userId, "RP"), HIST: demoHostTier(userId, "HIST") };
  if (!host && ranks.RP === "None" && ranks.HIST === "None") return null;
  return {
    hosted_games: host?.hosted_games ?? 0,
    branches: HOST_BRANCH_VALUES.map((branch) => ({
      branch,
      rank: ranks[branch] === "None" ? null : (ranks[branch] as HostRank),
      acclamations: host?.ratings[branch].acclamations ?? 0,
      violations: host?.ratings[branch].violations ?? 0,
    })),
  };
}

export function demoPlayerIndex(): DatabasePlayer[] {
  return demoDirectory().map((member) => {
    const record = records().get(member.discord_id) ?? initialRecord(0);
    const dishonored = activeDishonored(record).map((entry) => entry.category as PortfolioMode);
    return {
      discord_id: member.discord_id,
      name: member.ingame_nickname || member.display_name || member.username || member.discord_id,
      username: member.username,
      avatar_url: member.avatar_url,
      in_server: true,
      has_history: hasHistory(record),
      total_games: record.totalGames,
      attended: record.attended,
      attendance_tracked: record.tracked,
      merit: record.merit,
      modes: {
        Roleplay: { ...record.modes.Roleplay },
        Historical: { ...record.modes.Historical },
      },
      dishonored,
      trusted: PORTFOLIO_MODES.filter((mode) => hasTrusted(record, mode, demoIsVerified(member.discord_id, mode))),
      valor: valor(record),
      last_action_at: record.events[0]?.created_at ?? null,
    };
  });
}

export function demoActivity(limit = 30): ActivityItem[] {
  const names = new Map(demoDirectory().map((member) => [member.discord_id, member.ingame_nickname || member.username || member.discord_id]));
  const items: ActivityItem[] = [];
  for (const [userId, record] of records()) {
    for (const entry of record.events) {
      items.push({
        target_id: userId,
        target_name: names.get(userId) ?? userId,
        action: entry.action,
        label: entry.label,
        mode: entry.mode,
        amount: entry.amount,
        reason: entry.reason,
        issued_by: entry.issued_by,
        automatic: entry.automatic,
        created_at: entry.created_at,
        log_url: entry.log_url,
      });
    }
  }
  return items.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

export function demoModerationOptions(): ModerationOptions {
  const roleplay = {
    majors: ["U.S.A", "Soviet Union", "Germany", "United Kingdom", "France", "Italy", "Japan"],
    minors: ["Argentina", "Australia", "Austria", "Belgium", "Brazil", "Bulgaria", "Canada", "China", "Czechoslovakia", "Egypt", "Finland", "Greece", "Hungary", "Iran", "Mexico", "Netherlands", "Poland", "Romania", "South Africa", "Spain", "Sweden", "Turkey", "Yugoslavia"],
  };
  const historical = {
    majors: ["United Kingdom", "USA", "Soviet Union", "Germany", "Italy", "Japan"],
    minors: ["Australia", "Brazil", "British Raj", "Bulgaria", "Canada", "Finland", "France", "Hungary", "Manchukuo", "Mexico", "Netherlands", "Romania", "Siam", "South Africa", "Spain"],
  };
  // The bot's own per-mode lists, groups, mods and rules (snapshot of what it
  // publishes to bot_config — regenerate from bot.py.py if they change).
  return {
    nations: { Roleplay: roleplay, Historical: historical },
    mode_nations: demoModeDefaults.mode_nations,
    mode_layouts: demoModeDefaults.mode_layouts,
    mode_resources: demoModeDefaults.mode_resources,
    server: { id: "341585283881631744", name: "Preview Server" },
  };
}

// --- the simulated bot --------------------------------------------------------

type DemoOutcome = { status: RequestState; result: ScheduleRequestStatus["result"]; error: string | null };
const done = (moderation: ModerationOutcome): DemoOutcome => ({ status: "done", result: { moderation }, error: null });
const refuse = (error: string): DemoOutcome => ({ status: "error", result: null, error });

const TITLES: Record<string, string> = {
  "give:commend": "🌟 {label} Commendation",
  "give:merit": "🎖️ Merit Awarded",
  "give:warn": "⚠️ {label} Warning",
  "give:ban": "🚨 {label} Game Banned",
  "take:commend": "📉 {label} Commend Removed",
  "take:merit": "📉 Merit Removed",
  "take:warn": "📉 {label} Warning Removed",
  "take:ban": "🔓 {label} Unbanned",
  "redeem:warn": "♻️ {label} Warnings Redeemed",
};
const EVENT_ACTIONS: Record<string, string> = {
  "take:commend": "commend_removed",
  "take:merit": "merit_removed",
  "take:warn": "warn_removed",
  "take:ban": "unban",
  "redeem:warn": "redeem",
};

/** The bot's _apply_game_ban_wipe: banned mode's commends + all Merit to 0
 *  (Trusted / Valor follow, since they're derived from the stats here). */
function banWipe(record: DemoRecord, mode: PortfolioMode, notes: string[]) {
  const stats = record.modes[mode];
  if (stats.commends) notes.push(`Lost ${stats.commends} ${mode} commend(s) (game bans reset positive stats).`);
  if (record.merit) notes.push(`Lost ${record.merit} Merit (game bans reset positive stats).`);
  stats.commends = 0;
  record.merit = 0;
  record.valorHeld = false;
  record.valorTrusted = null;
  notes.push("Removed Trusted (RP + MP) and Hearts of Valor if held.");
}

/** The bot's apply_host_rating: Acclamations promote (2 → Full, 4 → Senior),
 *  Violations demote (3 → terminated); giving one first cancels the other. */
function applyDemoHostRating(
  record: DemoRecord,
  payload: Record<string, unknown>,
  log: (entry: Partial<ModerationEvent> & { action: string }) => void,
): DemoOutcome {
  const op = payload.op === "give" || payload.op === "take" ? payload.op : null;
  const kind = payload.kind === "acclamation" || payload.kind === "violation" ? payload.kind : null;
  const amount = Number(payload.amount);
  if (!op || !kind) return refuse("❌ Unknown action.");
  if (!Number.isInteger(amount) || amount < 1 || amount > HOST_RATING_MAX_AMOUNT) {
    return refuse(`❌ Amount must be between 1 and ${HOST_RATING_MAX_AMOUNT}.`);
  }
  const branch = HOST_BRANCH_VALUES.find((value) => value === payload.branch);
  if (!branch) return refuse("❌ Pick a host branch: RP or HIST.");
  const userId = demoDirectory()[record.index].discord_id;
  const rankOf = () => demoHostTier(userId, branch);
  if (!record.host && rankOf() === "None" && demoHostTier(userId, branch === "RP" ? "HIST" : "RP") === "None") {
    return refuse("❌ That user isn't a host.");
  }
  record.host ??= {
    hosted_games: 0,
    ratings: { RP: { acclamations: 0, violations: 0 }, HIST: { acclamations: 0, violations: 0 } },
  };
  const counts = record.host.ratings[branch];
  const label = kind === "acclamation" ? "Acclamation" : "Violation";
  const notes: string[] = [];
  // Like commends and warnings: the two counts never cancel each other; only
  // Host Management takes them back (the demo viewer is Host Management).
  if (op === "take") {
    const key = kind === "acclamation" ? "acclamations" : "violations";
    if (counts[key] < amount) return refuse(`⚠️ They only have ${counts[key]} ${branch} ${label}(s).`);
    const before = counts[key];
    counts[key] -= amount;
    if (kind === "acclamation") {
      if (rankOf() === "Senior" && counts.acclamations < HOST_RATING_RULES.senior_at) {
        setDemoHostTier(userId, branch, "Full");
        notes.push(`Back to Full ${branch} Host (below ${HOST_RATING_RULES.senior_at} Acclamations).`);
      } else if (rankOf() === "Full" && counts.acclamations < HOST_RATING_RULES.full_at) {
        setDemoHostTier(userId, branch, "Assistant");
        notes.push(`Back to Assistant ${branch} Host (below ${HOST_RATING_RULES.full_at} Acclamations).`);
      }
    } else if (rankOf() === "None" && before >= HOST_RATING_RULES.terminate_at && counts.violations < HOST_RATING_RULES.terminate_at) {
      const back =
        counts.acclamations >= HOST_RATING_RULES.senior_at ? "Senior" : counts.acclamations >= HOST_RATING_RULES.full_at ? "Full" : "Assistant";
      setDemoHostTier(userId, branch, back);
      notes.push(`Violations are below ${HOST_RATING_RULES.terminate_at} — ${back} ${branch} Host given back.`);
    }
  } else if (kind === "acclamation") {
    counts.acclamations += amount;
    if (counts.acclamations >= HOST_RATING_RULES.senior_at && rankOf() === "Full") {
      setDemoHostTier(userId, branch, "Senior");
      notes.push(`Promoted to Senior ${branch} Host (reached ${counts.acclamations} Acclamations).`);
    } else if (counts.acclamations >= HOST_RATING_RULES.full_at && rankOf() === "Assistant") {
      setDemoHostTier(userId, branch, "Full");
      notes.push(`Promoted to Full ${branch} Host (reached ${counts.acclamations} Acclamations).`);
    }
  } else {
    counts.violations += amount;
    if (counts.violations >= HOST_RATING_RULES.terminate_at && rankOf() !== "None") {
      setDemoHostTier(userId, branch, "None");
      notes.push(`TERMINATED from the ${branch} branch: ${HOST_RATING_RULES.terminate_at} Violations reached — ${branch} host role stripped.`);
    }
  }
  log({ action: `host_${kind}${op === "take" ? "_removed" : ""}`, mode: branch, amount });
  return done({
    title: `${kind === "acclamation" ? "⭐" : "⚠️"} ${branch} Host ${label}${op === "take" ? " Removed" : ""}`,
    summary: `${branch} Host ${label}: ${op === "give" ? "+" : "−"}${amount}`,
    notes,
    stats: { acclamations: counts.acclamations, violations: counts.violations, hosted_games: record.host.hosted_games },
    log_url: DEMO_LOG_URL,
  });
}

/** The simulated bot for "moderation" / "dishonored" / "host_rating" requests. */
export function applyDemoModeration(action: string, payload: Record<string, unknown>, hostId: string): DemoOutcome {
  const userId = String(payload.user_id ?? "");
  const record = records().get(userId);
  if (!record) return refuse("❌ Couldn't find that Discord user.");
  if (userId === hostId) return refuse("❌ You can't moderate yourself — ask another host.");
  const reason = String(payload.reason ?? "").trim();
  if (reason.length < MIN_REASON_LENGTH) return refuse("❌ Please give a reason (at least a few words).");
  const now = nowSec();
  const log = (entry: Partial<ModerationEvent> & { action: string }) => {
    record.events.unshift(event(now, entry.action, { reason, ...entry }));
  };

  if (action === "host_rating") return applyDemoHostRating(record, payload, log);

  if (action === "dishonored") {
    const mode = String(payload.mode ?? "") as PortfolioMode;
    if (!PORTFOLIO_MODES.includes(mode)) return refuse("❌ Pick a mode: Roleplay or Historical.");
    if (payload.op === "take") {
      if (!record.dishonored[mode]) return refuse(`ℹ️ They have no Dishonored restriction in ${mode}.`);
      delete record.dishonored[mode];
      log({ action: "dishonored_take", mode });
      return done({ title: "⚖️ Dishonored Title Lifted", summary: `Dishonored lifted in ${mode}`, notes: [`Lifted the ${mode} restriction.`], stats: {}, log_url: DEMO_LOG_URL });
    }
    const days = Number(payload.days);
    if (!Number.isInteger(days) || days < DISHONORED_MIN_DAYS || days > DISHONORED_MAX_DAYS) {
      return refuse(`❌ Duration must be ${DISHONORED_MIN_DAYS}–${DISHONORED_MAX_DAYS} days.`);
    }
    const pool = demoModerationOptions().nations[mode];
    const majors = (Array.isArray(payload.majors) ? payload.majors : []).map(String);
    const minors = (Array.isArray(payload.minors) ? payload.minors : []).map(String);
    const badMajor = majors.find((name) => !pool.majors.includes(name));
    if (badMajor) return refuse(`❌ **${badMajor}** isn't a Major nation in ${mode}.`);
    const badMinor = minors.find((name) => !pool.minors.includes(name));
    if (badMinor) return refuse(`❌ **${badMinor}** isn't a Minor nation in ${mode}.`);
    let allMajors = Boolean(payload.all_majors);
    if (!allMajors && majors.length === 0 && minors.length === 0) {
      return refuse("❌ Pick at least one restriction: All Majors, a Major or a Minor.");
    }
    const existing = record.dishonored[mode];
    const merge = existing && !payload.replace && (!existing.expires_at || existing.expires_at > now);
    allMajors = allMajors || Boolean(merge && existing!.all_majors);
    // A time-out only: no stat or role changes.
    record.dishonored[mode] = {
      category: mode,
      all_majors: allMajors,
      majors: allMajors ? [] : [...new Set([...(merge ? existing!.majors : []), ...majors])],
      minors: [...new Set([...(merge ? existing!.minors : []), ...minors])],
      reason,
      since: now,
      expires_at: now + days * 86_400,
      log_url: DEMO_LOG_URL,
    };
    log({ action: "dishonored_give", mode });
    return done({
      title: "⚖️ Dishonored Title Applied",
      summary: `Dishonored in ${mode} for ${days} days`,
      notes: [`Dishonored in ${mode} for ${days} days. Stats and roles are untouched.`],
      stats: {},
      log_url: DEMO_LOG_URL,
    });
  }

  const op = String(payload.op ?? "");
  const kind = op === "redeem" ? "warn" : String(payload.kind ?? "");
  const key = `${op}:${kind}`;
  if (!TITLES[key]) return refuse("❌ Unknown action type.");
  const counted = kind === "commend" || kind === "merit" || kind === "warn";
  const amount = counted ? Number(payload.amount ?? 1) : 1;
  if (!Number.isInteger(amount) || amount < 1 || amount > MODERATION_MAX_AMOUNT) {
    return refuse(`❌ Amount must be between 1 and ${MODERATION_MAX_AMOUNT}.`);
  }
  const mode = (kind === "merit" ? "Roleplay" : String(payload.mode ?? "")) as PortfolioMode;
  if (!PORTFOLIO_MODES.includes(mode)) return refuse("❌ Pick a mode: Roleplay or Historical.");
  const stats = record.modes[mode];
  const warnsBefore = stats.warns;
  const wasBanned = stats.banned;
  const notes: string[] = [];
  const extra: Array<Partial<ModerationEvent> & { action: string }> = [];

  const autoBan = () => {
    if (stats.warns >= WARN_BAN_LIMIT && !stats.banned) {
      stats.banned = true;
      notes.push(`Reached ${stats.warns} ${mode} warnings — automatically game banned.`);
      banWipe(record, mode, notes);
      extra.push({ action: "ban", mode, automatic: true, issued_by: null, reason: `Automatic: reached ${stats.warns} ${mode} warnings` });
    }
  };
  const autoUnban = () => {
    if (wasBanned && warnsBefore >= WARN_BAN_LIMIT && stats.warns < WARN_BAN_LIMIT && stats.banned) {
      stats.banned = false;
      notes.push(`${mode} warnings are below 3 — the automatic game ban was lifted.`);
      extra.push({ action: "unban", mode, automatic: true, issued_by: null, reason: `Automatic: ${mode} warnings dropped below 3` });
    }
  };

  switch (key) {
    case "give:commend":
      stats.commends += amount;
      if (stats.commends >= TRUSTED_COMMENDS && stats.commends - amount < TRUSTED_COMMENDS) {
        notes.push(
          bannedAnywhere(record)
            ? `Has 5+ ${mode} commends, but game-banned players can't get Trusted.`
            : `Reached ${TRUSTED_COMMENDS} ${mode} commends — Trusted (if Verified).`,
        );
      }
      break;
    case "give:merit":
      record.merit += amount;
      syncValor(record, notes);
      break;
    case "take:merit":
      if (record.merit < amount) return refuse(`⚠️ They only have ${record.merit} Merit.`);
      record.merit -= amount;
      syncValor(record, notes);
      break;
    case "give:warn":
      stats.warns += amount;
      autoBan();
      break;
    case "give:ban":
      if (stats.banned) return refuse(`⚠️ They're already ${mode} banned.`);
      stats.banned = true;
      banWipe(record, mode, notes);
      break;
    case "take:commend":
      if (stats.commends < amount) return refuse(`⚠️ They only have ${stats.commends} ${mode} commend(s).`);
      stats.commends -= amount;
      break;
    case "take:warn":
      if (stats.warns < amount) return refuse(`⚠️ They only have ${stats.warns} ${mode} warning(s).`);
      stats.warns -= amount;
      autoUnban();
      break;
    case "take:ban":
      if (!stats.banned) return refuse(`⚠️ They aren't ${mode} banned.`);
      stats.banned = false;
      break;
    case "redeem:warn":
      if (stats.warns < amount) return refuse(`⚠️ They only have ${stats.warns} ${mode} warning(s) to clear.`);
      if (stats.commends < amount) return refuse(`⚠️ They only have ${stats.commends} ${mode} commend(s) to spend.`);
      stats.commends -= amount;
      stats.warns -= amount;
      notes.push(`Spent ${amount} ${mode} commend(s) to clear ${amount} warning(s).`);
      autoUnban();
      break;
  }

  const title = TITLES[key].replace("{label}", mode);
  const plain = title.split(" ").slice(1).join(" ");
  log({
    action: EVENT_ACTIONS[key] ?? kind,
    mode: kind === "merit" ? null : mode,
    amount: counted ? amount : null,
  });
  for (const entry of extra) log(entry);
  return done({
    title,
    summary: op === "redeem" ? `${plain}: ${amount} commend(s) spent, ${amount} warning(s) cleared` : counted ? `${plain}: ${op === "give" ? "+" : "−"}${amount}` : plain,
    notes,
    stats: { commends: stats.commends, warns: stats.warns, banned: stats.banned, merit: record.merit },
    log_url: DEMO_LOG_URL,
  });
}
