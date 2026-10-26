import { connection } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";
import { SchedulerSetupError, listHosts } from "@/lib/scheduleStore";

/**
 * GET /api/schedule/hosts
 *
 * Every member with a Host role (the bot's web_host_roster) — the choices
 * when handing a game over to another host. Hosts only.
 */
export async function GET() {
  await connection();
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  try {
    return Response.json({ hosts: await listHosts() });
  } catch (error) {
    if (error instanceof DatabaseConfigError || error instanceof SchedulerSetupError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[schedule/hosts] GET failed:", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
