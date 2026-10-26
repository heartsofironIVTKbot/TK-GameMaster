import type { RowDataPacket } from "mysql2";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { buildLobbyDraft, draftNotes, type DraftViewer } from "@/lib/draft";
import { demoDraftRaw } from "@/lib/gameControlDemo";
import { DEMO_HOST, hostEntryOn, isSchedulerDemo } from "@/lib/scheduleStore";
import { getSession } from "@/lib/session";

/**
 * Server side of draft games on the website: who the viewer is to a draft
 * (captain? host?) and the pool notes, which only hosts and the captains see.
 * Changes go to the bot as web_schedule_requests (POST /api/draft), for the
 * game's own server (multi-server).
 */

/** The signed-in viewer (preview mode: the demo host). */
export async function draftViewerIdentity(): Promise<{ user_id: string; name: string } | null> {
  if (isSchedulerDemo()) {
    return { user_id: DEMO_HOST.discord_id, name: DEMO_HOST.display_name ?? DEMO_HOST.username };
  }
  const session = await getSession();
  return session ? { user_id: session.discord_id, name: session.ingame_nickname || session.username } : null;
}

interface DraftGameRow extends RowDataPacket {
  host_id: string | null;
  guild_id: string | null;
  game_data: unknown;
}

function parse(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

export interface DraftGame {
  data: Record<string, unknown>;
  host_id: string | null;
  /** The game's Discord server. */
  guild_id: string;
}

/** A draft game's document and host, or null when it isn't a draft game. */
export async function loadDraftGame(threadId: string): Promise<DraftGame | null> {
  if (isSchedulerDemo()) {
    const raw = demoDraftRaw(threadId);
    return raw ? { data: raw.data, host_id: raw.host_id, guild_id: HOME_GUILD_ID } : null;
  }
  const [rows] = await getPool().query<DraftGameRow[]>(
    "SELECT CAST(host_id AS CHAR) AS host_id, CAST(guild_id AS CHAR) AS guild_id, game_data FROM games WHERE thread_id = ?",
    [threadId],
  );
  const row = rows[0];
  if (!row) return null;
  const data = parse(row.game_data);
  return data.is_draft ? { data, host_id: row.host_id, guild_id: row.guild_id ? String(row.guild_id) : HOME_GUILD_ID } : null;
}

/** Whether the viewer hosts on the draft game's server (and is staff there). */
export async function draftHostOn(game: DraftGame, userId: string | null) {
  return userId ? hostEntryOn(userId, game.guild_id) : null;
}

/** The viewer's role in a draft (+ the notes when they may read them). */
export async function getDraftViewer(threadId: string): Promise<DraftViewer | null> {
  const game = await loadDraftGame(threadId);
  if (!game) return null;
  const me = await draftViewerIdentity();
  const host = await draftHostOn(game, me?.user_id ?? null);
  const draft = buildLobbyDraft(game.data, () => ({ name: null, avatar_url: null }), null);
  const captainOf = me ? (draft?.teams.find((team) => team.captain_id === me.user_id)?.key ?? null) : null;
  const canManage = Boolean(host && me && (host.is_staff || me.user_id === game.host_id));
  const notes = draftNotes(game.data);
  return {
    user_id: me?.user_id ?? null,
    name: me?.name ?? null,
    is_host: Boolean(host),
    can_manage: canManage,
    captain_of: captainOf,
    notes: host || captainOf ? notes : null,
    my_note: me ? (notes[me.user_id] ?? null) : null,
  };
}
