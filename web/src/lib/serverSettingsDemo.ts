import {
  REQUIRED_PERMISSIONS,
  defaultSettings,
  normalizeSettings,
  type GuildSnapshot,
  type HistoryEntry,
  type ServerAccess,
  type ServerSettings,
  type SnapshotChannel,
  type SnapshotRole,
  type StepId,
} from "@/lib/serverSettingsTypes";

/**
 * Preview mode (SCHEDULER_DEMO=1) for the servers pages: TommyKay (set up,
 * running on its settings), "Baltic HOI4 League" (bot just added, needs setup:
 * GameMaster is missing two permissions and sits below the Moderator role) and
 * "Pacific Front MP" (bot not added). Also simulates the bot's
 * _process_web_server_setup ("Create for me").
 */

export const DEMO_HOME_ID = "880000000000000043";
const BALTIC_ID = "600000000000000001";
const PACIFIC_ID = "600000000000000002";

export interface DemoServer {
  id: string;
  name: string;
  icon: string | null;
  access: ServerAccess;
  is_home: boolean;
  bot_present: boolean;
  status: "needs_setup" | "active";
  settings: ServerSettings | null;
  version: number;
  setup_step: StepId | null;
  completed_at: number | null;
  updated_at: number | null;
  snapshot: GuildSnapshot | null;
  history: HistoryEntry[];
}

const ALL_BOT = { view: true, send: true, embed: true, attach: true, threads: true, manage: true, connect: true, move: true };

function role(id: string, name: string, position: number, color: string | null, extra: Partial<SnapshotRole> = {}): SnapshotRole {
  return { id, name, position, color, managed: false, mentionable: false, hoist: false, everyone: false, members: 12, ...extra };
}

function chan(
  id: string,
  name: string,
  type: SnapshotChannel["type"],
  parent: string | null,
  position: number,
  bot: Partial<SnapshotChannel["bot"]> = {},
): SnapshotChannel {
  return { id, name, type, parent_id: parent, position, bot: { ...ALL_BOT, ...bot } };
}

function permissions(missing: number[] = []): string {
  return REQUIRED_PERMISSIONS.filter((perm) => !missing.includes(perm.bit))
    .reduce((sum, perm) => sum | (BigInt(1) << BigInt(perm.bit)), BigInt(0))
    .toString();
}

