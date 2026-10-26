/**
 * Host messages (formerly /dm and /dm_participants). Client-safe.
 *
 *  - host_dm       any host DMs one member from their Database record —
 *                  anonymous ("a Game Host") unless they sign it
 *                  (bot: _process_web_host_dm; kept in `host_messages`).
 *  - game_message  the game's host or Host Management DMs a game's players from
 *                  the Games page (bot: _process_web_game_message; runs in the
 *                  background, kept in the game's message_history).
 * Both go to the audit log channel.
 */

/** Mirrors HOST_MESSAGE_MAX_LEN in bot.py.py. */
export const HOST_MESSAGE_MAX_LEN = 2000;

/** POST /api/schedule/requests {action: "host_dm"}. */
export interface HostDmPayload {
  user_id: string;
  message: string;
  /** Show the sender's name instead of "a Game Host". */
  signed: boolean;
}

/** POST /api/schedule/requests {action: "game_message"}. */
export interface GameMessagePayload {
  thread_id: string;
  message: string;
  /** Who gets it (user ids); null = everyone in the game. */
  recipients: string[] | null;
}

/** While a game message is going out (request "running"). */
export interface GameMessageProgress {
  state: "running";
  sent: number;
  failed: number;
  total: number;
  started_at: number;
}

/** One message a host sent a member (newest first on the record). */
export interface HostMessageEntry {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  signed: boolean;
  delivered: boolean;
  created_at: number;
}

/** Someone a game message can reach (mirrors the bot's _game_message_recipients). */
export interface GameMessageRecipient {
  user_id: string;
  name: string;
  avatar_url: string | null;
  /** "Germany", "Italy (Co-op)", "Filler 1", "Draft pool". */
  label: string;
}

/** One message sent to a game's players (newest first). */
export interface GameMessageEntry {
  ts: number;
  by_name: string | null;
  text: string;
  sent: number;
  failed: number;
  total: number;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const SNOWFLAKE_RE = /^\d{5,25}$/;

function messageText(raw: unknown): Result<string> {
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > HOST_MESSAGE_MAX_LEN) return { ok: false, error: `Messages can be at most ${HOST_MESSAGE_MAX_LEN} characters.` };
  return { ok: true, value: text };
}

export function validateHostDm(raw: unknown): Result<HostDmPayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!SNOWFLAKE_RE.test(userId)) return { ok: false, error: "Pick who to message." };
  const message = messageText(body.message);
  if (!message.ok) return message;
  return { ok: true, value: { user_id: userId, message: message.value, signed: body.signed === true } };
}

export function validateGameMessage(raw: unknown): Result<GameMessagePayload> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const threadId = typeof body.thread_id === "string" ? body.thread_id.trim() : "";
  if (!SNOWFLAKE_RE.test(threadId)) return { ok: false, error: "Invalid game." };
  const message = messageText(body.message);
  if (!message.ok) return message;
  let recipients: string[] | null = null;
  if (body.recipients !== null && body.recipients !== undefined) {
    if (!Array.isArray(body.recipients) || body.recipients.some((id) => typeof id !== "string" || !SNOWFLAKE_RE.test(id))) {
      return { ok: false, error: "Invalid recipients." };
    }
    recipients = [...new Set(body.recipients as string[])];
    if (recipients.length === 0) return { ok: false, error: "Pick at least one player." };
    if (recipients.length > 300) return { ok: false, error: "Too many recipients." };
  }
  return { ok: true, value: { thread_id: threadId, message: message.value, recipients } };
}
