import { DatabaseConfigError } from "@/lib/db";
import { draftViewerIdentity } from "@/lib/draftStore";
import { isSystemAdmin, setServerBan, systemOverview } from "@/lib/systemAdmin";

/**
 * The system admin's view of every server using GameMaster (web /system).
 *
 * GET                               — every server, and the banned ones
 * POST {guild_id, banned, reason?}  — ban or unban a server (the bot leaves it within a minute)
 *
 * GameMaster's owners only (lib/systemAdmin.ts).
 */

const noStore = { "Cache-Control": "no-store" };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

async function admin() {
  const me = await draftViewerIdentity();
  if (!me) return { error: jsonError("Log in with Discord first.", 401) };
  if (!(await isSystemAdmin(me.user_id))) return { error: jsonError("Only GameMaster's owners can see this.", 403) };
  return { me };
}

export async function GET() {
  try {
    const check = await admin();
    if ("error" in check) return check.error;
    return Response.json(await systemOverview(), { headers: noStore });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return jsonError(error.message, 503);
    console.error("[system] GET failed:", error);
    return jsonError("Database unavailable — try again shortly.", 503);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const guildId = typeof body.guild_id === "string" ? body.guild_id.trim() : "";
  if (typeof body.banned !== "boolean") return jsonError("Say whether to ban or unban.", 400);
  const reason = typeof body.reason === "string" ? body.reason : null;
  try {
    const check = await admin();
    if ("error" in check) return check.error;
    const result = await setServerBan(guildId, body.banned, reason, { id: check.me.user_id, name: check.me.name });
    if (!result.ok) return jsonError(result.error, 400);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    if (error instanceof DatabaseConfigError) return jsonError(error.message, 503);
    console.error("[system] POST failed:", error);
    return jsonError("Database unavailable — try again shortly.", 503);
  }
}
