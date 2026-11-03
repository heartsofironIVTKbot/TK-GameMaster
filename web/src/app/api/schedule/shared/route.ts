import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError } from "@/lib/scheduleStore";
import type { SharedCalendarResponse } from "@/lib/scheduleTypes";
import { listSharedCalendar } from "@/lib/sharedCalendar";

/**
 * GET /api/schedule/shared?from=<unix>&to=<unix>
 *
 * The Shared Calendar (lib/sharedCalendar.ts): the games of every server
 * that shares its calendar, between two UTC unix timestamps. Hosts only, and
 * only on a server that shares its own; otherwise `sharing` is false.
 */

const MAX_RANGE_SEC = 16 * 86_400;

export async function GET(request: NextRequest) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const params = request.nextUrl.searchParams;
  const from = Number(params.get("from"));
  const to = Number(params.get("to"));
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to - from > MAX_RANGE_SEC) {
    return Response.json({ error: "from/to must be a unix range of at most 16 days" }, { status: 400 });
  }

  try {
    const shared = await listSharedCalendar(from, to, status.host.discord_id);
    const body: SharedCalendarResponse = {
      ...shared,
      can_enable: status.host.is_staff,
      server_time: Math.floor(Date.now() / 1000),
    };
    return Response.json(body);
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[schedule/shared] GET failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
