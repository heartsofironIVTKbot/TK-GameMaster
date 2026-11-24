import { viewerFor } from "@/lib/greatGame/access";
import { ggHub } from "@/lib/greatGame/hub";
import { getState, SLUG_RE } from "@/lib/greatGame/store";

/**
 * POST /api/greatgame/<event>/consider {tag}  ("" clears)
 * The captain on the clock (or an organizer) is looking at a nation: it glows
 * yellow on everyone's map. Not saved; only during bans and the draft.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404 });
  const state = await getState(slug).catch(() => null);
  if (!state) return Response.json({ error: "No such event." }, { status: 404 });
  const access = await viewerFor(state);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = (await request.json().catch(() => ({}))) as { tag?: unknown };
  const tag = typeof body.tag === "string" ? body.tag : "";
  const team = state.turn.team;
  if (!team || (state.phase !== "bans" && state.phase !== "draft")) return Response.json({ ok: false });
  if (!access.viewer.organizer && access.viewer.captainOf !== team) return Response.json({ ok: false });
  if (tag && !state.config.pool.includes(tag)) return Response.json({ ok: false });
  ggHub().consider(slug, team, tag, access.viewer.id);
  return Response.json({ ok: true });
}
