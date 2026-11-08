import { casinoReceipt } from "@/lib/casinoEntry";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus } from "@/lib/hostAuth";
import { DEMO_HOST, isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * GET /api/casino/<game>/receipt/<user> — a player's Casino receipt link for
 * the game's host, its co-hosts and Host Management (lib/casinoEntry.ts):
 * {status: "ok", url, finished} or {status: "denied", message}.
 */
const GAME_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const USER_RE = /^\d{15,25}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ game: string; user: string }> }) {
  const { game, user } = await params;
  if (!GAME_KEY_RE.test(game) || !USER_RE.test(user)) return Response.json({ status: "denied", message: "Not a player in a game." }, { status: 400 });
  const viewerId = isSchedulerDemo() ? DEMO_HOST.discord_id : (await getSession().catch(() => null))?.discord_id;
  if (!viewerId) return Response.json({ status: "denied", message: "Log in first." }, { status: 401 });
  try {
    const status = await getHostStatus();
    const host = status.status === "ok" ? status.host : null;
    const receipt = await casinoReceipt(game, { id: viewerId, isStaff: Boolean(host?.is_staff), guildId: host?.guild_id ?? null }, user);
    return Response.json(receipt, { status: receipt.status === "ok" ? 200 : 403, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ status: "denied", message: error.message }, { status: 503 });
    console.error("[casino] receipt failed:", error);
    return Response.json({ status: "denied", message: "GameMaster couldn't get the receipt just now. Try again in a moment." }, { status: 503 });
  }
}
