import type { NextRequest } from "next/server";

/**
 * A page on this site, for redirects. Behind a host's proxy (Render),
 * request.url is the internal address (e.g. http://localhost:10000), so the
 * public origin comes from DISCORD_REDIRECT_URI — the address Discord already
 * sends the user back to.
 */
export function sitePage(path: string, request: NextRequest): URL {
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (redirectUri) {
    try {
      return new URL(path, new URL(redirectUri).origin);
    } catch {
      // Malformed env value: fall back to the request's own address.
    }
  }
  return new URL(path, request.url);
}
