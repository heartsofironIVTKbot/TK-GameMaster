import { DatabaseConfigError } from "@/lib/db";
import { HOST_BRANCH_VALUES, type HostBranch } from "@/lib/hostBranches";
import { hostRanksOf, memberRoleIds } from "@/lib/playerProfile";
import { getSession } from "@/lib/session";
import { currentGuildId, hostServersOf } from "@/lib/currentGuild";
import { settingsOf } from "@/lib/serverSettings";
import { disabledModes } from "@/lib/serverSettingsTypes";
import {
  DEMO_HOST,
  SchedulerSetupError,
  getHostRosterEntry,
  isSchedulerDemo,
} from "@/lib/scheduleStore";
import type { HostProfile, HostStatusResponse } from "@/lib/scheduleTypes";

/**
 * Who may use the host calendar: a Discord-OAuth session whose user is on
 * the bot-maintained web_host_roster (the same rules as the bot's is_host():
 * server admins + ALLOWED_HOST_ROLES). The bot re-checks live member roles
 * when it applies each request, so a stale roster can never schedule games
 * for someone who lost the role.
 */
export async function getHostStatus(): Promise<HostStatusResponse> {
  if (isSchedulerDemo()) {
    const guildId = await currentGuildId();
    return {
      status: "ok",
      host: {
        ...DEMO_HOST,
        guild_id: guildId,
        servers: await hostServersOf(DEMO_HOST.discord_id),
        disabled_modes: disabledModes(await settingsOf(guildId)),
      },
    };
  }

  const session = await getSession();
  if (!session) return { status: "anonymous" };

  try {
    // Host pages work on one server at a time (the header's server switcher).
    const guildId = await currentGuildId();
    const entry = await getHostRosterEntry(session.discord_id, guildId);
    if (!entry) return { status: "not_host", username: session.username };
    // Same rule as the bot's _can_rate_hosts(): staff rate both branches, a
    // Senior Host rates the branch they're Senior in.
    const ranks = entry.is_staff ? null : await hostRanksOf(await memberRoleIds(session.discord_id));
    const rateBranches: HostBranch[] = entry.is_staff
      ? [...HOST_BRANCH_VALUES]
      : HOST_BRANCH_VALUES.filter((branch) => ranks?.[branch] === "Senior");
    // Before the bot reports branches, fall back to the member's rank roles.
    const branches: HostBranch[] = entry.is_staff
      ? [...HOST_BRANCH_VALUES]
      : entry.branches.length > 0
        ? entry.branches
        : HOST_BRANCH_VALUES.filter((branch) => ranks?.[branch]);
    const host: HostProfile = {
      discord_id: session.discord_id,
      username: session.username,
      display_name: entry.display_name,
      avatar: session.avatar,
      is_staff: entry.is_staff,
      can_rate_hosts: rateBranches.length > 0,
      rate_branches: rateBranches,
      branches,
      disabled_modes: disabledModes(await settingsOf(guildId)),
      guild_id: guildId,
      servers: await hostServersOf(session.discord_id),
      demo: false,
    };
    return { status: "ok", host };
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return { status: "unavailable", message: error.message };
    }
    console.error("[schedule] host roster lookup failed:", error);
    return { status: "unavailable", message: "The database is unavailable — try again shortly." };
  }
}

/** JSON error for a non-host status (used by every calendar API route). */
export function hostStatusError(status: Exclude<HostStatusResponse, { status: "ok" }>) {
  switch (status.status) {
    case "anonymous":
      return Response.json({ error: "Log in with Discord first." }, { status: 401 });
    case "not_host":
      return Response.json(
        { error: "Only members with a Host role can use the calendar." },
        { status: 403 },
      );
    default:
      return Response.json({ error: status.message }, { status: 503 });
  }
}
