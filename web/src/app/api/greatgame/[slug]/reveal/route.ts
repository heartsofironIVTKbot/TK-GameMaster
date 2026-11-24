import { viewerFor } from "@/lib/greatGame/access";
import { getState, revealSeed, SLUG_RE } from "@/lib/greatGame/store";

/** POST /api/greatgame/<event>/reveal: organizers publish the fairness seed once the teams are locked. */
export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404 });
  const state = await getState(slug).catch(() => null);
  if (!state) return Response.json({ error: "No such event." }, { status: 404 });
  const access = await viewerFor(state);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  if (!access.viewer.organizer) return Response.json({ error: "Only organizers can do that." }, { status: 403 });
  const result = await revealSeed(slug);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ state: result.state });
}
