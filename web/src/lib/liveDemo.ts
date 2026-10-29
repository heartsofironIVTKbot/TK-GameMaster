import { demoModerationOptions } from "@/lib/databaseDemo";
import { demoDraftLobbyListing, demoDraftLobbyState } from "@/lib/gameControlDemo";
import type { PlayerProfile, ProfileRole } from "@/lib/playerTypes";
import type { DirectoryMember, RequestState, ScheduleRequestStatus } from "@/lib/scheduleTypes";

/**
 * Preview mode (SCHEDULER_DEMO=1, `next dev` only) for the live map's host
 * tools: two sample Road to 56 lobbies (one open, one already in progress —
 * hot-join), a small member directory and a simulated bot that
 * applies roster actions the way bot.py.py does
 * (_process_web_roster_assign / _process_web_roster_remove).
 */

export const DEMO_LOBBY_ID = "900000000000000001";
export const DEMO_STARTED_LOBBY_ID = "900000000000000002";
/** A lobby set up from a preset ("Europe only": other regions not playable). */
export const DEMO_PRESET_LOBBY_ID = "900000000000000003";
/** Same id as DEMO_HOST in scheduleStore (the signed-in preview host). */
const DEMO_HOST_ID = "100000000000000001";

/** Road to 56 major slot names (bot reservation keys on that map). */
const DEMO_MAJORS = new Set([
  "German Reich",
  "United Kingdom",
  "French Republic",
  "Union of Soviet Socialist Republics",
  "Kingdom of Italy",
  "Empire of Japan",
  "United States of America",
]);
const MAX_COOP_SLOTS = 2;

function member(
  id: number,
  username: string,
  displayName: string,
  extra: Partial<DirectoryMember> = {},
): DirectoryMember {
  return {
    discord_id: `5000000000000000${String(id).padStart(2, "0")}`,
    username,
    display_name: displayName,
    avatar_url: null,
    verified: true,
    is_vip: false,
    ingame_nickname: displayName,
    ...extra,
  };
}

const DEMO_MEMBERS: DirectoryMember[] = [
  { ...member(0, "demo_host", "Demo Host"), discord_id: DEMO_HOST_ID },
  member(1, "bismarck_fan", "Otto"),
  member(2, "tsar_nikolai", "Nikolai"),
  member(3, "rommel77", "Erwin"),
  member(4, "kaiser_bill", "Wilhelm", { is_vip: true }),
  member(5, "winged_hussar", "Jan"),
  member(6, "yamamoto_san", "Isoroku"),
  member(7, "churchill_cigar", "Winston"),
  member(8, "free_french", "Charles"),
  member(9, "lena_hoi", "Lena"),
  member(10, "viktor_partisan", "Viktor"),
  member(11, "dutch_trader", "Pieter"),
  member(12, "new_recruit", "Rookie", { verified: false }),
  member(13, "cooldown_carl", "Carl"),
];
/** Plays the "recently played a Major" warning (confirm flow). */
const COOLDOWN_MEMBER = DEMO_MEMBERS[13].discord_id;

/** Preview members (the Database page's demo records build on these). */
export function demoDirectory(): readonly DirectoryMember[] {
  return DEMO_MEMBERS;
}

interface DemoLobby {
  /** slot_key → Discord id */
  reservations: Record<string, string>;
  lockedRegions: string[];
  /** Preset games: the preset's playable groups and the nations it leaves out. */
  layout?: { name: string; tiers: { label: string | null; nations: string[] }[] }[];
  hidden?: string[];
}

/** The preset lobby: Roleplay's standard Majors + Europe only. */
function demoPresetLobby(): DemoLobby {
  const options = demoModerationOptions();
  const layout = (options.mode_layouts?.Roleplay ?? []).filter((group) => group.name === "Majors" || group.name === "Europe");
  const playable = new Set(layout.flatMap((group) => group.tiers.flatMap((tier) => tier.nations)));
  const lists = options.mode_nations?.Roleplay;
  const hidden = lists ? [...lists.majors, ...lists.minors].filter((name) => !playable.has(name)) : [];
  return {
    reservations: { "German Reich": DEMO_MEMBERS[2].discord_id, "Kingdom of Italy": DEMO_MEMBERS[6].discord_id },
    lockedRegions: hidden,
    layout,
    hidden,
  };
}

