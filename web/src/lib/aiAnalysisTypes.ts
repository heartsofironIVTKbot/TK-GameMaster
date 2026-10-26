/**
 * AI chat-log analysis (Games page upload → bot run_ai_log_analysis).
 * The AI only scores quality; the bot applies these strict rules to its own
 * word counts (bot.py.py AI_* constants — keep in sync). Client-safe.
 */

/** Largest chat log the website accepts (HOI4 logs are usually well under 2 MB). */
export const CHAT_LOG_MAX_BYTES = 8 * 1024 * 1024;

export interface AiRules {
  /** [in-character words, commends], highest first. */
  commend_tiers: [number, number][];
  /** [in-character words, Merit points], highest first. */
  merit_tiers: [number, number][];
  commend_min_creativity: number;
  merit_min_creativity: number;
  /** Toxicity at or above this: no reward. */
  toxic_from: number;
}

export const DEFAULT_AI_RULES: AiRules = {
  commend_tiers: [
    [3000, 3],
    [1500, 2],
    [750, 1],
  ],
  merit_tiers: [
    [500, 4],
    [350, 3],
    [200, 2],
  ],
  commend_min_creativity: 7,
  merit_min_creativity: 6,
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
  log: { filename: string; bytes: number; uploaded_at: number } | null;
}

export interface GameChatLog {
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
  if (creativity >= rules.commend_min_creativity) {
    for (const [min, count] of rules.commend_tiers) {
      if (meaningfulWords >= min) return { commends: count, merit: 0, why: `${words} words of in-character RP, creativity ${creativity}/10.` };
    }
  }
  if (meritEnabled && creativity >= rules.merit_min_creativity) {
    for (const [min, count] of rules.merit_tiers) {
      if (meaningfulWords >= min) return { commends: 0, merit: count, why: `${words} words of in-character RP, creativity ${creativity}/10.` };
    }
  }
  const lowest = meritEnabled ? rules.merit_tiers[rules.merit_tiers.length - 1][0] : rules.commend_tiers[rules.commend_tiers.length - 1][0];
  if (meaningfulWords < lowest) {
    return nothing(`${words} words of in-character RP — ${lowest.toLocaleString("en-US")} are needed for ${meritEnabled ? "Merit" : "a commend"}.`);
  }
  return meritEnabled
    ? nothing(`Creativity ${creativity}/10 — Merit needs ${rules.merit_min_creativity}/10.`)
    : nothing(`Creativity ${creativity}/10 — a commend needs ${rules.commend_min_creativity}/10 (Merit is off on this server).`);
}

/** Plain-language summary of the rules for hosts. */
export function rulesSummary(rules: AiRules, meritEnabled: boolean): string[] {
  const words = (n: number) => n.toLocaleString("en-US");
  const commends = [...rules.commend_tiers].reverse().map(([min, count]) => `${count} at ${words(min)}+`).join(", ");
  const lines = [
    `Commends: ${commends} words of in-character RP, with creativity ${rules.commend_min_creativity}/10 or more.`,
  ];
  if (meritEnabled) {
    const merit = [...rules.merit_tiers].reverse().map(([min, count]) => `${count} at ${words(min)}+`).join(", ");
    lines.push(`Merit: ${merit} words, with creativity ${rules.merit_min_creativity}/10 or more.`);
  } else {
    lines.push("Merit is off on this server, so only commends are recommended.");
  }
  lines.push(
    `Nothing for toxicity ${rules.toxic_from}/10 or more, or for mostly one-liners. Only in-character roleplay counts — not out-of-character chat.`,
  );
  return lines;
}
