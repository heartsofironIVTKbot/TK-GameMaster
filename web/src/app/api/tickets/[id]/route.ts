import { DatabaseConfigError } from "@/lib/db";
import { getTicket, ticketContext } from "@/lib/tickets";

/** GET /api/tickets/<id> — one closed ticket's transcript. 404 when it's not yours to see (we don't say it exists). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await ticketContext();
    if (!ctx) return Response.json({ error: "Log in with Discord first." }, { status: 401 });
    const detail = await getTicket(ctx, id);
    if (!detail) return Response.json({ error: "Ticket not found." }, { status: 404 });
    return Response.json(detail, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[tickets] read failed:", error);
    return Response.json({ error: "Database unavailable — try again shortly." }, { status: 503 });
  }
}
