import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { getPlayerPortfolio } from "@/lib/playerProfile";

/**
 * GET /api/players/<discord_id>/portfolio
 *
 * The bot's /report for one player — career total, per-mode standings,
 * Merit / Hearts of Valor, active Dishonored restrictions and the latest 20
 * games. Hosts only (same roster as the Host Calendar).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) {
    return Response.json({ error: "Invalid player id" }, { status: 400 });
  }
  try {
    // ?fresh=1 right after a moderation action (skips the short cache).
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const portfolio = await getPlayerPortfolio(id, fresh);
    return Response.json({ portfolio }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[players] portfolio lookup failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
