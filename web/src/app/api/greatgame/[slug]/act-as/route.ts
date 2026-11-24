import { cookies } from "next/headers";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * POST /api/greatgame/<event>/act-as {id}: preview mode only (next dev with
 * SCHEDULER_DEMO=1). Switches which roster person you are, to try the page as
 * a captain, a recruit, a caster or an organizer. 404 everywhere else.
 */
export async function POST(request: Request) {
  if (!isSchedulerDemo()) return new Response(null, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const jar = await cookies();
  if (id) jar.set("gg_as", id, { path: "/", httpOnly: true, sameSite: "lax" });
  else jar.delete("gg_as");
  return Response.json({ ok: true });
}
