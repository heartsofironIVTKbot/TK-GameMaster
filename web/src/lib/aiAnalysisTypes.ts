/**
 * AI chat-log analysis (Games page upload → bot run_ai_log_analysis).
 * The AI only scores quality; the bot applies these strict rules to its own
 * word counts (bot.py.py AI_* constants — keep in sync). Client-safe.
 */

/**
 * How much log text one game can have, all files together. The AI reads a
 * game's files in one go, and about 3 MB is what fits (HOI4 logs are usually
 * well under 1 MB).
 */
export const CHAT_LOG_MAX_BYTES = 3 * 1024 * 1024;
/** Files per game (a rehost after a crash, a log saved in parts). */
export const CHAT_LOG_MAX_FILES = 10;

/** [in-character words, how many, creativity at least]. */
export type AiTier = [number, number, number];

export interface AiRules {
  /** Commend tiers, best first. */
  commend_tiers: AiTier[];
  /** Merit tiers, best first. */
  merit_tiers: AiTier[];
  /** The lowest tier's creativity (analyses before per-tier minimums had one for all tiers). */
  commend_min_creativity: number;
  merit_min_creativity: number;
  /** Toxicity at or above this: no reward. */
  toxic_from: number;
}

/** Lowered 19 November 2026 (bot.py.py AI_COMMEND_TIERS / AI_MERIT_TIERS). */
export const DEFAULT_AI_RULES: AiRules = {
  commend_tiers: [
    [2500, 3, 8],
    [1200, 2, 7],
    [600, 1, 6],
  ],
  merit_tiers: [
    [450, 4, 5],
    [300, 3, 5],
    [150, 2, 4],
  ],
  commend_min_creativity: 6,
  merit_min_creativity: 4,
  toxic_from: 4,
};

export type AiStatus = "rewarded" | "minimal" | "no_rp" | "toxic" | "ungraded";

export interface AiReward {
  commends: number;
  merit: number;
  why: string;
}

export interface AiPlayerResult {
  tag: string;
  nation: string;
  user_id: string | null;
  role: "MAIN" | "COOP" | "UNRESERVED";
  /** Display name (resolved on the website). */
  name: string | null;
  avatar_url: string | null;
  lines: number;
  words: number;
  /** Words of real in-character roleplay (what the rules count). */
  meaningful_words: number;
  in_character_share: number;
  creativity: number;
  toxicity: number;
  low_effort: boolean;
  left_early: boolean;
  graded: boolean;
  summary: string;
  snippets: string[];
  reward: AiReward;
  status: AiStatus;
  /** A host already gave it (Games page). */
  given: { kind: "commend" | "merit"; amount: number; by_name: string | null; at: number } | null;
}

export interface GameAiAnalysis {
  at: number;
  by_name: string | null;
  merit_enabled: boolean;
  rules: AiRules;
  players: AiPlayerResult[];
  /** The files that were graded (signature changes when a file is added, removed or moved). */
  log: { filename: string; bytes: number; uploaded_at: number; signature: string | null; files: number } | null;
  /** The AI's 2-4 sentence recap of the game's story (public). */
  game_summary: string;
}

export interface GameChatLog {
  file_id: string;
  part: number;
  filename: string;
  bytes: number;
  uploaded_at: number;
  uploaded_by_name: string | null;
}

/** One game's result on the player's own profile. */
export interface ProfileAiResult {
  game_id: string;
  game_name: string;
  mode: string;
  ts: number;
  nation: string;
  words: number;
  meaningful_words: number;
  creativity: number;
  reward: AiReward;
  status: AiStatus;
  summary: string;
  given: boolean;
}

/** The bot's _ai_reward (used by the preview's simulated bot and to explain the rules). */
export function aiReward(
  meaningfulWords: number,
  creativity: number,
  toxicity: number,
  lowEffort: boolean,
  meritEnabled: boolean,
  rules: AiRules = DEFAULT_AI_RULES,
): AiReward {
  const nothing = (why: string): AiReward => ({ commends: 0, merit: 0, why });
  const words = meaningfulWords.toLocaleString("en-US");
  if (toxicity >= rules.toxic_from) return nothing(`Toxicity ${toxicity}/10 — no reward.`);
  if (lowEffort) return nothing("Mostly one-liners, spam or out-of-character chat — no reward.");
  const why = `${words} words of in-character RP, creativity ${creativity}/10.`;
  for (const [min, count, minCreativity] of rules.commend_tiers) {
    if (meaningfulWords >= min && creativity >= minCreativity) return { commends: count, merit: 0, why };
  }
  if (meritEnabled) {
    for (const [min, count, minCreativity] of rules.merit_tiers) {
      if (meaningfulWords >= min && creativity >= minCreativity) return { commends: 0, merit: count, why };
    }
  }
  const tiers = meritEnabled ? rules.merit_tiers : rules.commend_tiers;
  const [lowestWords, , lowestCreativity] = tiers[tiers.length - 1];
  if (meaningfulWords < lowestWords) {
    return nothing(`${words} words of in-character RP — ${lowestWords.toLocaleString("en-US")} are needed for ${meritEnabled ? "Merit" : "a commend"}.`);
  }
  return meritEnabled
    ? nothing(`Creativity ${creativity}/10 — Merit needs ${lowestCreativity}/10.`)
    : nothing(`Creativity ${creativity}/10 — a commend needs ${lowestCreativity}/10 (Merit is off on this server).`);
}

/** Plain-language summary of the rules for hosts. */
export function rulesSummary(rules: AiRules, meritEnabled: boolean): string[] {
  const words = (n: number) => n.toLocaleString("en-US");
  const list = (tiers: AiTier[]) =>
    [...tiers].reverse().map(([min, count, minCreativity]) => `${count} at ${words(min)}+ words (creativity ${minCreativity}+)`).join(", ");
  const lines = [`Commends: ${list(rules.commend_tiers)} of in-character RP.`];
  if (meritEnabled) {
    lines.push(`Merit: ${list(rules.merit_tiers)}.`);
  } else {
    lines.push("Merit is off on this server, so only commends are recommended.");
  }
  lines.push(
    `Nothing for toxicity ${rules.toxic_from}/10 or more, or for mostly one-liners. Only in-character roleplay counts — not out-of-character chat.`,
  );
  return lines;
}
