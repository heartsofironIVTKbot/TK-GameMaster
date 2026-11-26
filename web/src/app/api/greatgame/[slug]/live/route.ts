import { viewerFor } from "@/lib/greatGame/access";
import { ggHub, type GGClient } from "@/lib/greatGame/hub";
import { getState, SLUG_RE } from "@/lib/greatGame/store";

/**
 * GET /api/greatgame/<event>/live: Server-Sent Events for one event
 * (lib/greatGame/hub.ts):
 *
 *   state        the whole event, on connect and after every change
 *   considering  {team: {tag, by, at} | null}: the yellow glows
 *   viewers      {count}: pages open
 *   ping         keeps proxies from closing a quiet connection
 */

const MAX_QUEUED = 200;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "No such event." }, { status: 404 });
  const state = await getState(slug).catch(() => null);
  if (!state) return Response.json({ error: "No such event." }, { status: 404 });
  const access = await viewerFor(state);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const hub = ggHub();
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
      const client: GGClient = { id: hub.newClientId(), send: write, close, viewer: access.viewer.id, owner: access.viewer.owner };
      write("retry: 2000\n: connected\n\n");
      void hub.subscribe(slug, client).then((stop) => {
        if (closed) stop();
        else unsubscribe = stop;
      });
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
