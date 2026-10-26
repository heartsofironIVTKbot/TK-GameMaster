import type { HostBranch, HostRank } from "@/lib/hostBranches";
import type { PortfolioMode } from "@/lib/playerTypes";

/**
 * Web Database page: moderation requests (applied by the bot's moderation
 * engine — apply_moderation_action / apply_dishonored_action in bot.py.py)
 * and user-search shapes. Client-safe.
 */

export const PORTFOLIO_MODES: PortfolioMode[] = ["Roleplay", "Historical"];

export type ModerationOp = "give" | "take" | "redeem";
/** Counted stats + game ban. Dishonored has its own payload (DishonoredPayload). */
export type ModerationKind = "commend" | "merit" | "warn" | "ban";

/** Mirrors MODERATION_MAX_AMOUNT / DISHONORED_*_DAYS in bot.py.py. */
export const MODERATION_MAX_AMOUNT = 20;
export const DISHONORED_MIN_DAYS = 1;
export const DISHONORED_MAX_DAYS = 365;
/** Dishonored is usually 1 week – 3 months: the slider covers this range
 *  (longer sentences go in the exact-days box). */
export const DISHONORED_SLIDER_MAX_DAYS = 90;
export const MIN_REASON_LENGTH = 3;

/** Give / take / redeem one action. `mode` is null for Merit (one pool). */
export interface ModerationPayload {
  user_id: string;
  op: ModerationOp;
  kind: ModerationKind;
  mode: PortfolioMode | null;
  amount: number;
  reason: string;
  /** Ended game this action belongs to, or null ("Not game related"). */
  game_id: string | null;
  /** Given from the Games page's AI analysis (the bot marks it "given" there). */
  ai_reward?: boolean;
}

/** Give (set) or take (lift) a Dishonored restriction. */
export interface DishonoredPayload {
  user_id: string;
  op: "give" | "take";
  mode: PortfolioMode;
  reason: string;
  days: number;
  all_majors: boolean;
  majors: string[];
  minors: string[];
  /** Replace an active restriction instead of adding to it. */
  replace: boolean;
  game_id: string | null;
}

/** Host rating (formerly /give_host, /take_host): Senior Hosts of that branch
 *  + management give or take a host's Acclamations / Violations in one branch
 *  (RP / HIST). Mirrors apply_host_rating. */
export type HostRatingKind = "acclamation" | "violation";
export const HOST_RATING_MAX_AMOUNT = 10;
/** Per branch: Assistant → Full at 2 Acclamations, Full → Senior at 4; 3 Violations = that rank stripped. */
export const HOST_RATING_RULES = { full_at: 2, senior_at: 4, terminate_at: 3 } as const;

export interface HostRatingPayload {
  user_id: string;
  op: "give" | "take";
  kind: HostRatingKind;
  amount: number;
  reason: string;
  branch: HostBranch;
}

/** One branch of a host's standing (rank role + that branch's ratings). */
export interface HostBranchStanding {
  branch: HostBranch;
  /** Rank in this branch; null = not in it (e.g. terminated). */
  rank: HostRank | null;
  acclamations: number;
  violations: number;
}

/** A host's standing (host_stats + their rank roles), per branch. */
export interface HostStanding {
  hosted_games: number;
  branches: HostBranchStanding[];
}

/** What the bot reports back for a finished moderation request. */
export interface ModerationOutcome {
  title: string;
  summary: string;
  notes: string[];
  stats: Partial<{
    commends: number;
    warns: number;
    banned: boolean;
    merit: number;
    acclamations: number;
    violations: number;
    hosted_games: number;
  }>;
  log_url: string | null;
}

/** The bot's Dishonored nation lists (exact names it validates), via bot_config. */
export interface ModerationOptions {
  nations: Record<PortfolioMode, { majors: string[]; minors: string[] }>;
  /** Every game mode's nation names (Games page nation lock / late join). */
  mode_nations?: Record<string, { majors: string[]; minors: string[] }>;
  /** Each mode's standard nation groups, in reservation-list order (Presets page). */
  mode_layouts?: Record<string, { name: string; tiers: { label: string | null; nations: string[] }[] }[]>;
  /** Each mode's standard mods and rulesets (Presets page, Games page). */
  mode_resources?: Record<string, { mods: { name: string; link: string }[]; rules: { name: string; link: string }[] }>;
  /** This server, as the bot knows it (presets are kept per server). */
  server?: { id: string; name: string | null };
}

export type PlayerFilter = "all" | "warned" | "banned" | "dishonored" | "trusted" | "valor";

export type PlayerSort = "name" | "warnings" | "commends" | "games" | "recent";

/** One row in the Database search results. */
export interface DatabasePlayer {
  discord_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  in_server: boolean;
  /** Has played, or has any stat / moderation record. Users without history
   *  only show up when searched for directly. */
  has_history: boolean;
  total_games: number;
  attended: number;
  attendance_tracked: number;
  merit: number;
  /** Per mode (Roleplay / Historical). */
  modes: Record<PortfolioMode, { commends: number; warns: number; banned: boolean }>;
  dishonored: PortfolioMode[];
  trusted: PortfolioMode[];
  valor: boolean;
  /** Last moderation action, epoch seconds (null = never). */
  last_action_at: number | null;
}

export interface PlayerSearchResult {
  players: DatabasePlayer[];
  total: number;
  page: number;
  page_size: number;
  /** Users per filter across everyone with history (the filter chip counts). */
  counts: Record<PlayerFilter, number>;
}

/** One line of the server-wide moderation feed. */
export interface ActivityItem {
  target_id: string;
  target_name: string;
  action: string;
  label: string;
  mode: string | null;
  amount: number | null;
  reason: string | null;
  issued_by: string | null;
  automatic: boolean;
  created_at: number;
  log_url: string | null;
}
