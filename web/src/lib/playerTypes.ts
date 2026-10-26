/**
 * Player profile card + host portfolio shapes (GET /api/players/<id> and
 * /api/players/<id>/portfolio). Client-safe: no server imports here.
 */

import type { HostStanding } from "@/lib/moderationTypes";

/** One Discord server role, as shown on the profile card. */
export interface ProfileRole {
  id: string;
  name: string;
  /** "#rrggbb", or null for Discord's default (uncolored) role. */
  color: string | null;
  /** Role icon image URL, when the role has one. */
  icon_url: string | null;
  /** Unicode emoji role icon, when the role uses one instead of an image. */
  icon_emoji: string | null;
}

/** Discord-style profile: names, avatar, banner and server roles. */
export interface PlayerProfile {
  discord_id: string;
  /** Discord username (the unique @handle). */
  username: string | null;
  /** Server display name. */
  display_name: string | null;
  /** HOI4 in-game nickname set on the web after login. */
  ingame_nickname: string | null;
  avatar_url: string | null;
  /** Discord profile banner (known once the player has logged in on the web). */
  banner_url: string | null;
  /** Discord accent color (integer): banner fallback. */
  accent_color: number | null;
  /** Highest role first, like Discord's profile popout. */
  roles: ProfileRole[];
  /** Still a member of the server (present in the bot's member mirror). */
  in_server: boolean;
}

export type StandingStatus = "clear" | "banned";

export type PortfolioMode = "Roleplay" | "Historical";

/** Per-mode moderation standing (the /report "Mode Standings" lines). */
export interface ModeStanding {
  mode: PortfolioMode;
  status: StandingStatus;
  commends: number;
  warns: number;
}

/** Road to the mode's Trusted role (bot: statistics role scan). */
export interface TrustedRoad {
  mode: PortfolioMode;
  commends: number;
  /** Commends needed (MIN_TRUSTED_COMMENDS). */
  required: number;
  /** Holds the Trusted role now (null = role mirror not available yet). */
  has_role: boolean | null;
  /** Has the mode's Verified role (falls back to the users-table flag). */
  verified: boolean;
  banned: boolean;
}

/** Road to an automatic game ban: 3 warnings in a mode. */
export interface BanRoad {
  mode: PortfolioMode;
  warns: number;
  limit: number;
  banned: boolean;
}

/** An active game ban (bans have no expiry: they last until lifted). */
export interface GameBanInfo {
  mode: PortfolioMode;
  /** Reached the warning limit (automatic ban) vs issued by staff. */
  automatic: boolean;
  warns: number;
  /** Latest game in the player's history that recorded this ban. */
  game: { thread_id: string; mode: string; nation: string; ts: number } | null;
  /** From the moderation log (null until it has the ban recorded). */
  reason: string | null;
  issued_by: string | null;
  /** Epoch seconds. */
  issued_at: number | null;
  log_url: string | null;
}

/** One moderation action (moderation_events), newest first in a portfolio. */
export interface ModerationEvent {
  action: string;
  /** Human label, e.g. "Warning", "Game banned". */
  label: string;
  mode: string | null;
  amount: number | null;
  reason: string | null;
  /** Issuing host's name (null for automatic actions). */
  issued_by: string | null;
  automatic: boolean;
  /** Epoch seconds. */
  created_at: number;
  /** Link to the host-log message. */
  log_url: string | null;
}

/** One active Dishonored restriction. */
export interface DishonoredRestriction {
  category: string;
  all_majors: boolean;
  majors: string[];
  minors: string[];
  reason: string | null;
  /** Epoch seconds. */
  since: number | null;
  /** Epoch seconds; null = permanent. */
  expires_at: number | null;
  /** Host-log message that issued it (from the moderation log). */
  log_url?: string | null;
}

/** One game in the player's history (/report "Recent Game History"). */
export interface PortfolioGame {
  thread_id: string;
  mode: string;
  nation: string;
  /** Showed up; null = attendance not taken yet (upcoming / running game). */
  present: boolean | null;
  /** Epoch seconds. */
  ts: number;
}

/** Everything the bot's /report shows (minus the moderation-evidence links),
    laid out as progress "roads". */
export interface PlayerPortfolio {
  discord_id: string;
  /** Every game reserved in (same count as /report and the Valor rule). */
  total_games: number;
  /** Games the player showed up to. */
  attended: number;
  /** Games whose attendance has been taken (the attendance % base). */
  attendance_tracked: number;
  standings: ModeStanding[];
  merit_points: number;
  /** Holds Hearts of Valor (the Valor role; computed when the role mirror is missing). */
  hearts_of_valor: boolean;
  /** Hearts of Valor: valor_merit Merit + valor_attended ATTENDED games, no current warning. */
  merit_rules: { valor_merit: number; valor_attended: number };
  trusted: TrustedRoad[];
  bans: BanRoad[];
  /** Active game bans only (empty = none). */
  game_bans: GameBanInfo[];
  /** Active restrictions only (empty = none). */
  dishonored: DishonoredRestriction[];
  /** Latest 20 games, newest first. */
  history: PortfolioGame[];
  /** Latest 20 moderation actions, newest first (with log links). */
  events: ModerationEvent[];
  /** Host Acclamations / Violations — null when they're not a host and have no host record. */
  host: HostStanding | null;
}

/** Mirrors MODERATION_ACTION_LABELS in bot.py.py. */
export const MODERATION_ACTION_LABELS: Record<string, string> = {
  commend: "Commendation",
  commend_removed: "Commend removed",
  merit: "Merit awarded",
  merit_removed: "Merit removed",
  warn: "Warning",
  warn_removed: "Warning removed",
  redeem: "Warnings redeemed with commends",
  ban: "Game banned",
  unban: "Unbanned",
  dishonored_give: "Dishonored",
  dishonored_take: "Dishonored lifted",
  valor_earned: "Hearts of Valor earned",
  valor_trusted: "Valor Trusted approved",
  appeal: "Appeal submitted",
  host_acclamation: "Host acclamation",
  host_violation: "Host violation",
  host_acclamation_removed: "Host acclamation removed",
  host_violation_removed: "Host violation removed",
  verified_granted: "Verified",
  verified_removed: "Verification removed",
  vip_granted: "VIP given",
  vip_removed: "VIP removed",
  vip_declined: "VIP from another server declined",
};

/** Mirrors the bot's MERIT_VALOR_* constants (bot.py.py): Merit never turns
 *  into commends; 25 Merit + 50 attended games = Hearts of Valor. */
export const MERIT_RULES = { valor_merit: 25, valor_attended: 50 } as const;
/** Mirrors MIN_TRUSTED_COMMENDS and the 3-warning auto-ban (bot.py.py). */
export const TRUSTED_COMMENDS = 5;
export const WARN_BAN_LIMIT = 3;