function tommyKaySnapshot(now: number): GuildSnapshot {
  const roles = [
    role("880000000000000044", "Tommy and the Boys", 40, "#e74c3c", { hoist: true, members: 4 }),
    role("900000000000000001", "GameMaster", 39, "#f1c40f", { managed: true, members: 1 }),
    role("880000000000000046", "SUPA Mods", 38, "#9b59b6", { hoist: true, members: 6 }),
    role("880000000000000008", "Game Community Manager", 37, "#1abc9c", { members: 2 }),
    role("880000000000000034", "Game Community Assistant", 36, "#16a085", { members: 3 }),
    role("880000000000000013", "Head Mod Developer", 35, "#3498db", { members: 1 }),
    role("880000000000000036", "Senior RP Host", 34, "#e67e22", { hoist: true, members: 4 }),
    role("880000000000000048", "RP Host", 33, "#f39c12", { hoist: true, members: 11 }),
    role("880000000000000009", "RP Assistant Host", 32, "#f8c471", { members: 6 }),
    role("900000000000000011", "Senior HIST Host", 31, "#2980b9", { members: 1 }),
    role("900000000000000012", "HIST Host", 30, "#5dade2", { members: 3 }),
    role("900000000000000013", "HIST Assistant Host", 29, "#aed6f1", { members: 2 }),
    role("880000000000000027", "Retired Organiser", 28, "#95a5a6", { members: 5 }),
    role("880000000000000045", "VIP", 27, "#ff73fa", { hoist: true, members: 18 }),
    role("880000000000000021", "Hearts of Valor", 26, "#c0392b", { members: 9 }),
    role("880000000000000011", "HOI4 RP Trusted", 25, "#27ae60", { members: 64 }),
    role("880000000000000031", "HOI4 MP Trusted", 24, "#2ecc71", { members: 31 }),
    role("880000000000000017", "RP Verified", 23, "#58d68d", { members: 412 }),
    role("900000000000000014", "Hist Verified", 22, "#82e0aa", { members: 97 }),
    role("880000000000000033", "Dishonored", 21, "#7f8c8d", { members: 3 }),
    role("880000000000000012", "HOI4 RP Banned", 20, "#34495e", { members: 14 }),
    role("880000000000000032", "HOI4 MP Banned", 19, "#2c3e50", { members: 6 }),
    role("880000000000000040", "Mod Developer", 18, "#5499c7", { members: 4 }),
    role("880000000000000018", "Helper", 17, "#48c9b0", { members: 5 }),
    role("880000000000000049", "HOI4 MP", 17, null, { mentionable: true, members: 1640 }),
    role("880000000000000030", "Historical Ping", 16, null, { mentionable: true, members: 870 }),
    role("880000000000000016", "Server Partner", 15, "#d4ac0d", { members: 7 }),
    role("900000000000000020", "Member", 1, null, { members: 4120 }),
    role(DEMO_HOME_ID, "@everyone", 0, null, { everyone: true, members: 4300 }),
  ];
  const channels = [
    chan("900000000000000101", "HOI4 ROLEPLAY", "category", null, 1),
    chan("880000000000000005", "rp-announcements", "text", "900000000000000101", 1),
    chan("880000000000000026", "kaiserreich-announcements", "text", "900000000000000101", 2),
    chan("880000000000000010", "rp-game-info", "text", "900000000000000101", 3),
    chan("880000000000000006", "rp-rules", "text", "900000000000000101", 4),
    chan("880000000000000029", "rp-mods", "text", "900000000000000101", 5),
    chan("880000000000000020", "rp-game-logs", "text", "900000000000000101", 6),
    chan("900000000000000102", "HOI4 HISTORICAL", "category", null, 2),
    chan("880000000000000050", "historical-announcements", "text", "900000000000000102", 1),
    chan("880000000000000015", "historical-game-info", "text", "900000000000000102", 2),
    chan("880000000000000002", "historical-rules", "text", "900000000000000102", 3),
    chan("880000000000000007", "historical-mods", "text", "900000000000000102", 4),
    chan("880000000000000028", "historical-game-logs", "text", "900000000000000102", 5),
    chan("900000000000000103", "HOST TEAM", "category", null, 3),
    chan("880000000000000014", "host-log", "text", "900000000000000103", 1),
    chan("880000000000000035", "host-management", "text", "900000000000000103", 2),
    chan("880000000000000025", "host-chatlogs", "forum", "900000000000000103", 3),
    chan("880000000000000039", "schedule", "text", "900000000000000103", 4),
    chan("880000000000000019", "tickets", "text", null, 4),
    chan("880000000000000041", "crash-reports", "text", null, 5),
    chan("880000000000000024", "HOI4 TICKETS", "category", null, 10),
    chan("880000000000000022", "ticket-transcripts", "text", "900000000000000103", 5),
    chan("880000000000000023", "private-ticket-transcripts", "text", "900000000000000103", 6),
    chan("900000000000000104", "CASINO", "category", null, 6),
    chan("880000000000000042", "casino-access", "text", "900000000000000104", 1),
    chan("880000000000000037", "randomizer-log", "text", "900000000000000104", 2),
    chan("880000000000000038", "fortunes-log", "text", "900000000000000104", 3),
    chan("880000000000000004", "RP GAME VOICE", "category", null, 7),
    chan("880000000000000003", "Game Lobby", "voice", "880000000000000004", 1),
    chan("880000000000000047", "HISTORICAL GAME VOICE", "category", null, 8),
    chan("880000000000000001", "COMMUNITY VOICE", "category", null, 9),
    chan("900000000000000105", "General", "voice", "880000000000000001", 1),
  ];
  return {
    guild: { id: DEMO_HOME_ID, name: "TommyKay's HOI4 Community", icon: null, owner_id: "900000000000000900", member_count: 4300, system_channel_id: null, community: true },
    roles,
    channels,
    bot: { user_id: "900000000000000999", permissions: permissions(), top_role_id: "900000000000000001", top_role_position: 39 },
    staff_user_ids: ["100000000000000001", "200000000000000002"],
    updated_at: now - 120,
  };
}

