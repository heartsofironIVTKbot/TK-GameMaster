import type { NextRequest } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { mapAccessFor } from "@/lib/mapAccess";
import { gameGuildOf } from "@/lib/scheduleStore";
import { memberIsVip } from "@/lib/vipStatus";

/**
 * GET /api/games/vip?game=<thread id> → {vip}
 *
 * Is the signed-in viewer a VIP on this game's server: the map then offers
 * Reserve on nations locked "except VIPs" (the reserve route checks again).
 */
const THREAD_RE = /^\d{10,25}$/;

export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game") ?? "";
  if (!THREAD_RE.test(game)) return Response.json({ vip: false }, { status: 400 });
  try {
    const guildId = await gameGuildOf(game);
    if (guildId === null) return Response.json({ vip: false }, { status: 404 });
    const access = await mapAccessFor(guildId);
    if (!access.ok || !access.userId) return Response.json({ vip: false }, { headers: { "Cache-Control": "no-store" } });
    const vip = await memberIsVip(guildId, access.userId);
    return Response.json({ vip }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof DatabaseConfigError)) console.error("[games/vip] failed:", error);
    return Response.json({ vip: false }, { status: 503 });
  }
}
