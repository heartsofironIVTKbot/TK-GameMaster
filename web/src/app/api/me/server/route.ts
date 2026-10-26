import { cookies } from "next/headers";
import { DatabaseConfigError } from "@/lib/db";
import { GUILD_COOKIE, hostServersOf } from "@/lib/currentGuild";
import { DEMO_HOST, isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * POST /api/me/server  {guild_id}
 *
 * The header's server switcher: the host pages (calendar, games, database,
 * attendance, presets) work on this server from now on. Only servers the
 * viewer hosts in are accepted. Sets the `gm_guild` cookie.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { guild_id?: unknown } | null;
  const guildId = typeof body?.guild_id === "string" ? body.guild_id : "";
  if (!/^\d{15,25}$/.test(guildId)) return Response.json({ error: "Invalid server." }, { status: 400 });
  const userId = isSchedulerDemo() ? DEMO_HOST.discord_id : (await getSession())?.discord_id;
  if (!userId) return Response.json({ error: "Log in with Discord first." }, { status: 401 });
  try {
    const servers = await hostServersOf(userId);
    if (!servers.some((server) => server.id === guildId)) {
      return Response.json({ error: "You're not a host on that server." }, { status: 403 });
    }
  } catch (error) {
    if (error instanceof DatabaseConfigError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[me/server] lookup failed:", error);
    return Response.json({ error: "The database is unavailable — try again shortly." }, { status: 503 });
  }
  (await cookies()).set(GUILD_COOKIE, guildId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ ok: true, guild_id: guildId });
}