function tommyKaySettings(): ServerSettings {
  const s = defaultSettings("TommyKay's HOI4 Community");
  s.access = {
    senior_staff_roles: ["880000000000000013", "880000000000000034", "880000000000000008", "880000000000000046", "880000000000000044"],
    staff_can_edit_settings: true,
    ticket_support_roles: ["880000000000000018"],
    developer_roles: ["880000000000000013"],
  };
  s.branches.RP.ranks = { Assistant: "880000000000000009", Full: "880000000000000048", Senior: "880000000000000036" };
  s.branches.HIST.ranks = { Assistant: "900000000000000013", Full: "900000000000000012", Senior: "900000000000000011" };
  s.roles = {
    verified: { RP: "880000000000000017", HIST: "900000000000000014" },
    trusted: { RP: "880000000000000011", HIST: "880000000000000031" },
    game_ban: { RP: "880000000000000012", HIST: "880000000000000032" },
    dishonored: { RP: "880000000000000033", HIST: "880000000000000033" },
    ping: { RP: "880000000000000049", HIST: "880000000000000030" },
    vip: ["880000000000000045"],
    valor: "880000000000000021",
  };
  s.channels = {
    host_log: "880000000000000014",
    staff_notices: "880000000000000035",
    schedule_panel: "880000000000000039",
    host_chatlogs_forum: "880000000000000025",
    tickets: "880000000000000019",
    crash_reports: "880000000000000041",
    ticket_category: "880000000000000024",
    ticket_log: "880000000000000022",
    ticket_private_log: "880000000000000023",
  };
  s.lobby_voices = ["880000000000000003"];
  s.voice = {
    RP: { after_category: "880000000000000004", before_category: "880000000000000047" },
    HIST: { after_category: "880000000000000047", before_category: "880000000000000001" },
  };
  const rp = {
    game_info_channel: "880000000000000010",
    ping_role: "880000000000000049",
  };
  const hist = {
    announcement_channel: "880000000000000050",
    game_info_channel: "880000000000000015",
    ping_role: "880000000000000030",
  };
  for (const [key, mode] of Object.entries(s.modes)) {
    mode.enabled = true;
    if (key.startsWith("Historical")) Object.assign(mode, hist);
    else Object.assign(mode, rp, { announcement_channel: key === "Kaiserreich (FFA)" ? "880000000000000026" : "880000000000000005" });
  }
  s.addons = { casino_panel_channel: "880000000000000042" };
  return normalizeSettings(s, "TommyKay's HOI4 Community");
}

