import { connection } from "next/server";
import { getHostStatus } from "@/lib/hostAuth";

/**
 * GET /api/schedule/me
 *
 * Whether the visitor may use the host calendar: ok (with the host
 * profile), anonymous (needs Discord login), not_host, or unavailable
 * (database / bot not ready). Always 200 — the page renders each state.
 */
export async function GET() {
  await connection();
  return Response.json(await getHostStatus());
}
