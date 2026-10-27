import { parseAuditQuery, queryAudit } from "@/lib/auditLog";
import { AUDIT_EXPORT_MAX } from "@/lib/auditTypes";
import { currentGuildId } from "@/lib/currentGuild";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";

/** GET /api/audit/export — the same filters as /api/audit, as a CSV (up to 10 000 rows). Staff only. */

const COLUMNS = [
  "id", "time_utc", "category", "action", "actor_id", "actor_name",
  "target_id", "target_name", "game_id", "summary", "source", "details",
] as const;

function cell(value: unknown): string {
  let text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  // Spreadsheet apps run cells that start with these as formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

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
    const lines = [COLUMNS.join(",")];
    let before = query.before;
    let total = 0;
    while (total < AUDIT_EXPORT_MAX) {
      const page = await queryAudit(guildId, { ...query, before, limit: Math.min(1000, AUDIT_EXPORT_MAX - total) }, 1000);
      for (const event of page.events) {
        lines.push(
          [
            event.id,
            new Date(event.created_at * 1000).toISOString().replace("T", " ").slice(0, 19),
            event.category,
            event.action,
            event.actor_id,
            event.actor_name,
            event.target_id,
            event.target_name,
            event.game_id,
            event.summary,
            event.source,
            event.details,
          ]
            .map(cell)
            .join(","),
        );
      }
      total += page.events.length;
      if (!page.next_before) break;
      before = page.next_before;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gamemaster-audit-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[audit] export failed:", error);
    return Response.json({ error: "Database unavailable — try again shortly." }, { status: 503 });
  }
}