function balticSnapshot(now: number): GuildSnapshot {
  const roles = [
    role("610000000000000001", "Owner", 13, "#e91e63", { hoist: true, members: 1 }),
    role("610000000000000002", "Admin", 12, "#e74c3c", { hoist: true, members: 3 }),
    role("610000000000000003", "Moderator", 11, "#3498db", { hoist: true, members: 6 }),
    role("610000000000000004", "GameMaster", 10, "#f1c40f", { managed: true, members: 1 }),
    role("610000000000000005", "Event Staff", 8, "#1abc9c", { members: 4 }),
    role("610000000000000006", "Veteran", 7, "#9b59b6", { members: 38 }),
    role("610000000000000007", "HOI4 Players", 6, "#2ecc71", { members: 211 }),
    role("610000000000000008", "Members", 5, null, { members: 640 }),
    role("610000000000000009", "Muted", 4, "#7f8c8d", { members: 2 }),
    role("610000000000000010", "Server Booster", 3, "#f47fff", { managed: true, members: 9 }),
    role("610000000000000011", "MEE6", 2, null, { managed: true, members: 1 }),
    role(BALTIC_ID, "@everyone", 0, null, { everyone: true, members: 655 }),
  ];
  const channels = [
    chan("620000000000000001", "INFORMATION", "category", null, 1),
    chan("620000000000000002", "welcome", "text", "620000000000000001", 1),
    chan("620000000000000003", "rules", "text", "620000000000000001", 2),
    chan("620000000000000004", "announcements", "news", "620000000000000001", 3),
    chan("620000000000000010", "HEARTS OF IRON", "category", null, 2),
    chan("620000000000000011", "hoi4-games", "text", "620000000000000010", 1),
    chan("620000000000000012", "game-info", "text", "620000000000000010", 2),
    chan("620000000000000013", "hoi4-mods", "text", "620000000000000010", 3),
    chan("620000000000000014", "game-logs", "text", "620000000000000010", 4),
    chan("620000000000000020", "STAFF", "category", null, 3),
    chan("620000000000000021", "staff-chat", "text", "620000000000000020", 1),
    chan("620000000000000022", "bot-logs", "text", "620000000000000020", 2),
    chan("620000000000000023", "mod-only", "text", "620000000000000020", 3, { view: false, send: false, embed: false }),
    chan("620000000000000030", "VOICE", "category", null, 4),
    chan("620000000000000031", "Lobby", "voice", "620000000000000030", 1, { move: false }),
    chan("620000000000000032", "General", "voice", "620000000000000030", 2, { move: false }),
  ];
  return {
    guild: { id: BALTIC_ID, name: "Baltic HOI4 League", icon: null, owner_id: "100000000000000001", member_count: 655, system_channel_id: "620000000000000002", community: false },
    roles,
    channels,
    // Added without Move Members and Mention Everyone; its role sits below Moderator.
    bot: { user_id: "900000000000000999", permissions: permissions([24, 17]), top_role_id: "610000000000000004", top_role_position: 10 },
    staff_user_ids: [],
    updated_at: now - 40,
  };
}

function build(): Map<string, DemoServer> {
  const now = Math.floor(Date.now() / 1000);
  const servers: DemoServer[] = [
    {
      id: DEMO_HOME_ID,
      name: "TommyKay's HOI4 Community",
      icon: null,
      access: "admin",
      is_home: true,
      bot_present: true,
      status: "active",
      settings: tommyKaySettings(),
      version: 2,
      setup_step: "review",
      completed_at: now - 3 * 86_400,
      updated_at: now - 86_400,
      snapshot: tommyKaySnapshot(now),
      history: [
        {
          version: 2,
          actor_name: "Senior Host",
          summary: "Changed Channels (1 change)",
          changes: [{ path: "channels.staff_notices", before: "880000000000000014", after: "880000000000000035" }],
          created_at: now - 86_400,
        },
        {
          version: 1,
          actor_name: "GameMaster bot",
          summary: "Copied this server's existing roles, channels and rules into the settings",
          changes: [],
          created_at: now - 3 * 86_400,
        },
      ],
    },
    {
      id: BALTIC_ID,
      name: "Baltic HOI4 League",
      icon: null,
      access: "owner",
      is_home: false,
      bot_present: true,
      status: "needs_setup",
      settings: defaultSettings("Baltic HOI4 League"),
      version: 1,
      setup_step: null,
      completed_at: null,
      updated_at: now - 40,
      snapshot: balticSnapshot(now),
      history: [{ version: 1, actor_name: "GameMaster bot", summary: "Joined the server — waiting for setup", changes: [], created_at: now - 40 }],
    },
    {
      id: PACIFIC_ID,
      name: "Pacific Front MP",
      icon: null,
      access: "admin",
      is_home: false,
      bot_present: false,
      status: "needs_setup",
      settings: null,
      version: 0,
      setup_step: null,
      completed_at: null,
      updated_at: null,
      snapshot: null,
      history: [],
    },
  ];
  return new Map(servers.map((server) => [server.id, server]));
}

