import { DatabaseConfigError } from "@/lib/db";
import { INLINE_IMAGE_TYPES } from "@/lib/ticketTypes";
import { ticketContext, ticketFile } from "@/lib/tickets";

/**
 * GET /api/tickets/<id>/files/<fileId> — a file posted in a ticket. Images
 * (png / jpg / gif / webp) may show inline; everything else (HTML, SVG, …)
 * always downloads, so a file can never run as a page on our site.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  try {
    const ctx = await ticketContext();
    if (!ctx) return Response.json({ error: "Log in with Discord first." }, { status: 401 });
    const file = await ticketFile(ctx, id, fileId);
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    const type = (file.contentType ?? "").split(";")[0].trim().toLowerCase();
    const inline = INLINE_IMAGE_TYPES.includes(type);
    const safeName = file.filename.replace(/[^\w.\- ()]+/g, "_").slice(0, 150) || "file";
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": inline ? type : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[tickets] file download failed:", error);
    return Response.json({ error: "Database unavailable — try again shortly." }, { status: 503 });
  }
}
