import type { NextRequest } from "next/server";
import { liveHub, type LiveClient } from "@/lib/live/hub";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * GET /api/live?thread_id=<id>[&known=<lobby version>] — Server-Sent Events
 * for one game's map (lib/live/hub.ts):
 *
 *   lobby       the full lobby (same shape as GET /api/reserve) on every change,
 *               or {unchanged: true, version} when only the version rolled over
 *   selections  other players' selected nations [{user_id, name, avatar_url, tag}]
 *   viewers     {count}: people with this game's map open
 *   ping        keeps proxies from closing a quiet connection
 *
 * 204 = no live updates here (preview mode or the server is full): the map
 * keeps polling GET /api/reserve, as it does whenever this stream is down.
 */

const THREAD_RE = /^\d{10,25}$/;
/** A client this far behind (queued events) is dropped and reconnects fresh. */
const MAX_QUEUED = 200;

export async function GET(request: NextRequest) {
  const threadId = request.nextUrl.searchParams.get("thread_id") ?? "";
  if (!THREAD_RE.test(threadId)) return Response.json({ error: "thread_id is required" }, { status: 400 });
  if (isSchedulerDemo()) return new Response(null, { status: 204 });
  const known = request.nextUrl.searchParams.get("known");
  const session = await getSession().catch(() => null);

  const hub = liveHub();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string): boolean => {
        if (closed) return false;
        if ((controller.desiredSize ?? 0) < -MAX_QUEUED) return false;
        try {
          controller.enqueue(encoder.encode(text));
          return true;
        } catch {
          return false;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed by the browser
        }
      };
      const client: LiveClient = {
        id: hub.newClientId(),
        userId: session?.discord_id ?? null,
        send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        close,
      };
      write("retry: 3000\n: connected\n\n");
      unsubscribe = hub.subscribe(threadId, client, known);
      if (!unsubscribe) close();
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  if (closed) return new Response(null, { status: 204 });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: the server's gzip and proxies must not hold events back.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
