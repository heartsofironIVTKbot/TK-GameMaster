import { publicStatus } from "@/lib/botStatus";
import { DatabaseConfigError } from "@/lib/db";

/**
 * GET /api/status — public: is GameMaster online, 30-day uptime and recent
 * incidents (the /status page). No server names or anything private.
 */
export async function GET(request: Request) {
  void request.url; // request-time only (never prerendered)
  try {
    return Response.json(await publicStatus(), { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[status] failed:", error);
    return Response.json({ error: "Status is unavailable right now." }, { status: 503 });
  }
}
