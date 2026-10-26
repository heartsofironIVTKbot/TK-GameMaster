import { cookies } from "next/headers";
import crypto from "node:crypto";

/**
 * Encrypted, HTTP-only session cookie for the Discord OAuth2 login.
 *
 * The payload (discord_id / username / avatar / expiry) is serialized to
 * JSON and sealed with AES-256-GCM using a key derived from SESSION_SECRET,
 * so clients can neither read nor forge sessions.
 */

export interface SessionUser {
  discord_id: string;
  username: string;
  avatar: string | null;
  /** Discord profile banner hash (CDN: /banners/{id}/{banner}.png). */
  banner?: string | null;
  /** Discord accent color (integer) used as the banner gradient fallback. */
  accent_color?: number | null;
  /** HOI4 in-game nickname, saved via /api/auth/nickname. */
  ingame_nickname?: string | null;
  /**
   * Discord OAuth token with the `guilds` scope — only after "Connect your
   * servers" (/servers): lists the servers you own or admin. Sealed in the
   * cookie like everything else, never sent to the browser.
   */
  access_token?: string | null;
  /** When access_token expires (epoch seconds). */
  token_exp?: number | null;
}

const COOKIE_NAME = "gm_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function secretKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured (see web/.env.example)");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function seal(plaintext: string): string {
  const key = secretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function unseal(token: string): string | null {
  try {
    const key = secretKey();
    const data = Buffer.from(token, "base64url");
    if (data.length < IV_LENGTH + TAG_LENGTH) return null;
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

/** The session as the browser may see it (never the Discord token). */
export function publicSessionUser(user: SessionUser): Omit<SessionUser, "access_token" | "token_exp"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { access_token, token_exp, ...rest } = user;
  return rest;
}

export async function createSession(user: SessionUser): Promise<void> {
  const payload = JSON.stringify({
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  });
  const store = await cookies();
  store.set(COOKIE_NAME, seal(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const plaintext = unseal(token);
  if (!plaintext) return null;

  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.exp !== "number" || record.exp < Date.now() / 1000) {
      return null;
    }
    if (typeof record.discord_id !== "string" || !record.discord_id) return null;
    if (typeof record.username !== "string" || !record.username) return null;
    return {
      discord_id: record.discord_id,
      username: record.username,
      avatar: typeof record.avatar === "string" ? record.avatar : null,
      banner: typeof record.banner === "string" ? record.banner : null,
      accent_color:
        typeof record.accent_color === "number" ? record.accent_color : null,
      ingame_nickname:
        typeof record.ingame_nickname === "string"
          ? record.ingame_nickname
          : null,
      access_token: typeof record.access_token === "string" ? record.access_token : null,
      token_exp: typeof record.token_exp === "number" ? record.token_exp : null,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
