/**
 * Draft games (bot.py.py _process_web_draft — formerly /reserve in draft
 * games, /start_draft, /draft_pick and /empty_draft_pool). Players join a
 * shared pool from the map as a Major, a Minor, a Major Co-op or a Filler with
 * an optional note; two team captains take turns placing pool players on
 * their team's nations; the game's host can place anyone at any time and runs
 * the draft. Client-safe.
 */

export type DraftPhase = "ENLISTING" | "DRAFTING" | "COMPLETE";
/** What a player signs up as (the bot's DRAFT_POOL_CHOICES). */
export type DraftChoice = "major" | "minor" | "coop" | "filler";

export const DRAFT_CHOICES: readonly { value: DraftChoice; icon: string; title: string; text: string }[] = [
  { value: "major", icon: "👑", title: "Major", text: "Lead one of the big powers." },
  { value: "minor", icon: "🏳️", title: "Minor", text: "Play a smaller nation." },
  { value: "coop", icon: "🤝", title: "Major Co-op", text: "Share a Major with its main player." },
  { value: "filler", icon: "🧩", title: "Filler", text: "Fill in wherever you're needed — you still play." },
];
export const DRAFT_CHOICE_VALUES: readonly DraftChoice[] = DRAFT_CHOICES.map((choice) => choice.value);

/** A pool entry's label ("Major", "Major Co-op", "Filler"…) → the choice it came from. */
export function draftChoiceOf(preference: string): DraftChoice {
  const value = preference.toLowerCase();
  if (value.includes("co-op") || value.includes("coop")) return "coop";
  if (value.startsWith("filler")) return "filler";
  if (value.startsWith("major")) return "major";
  return "minor";
}

/** Mirrors DRAFT_NOTE_MAX / DRAFT_MAX_COOPS_PER_NATION / DRAFT_MAX_GENERIC_FILLERS in bot.py.py. */
export const DRAFT_NOTE_MAX = 300;
const MAX_COOPS = 2;
const MAX_FILLERS = 10;

export interface DraftTeam {
  key: string;
  name: string;
  captain_id: string;
  captain_name: string | null;
  /** Nation groups the host put in the team (null = the old Allies / Axis sides). */
  groups: string[] | null;
  majors: string[];
  minors: string[];
}

export interface DraftPoolEntry {
  user_id: string;
  /** "Major" / "Minor" / "Major Co-op" / "Filler". */
  preference: string;
  name: string;
  avatar_url: string | null;
  joined_at: number;
}

/** What every viewer of a draft lobby sees (notes are separate — host and captains only). */
export interface LobbyDraft {
  phase: DraftPhase;
  teams: DraftTeam[];
  current_turn: string | null;
  picks_remaining: number;
  coin_flip: boolean;
  /** Team that won the coin toss (once the draft started). */
  coin_winner: string | null;
  first_picker: string | null;
  pool: DraftPoolEntry[];
  pool_cap: number;
  /** Every playable nation (the host can place anyone anywhere). */
  playable: { majors: string[]; minors: string[] };
}

/** GET /api/draft?thread_id= — who the viewer is to this draft. */
export interface DraftViewer {
  /** Logged in (Discord) — null = anonymous. */
  user_id: string | null;
  name: string | null;
  /** Any host: sees notes. */
  is_host: boolean;
  /** The game's host or Host Management: runs the draft and places anyone. */
  can_manage: boolean;
  /** Team key the viewer captains. */
  captain_of: string | null;
  /** user id → note (hosts and captains only). */
  notes: Record<string, string> | null;
  /** The viewer's own note (to edit their entry). */
  my_note: string | null;
}

/** POST /api/draft actions (the bot's draft_join / draft_leave / draft_pick / draft_control). */
export type DraftPlayerAction = "join" | "leave" | "pick";
export type DraftHostOp = "start" | "finish" | "remove" | "assign" | "captain";
export const DRAFT_HOST_OPS: readonly DraftHostOp[] = ["start", "finish", "remove", "assign", "captain"];

export interface DraftSlot {
  /** Reservation key ("Germany", "Germany_coop", "_FILL_Filler 2"). */
  key: string;
  label: string;
  kind: "major" | "coop" | "minor" | "filler";
}

export function draftPreferenceLabel(preference: string): string {
  return preference.replace(/ Nation$/, "");
}

