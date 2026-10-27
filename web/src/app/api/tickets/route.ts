import { DatabaseConfigError } from "@/lib/db";
import { TICKET_KINDS } from "@/lib/ticketAccess";
import { listTickets, ticketContext } from "@/lib/tickets";

/**
 * GET /api/tickets?kind=&status=&q=&before= — closed tickets the viewer may
 * read (their own, plus the kinds their roles handle, in every server they're
 * in). Paged: pass next_before back as before.
 */
export async function GET(request: Request) {
  try {
    const ctx = await ticketContext();
    if (!ctx) return Response.json({ error: "Log in with Discord first." }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") ?? "";
    const status = params.get("status") ?? "";
    const page = await listTickets(ctx, {
      kind: kind in TICKET_KINDS ? kind : undefined,
      status: status === "Resolved" || status === "Unresolved" ? status : undefined,
      q: (params.get("q") ?? "").slice(0, 80),
      before: params.get("before") ?? undefined,
    });
    return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[tickets] list failed:", error);
    return Response.json({ error: "Database unavailable — try again shortly." }, { status: 503 });
  }
}
