import { readBotConfig } from "@/lib/currentGuild";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { lookupMembers } from "@/lib/memberDirectory";
import { demoRoleScanState } from "@/lib/memberRolesDemo";
import type { RoleScanResult, RoleScanState } from "@/lib/roleScanTypes";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * GET /api/database/role-scan
 *
 * The role check (formerly /scan): the last preview and the last applied run
 * (from the website or the daily 04:00 UTC run), as the bot saved them in
 * bot_config (web_role_scan_last, per server). Hosts can look; Host Management
 * run it with POST /api/schedule/requests {action: "role_scan", payload: {mode}}.
 */

function parse(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const value: unknown = JSON.parse(raw);
      return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export async function GET() {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  if (isSchedulerDemo()) return Response.json(demoRoleScanState(status.host.is_staff), { headers: { "Cache-Control": "no-store" } });
  try {
    let stored: unknown = null;
    try {
      stored = await readBotConfig(status.host.guild_id, "web_role_scan_last");
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "ER_NO_SUCH_TABLE") throw error;
    }
    const last = parse(stored);
    const result = (raw: unknown) => {
      const value = parse(raw);
      return typeof value.finished_at === "number" ? (value as unknown as RoleScanResult) : null;
    };
    const preview = result(last.preview);
    const apply = result(last.apply);
    const people = await lookupMembers([preview?.by, apply?.by].filter((id): id is string => Boolean(id)), status.host.guild_id);
    const named = (run: RoleScanResult | null) => {
      if (!run) return null;
      const person = run.by ? people.get(run.by) : undefined;
      return { ...run, by_name: person ? person.display_name || person.username : run.by ? `#${run.by}` : null };
    };
    const state: RoleScanState = { preview: named(preview), apply: named(apply), can_run: status.host.is_staff, daily_at_utc: "04:00" };
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[database/role-scan] failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