/**
 * Free slots a pool player can go on (the bot's _draft_assignment_entries):
 * teamKey = a captain's team — its free nations (host-locked ones excluded),
 * a co-op of its taken majors, a filler; null = the host — any playable nation.
 */
export function draftSlots(
  draft: LobbyDraft,
  reserved: ReadonlySet<string>,
  locked: ReadonlySet<string>,
  teamKey: string | null,
): DraftSlot[] {
  const team = teamKey === null ? null : draft.teams.find((entry) => entry.key === teamKey);
  if (teamKey !== null && !team) return [];
  const majors = team ? team.majors : draft.playable.majors;
  const minors = team ? team.minors : draft.playable.minors;
  const open = (nation: string) => !reserved.has(nation) && (team === null || !locked.has(nation));
  const byName = (a: string, b: string) => a.localeCompare(b);
  const slots: DraftSlot[] = [...majors].filter(open).sort(byName).map((nation) => ({ key: nation, label: nation, kind: "major" as const }));
  for (const nation of [...majors].filter((name) => reserved.has(name)).sort(byName)) {
    for (let index = 1; index <= MAX_COOPS; index += 1) {
      const key = index === 1 ? `${nation}_coop` : `${nation}_coop_${index}`;
      if (!reserved.has(key)) {
        slots.push({ key, label: index === 1 ? `${nation} Co-op` : `${nation} Co-op ${index}`, kind: "coop" });
        break;
      }
    }
  }
  slots.push(...[...minors].filter(open).sort(byName).map((nation) => ({ key: nation, label: nation, kind: "minor" as const })));
  for (let index = 1; index <= MAX_FILLERS; index += 1) {
    const key = `_FILL_Filler ${index}`;
    if (!reserved.has(key)) {
      slots.push({ key, label: "Filler", kind: "filler" });
      break;
    }
  }
  return slots;
}

/** The team a reservation key belongs to (null = not a team nation, e.g. a filler). */
export function draftTeamOf(draft: LobbyDraft, slotKey: string): DraftTeam | null {
  const base = slotKey.replace(/_coop(?:_\d+)?$/, "");
  return draft.teams.find((team) => team.majors.includes(base) || team.minors.includes(base)) ?? null;
}

/**
 * Who is placing pool players: the captain on the clock (their team's slots
 * use the pick) and / or the game's host or staff (anything playable, without
 * using a turn).
 */
export interface DraftPlacer {
  pickTeam: string | null;
  canManage: boolean;
}

/** "pick" (a captain's turn), "assign" (a host placement) or null (not allowed). */
export function draftPlacement(
  draft: LobbyDraft,
  reserved: ReadonlySet<string>,
  locked: ReadonlySet<string>,
  placer: DraftPlacer,
  slotKey: string,
): "pick" | "assign" | null {
  if (placer.pickTeam && draftSlots(draft, reserved, locked, placer.pickTeam).some((slot) => slot.key === slotKey)) return "pick";
  if (placer.canManage && draftSlots(draft, reserved, locked, null).some((slot) => slot.key === slotKey)) return "assign";
  return null;
}

/** Where a dragged pool player was dropped: a nation (map or list) or the filler zone. */
export type DraftDropTarget = { kind: "nation"; slot: string; name: string } | { kind: "filler" };

export type DraftDrop =
  | { ok: true; action: "pick" | "assign"; slot: string; label: string }
  | { ok: false; error: string };

/**
 * A pool player dropped on a target: a free nation is theirs, a taken Major
 * gets them as its next co-op, the filler zone gives them the next filler
 * seat. Then the captain's pick or a host placement, whichever the viewer
 * may do (the bot checks it all again).
 */
