import { auditCategoryCounts, parseAuditQuery, queryAudit } from "@/lib/auditLog";
import { currentGuildId } from "@/lib/currentGuild";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";

/**
 * GET /api/audit — the audit trail for the current server, newest first.
 * Host Management and server admins only. Filters: category, action, actor,
 * target, game, q (text in the summary), from / to (unix seconds); paging
 * with before=<id> (the last page's next_before) and limit (≤ 200).
 */
export async function GET(request: Request) {
  const status = await getHostStatus();
  if (status.status !== "ok") {
    if (status.status === "not_host") {
      return Response.json({ error: "Only Host Management can see the audit log." }, { status: 403 });
    }
    return hostStatusError(status);
  }
  if (!status.host.is_staff) {
    return Response.json({ error: "Only Host Management can see the audit log." }, { status: 403 });
  }
  try {
    const guildId = await currentGuildId();
    const query = parseAuditQuery(new URL(request.url).searchParams);
    const page = await queryAudit(guildId, query);
    if (!query.before) page.counts = await auditCategoryCounts(guildId);
    return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[audit] read failed:", error);
    return Response.json({ error: "Database unavailable — try again shortly." }, { status: 503 });
  }
}
