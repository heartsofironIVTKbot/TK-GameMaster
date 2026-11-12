import { DatabaseConfigError } from "@/lib/db";
import { holdRefusal } from "@/lib/live/holdRules";
import { liveHub } from "@/lib/live/hub";
import { getSession } from "@/lib/session";

/**
 * POST /api/live/select {thread_id, tag | null} — "I'm picking this
 * nation" (or no longer) on a game's map, shown to everyone else on it with
 * the player's name: a 30-second hold (lib/live/hub.ts). Answers the
 * SelectResult: holding (with the time left), held by someone else,
 * cooldown, or cleared — or `refused` (with why) for a nation the player
 * couldn't reserve anyway (locked, above their access level, …: no hold, so
 * they can't keep others off it). Logged-in players only; memory only.
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

  if (tag !== null) {
    let refusal: string | null;
    try {
      refusal = await holdRefusal(threadId, session.discord_id, tag);
    } catch (error) {
      if (!(error instanceof DatabaseConfigError)) console.error("[live/select] check failed:", error);
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }
    if (refusal) {
      // Not theirs to hold: drop whatever they held before, hold nothing.
      liveHub().select(threadId, { user_id: session.discord_id, name: "", tag: null });
      return Response.json({ status: "refused", message: refusal }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  const result = liveHub().select(threadId, {
    user_id: session.discord_id,
    name: session.ingame_nickname?.trim() || session.username,
    tag,
  });
  if (result.status === "limited") return Response.json({ error: "Too many updates" }, { status: 429 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
