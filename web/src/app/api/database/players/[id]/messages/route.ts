import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { listHostMessages } from "@/lib/hostMessages";

/**
 * GET /api/database/players/<discord_id>/messages
 *
 * Messages hosts sent this member from the Database page (formerly /dm),
 * newest first, with who sent them and whether they arrived. Hosts only —
 * the same messages are in the audit log channel. Sending is
 * POST /api/schedule/requests {action: "host_dm"}.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  const { id } = await params;
  if (!/^\d{15,25}$/.test(id)) return Response.json({ error: "Invalid player id" }, { status: 400 });
  try {
    const messages = await listHostMessages(id);
    return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[database/messages] lookup failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
