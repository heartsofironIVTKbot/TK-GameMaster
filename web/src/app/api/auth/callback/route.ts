import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { saveLoginProfile } from "@/lib/playerProfile";
import { createSession } from "@/lib/session";

/**
 * GET /api/auth/callback
 *
 * Discord redirects here after authorization. Exchanges the code for an
 * access token, fetches the user's identity from /users/@me, stores an
 * encrypted session cookie, and redirects back to the app root.
 */

const STATE_COOKIE = "gm_oauth_state";
/** Same-site return path saved by /api/auth/login?next=… */
const NEXT_COOKIE = "gm_oauth_next";

interface DiscordTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  /** Present when the bot was just added to a server (invite flow). */
  guild?: { id?: string };
}

interface DiscordUserResponse {
  id?: string;
  username?: string;
  avatar?: string | null;
  banner?: string | null;
  accent_color?: number | null;
}

function fail(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/?auth=error", request.url));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Verify the CSRF state cookie (consumed either way).
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  const nextPath = store.get(NEXT_COOKIE)?.value;
  store.delete(NEXT_COOKIE);
  const returnPath =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") && !nextPath.includes("\\")
      ? nextPath
      : "/";

  if (!code || !state || !expectedState || state !== expectedState) {
    // Cancelled on Discord's "Add to server" screen: back to the servers page.
    if (searchParams.get("error") === "access_denied" && state && state === expectedState) {
      return NextResponse.redirect(new URL("/servers?invite=cancelled", request.url));
    }
    return fail(request);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    console.error("[auth] Discord OAuth env vars are not configured");
    return fail(request);
  }

  let tokenData: DiscordTokenResponse;
  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) {
      console.error(`[auth] token exchange failed: HTTP ${tokenResponse.status}`);
      return fail(request);
    }
    tokenData = (await tokenResponse.json()) as DiscordTokenResponse;
  } catch (error) {
    console.error("[auth] token exchange request failed", error);
    return fail(request);
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) return fail(request);

  let profile: DiscordUserResponse;
  try {
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!userResponse.ok) {
      console.error(`[auth] /users/@me failed: HTTP ${userResponse.status}`);
      return fail(request);
    }
    profile = (await userResponse.json()) as DiscordUserResponse;
  } catch (error) {
    console.error("[auth] /users/@me request failed", error);
    return fail(request);
  }

  const discordId = profile.id;
  const username = profile.username;
  if (!discordId || !username) {
    console.error("[auth] /users/@me response missing id or username");
    return fail(request);
  }

  // Keep the token only when it can list servers (/servers page).
  const scopes = (tokenData.scope ?? "").split(/\s+/);
  const keepToken = scopes.includes("guilds");
  await createSession({
    discord_id: discordId,
    username,
    avatar: profile.avatar ?? null,
    banner: profile.banner ?? null,
    accent_color: profile.accent_color ?? null,
    access_token: keepToken ? accessToken : null,
    token_exp: keepToken ? Math.floor(Date.now() / 1000) + Math.max(60, Number(tokenData.expires_in) || 3600) : null,
  });
  // Other players' profile cards show this banner (bots can't read it).
  await saveLoginProfile(discordId, profile.banner ?? null, profile.accent_color ?? null);

  // The bot was just added: straight to that server's setup.
  const addedGuild = tokenData.guild?.id ?? searchParams.get("guild_id");
  if (addedGuild && /^\d{15,25}$/.test(addedGuild) && scopes.includes("bot")) {
    return NextResponse.redirect(new URL(`/servers?guild=${addedGuild}&added=1`, request.url));
  }
  return NextResponse.redirect(new URL(returnPath, request.url));
}
