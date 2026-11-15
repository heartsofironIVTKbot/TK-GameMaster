import { casinoRolls } from "@/lib/casinoEntry";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus } from "@/lib/hostAuth";
import { DEMO_HOST, isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * GET /api/casino/<game>/rolls — everyone's Casino rolls in a game (who has
 * finished, who stopped where) for its host, co-hosts and Host Management
 * (lib/casinoEntry.ts casinoRolls).
 */
const GAME_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!GAME_KEY_RE.test(game)) return Response.json({ status: "denied", message: "Not a game." }, { status: 400 });
  const viewerId = isSchedulerDemo() ? DEMO_HOST.discord_id : (await getSession().catch(() => null))?.discord_id;
  if (!viewerId) return Response.json({ status: "denied", message: "Log in first." }, { status: 401 });
  try {
    const status = await getHostStatus();
    const host = status.status === "ok" ? status.host : null;
    const rolls = await casinoRolls(game, { id: viewerId, isStaff: Boolean(host?.is_staff), guildId: host?.guild_id ?? null });
    return Response.json(rolls, { status: rolls.status === "ok" ? 200 : 403, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ status: "denied", message: error.message }, { status: 503 });
    console.error("[casino] rolls failed:", error);
    return Response.json({ status: "denied", message: "GameMaster couldn't get the rolls just now. Try again in a moment." }, { status: 503 });
  }
}
