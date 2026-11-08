import { casinoUp } from "@/lib/casinoStatus";
import { getHostStatus, hostStatusError } from "@/lib/hostAuth";

/** GET /api/casino/status — {up}: is tkcasino.online answering? (Hosts; the Games page's Casino card.) */
export async function GET() {
  const status = await getHostStatus();
  if (status.status !== "ok") return hostStatusError(status);
  return Response.json({ up: await casinoUp() }, { headers: { "Cache-Control": "no-store" } });
}
