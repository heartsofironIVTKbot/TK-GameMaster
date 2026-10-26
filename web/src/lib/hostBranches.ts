/**
 * Host branches (bot.py.py HOST_BRANCHES): RP hosts host Roleplay games, HIST
 * hosts Historical games. Each branch has Assistant / Full / Senior ranks
 * and its own Acclamations / Violations (2 → Full, 4 → Senior, 3 Violations
 * → that branch's rank is stripped). Staff host anything. Client-safe.
 */

export type HostBranch = "RP" | "HIST";
export type HostRank = "Assistant" | "Full" | "Senior";

export const HOST_BRANCHES: readonly { value: HostBranch; label: string; category: "Roleplay" | "Historical"; games: string }[] = [
  { value: "RP", label: "RP", category: "Roleplay", games: "Roleplay games" },
  { value: "HIST", label: "HIST", category: "Historical", games: "Historical games" },
];
export const HOST_BRANCH_VALUES: readonly HostBranch[] = ["RP", "HIST"];
export const HOST_RANKS: readonly HostRank[] = ["Assistant", "Full", "Senior"];

/** The RP rank roles (the original host roles). HIST ids come from the bot (bot_config web_member_roles). */
export const RP_RANK_ROLES: Record<HostRank, string> = {
  Assistant: "1420697977340821514",
  Full: "819120021464285184",
  Senior: "1485937962695786578",
};

/** Which branch hosts a mode's games (Historical modes → HIST). Mirrors _host_branch_for_mode. */
export function branchOfMode(mode: string): HostBranch {
  return mode.includes("Historical") ? "HIST" : "RP";
}

export function rankLabel(branch: HostBranch, rank: HostRank | "None" | null): string {
  return !rank || rank === "None" ? `No ${branch} rank` : `${rank} ${branch} Host`;
}

export function parseBranches(raw: unknown): HostBranch[] {
  if (typeof raw !== "string") return [];
  const parts = raw.split(",").map((part) => part.trim().toUpperCase());
  return HOST_BRANCH_VALUES.filter((branch) => parts.includes(branch));
}