function demoLobbyStore(): Record<string, DemoLobby> {
  const holder = globalThis as { __gmLiveDemoLobbiesV2?: Record<string, DemoLobby> };
  if (!holder.__gmLiveDemoLobbiesV2) {
    holder.__gmLiveDemoLobbiesV2 = {
      [DEMO_LOBBY_ID]: {
        reservations: {
          "German Reich": DEMO_MEMBERS[1].discord_id,
          "German Reich_coop": DEMO_MEMBERS[3].discord_id,
          "Union of Soviet Socialist Republics": DEMO_MEMBERS[2].discord_id,
          "United Kingdom": DEMO_MEMBERS[7].discord_id,
          "Empire of Japan": DEMO_MEMBERS[6].discord_id,
          "Republic of Poland": DEMO_MEMBERS[5].discord_id,
          "Kingdom of the Netherlands": DEMO_MEMBERS[11].discord_id,
          _FILL_Filler: DEMO_MEMBERS[9].discord_id,
        },
        lockedRegions: ["Republic of Turkey"],
      },
      [DEMO_STARTED_LOBBY_ID]: {
        reservations: {
          "German Reich": DEMO_MEMBERS[4].discord_id,
          "United Kingdom": DEMO_MEMBERS[8].discord_id,
          "United States of America": DEMO_MEMBERS[10].discord_id,
          "Kingdom of Italy": DEMO_MEMBERS[3].discord_id,
        },
        lockedRegions: [],
      },
      [DEMO_PRESET_LOBBY_ID]: demoPresetLobby(),
    };
  }
  return holder.__gmLiveDemoLobbiesV2;
}

/** Lobby list (the in-progress game last: players can ask to hot-join it). */
export function demoLobbies(includeStarted: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const open = {
    thread_id: DEMO_LOBBY_ID,
    mode: "Roleplay",
    status: "open",
    thread_name: "Roleplay Game - Preview Lobby",
    game_started: 0,
    host_id: DEMO_HOST_ID,
    start_timestamp: now + 26 * 3600,
  };
  const started = {
    thread_id: DEMO_STARTED_LOBBY_ID,
    mode: "Roleplay",
    status: "open",
    thread_name: "Roleplay Game - Already Running",
    game_started: 1,
    host_id: DEMO_MEMBERS[4].discord_id,
    start_timestamp: now - 2 * 3600,
  };
  const preset = {
    thread_id: DEMO_PRESET_LOBBY_ID,
    mode: "Roleplay",
    status: "open",
    thread_name: "Roleplay Game - Europe Only (preset)",
    game_started: 0,
    host_id: DEMO_HOST_ID,
    start_timestamp: now + 50 * 3600,
  };
  // The Games page's preview draft game is on the map too (draft sign-ups).
  const drafts = demoDraftLobbyListing();
  return includeStarted ? [open, preset, ...drafts, started] : [open, preset, ...drafts];
}

function memberById(id: string): DirectoryMember | undefined {
  return DEMO_MEMBERS.find((entry) => entry.discord_id === id);
}

/** GET /api/reserve body for the preview lobby. */
export function demoLobbyState(threadId: string) {
  const draftLobby = demoDraftLobbyState(threadId);
  if (draftLobby) return draftLobby;
  const lobby = demoLobbyStore()[threadId];
  const game = demoLobbies(true).find((entry) => entry.thread_id === threadId);
  if (!lobby || !game) return null;
  return {
    game: {
      ...game,
      lockdown: false,
      locked_regions: lobby.lockedRegions,
      nation_layout: lobby.layout ?? null,
      layout_disabled_nations: lobby.hidden ?? [],
      // The open preview lobby shows the map's IronLegion prompt (no real server to link to).
      ironlegion: threadId === DEMO_LOBBY_ID ? { verify_url: null } : null,
    },
    reservations: Object.entries(lobby.reservations).map(([slotKey, userId]) => {
      const entry = memberById(userId);
      return {
        slot_key: slotKey,
        user_id: userId,
        rerolls_used: 0,
        ingame_nickname: entry?.ingame_nickname ?? null,
        hoi4_verified: entry?.verified ?? null,
        host_tier: userId === DEMO_HOST_ID ? "Senior" : null,
        username: entry?.username ?? null,
        display_name: entry?.display_name ?? null,
        avatar_url: entry?.avatar_url ?? null,
      };
    }),
  };
}

export function searchDemoMembers(query: string): DirectoryMember[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return DEMO_MEMBERS.filter((entry) =>
    [entry.discord_id, entry.username, entry.display_name, entry.ingame_nickname].some((value) =>
      value?.toLowerCase().includes(needle),
    ),
  ).slice(0, 20);
}

export function demoMembersById(ids: string[]): Map<string, DirectoryMember> {
  return new Map(
    ids.map((id) => [id, memberById(id)]).filter((pair): pair is [string, DirectoryMember] => Boolean(pair[1])),
  );
}

// --- profile cards + host portfolio --------------------------------------

const DEMO_ROLES: Record<string, ProfileRole> = {
  senior: { id: "700000000000000001", name: "Senior Host", color: "#f1c40f", icon_url: null, icon_emoji: "👑" },
  host: { id: "700000000000000002", name: "Host", color: "#e67e22", icon_url: null, icon_emoji: null },
  vip: { id: "700000000000000003", name: "VIP", color: "#e91e63", icon_url: null, icon_emoji: "💎" },
  verified: { id: "700000000000000004", name: "HOI4 Verified", color: "#3498db", icon_url: null, icon_emoji: null },
  rp: { id: "700000000000000005", name: "RP Gamer Pass", color: "#9b59b6", icon_url: null, icon_emoji: null },
  member: { id: "700000000000000006", name: "Member", color: null, icon_url: null, icon_emoji: null },
};

