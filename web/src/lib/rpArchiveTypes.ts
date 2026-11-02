/**
 * The public roleplay archive (/roleplay): every game whose chat log the AI
 * graded, its story, everyone's result and the roleplay itself. Public: no
 * Discord IDs, no staff names, no toxicity scores. Client-safe.
 */

export type RpVerdictKind = "commend" | "merit" | "none" | "no_rp";

export interface RpVerdict {
  kind: RpVerdictKind;
  amount: number;
  /** "⭐ 2 commends", "🎖️ 3 Merit", "No reward", "0 RP". */
  label: string;
}

export interface RpPlayer {
  /** Stable key for lists (not a Discord ID). */
  key: string;
  name: string;
  avatar_url: string | null;
  tag: string;
  nation: string;
  role: "MAIN" | "COOP" | "UNRESERVED";
  words: number;
  /** In-character words (what the rules count). */
  ic_words: number;
  creativity: number;
  verdict: RpVerdict;
  /** Why: the rule that applied (conduct is never spelled out publicly). */
  why: string;
  summary: string;
  snippets: string[];
  /** The host gave the recommended reward. */
  given: boolean;
  left_early: boolean;
}

export interface RpTopPlayer {
  name: string;
  avatar_url: string | null;
  tag: string;
  verdict: RpVerdict;
}

export interface RpGameCard {
  id: string;
  server_id: string;
  server_name: string;
  server_icon_url: string | null;
  mode: string;
  name: string;
  /** When the game was played (epoch seconds). */
  ts: number;
  host_name: string | null;
  /** The AI's recap of the story. */
  summary: string;
  players: number;
  ic_words: number;
  rewarded: number;
  /** The best roleplayers first (up to 5). */
  top: RpTopPlayer[];
}

export interface RpServer {
  id: string;
  name: string;
  icon_url: string | null;
}

export interface RpListResponse {
  games: RpGameCard[];
  total: number;
  servers: RpServer[];
  modes: string[];
  /** Offset of the next page, or null at the end. */
  next: number | null;
}

export interface RpLine {
  /** Line number in the whole game (1-based). */
  n: number;
  /** Which file it came from (1-based). */
  file: number;
  /** Country tag of the speaker, or null for system lines. */
  tag: string | null;
  /** In-game name after the tag. */
  speaker: string | null;
  text: string;
  /** Plainly out of character ("unpause", "lag?", ((...))). */
  ooc: boolean;
}

export interface RpGameDetail {
  card: RpGameCard;
  players: RpPlayer[];
  files: { part: number; filename: string; lines: number }[];
  lines: RpLine[];
  /** Lines were left out because the log is very long. */
  truncated: boolean;
  graded_at: number;
}

// ---- Reading a chat log (mirrors bot.py.py) -----------------------------------

/**
 * Game-control and lobby one-liners that are never roleplay. Same list as the
 * bot's _OOC_WORDS (bot.py.py): keep them in sync.
 */
export const OOC_WORDS = new Set(
  `pause unpause unpaused unp paused resume p up go lag lagging laggy desync desynced oos rehost rehosting
save saved saving load speed faster slower slow ready rdy r gg ggs wp gl hf glhf brb afk back ok okay k
lol lmao xd ty thx np sec wait min checksum host hosting crash crashed kick ping`.split(/\s+/),
);

/** The bot's _is_ooc_payload. */
export function isOocText(text: string): boolean {
  const lowered = text.trim().toLowerCase();
  if (!lowered) return true;
  if (lowered.startsWith("((") || lowered.startsWith("ooc") || lowered.startsWith("[ooc") || lowered.startsWith("(ooc")) return true;
  const words = lowered.match(/[a-z0-9']+/g) ?? [];
  return words.length > 0 && words.length <= 4 && words.every((word) => OOC_WORDS.has(word));
}

const DIRECT = /^([A-Z]{3}|D\d{2})([^:]{0,40}):\s?(.*)$/;
const WRAPPED = /^.*?\(([A-Z]{3}|D\d{2})([^)]{0,40})\):\s?(.*)$/;
const SYSTEM_EVENT = /^(joined|connected|reconnected|left|disconnected|quit)\.?$/i;
const FILE_MARKER = /^===== CHAT LOG FILE \d+ of \d+/;

/** One log line → who said what (system and join/leave lines have no tag). */
export function parseLogLine(raw: string): { tag: string | null; speaker: string | null; text: string; ooc: boolean } {
  const line = raw.replace(/\r$/, "");
  const trimmed = line.trim();
  if (FILE_MARKER.test(trimmed)) return { tag: null, speaker: null, text: trimmed, ooc: true };
  const match = trimmed.match(DIRECT) ?? trimmed.match(WRAPPED);
  if (!match) return { tag: null, speaker: null, text: trimmed, ooc: true };
  const text = match[3].trim();
  const speaker = match[2].trim() || null;
  if (SYSTEM_EVENT.test(text)) return { tag: match[1], speaker, text, ooc: true };
  return { tag: match[1], speaker, text, ooc: isOocText(text) };
}

// ---- Shared labels ----------------------------------------------------------------

export function verdictOf(reward: { commends: number; merit: number }, status: string): RpVerdict {
  if (reward.commends > 0) {
    return { kind: "commend", amount: reward.commends, label: `⭐ ${reward.commends} commend${reward.commends > 1 ? "s" : ""}` };
  }
  if (reward.merit > 0) return { kind: "merit", amount: reward.merit, label: `🎖️ ${reward.merit} Merit` };
  if (status === "no_rp") return { kind: "no_rp", amount: 0, label: "0 RP" };
  return { kind: "none", amount: 0, label: "No reward" };
}

/** Best first: commends, then Merit, then in-character words. */
export function verdictRank(verdict: RpVerdict): number {
  return verdict.kind === "commend" ? 300 + verdict.amount : verdict.kind === "merit" ? 200 + verdict.amount : verdict.kind === "none" ? 100 : 0;
}

/** Words of a search, lower-case. */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 8);
}
