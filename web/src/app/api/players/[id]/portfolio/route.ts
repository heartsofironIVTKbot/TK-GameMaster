import { hostServersOf } from "@/lib/currentGuild";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { getPlayerPortfolio } from "@/lib/playerProfile";
import { gameGuildOf, isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * GET /api/players/<discord_id>/portfolio[?game=<thread id>]
 *
 * The bot's /report for one player — career total, per-mode standings,
 * Merit / Hearts of Valor, active Dishonored restrictions and the latest 20
 * games. Hosts only (same roster as the Host Calendar).
 *
 * `game` (the map's player card): that game's server's record, for hosts of
 * that server; never another server's (the host pages' switcher used to
 * decide, so a test server's game showed TommyKay's commends). Without it,
 * the host pages' server.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) {
    return Response.json({ error: "Invalid player id" }, { status: 400 });
  }
  const url = new URL(request.url);
  const game = url.searchParams.get("game") ?? "";
  try {
    let guildId: string | undefined;
    if (/^\d{5,25}$/.test(game)) {
      guildId = (await gameGuildOf(game)) ?? undefined;
      if (!guildId) return Response.json({ error: "That game no longer exists." }, { status: 404 });
      if (!isSchedulerDemo()) {
        const session = await getSession();
        if (!session) return Response.json({ error: "Log in with Discord first." }, { status: 401 });
        const servers = await hostServersOf(session.discord_id);
        if (!servers.some((server) => server.id === guildId)) {
          return Response.json({ error: "Only that game's server's hosts can see portfolios." }, { status: 403 });
        }
      }
    } else {
      const status = await getHostStatus();
      if (status.status !== "ok") return hostStatusError(status);
    }
    // ?fresh=1 right after a moderation action (skips the short cache).
    const fresh = url.searchParams.get("fresh") === "1";
    const portfolio = await getPlayerPortfolio(id, fresh, guildId);
    return Response.json({ portfolio }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[players] portfolio lookup failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
