import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError, listCalendar, listRequests } from "@/lib/scheduleStore";
import type { CalendarResponse } from "@/lib/scheduleTypes";

/**
 * GET /api/schedule/calendar?from=<unix>&to=<unix>
 *
 * Games on the schedule board between two UTC unix timestamps (seconds),
 * every staff day lock, and the caller's recent web requests (pending ones
 * show as "sending" chips). Hosts only.
 */

const MAX_RANGE_SEC = 70 * 86_400;
const RECENT_REQUESTS_SEC = 3600;

export async function GET(request: NextRequest) {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);

  const params = request.nextUrl.searchParams;
  const from = Number(params.get("from"));
  const to = Number(params.get("to"));
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to - from > MAX_RANGE_SEC) {
    return Response.json({ error: "from/to must be a unix range of at most 70 days" }, { status: 400 });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const [{ slots, locks }, requests] = await Promise.all([
      listCalendar(from, to, status.host.discord_id),
      listRequests(status.host.discord_id, now - RECENT_REQUESTS_SEC),
    ]);
    const body: CalendarResponse = { slots, locks, requests, server_time: now };
    return Response.json(body);
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[schedule/calendar] GET failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
