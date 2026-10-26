import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { moderationOptions } from "@/lib/playerIndex";

/**
 * GET /api/database/options
 *
 * The bot's Dishonored nation lists per mode — the exact names its engine
 * validates (published into bot_config at bot startup). `options: null`
 * until the bot has run with the Database update. Hosts only.
 */
export async function GET() {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  try {
    return Response.json({ options: await moderationOptions() }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[database/options] failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
