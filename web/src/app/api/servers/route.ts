import { DatabaseConfigError } from "@/lib/db";
import { listServers } from "@/lib/serverSettings";

/**
 * GET /api/servers
 *
 * The servers the logged-in user can set GameMaster up in: ones they own or
 * admin (from Discord, needs "Connect your servers"), plus ones whose owner
 * let Host Management edit settings. Each shows whether the bot is in it and
 * whether setup is finished. See docs/server-setup.md.
 */
export async function GET() {
  try {
    return Response.json(await listServers(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ status: "unavailable", message: error.message });
    console.error("[servers] list failed:", error);
    return Response.json({ status: "unavailable", message: "The database is unavailable — try again shortly." });
  }
}
