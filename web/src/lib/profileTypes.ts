import type { ProfileAiResult } from "@/lib/aiAnalysisTypes";
import type { PlayerPortfolio, PlayerProfile } from "@/lib/playerTypes";

/**
 * GET /api/me/profile — the logged-in player's own record (the /info
 * command's page). Client-safe: no server imports.
 */
export interface MyProfileResponse {
  /** Discord card (null when the bot hasn't mirrored the member yet). */
  profile: PlayerProfile | null;
  /** The same portfolio hosts see, without staff names or host-log links. */
  portfolio: PlayerPortfolio;
  /** Whose records these are (stats are kept per server). */
  server: { id: string; name: string | null };
  viewer: { discord_id: string; username: string; avatar_url: string | null };
  /** The AI's verdict on their recent analyzed games (newest first). */
  ai_results: ProfileAiResult[];
}
