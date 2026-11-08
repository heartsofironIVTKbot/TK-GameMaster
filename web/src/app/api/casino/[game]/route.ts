import { casinoEntry } from "@/lib/casinoEntry";
import { DatabaseConfigError } from "@/lib/db";
import { DEMO_HOST, isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * GET /api/casino/<game> — the signed-in player's way into the Casino for
 * one game (lib/casinoEntry.ts): {status: "ok", url} with a one-time Casino
 * link (or a resume / receipt link), {status: "login"} when they aren't
 * signed in, {status: "not_casino", map_url}, or {status: "denied", ...} with why.
 * The /casino/<game> page calls it; each call writes a fresh link.
 */
const GAME_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!GAME_KEY_RE.test(game)) return Response.json({ status: "denied", title: "Not a game", message: "This link isn't a game.", map_url: null }, { status: 400 });
  const user = isSchedulerDemo()
    ? { discord_id: DEMO_HOST.discord_id, username: DEMO_HOST.username }
    : await getSession().catch(() => null);
  if (!user) return Response.json({ status: "login" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const entry = await casinoEntry(game, user.discord_id, user.username);
    return Response.json(entry, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return Response.json({ status: "denied", title: "GameMaster is busy", message: error.message, map_url: null }, { status: 503 });
    }
    console.error("[casino] entry failed:", error);
    return Response.json(
      { status: "denied", title: "Something went wrong", message: "GameMaster couldn't open the Casino just now. Try again in a moment.", map_url: null },
      { status: 503 },
    );
  }
}