export function demoServers(): Map<string, DemoServer> {
  const holder = globalThis as { __gmServersDemoV6?: Map<string, DemoServer> };
  if (!holder.__gmServersDemoV6) holder.__gmServersDemoV6 = build();
  return holder.__gmServersDemoV6;
}

type DemoOutcome = { status: "done" | "error"; result: Record<string, unknown> | null; error: string | null };

let nextId = BigInt("700000000000000001");

/** The bot's _process_web_server_setup, simulated ("Create for me"). */
export function applyDemoServerSetup(payload: Record<string, unknown>): DemoOutcome {
  const refuse = (error: string): DemoOutcome => ({ status: "error", result: null, error });
  const server = demoServers().get(String(payload.guild_id ?? ""));
  if (!server?.bot_present || !server.snapshot) return refuse("❌ GameMaster isn't in that server any more — add it again first.");
  const snap = server.snapshot;
  // The dashboard's fix-it buttons (bot: refresh / sync_commands / test_post / resend_welcome).
  const fixed: Record<string, string> = {
    refresh: "Refreshed the server's roles and channels",
    sync_commands: "Re-synced 10 slash commands",
    test_post: "Posted a test message in #bot-logs",
    resend_welcome: "Sent the setup welcome again (to the owner's DMs, else the system channel)",
    schedule_panel: "Posted and pinned the scheduling panel",
  };
  if (payload.op === "schedule_panel" && !server.settings?.channels.schedule_panel) {
    return refuse("❌ Pick the scheduling panel channel and save first.");
  }
  if (typeof payload.op === "string" && payload.op in fixed) {
    if (payload.op === "sync_commands" && server.status !== "active") {
      return refuse("❌ Finish setup first — GameMaster gives a server its commands when setup is done.");
    }
    snap.updated_at = Math.floor(Date.now() / 1000);
    return { status: "done", result: { setup: { title: "✅ Done", summary: fixed[payload.op], created: null } }, error: null };
  }
  const name = String(payload.name ?? "").trim().slice(0, 100);
  if (!name) return refuse("❌ Give it a name.");
  const id = nextId.toString();
  nextId += BigInt(1);
  let created: { id: string; name: string; kind: string };
  if (payload.op === "create_role") {
    // New roles land just under GameMaster's own role, like Discord does.
    const position = Math.max(1, snap.bot.top_role_position - 1);
    for (const existing of snap.roles) if (existing.position >= position && existing.id !== snap.bot.top_role_id && !existing.everyone) existing.position += 1;
    snap.bot.top_role_position += 1;
    const color = typeof payload.color === "string" && /^#?[0-9a-f]{6}$/i.test(payload.color) ? `#${payload.color.replace("#", "")}` : null;
    snap.roles.push(role(id, name, position, color, { mentionable: payload.mentionable === true, members: 0 }));
    snap.roles.sort((a, b) => b.position - a.position);
    created = { id, name, kind: "role" };
  } else if (payload.op === "create_channel") {
    const kind = String(payload.kind ?? "text");
    if (kind === "forum" && !snap.guild.community) {
      return refuse("❌ Discord only allows forum channels in Community servers — pick a text channel instead.");
    }
    const type = (["text", "voice", "category", "forum"].includes(kind) ? kind : "text") as SnapshotChannel["type"];
    const parent = typeof payload.parent_id === "string" && snap.channels.some((c) => c.id === payload.parent_id && c.type === "category") ? payload.parent_id : null;
    const slug = type === "voice" || type === "category" ? name : name.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "channel";
    snap.channels.push(chan(id, type === "category" ? slug.toUpperCase() : slug, type, type === "category" ? null : parent, 99));
    created = { id, name: slug, kind: type };
  } else {
    return refuse("❌ Unknown setup action.");
  }
  snap.updated_at = Math.floor(Date.now() / 1000);
  return { status: "done", result: { setup: { title: "✅ Done", summary: `Created ${created.kind} ${created.name}`, created } }, error: null };
}
