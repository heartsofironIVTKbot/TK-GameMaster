/**
 * The public game archive (/archive, docs/game-archive.md): every started
 * game on every server, who played which nation, who came, what they got and
 * how the players rated it. Public, so names and avatars only: no Discord
 * IDs, and never who gave which rating. Client-safe.
 */

/** How a reserved player did. "pending": the game is still running. */
export type ArchivePresence = "played" | "no_show" | "told_host" | "late" | "pending" | "none";

export type ArchiveStatus = "starting" | "ongoing" | "ended" | "cancelled";

/** Marks a player got in this game (host rewards and sanctions). */
export interface ArchiveMarks {
  commend: number;
  merit: number;
  warn: number;
  dishonored: number;
  ban: number;
}

export interface ArchiveRating {
  /** Average stars, or null before anyone rated. */
  average: number | null;
  count: number;
  /** How many gave 5, 4, 3, 2 and 1 stars (in that order). */
  spread: [number, number, number, number, number];
  /** Players can still rate (24 hours after the game ends). */
  open: boolean;
  /** When rating closes (epoch seconds), while it's open. */
  closes_at: number | null;
}

export interface ArchiveCounts {
  reserved: number;
  played: number;
  no_show: number;
  told_host: number;
  late: number;
  commend: number;
  merit: number;
  warn: number;
  dishonored: number;
  ban: number;
}

export interface ArchiveGameCard {
  id: string;
  name: string;
  mode: string;
  /** "Roleplay" or "Historical" (the tabs). */
  category: string;
  status: ArchiveStatus;
  server_id: string;
  server_name: string;
  server_icon_url: string | null;
  host_name: string | null;
  /** When it was scheduled to start (epoch seconds). */
  ts: number;
  counts: ArchiveCounts;
  rating: ArchiveRating;
  /** The AI graded its roleplay (it has a page in the roleplay archive). */
  graded: boolean;
}

export interface ArchiveRow {
  /** The bot's name for the slot ("Germany", "Germany (co-op)"). */
  nation: string;
  /** Map tag for the flag, when known. */
  tag: string | null;
  coop: boolean;
  player: { name: string; avatar_url: string | null } | null;
  presence: ArchivePresence;
  marks: ArchiveMarks;
}

export interface ArchiveSection {
  title: string;
  rows: ArchiveRow[];
  /** Nations in this section nobody played. */
  open: number;
}

export interface ArchiveViewerRating {
  /** The viewer played and may rate (or change their rating) now. */
  can_rate: boolean;
  /** Their rating, when they gave one. */
  stars: number | null;
}

export interface ArchiveGameDetail {
  card: ArchiveGameCard;
  started_at: number | null;
  ended_at: number | null;
  sections: ArchiveSection[];
  /** Present when the viewer is logged in and played this game. */
  viewer: ArchiveViewerRating | null;
}

export interface ArchiveServer {
  id: string;
  name: string;
}

export type ArchiveTab = "all" | "roleplay" | "historical";
export type ArchiveSort = "newest" | "oldest" | "rating";

export interface ArchiveListResponse {
  games: ArchiveGameCard[];
  total: number;
  /** Games per tab (with the other filters applied). */
  tabs: Record<ArchiveTab, number>;
  servers: ArchiveServer[];
  modes: string[];
  next: number | null;
}

export const EMPTY_MARKS: ArchiveMarks = { commend: 0, merit: 0, warn: 0, dishonored: 0, ban: 0 };

/** Rating opens when the game ends and closes when the hosting is judged. */
export const RATING_WINDOW_SEC = 24 * 3600;