/** Demo profile card: roles follow the member's VIP / verified flags. */
export function demoPlayerProfile(userId: string): PlayerProfile | null {
  const entry = memberById(userId);
  if (!entry) return null;
  const index = DEMO_MEMBERS.indexOf(entry);
  const roles: ProfileRole[] = [];
  if (userId === DEMO_HOST_ID) roles.push(DEMO_ROLES.senior, DEMO_ROLES.host);
  if (entry.is_vip) roles.push(DEMO_ROLES.vip);
  if (entry.verified) roles.push(DEMO_ROLES.verified);
  if (index % 2 === 1) roles.push(DEMO_ROLES.rp);
  roles.push(DEMO_ROLES.member);
  return {
    discord_id: entry.discord_id,
    username: entry.username,
    display_name: entry.display_name,
    ingame_nickname: entry.ingame_nickname,
    avatar_url: entry.avatar_url,
    banner_url: null,
    // A few members "logged in" with an accent color; the rest use the default.
    accent_color: [0x8e44ad, 0x16a085, 0xc0392b][index % 4] ?? null,
    roles,
    in_server: true,
  };
}

type DemoOutcome = { status: RequestState; result: ScheduleRequestStatus["result"]; error: string | null };

const ok = (result: ScheduleRequestStatus["result"]): DemoOutcome => ({ status: "done", result, error: null });
const fail = (error: string): DemoOutcome => ({ status: "error", result: null, error });

function slotOf(reservations: Record<string, string>, userId: string): string | undefined {
  return Object.keys(reservations).find((key) => reservations[key] === userId);
}

/** The simulated bot for roster_assign / roster_remove. */
export function applyDemoRoster(action: string, payload: Record<string, unknown>): DemoOutcome {
  const lobby = demoLobbyStore()[String(payload.thread_id ?? "")];
  if (!lobby) return fail("❌ This game no longer exists.");
  const res = lobby.reservations;
  const userId = String(payload.user_id ?? "");
  const target = memberById(userId);

  if (action === "roster_remove") {
    const keys = Object.keys(res).filter((key) => res[key] === userId);
    for (const key of keys) delete res[key];
    return ok({ removed: keys[0] ?? null });
  }

  if (!target) return fail("❌ That player is no longer in the server.");
  if (!target.verified) return fail(`🔒 ${target.display_name} isn't Steam verified via LegionMaster yet.`);
  const kind = payload.kind;
  const nation = String(payload.nation ?? "");
  let key: string;
  if (kind === "coop") {
    if (!res[nation]) return fail(`❌ **${nation}** must be reserved before it can get a co-op.`);
    if (!DEMO_MAJORS.has(nation)) return fail("❌ Co-op slots are only for major nations.");
    const coopKeys = Array.from({ length: MAX_COOP_SLOTS }, (_, index) =>
      index === 0 ? `${nation}_coop` : `${nation}_coop_${index + 1}`,
    );
    const free = coopKeys.find((candidate) => res[candidate] === userId) ?? coopKeys.find((candidate) => !res[candidate]);
    if (!free) return fail(`❌ All ${MAX_COOP_SLOTS} co-op slots for **${nation}** are taken.`);
    key = free;
  } else if (kind === "filler") {
    const name = String(payload.filler_name ?? "").trim();
    key = `_FILL_${name.replace(/ /g, "_")}`;
    if (res[key] && res[key] !== userId) {
      if (!name.includes("Filler")) return fail(`❌ **${name}** is already on the list — use a different name.`);
      let index = 1;
      while (res[`${key}_${index}`]) index += 1;
      key = `${key}_${index}`;
    }
  } else {
    key = nation;
  }

  const current = slotOf(res, userId);
  if (current === key) return ok({ slot_key: key });
  let occupant = kind === "nation" ? res[key] : undefined;
  if (occupant === userId) occupant = undefined;
  if (occupant && payload.occupied !== "swap" && payload.occupied !== "replace") {
    return fail(`❌ **${nation}** is already taken — choose swap or replace.`);
  }
  const majorSlot = kind === "coop" || (kind === "nation" && DEMO_MAJORS.has(nation));
  if (userId === COOLDOWN_MEMBER && majorSlot && payload.force !== true) {
    return {
      status: "confirm",
      result: { warnings: [`${target.display_name} recently played Major United States of America and was due a Minor.`] },
      error: null,
    };
  }

  for (const stale of Object.keys(res).filter((slot) => res[slot] === userId)) delete res[stale];
  let swappedTo: string | null = null;
  if (occupant) {
    delete res[key];
    if (payload.occupied === "swap" && current && !res[current]) {
      res[current] = occupant;
      swappedTo = current;
    }
  }
  res[key] = userId;
  return ok({ slot_key: key, moved_from: current ?? null, displaced: swappedTo ? null : (occupant ?? null) });
}
