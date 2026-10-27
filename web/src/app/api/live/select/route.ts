import { liveHub } from "@/lib/live/hub";
import { getSession } from "@/lib/session";

/**
 * POST /api/live/select {thread_id, tag | null} — "I'm looking at this
 * nation" (or no longer) on a game's map, shown to everyone else on it with
 * the player's name. Logged-in players only; memory only, never stored.
 * Also sent by navigator.sendBeacon when the page closes (text/plain body).
 */

const THREAD_RE = /^\d{10,25}$/;
const TAG_RE = /^[A-Z0-9]{2,8}$/;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Log in with Discord first" }, { status: 401 });

  type Body = { thread_id?: unknown; tag?: unknown } | null;
  let body: Body;
  try {
    body = JSON.parse(await request.text()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const threadId = typeof body?.thread_id === "string" ? body.thread_id : "";
  const tag = body?.tag === null ? null : typeof body?.tag === "string" ? body.tag : undefined;
  if (!THREAD_RE.test(threadId) || tag === undefined || (tag !== null && !TAG_RE.test(tag))) {
    return Response.json({ error: "thread_id and tag (a nation tag or null) are required" }, { status: 400 });
  }

  const accepted = liveHub().select(threadId, {
    user_id: session.discord_id,
    name: session.ingame_nickname?.trim() || session.username,
    avatar_url: session.avatar
      ? `https://cdn.discordapp.com/avatars/${session.discord_id}/${session.avatar}.png?size=64`
      : null,
    tag,
  });
  return accepted ? new Response(null, { status: 204 }) : Response.json({ error: "Too many updates" }, { status: 429 });
}
