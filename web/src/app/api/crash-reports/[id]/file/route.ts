import { crashReportFile } from "@/lib/crashReports";
import { DatabaseConfigError } from "@/lib/db";
import { hostEntryOn } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * GET /api/crash-reports/<id>/file — a crash report's zip, for hosts and
 * staff of its server. Only kept when it was too big for the bot to attach in
 * Discord (the crash-report post links here instead).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return Response.json({ error: "Invalid report" }, { status: 400 });
  const session = await getSession();
  if (!session) return Response.json({ error: "Log in with Discord first." }, { status: 401 });
  try {
    const file = await crashReportFile(id);
    if (!file) return Response.json({ error: "That file isn't kept (it's attached to the post in Discord)." }, { status: 404 });
    if (!(await hostEntryOn(session.discord_id, file.guild_id))) {
      return Response.json({ error: "Only hosts and staff of that server can download crash reports." }, { status: 403 });
    }
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[crash-reports] file download failed:", error);
    return Response.json({ error: "Database unavailable — try again shortly." }, { status: 503 });
  }
}
