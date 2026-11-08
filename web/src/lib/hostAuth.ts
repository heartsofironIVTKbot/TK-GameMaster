import { DatabaseConfigError } from "@/lib/db";
import { HOST_BRANCH_VALUES, type HostBranch, type HostRank } from "@/lib/hostBranches";
import { hostRanksOf, memberRoleIds } from "@/lib/playerProfile";
import { getSession } from "@/lib/session";
import { currentGuildId, hostServersOf, isHomeGuild } from "@/lib/currentGuild";
import { settingsOf } from "@/lib/serverSettings";
import { disabledModes, type ServerSettings } from "@/lib/serverSettingsTypes";
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
    const settings = await settingsOf(guildId);
    return {
      status: "ok",
      host: {
        ...DEMO_HOST,
        guild_id: guildId,
        home_server: isHomeGuild(guildId),
        servers: await hostServersOf(DEMO_HOST.discord_id),
        disabled_modes: disabledModes(settings),
        booking_days: bookingDays(settings, DEMO_HOST.is_staff, null),
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
    // Senior Host rates the branch they're Senior in (with Senior switched
    // off, a Full Host does when Full hosts take over Senior host powers).
    const settings = await settingsOf(guildId);
    const ranks = entry.is_staff ? null : await hostRanksOf(await memberRoleIds(session.discord_id));
    const ratingRank = (branch: HostBranch) => {
      const config = settings?.branches[branch];
      if (!config || config.ranks_on.Senior) return "Senior";
      return config.full_takes_senior ? "Full" : null;
    };
    const rateBranches: HostBranch[] = entry.is_staff
      ? [...HOST_BRANCH_VALUES]
      : HOST_BRANCH_VALUES.filter((branch) => {
          const needed = ratingRank(branch);
          return Boolean(needed && ranks?.[branch] === needed);
        });
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
      disabled_modes: disabledModes(settings),
      booking_days: bookingDays(settings, entry.is_staff, ranks),
      guild_id: guildId,
      home_server: isHomeGuild(guildId),
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

/**
 * How far ahead this host may schedule (mirrors the bot's _booking_window_error):
 * by their rank in each branch, no rank counting as Assistant; staff no limit.
 * Roles not mirrored yet (ranks null): no limit here, the bot still checks live roles.
 */
function bookingDays(
  settings: ServerSettings | null,
  isStaff: boolean,
  ranks: Record<HostBranch, HostRank | null> | null,
): HostProfile["booking_days"] {
  if (!settings?.features.booking_limits) return null;
  const days = (branch: HostBranch) => {
    if (isStaff || !ranks) return null;
    const rank = ranks?.[branch] ?? "Assistant";
    return settings.rules[rank === "Senior" ? "book_days_senior" : rank === "Full" ? "book_days_full" : "book_days_assistant"];
  };
  return { RP: days("RP"), HIST: days("HIST") };
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
