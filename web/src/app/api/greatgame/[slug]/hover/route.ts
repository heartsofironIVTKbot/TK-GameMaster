import { viewerFor } from "@/lib/greatGame/access";
import { ggHub } from "@/lib/greatGame/hub";
import { getState, SLUG_RE } from "@/lib/greatGame/store";

/**
 * POST /api/greatgame/<event>/hover {card}  (null: none)
 * Step 4: the captain on the clock (or an organizer) points at one of the
 * face-down recruit cards; it lifts on every page. Not saved.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404 });
  const state = await getState(slug).catch(() => null);
  if (!state) return Response.json({ error: "No such event." }, { status: 404 });
  const access = await viewerFor(state);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = (await request.json().catch(() => ({}))) as { card?: unknown };
  const team = state.turn.team;
  if (!team || state.phase !== "recruits") return Response.json({ ok: false });
  if (!access.viewer.organizer && access.viewer.captainOf !== team) return Response.json({ ok: false });
  const card = Number.isInteger(body.card) && Number(body.card) >= 0 && Number(body.card) < 100 ? Number(body.card) : null;
  ggHub().hover(slug, team, card);
  return Response.json({ ok: true });
}
