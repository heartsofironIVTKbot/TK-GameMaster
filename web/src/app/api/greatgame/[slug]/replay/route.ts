import { DatabaseConfigError } from "@/lib/db";
import { viewerFor } from "@/lib/greatGame/access";
import { avatarsFor } from "@/lib/greatGame/avatars";
import { getReplay, getState, SLUG_RE } from "@/lib/greatGame/store";

/**
 * GET /api/greatgame/<event>/replay: everything the replay page needs to
 * rebuild the night move by move in the browser (the event's setup as
 * created, the whole log, the fairness fingerprint and, once revealed, the
 * seed). Same access as the draft room: the roster and GameMaster's owners.
 */

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404, headers });
  try {
    const state = await getState(slug);
    const replay = await getReplay(slug);
    if (!state || !replay) return Response.json({ error: "No such event." }, { status: 404, headers });
    const access = await viewerFor(state);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status, headers });
    const avatars = await avatarsFor(slug, state.config);
    return Response.json({ slug, ...replay, viewer: access.viewer, avatars, now: Date.now() }, { headers });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503, headers });
    console.error("[greatgame] replay failed:", error);
    return Response.json({ error: "The replay is unavailable right now. Try again in a moment." }, { status: 503, headers });
  }
}
