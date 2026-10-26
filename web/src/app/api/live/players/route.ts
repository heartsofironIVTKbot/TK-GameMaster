import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { searchMembers } from "@/lib/memberDirectory";
import { SchedulerSetupError, gameGuildOf, hostEntryOn } from "@/lib/scheduleStore";

const THREAD_RE = /^\d{10,25}$/;

/**
 * GET /api/live/players?q=<name or id>[&thread_id=<game>]
 *
 * Server members matching a username, display name, in-game nickname or
 * Discord id — the live map's host tools drag them onto nations. Hosts only.
 * Searches the given game's server (when the viewer hosts there), else the
 * server the host pages are on.
 */
export async function GET(request: NextRequest) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const threadId = params.get("thread_id") ?? "";
  try {
    let guildId = status.host.guild_id;
    const gameGuild = THREAD_RE.test(threadId) ? await gameGuildOf(threadId) : null;
    if (gameGuild && gameGuild !== guildId && (await hostEntryOn(status.host.discord_id, gameGuild))) guildId = gameGuild;
    return Response.json({ players: await searchMembers(query, guildId) });
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[live/players] GET failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
