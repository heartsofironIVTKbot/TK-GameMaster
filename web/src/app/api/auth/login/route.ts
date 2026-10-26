import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { invitePermissions } from "@/lib/serverSettingsTypes";

/**
 * GET /api/auth/login[?next=/schedule][&servers=1 | &invite=1[&guild_id=…]]
 *
 * Starts the Discord OAuth2 authorization-code flow (scope: identify).
 * servers=1 also asks for the user's server list (the /servers page);
 * invite=1 adds GameMaster to a server with the permissions it needs
 * (serverSettingsTypes REQUIRED_PERMISSIONS) and logs in at the same time.
 * A one-time `state` token is stored in a short-lived cookie and verified
 * by the callback to prevent CSRF login attacks. `next` (a same-site path)
 * is where the callback returns the user afterwards.
 */

const STATE_COOKIE = "gm_oauth_state";
const NEXT_COOKIE = "gm_oauth_next";

/** Only same-site absolute paths ("/schedule"), never "//evil.com" or URLs. */
function safeNextPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value.slice(0, 512);
}

export async function GET(request: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Discord OAuth is not configured — set DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI (see web/.env.example)",
      },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (nextPath) {
    store.set(NEXT_COOKIE, nextPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  } else {
    store.delete(NEXT_COOKIE);
  }

  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const params = request.nextUrl.searchParams;
  if (params.get("invite") === "1") {
    // Add the bot (and log in) in one go; Discord sends the server back to the callback.
    authorizeUrl.searchParams.set("scope", "identify guilds bot applications.commands");
    authorizeUrl.searchParams.set("permissions", invitePermissions());
    const guildId = params.get("guild_id");
    if (guildId && /^\d{15,25}$/.test(guildId)) {
      authorizeUrl.searchParams.set("guild_id", guildId);
      authorizeUrl.searchParams.set("disable_guild_select", "true");
    }
  } else if (params.get("servers") === "1") {
    // "Connect your servers": also list the servers you own or admin.
    authorizeUrl.searchParams.set("scope", "identify guilds");
  } else {
    authorizeUrl.searchParams.set("scope", "identify");
  }

  return NextResponse.redirect(authorizeUrl.toString());
}
