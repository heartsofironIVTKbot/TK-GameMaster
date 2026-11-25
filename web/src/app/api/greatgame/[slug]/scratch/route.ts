import { viewerFor } from "@/lib/greatGame/access";
import { ggHub } from "@/lib/greatGame/hub";
import { getState, SLUG_RE } from "@/lib/greatGame/store";

/**
 * POST /api/greatgame/<event>/scratch {seq, line?: [x, y, ...], done?}
 * The captain whose vice-captain ticket was just drawn (or an organizer)
 * scratches it by hand: each batch of strokes (x, y in 0..1 of the scratch
 * area) goes out live to every page, and `done` once it is scratched clear.
 * Not saved; the draw itself already is.
 */
const SCRATCH_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404 });
  const state = await getState(slug).catch(() => null);
  if (!state) return Response.json({ error: "No such event." }, { status: 404 });
  const access = await viewerFor(state);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = (await request.json().catch(() => ({}))) as { seq?: unknown; line?: unknown; done?: unknown };
  const draw = state.last_draw;
  if (!draw || draw.kind !== "vice" || Number(body.seq) !== draw.seq) return Response.json({ ok: false });
  if (!access.viewer.organizer && access.viewer.captainOf !== draw.team) return Response.json({ ok: false });
  if (state.now - draw.at > SCRATCH_WINDOW_MS) return Response.json({ ok: false });
  const raw = Array.isArray(body.line) ? body.line.slice(0, 400) : [];
  const line = raw.every((n) => typeof n === "number" && Number.isFinite(n)) && raw.length % 2 === 0 ? raw.map((n) => Math.round(Math.min(1, Math.max(0, n as number)) * 1000) / 1000) : [];
  ggHub().scratch(slug, draw.seq, line.length ? line : null, body.done === true);
  return Response.json({ ok: true });
}
