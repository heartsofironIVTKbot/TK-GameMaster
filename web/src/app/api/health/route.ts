import { getPool } from "@/lib/db";

/**
 * GET /api/health — for uptime monitors and Render's health check: 200 when
 * the website runs and reaches the database, 503 otherwise. Never cached,
 * nothing private. Whether the bot is online is /api/status.
 */
export async function GET(request: Request) {
  void request.url; // request-time only (never prerendered)
  const headers = { "Cache-Control": "no-store" };
  const started = Date.now();
  try {
    await Promise.race([
      getPool().query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out after 5 s")), 5000)),
    ]);
    return Response.json({ ok: true, database: "ok", ms: Date.now() - started }, { headers });
  } catch (error) {
    console.error("[health] database check failed:", error);
    return Response.json({ ok: false, database: "unreachable" }, { status: 503, headers });
  }
}