export function draftDrop(
  draft: LobbyDraft,
  reserved: ReadonlySet<string>,
  locked: ReadonlySet<string>,
  placer: DraftPlacer,
  target: DraftDropTarget,
): DraftDrop {
  let slot: string | null = null;
  let label: string;
  if (target.kind === "filler") {
    for (let index = 1; index <= MAX_FILLERS && !slot; index += 1) {
      if (!reserved.has(`_FILL_Filler ${index}`)) slot = `_FILL_Filler ${index}`;
    }
    if (!slot) return { ok: false, error: `All ${MAX_FILLERS} filler seats are taken.` };
    label = "Filler";
  } else if (!reserved.has(target.slot)) {
    slot = target.slot;
    label = target.name;
  } else {
    const isMajor = draft.playable.majors.includes(target.slot) || draft.teams.some((team) => team.majors.includes(target.slot));
    if (!isMajor) return { ok: false, error: `${target.name} is taken — co-ops are only for Majors.` };
    for (let index = 1; index <= MAX_COOPS && !slot; index += 1) {
      const key = index === 1 ? `${target.slot}_coop` : `${target.slot}_coop_${index}`;
      if (!reserved.has(key)) slot = key;
    }
    if (!slot) return { ok: false, error: `${target.name} already has ${MAX_COOPS} co-ops.` };
    label = `${target.name} (Co-op)`;
  }
  const action = draftPlacement(draft, reserved, locked, placer, slot);
  if (action) return { ok: true, action, slot, label };
  const team = placer.pickTeam ? draft.teams.find((entry) => entry.key === placer.pickTeam) : null;
  if (team && !placer.canManage) return { ok: false, error: `${label} isn't one of ${team.name}'s free slots.` };
  if (!placer.canManage) return { ok: false, error: "It isn't your pick right now." };
  return { ok: false, error: `${label} isn't free or playable in this game.` };
}

const PHASES: DraftPhase[] = ["ENLISTING", "DRAFTING", "COMPLETE"];

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/**
 * The public draft state from a game document (game_data.draft). Notes are
 * left out on purpose. `nameOf` resolves Discord ids; `playable` = the mode's
 * nations minus a preset's not-playable ones (falls back to the teams' nations).
 */
export function buildLobbyDraft(
  data: Record<string, unknown>,
  nameOf: (id: string) => { name: string | null; avatar_url: string | null },
  playable: { majors: string[]; minors: string[] } | null,
): LobbyDraft | null {
  if (!data.is_draft) return null;
  const draft = obj(data.draft);
  if (Object.keys(draft).length === 0) return null;
  const teamsRaw = Array.isArray(draft.teams) ? draft.teams.map(obj) : [];
  const teams: DraftTeam[] = (
    teamsRaw.length > 0
      ? teamsRaw
      : [
          { key: "Allies", name: "Allies", captain_id: draft.allies_captain_id },
          { key: "Axis", name: "Axis", captain_id: draft.axis_captain_id },
        ]
  ).map((team) => {
    const captainId = String(team.captain_id ?? "");
    return {
      key: String(team.key ?? ""),
      name: String(team.name ?? team.key ?? "Team"),
      captain_id: captainId,
      captain_name: captainId ? nameOf(captainId).name : null,
      groups: Array.isArray(team.groups) ? team.groups.map(String) : null,
      majors: strings(team.majors),
      minors: strings(team.minors),
    };
  });
  const pool = Object.entries(obj(draft.pool))
    .map(([userId, raw]) => {
      const entry = obj(raw);
      const person = nameOf(userId);
      return {
        user_id: userId,
        preference: draftPreferenceLabel(String(entry.preference ?? "Minor Nation")),
        name: person.name ?? (typeof entry.name === "string" ? entry.name : `#${userId}`),
        avatar_url: person.avatar_url,
        joined_at: Number(entry.reserved_at) || 0,
      };
    })
    .sort((a, b) => a.joined_at - b.joined_at);
  const teamNations = {
    majors: teams.flatMap((team) => team.majors),
    minors: teams.flatMap((team) => team.minors),
  };
  const phase = PHASES.find((value) => value === draft.phase) ?? "ENLISTING";
  return {
    phase,
    teams,
    current_turn: typeof draft.current_turn === "string" ? draft.current_turn : null,
    picks_remaining: Number(draft.picks_remaining_this_turn) || 0,
    coin_flip: Boolean(draft.coin_flip),
    coin_winner: typeof obj(draft.coin_toss).winner === "string" ? String(obj(draft.coin_toss).winner) : null,
    first_picker: typeof draft.first_picker === "string" ? draft.first_picker : null,
    pool,
    pool_cap: Number(draft.pool_cap) || 0,
    playable: playable && playable.majors.length + playable.minors.length > 0 ? playable : teamNations,
  };
}

/** Notes by user id from a game document (hosts and captains only). */
export function draftNotes(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [userId, raw] of Object.entries(obj(obj(data.draft).pool))) {
    const note = obj(raw).note;
    if (typeof note === "string" && note.trim()) out[userId] = note;
  }
  return out;
}
