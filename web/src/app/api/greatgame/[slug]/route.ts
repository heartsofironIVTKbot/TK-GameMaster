import { DatabaseConfigError } from "@/lib/db";
import { actorOf, viewerFor } from "@/lib/greatGame/access";
import { avatarsFor } from "@/lib/greatGame/avatars";
import { act, getState, SLUG_RE } from "@/lib/greatGame/store";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/**
 * GET  /api/greatgame/<event>   the event (state) and who you are to it
 * POST /api/greatgame/<event>   one action: {kind, ...fields, reason?}
 *                               (lib/greatGame/decide.ts says who may do what)
 *
 * Private: only the event's roster and GameMaster's owners (access.ts).
 */

const headers = { "Cache-Control": "private, no-store" };

function failure(error: unknown) {
  if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503, headers });
  console.error("[greatgame] request failed:", error);
  return Response.json({ error: "The draft is unavailable right now. Try again in a moment." }, { status: 503, headers });
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404, headers });
  try {
    const state = await getState(slug);
    if (!state) return Response.json({ error: "No such event." }, { status: 404, headers });
    const access = await viewerFor(state);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status, headers });
    const avatars = await avatarsFor(slug, state.config);
    return Response.json({ state, viewer: access.viewer, demo: isSchedulerDemo(), avatars }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404, headers });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad body");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send the action as JSON." }, { status: 400, headers });
  }
  try {
    const state = await getState(slug);
    if (!state) return Response.json({ error: "No such event." }, { status: 404, headers });
    const access = await viewerFor(state);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status, headers });
    if (access.viewer.role === "caster" || access.viewer.role === "vice" || access.viewer.role === "recruit") {
      if (!access.viewer.organizer && !access.viewer.captainOf) {
        return Response.json({ error: "You're watching this draft: only captains and organizers act." }, { status: 403, headers });
      }
    }
    const result = await act(slug, actorOf(access.viewer), body);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers });
    return Response.json({ action: result.action, state: result.state }, { headers });
  } catch (error) {
    return failure(error);
  }
}
