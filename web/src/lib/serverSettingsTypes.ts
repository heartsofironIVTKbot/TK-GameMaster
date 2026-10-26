/**
 * Server settings — the website setup for any server that adds GameMaster
 * (docs/server-setup.md). Client-safe: types, the built-in mode catalog,
 * defaults, the bot's permissions, normalization (mirrors the bot's
 * _normalize_guild_settings) and the health check behind the wizard.
 */

export type Branch = "RP" | "HIST";
export const BRANCHES: readonly Branch[] = ["RP", "HIST"];
export const BRANCH_INFO: Record<Branch, { label: string; long: string; games: string; emoji: string }> = {
  RP: { label: "RP", long: "Roleplay (RP)", games: "Roleplay games", emoji: "🎭" },
  HIST: { label: "HIST", long: "Historical (HIST)", games: "Historical games", emoji: "⚔️" },
};

export type Rank = "Assistant" | "Full" | "Senior";
export const RANKS: readonly Rank[] = ["Assistant", "Full", "Senior"];
/** Ranks a server can switch off (Full host is always on). */
export type OptionalRank = "Assistant" | "Senior";
export const OPTIONAL_RANKS: readonly OptionalRank[] = ["Assistant", "Senior"];
export const RANK_INFO: Record<Rank, { label: string; hint: string; off: string; suggested: (branch: Branch) => string }> = {
  Assistant: {
    label: "Assistant (Trialist) host",
    hint: "New hosts on trial. Promoted to Full after enough Acclamations.",
    off: "Off: new hosts (and approved host applications) start as Full hosts.",
    suggested: (b) => `${b} Assistant Host`,
  },
  Full: { label: "Full host", hint: "Regular hosts. Always on.", off: "", suggested: (b) => `${b} Host` },
  Senior: {
    label: "Senior host",
    hint: "Can give Acclamations and Violations to hosts of their branch.",
    off: "Off: promotions stop at Full, and only Host Management gives Acclamations and Violations.",
    suggested: (b) => `Senior ${b} Host`,
  },
};

/** The built-in game modes (bot.py.py BUILTIN_MODES / MODE_CONFIG). */
export const MODE_CATALOG: readonly { key: string; label: string; branch: Branch; mod: string }[] = [
  { key: "Roleplay", label: "Roleplay (Road to 56)", branch: "RP", mod: "Road to 56" },
  { key: "Roleplay (Millennium Dawn)", label: "Millennium Dawn", branch: "RP", mod: "Millennium Dawn" },
  { key: "Roleplay (Novum Vexillum)", label: "Novum Vexillum", branch: "RP", mod: "Novum Vexillum" },
  { key: "Kaiserreich (FFA)", label: "Kaiserreich FFA", branch: "RP", mod: "Kaiserreich" },
  { key: "TFR", label: "The Fire Rises", branch: "RP", mod: "The Fire Rises" },
  { key: "Historical (Vanilla)", label: "Historical — Vanilla", branch: "HIST", mod: "Vanilla" },
  { key: "Historical (TFB)", label: "Historical — Their Finest Bruh", branch: "HIST", mod: "Their Finest Bruh" },
  { key: "Historical (Oak)", label: "Historical — Hearts of Oak", branch: "HIST", mod: "Hearts of Oak 2" },
  { key: "Historical (Horst)", label: "Historical — Horstorical", branch: "HIST", mod: "Horstorical MP 2" },
  { key: "Historical (BFFU)", label: "Historical — BFFU 2", branch: "HIST", mod: "BFFU 2" },
];
export type ModeKey = (typeof MODE_CATALOG)[number]["key"];

export const MODE_CHANNEL_FIELDS = [
  { key: "announcement_channel", label: "Announcement channel", kind: "text", required: true, hint: "Games are announced here; the post links players to the map to reserve." },
  { key: "game_info_channel", label: "Game info channel", kind: "text", required: false, hint: "Where the lobby ID, password and checksum go (only players with the game's pass see it)." },
  { key: "rules_channel", label: "Rules channel", kind: "text", required: false, hint: "Where the mode's rules post lives." },
  { key: "mods_channel", label: "Mods channel", kind: "text", required: false, hint: "Where the mode's mods post lives." },
  { key: "public_log_channel", label: "Public chat-log channel", kind: "text", required: false, hint: "Finished games' chat logs are posted here." },
] as const;
export type ModeChannelField = (typeof MODE_CHANNEL_FIELDS)[number]["key"];

export interface LinkEntry {
  name: string;
  link: string;
}

export interface ModeSettings {
  enabled: boolean;
  announcement_channel: string | null;
  game_info_channel: string | null;
  rules_channel: string | null;
  mods_channel: string | null;
  public_log_channel: string | null;
  ping_role: string | null;
  mod_links: LinkEntry[];
  rule_links: LinkEntry[];
}

export const CHANNEL_FIELDS = [
  {
    key: "host_log",
    label: "Audit log",
    kind: "text",
    required: true,
    hint: "Everything GameMaster does is logged here: every host and staff action, DMs, game messages, every slash command used and every role it changes. Staff only.",
  },
  { key: "staff_notices", label: "Staff notices", kind: "text", required: false, hint: "VIP notices with Remove / Approve buttons, hosting streak alerts, and ban alerts from other servers." },
  {
    key: "schedule_panel",
    label: "Scheduling panel channel",
    kind: "text",
    required: false,
    hint: "A host channel. GameMaster posts and pins the scheduling panel here — the buttons hosts use to open the Calendar and the Games page.",
  },
  {
    key: "host_chatlogs_forum",
    label: "Host chat-logs forum",
    kind: "forum_or_text",
    required: false,
    hint: "When a game ends, GameMaster opens a thread here for it named like 20.05.2026 · Roleplay · #1234: date, game mode and game number with a link to manage the game. Commends, warnings and anything else given for that game, and its feedback, are posted in that thread.",
  },
  { key: "crash_reports", label: "Crash reports", kind: "text", required: false, hint: "Crash reports players send on the website are delivered here." },
] as const;

/** The Tickets step's channels (the ticket system merged in from TicketMaster). */
export const TICKET_CHANNEL_FIELDS = [
  { key: "tickets", label: "Ticket panel channel", kind: "text", required: false, hint: "Where /spawn posts the ticket panel — the buttons players press to open a ticket. Players are also pointed here for appeals and commends." },
  { key: "ticket_category", label: "Ticket category", kind: "category", required: false, hint: "Every new ticket is a channel in this category. Keep the category hidden from @everyone; GameMaster gives each ticket's own people access." },
  { key: "ticket_log", label: "Ticket transcripts", kind: "text", required: false, hint: "Closed tickets' transcripts: verification, appeals, player reports, commends, questions, bugs and suggestions. Staff only." },
  { key: "ticket_private_log", label: "Private ticket transcripts", kind: "text", required: false, hint: "Host applications and host reports. Host Management only." },
] as const;

const ALL_CHANNEL_FIELDS = [...CHANNEL_FIELDS, ...TICKET_CHANNEL_FIELDS] as const;
export type ChannelKey = (typeof ALL_CHANNEL_FIELDS)[number]["key"];

export const RULE_FIELDS = [
  { key: "trusted_commends", label: "Commends for Trusted", min: 1, max: 100, step: 1, hint: "Commends in a mode that earn that mode's Trusted role (with Verified, no game ban)." },
  { key: "warnings_for_ban", label: "Warnings for an automatic game ban", min: 1, max: 20, step: 1, hint: "Warnings in a mode that ban the player from that mode until they drop below." },
  { key: "host_full_at", label: "Acclamations to reach Full host", min: 1, max: 50, step: 1, hint: "Per branch." },
  { key: "host_senior_at", label: "Acclamations to reach Senior host", min: 1, max: 100, step: 1, hint: "Per branch. Never below the Full number." },
  { key: "host_strip_at", label: "Violations that strip the rank", min: 1, max: 20, step: 1, hint: "Per branch: the host loses that branch's rank." },
  { key: "valor_merit", label: "Merit for Hearts of Valor", min: 1, max: 1000, step: 1, hint: "Merit points needed." },
  { key: "valor_games", label: "Attended games for Hearts of Valor", min: 0, max: 1000, step: 1, hint: "Games the player was marked present in." },
  { key: "hosting_success_avg", label: "Rating that counts as successful hosting", min: 1, max: 5, step: 0.1, hint: "Average player rating out of 5." },
] as const;
export type RuleKey = (typeof RULE_FIELDS)[number]["key"];
export const RULE_DEFAULTS: Record<RuleKey, number> = {
  trusted_commends: 5,
  warnings_for_ban: 3,
  host_full_at: 2,
  host_senior_at: 4,
  host_strip_at: 3,
  valor_merit: 25,
  valor_games: 50,
  hosting_success_avg: 3.0,
};

export interface ServerSettings {
  schema: 1;
  general: { community_name: string };
  access: {
    /** Host Management (the key keeps its old name): the rank above Senior hosts. */
    senior_staff_roles: string[];
    staff_can_edit_settings: boolean;
    /** Ticket Support: handle HOI4 verification tickets only. */
    ticket_support_roles: string[];
    /** Developers: see bug report and suggestion tickets. */
    developer_roles: string[];
  };
  branches: Record<Branch, { enabled: boolean; ranks: Record<Rank, string | null>; ranks_on: Record<OptionalRank, boolean> }>;
  roles: {
    verified: Record<Branch, string | null>;
    trusted: Record<Branch, string | null>;
    game_ban: Record<Branch, string | null>;
    /** Shown while a player has an active Dishonored restriction in that branch. */
    dishonored: Record<Branch, string | null>;
    /** Pinged when a game of that branch is announced (a mode can use its own). */
    ping: Record<Branch, string | null>;
    vip: string | null;
    valor: string | null;
    crash_report_ping: string | null;
  };
  channels: Record<ChannelKey, string | null>;
  /** Waiting-room voice channels: people in them are never counted present. */
  lobby_voices: string[];
  voice: Record<Branch, { after_category: string | null; before_category: string | null }>;
  modes: Record<string, ModeSettings>;
  rules: Record<RuleKey, number>;
  features: {
    valor_merit: boolean;
    daily_role_check: boolean;
    vip_auto_carry_over: boolean;
    /** Tell staff when someone game-banned on another GameMaster server joins. */
    cross_server_ban_alerts: boolean;
    /** Ping after 24 h without messages in a ticket, close it as unresolved after 48 h. */
    ticket_inactivity_close: boolean;
  };
  /** TommyKay only: the casino / Fortunes add-on channels. */
  addons: { casino_panel_channel: string | null; randomizer_log_channel: string | null; fortunes_log_channel: string | null };
}

// ————— What the bot mirrors (web_guild_snapshot) —————

export interface SnapshotRole {
  id: string;
  name: string;
  position: number;
  color: string | null;
  managed: boolean;
  mentionable: boolean;
  hoist: boolean;
  everyone: boolean;
  members: number;
}

export type ChannelType = "text" | "news" | "voice" | "stage" | "category" | "forum";

export interface SnapshotChannel {
  id: string;
  name: string;
  type: ChannelType;
  parent_id: string | null;
  position: number;
  bot: { view: boolean; send: boolean; embed: boolean; attach: boolean; threads: boolean; manage: boolean; connect: boolean; move: boolean };
}

export interface GuildSnapshot {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    owner_id: string | null;
    member_count: number;
    system_channel_id: string | null;
    community: boolean;
  };
  roles: SnapshotRole[];
  channels: SnapshotChannel[];
  bot: { user_id: string | null; permissions: string; top_role_id: string | null; top_role_position: number };
  staff_user_ids: string[];
  updated_at: number;
}

// ————— The bot's permissions (invite link + health check) —————

export const REQUIRED_PERMISSIONS: readonly { bit: number; name: string; why: string }[] = [
  { bit: 10, name: "View Channels", why: "See the channels it posts in." },
  { bit: 11, name: "Send Messages", why: "Announcements, the scheduling panel, logs." },
  { bit: 14, name: "Embed Links", why: "Rich announcement and log cards." },
  { bit: 15, name: "Attach Files", why: "Chat logs, crash reports and ticket transcripts." },
  { bit: 16, name: "Read Message History", why: "Write ticket transcripts and spot inactive tickets." },
  { bit: 13, name: "Manage Messages", why: "Pin the scheduling panel and clean up its own old posts." },
  { bit: 17, name: "Mention Everyone", why: "Ping a mode's role on announcements even if the role isn't mentionable." },
  { bit: 18, name: "Use External Emojis", why: "GameMaster's own emojis in its messages." },
  { bit: 28, name: "Manage Roles", why: "Give host ranks, Verified, Trusted, bans, VIP and each game's pass role." },
  { bit: 4, name: "Manage Channels", why: "Create and remove each game's voice channels and each ticket's channel." },
  { bit: 20, name: "Connect", why: "Check who is in the game's voice channels." },
  { bit: 24, name: "Move Members", why: "Move players from the lobby into their nation's voice channel." },
];
export const ADMINISTRATOR_BIT = 3;

/** Add GameMaster to a server (Discord's "Add to server" screen, then back to its setup). */
export function inviteUrl(guildId?: string): string {
  const params = new URLSearchParams({ invite: "1" });
  if (guildId) params.set("guild_id", guildId);
  return `/api/auth/login?${params.toString()}`;
}

/** The permissions integer for the invite link. */
export function invitePermissions(): string {
  return REQUIRED_PERMISSIONS.reduce((sum, perm) => sum | (BigInt(1) << BigInt(perm.bit)), BigInt(0)).toString();
}

export function hasPermission(permissions: string, bit: number): boolean {
  try {
    const value = BigInt(permissions || "0");
    if ((value >> BigInt(ADMINISTRATOR_BIT)) & BigInt(1)) return true;
    return Boolean((value >> BigInt(bit)) & BigInt(1));
  } catch {
    return false;
  }
}

// ————— Defaults + normalization (mirrors bot.py.py) —————

const DEFAULT_LINKS: Record<string, { mods: LinkEntry[]; rules: LinkEntry[] }> = {
  Roleplay: {
    mods: [
      { name: "Road to 56 Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=820260968" },
      { name: "The Road to 56 RP Submod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=2790635823" },
    ],
    rules: [],
  },
  "Roleplay (Millennium Dawn)": {
    mods: [{ name: "Millennium Dawn: A Modern Day Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=2777392649" }],
    rules: [],
  },
  "Roleplay (Novum Vexillum)": {
    mods: [{ name: "Novum Vexillum", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=1827273767" }],
    rules: [],
  },
  "Kaiserreich (FFA)": {
    mods: [
      { name: "Kaiserreich", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=1521695605" },
      { name: "Kaiserreich FFA", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=3820086060" },
    ],
    rules: [],
  },
  TFR: {
    mods: [
      { name: "The Fire Rises (TFR) Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=3350890356" },
      { name: "TFR MP Submod (By Adds)", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=3780172444" },
    ],
    rules: [],
  },
  "Historical (Vanilla)": {
    mods: [{ name: "Vanilla Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=1827273767" }],
    rules: [],
  },
  "Historical (TFB)": {
    mods: [
      { name: "Their Finest Bruh Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=2559317737" },
      {
        name: "Their Finest Cope Submod",
        link: "https://steamcommunity.com/sharedfiles/filedetails/?id=3642935694&searchtext=their+finest+cope",
      },
    ],
    rules: [],
  },
  "Historical (Oak)": {
    mods: [{ name: "Hearts of Oak 2 Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=2566601386" }],
    rules: [],
  },
  "Historical (Horst)": {
    mods: [
      { name: "Horstorical Multiplayer 2 Mod", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=3516496049&searchtext=horst" },
    ],
    rules: [],
  },
  "Historical (BFFU)": {
    mods: [{ name: "BFFU 2", link: "https://steamcommunity.com/sharedfiles/filedetails/?id=3765324616" }],
    rules: [],
  },
};

function emptyMode(key: string): ModeSettings {
  const links = DEFAULT_LINKS[key] ?? { mods: [], rules: [] };
  return {
    // A new server switches on only the modes it runs.
    enabled: false,
    announcement_channel: null,
    game_info_channel: null,
    rules_channel: null,
    mods_channel: null,
    public_log_channel: null,
    ping_role: null,
    mod_links: links.mods.map((entry) => ({ ...entry })),
    rule_links: links.rules.map((entry) => ({ ...entry })),
  };
}

export function defaultSettings(name = ""): ServerSettings {
  const perBranch = <T,>(make: () => T) => ({ RP: make(), HIST: make() });
  return {
    schema: 1,
    general: { community_name: name.slice(0, 60) },
    access: {
      senior_staff_roles: [],
      staff_can_edit_settings: false,
      ticket_support_roles: [],
      developer_roles: [],
    },
    branches: perBranch(() => ({
      enabled: true,
      ranks: { Assistant: null, Full: null, Senior: null },
      ranks_on: { Assistant: true, Senior: true },
    })),
    roles: {
      verified: perBranch(() => null),
      trusted: perBranch(() => null),
      game_ban: perBranch(() => null),
      dishonored: perBranch(() => null),
      ping: perBranch(() => null),
      vip: null,
      valor: null,
      crash_report_ping: null,
    },
    channels: Object.fromEntries(ALL_CHANNEL_FIELDS.map((field) => [field.key, null])) as Record<ChannelKey, string | null>,
    lobby_voices: [],
    voice: perBranch(() => ({ after_category: null, before_category: null })),
    modes: Object.fromEntries(MODE_CATALOG.map((mode) => [mode.key, emptyMode(mode.key)])),
    rules: { ...RULE_DEFAULTS },
    features: {
      valor_merit: true,
      daily_role_check: true,
      vip_auto_carry_over: true,
      cross_server_ban_alerts: true,
      ticket_inactivity_close: true,
    },
    addons: { casino_panel_channel: null, randomizer_log_channel: null, fortunes_log_channel: null },
  };
}

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** A Discord id, or null (same as the bot's _sid). */
export function sid(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && text !== "0" ? text : null;
}

function sids(value: unknown): string[] {
  const out: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const id = sid(entry);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function links(value: unknown): LinkEntry[] {
  return (Array.isArray(value) ? value : [])
    .map(obj)
    .map((entry) => ({ name: String(entry.name ?? "").trim().slice(0, 100), link: String(entry.link ?? "").trim().slice(0, 500) }))
    .filter((entry) => entry.name && /^https?:\/\/\S+$/.test(entry.link) && !/[()[\]\s]/.test(entry.link))
    .slice(0, 20);
}

/** Stored or submitted settings → complete and type-checked (mirrors _normalize_guild_settings). */
export function normalizeSettings(raw: unknown, name = ""): ServerSettings {
  const source = obj(raw);
  const s = defaultSettings(name);
  const general = obj(source.general);
  if (typeof general.community_name === "string") s.general.community_name = general.community_name.trim().slice(0, 60);
  const access = obj(source.access);
  s.access.senior_staff_roles = sids(access.senior_staff_roles);
  s.access.staff_can_edit_settings = Boolean(access.staff_can_edit_settings);
  s.access.ticket_support_roles = sids(access.ticket_support_roles);
  s.access.developer_roles = sids(access.developer_roles);
  const branches = obj(source.branches);
  for (const branch of BRANCHES) {
    const entry = obj(branches[branch]);
    const ranks = obj(entry.ranks);
    const on = obj(entry.ranks_on);
    s.branches[branch] = {
      enabled: entry.enabled === undefined ? true : Boolean(entry.enabled),
      ranks: { Assistant: sid(ranks.Assistant), Full: sid(ranks.Full), Senior: sid(ranks.Senior) },
      ranks_on: {
        Assistant: on.Assistant === undefined ? true : Boolean(on.Assistant),
        Senior: on.Senior === undefined ? true : Boolean(on.Senior),
      },
    };
  }
  if (!BRANCHES.some((branch) => s.branches[branch].enabled)) s.branches.RP.enabled = true;
  const roles = obj(source.roles);
  for (const key of ["verified", "trusted", "game_ban", "dishonored", "ping"] as const) {
    // Older settings had one Dishonored role for both branches.
    if (key === "dishonored" && typeof roles.dishonored === "string") {
      s.roles.dishonored = { RP: sid(roles.dishonored), HIST: sid(roles.dishonored) };
      continue;
    }
    const per = obj(roles[key]);
    s.roles[key] = { RP: sid(per.RP), HIST: sid(per.HIST) };
  }
  for (const key of ["vip", "valor", "crash_report_ping"] as const) s.roles[key] = sid(roles[key]);
  const channels = obj(source.channels);
  for (const field of ALL_CHANNEL_FIELDS) s.channels[field.key] = sid(channels[field.key]);
  // Older settings: one lobby channel.
  s.lobby_voices = Array.isArray(source.lobby_voices) ? sids(source.lobby_voices) : sids([channels.lobby_voice]);
  const voice = obj(source.voice);
  for (const branch of BRANCHES) {
    const entry = obj(voice[branch]);
    s.voice[branch] = { after_category: sid(entry.after_category), before_category: sid(entry.before_category) };
  }
  const modes = obj(source.modes);
  for (const mode of MODE_CATALOG) {
    if (!(mode.key in modes)) continue;
    const entry = obj(modes[mode.key]);
    s.modes[mode.key] = {
      enabled: entry.enabled === undefined ? true : Boolean(entry.enabled),
      announcement_channel: sid(entry.announcement_channel),
      game_info_channel: sid(entry.game_info_channel),
      rules_channel: sid(entry.rules_channel),
      mods_channel: sid(entry.mods_channel),
      public_log_channel: sid(entry.public_log_channel),
      ping_role: sid(entry.ping_role),
      mod_links: links(entry.mod_links),
      rule_links: links(entry.rule_links),
    };
  }
  for (const branch of BRANCHES) {
    if (!s.roles.ping[branch]) {
      const first = MODE_CATALOG.find((mode) => mode.branch === branch && s.modes[mode.key]?.ping_role);
      s.roles.ping[branch] = first ? s.modes[first.key].ping_role : null;
    }
  }
  const rules = obj(source.rules);
  for (const field of RULE_FIELDS) {
    const rawValue = Number(rules[field.key] ?? RULE_DEFAULTS[field.key]);
    const value = Number.isFinite(rawValue) ? rawValue : RULE_DEFAULTS[field.key];
    const rounded = field.step < 1 ? Math.round(value * 10) / 10 : Math.trunc(value);
    s.rules[field.key] = Math.min(field.max, Math.max(field.min, rounded));
  }
  const features = obj(source.features);
  for (const key of ["valor_merit", "daily_role_check", "vip_auto_carry_over", "cross_server_ban_alerts", "ticket_inactivity_close"] as const) {
    if (key in features) s.features[key] = Boolean(features[key]);
  }
  const addons = obj(source.addons);
  for (const key of ["casino_panel_channel", "randomizer_log_channel", "fortunes_log_channel"] as const) s.addons[key] = sid(addons[key]);
  return s;
}

/** Leaf-level differences: [{path, before, after}] (mirrors _settings_changes). */
export function settingsChanges(before: unknown, after: unknown, prefix = ""): { path: string; before: unknown; after: unknown }[] {
  const a = obj(before);
  const b = obj(after);
  const out: { path: string; before: unknown; after: unknown }[] = [];
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    const path = prefix ? `${prefix}.${key}` : key;
    const left = a[key];
    const right = b[key];
    const isObj = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
    if (isObj(left) && isObj(right)) out.push(...settingsChanges(left, right, path));
    else if (JSON.stringify(left) !== JSON.stringify(right)) out.push({ path, before: left ?? null, after: right ?? null });
  }
  return out;
}

// ————— Wizard steps + health check —————

export type StepId = "welcome" | "basics" | "staff" | "branches" | "roles" | "channels" | "tickets" | "modes" | "features" | "review";
export const STEPS: readonly { id: StepId; label: string; icon: string; blurb: string }[] = [
  { id: "welcome", label: "Bot check", icon: "🤖", blurb: "Permissions and role position" },
  { id: "basics", label: "Basics", icon: "🏷️", blurb: "Name and host branches" },
  { id: "staff", label: "Staff & access", icon: "🛡️", blurb: "Host Management and who edits settings" },
  { id: "branches", label: "Host ranks", icon: "🎖️", blurb: "Assistant, Full and Senior hosts" },
  { id: "roles", label: "Player roles", icon: "🪪", blurb: "Verified, Trusted, bans, VIP" },
  { id: "channels", label: "Channels", icon: "📺", blurb: "Logs, schedule, voice" },
  { id: "tickets", label: "Tickets", icon: "🎫", blurb: "Ticket staff, channels and auto-close" },
  { id: "modes", label: "Game modes", icon: "🎮", blurb: "Modes, their channels and ping roles" },
  { id: "features", label: "Features", icon: "✨", blurb: "Hearts of Valor and more" },
  { id: "review", label: "Review", icon: "✅", blurb: "Check everything and finish" },
];

/** Which step a settings path belongs to (history + issue links). */
export function stepOfPath(path: string): StepId {
  if (path.startsWith("general") || path.match(/^branches\.\w+\.enabled/)) return "basics";
  if (/^(access\.(ticket_support|developer)_roles|channels\.ticket|features\.ticket_)/.test(path)) return "tickets";
  if (path.startsWith("access")) return "staff";
  if (path.startsWith("branches") || path.startsWith("rules.host_")) return "branches";
  if (path.startsWith("roles.valor") || path.startsWith("features") || path.startsWith("rules.valor") || path.startsWith("rules.hosting")) return "features";
  if (path.startsWith("roles") || path.startsWith("rules")) return "roles";
  if (path.startsWith("channels") || path.startsWith("voice") || path.startsWith("addons") || path.startsWith("lobby_voices")) return "channels";
  if (path.startsWith("modes")) return "modes";
  return "review";
}

export interface SettingsIssue {
  level: "error" | "warning";
  step: StepId;
  path: string;
  message: string;
}

/** Everything wrong or worth a look, given the server as the bot last saw it. */
export function settingsIssues(s: ServerSettings, snap: GuildSnapshot | null, botPresent: boolean): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  const add = (level: SettingsIssue["level"], step: StepId, path: string, message: string) =>
    issues.push({ level, step, path, message });
  if (!botPresent) add("error", "welcome", "bot", "GameMaster isn't in this server. Add it first.");
  if (!snap) {
    add("error", "welcome", "bot", "GameMaster hasn't reported this server's roles and channels yet — wait a minute and reload.");
    return issues;
  }

  const roles = new Map(snap.roles.map((role) => [role.id, role]));
  const channels = new Map(snap.channels.map((channel) => [channel.id, channel]));
  const top = snap.bot.top_role_position;
  for (const perm of REQUIRED_PERMISSIONS) {
    if (!hasPermission(snap.bot.permissions, perm.bit)) add("error", "welcome", `perm.${perm.bit}`, `GameMaster is missing **${perm.name}** — ${perm.why}`);
  }

  // A role GameMaster gives out must exist, be below its own role and not be a bot / integration role.
  const givenRole = (step: StepId, path: string, id: string | null, label: string, required: boolean) => {
    if (!id) {
      if (required) add("error", step, path, `Pick the ${label} role.`);
      return;
    }
    const role = roles.get(id);
    if (!role) add("error", step, path, `The ${label} role no longer exists — pick another.`);
    else if (role.everyone) add("error", step, path, `@everyone can't be the ${label} role.`);
    else if (role.managed) add("error", step, path, `${role.name} belongs to a bot or integration — GameMaster can't give it out.`);
    else if (role.position >= top) add("error", step, path, `${role.name} is above GameMaster's own role. In Server Settings → Roles, drag GameMaster above it.`);
  };
  // A role only checked (staff, host-page access): must exist.
  const checkedRole = (step: StepId, path: string, id: string, label: string) => {
    if (!roles.has(id)) add("error", step, path, `A ${label} role no longer exists — remove it.`);
  };
  const channel = (step: StepId, path: string, id: string | null, label: string, kind: string, required: boolean) => {
    if (!id) {
      if (required) add("error", step, path, `Pick the ${label}.`);
      return;
    }
    const found = channels.get(id);
    if (!found) {
      add("error", step, path, `The ${label} no longer exists — pick another.`);
      return;
    }
    if (kind === "voice") {
      if (found.type !== "voice" && found.type !== "stage") add("error", step, path, `The ${label} must be a voice channel.`);
      else if (!found.bot.view || !found.bot.move) add("warning", step, path, `GameMaster can't see or move people in #${found.name}.`);
    } else if (kind === "category") {
      if (found.type !== "category") add("error", step, path, `The ${label} must be a category.`);
    } else {
      const ok = kind === "forum_or_text" ? ["text", "news", "forum"] : ["text", "news"];
      if (!ok.includes(found.type)) add("error", step, path, `The ${label} must be a text channel${kind === "forum_or_text" ? " or forum" : ""}.`);
      else if (!found.bot.view || !found.bot.send) add("error", step, path, `GameMaster can't post in #${found.name} — give it View Channel and Send Messages there.`);
      else if (!found.bot.embed) add("warning", step, path, `GameMaster can't embed links in #${found.name}.`);
    }
  };

  if (!s.general.community_name.trim()) add("warning", "basics", "general.community_name", "Give your community a name.");
  if (s.access.senior_staff_roles.length === 0) {
    add(
      "warning",
      "staff",
      "access.senior_staff_roles",
      "No Host Management role — only server admins can manage VIP, verification, host ranks, other hosts' games, host applications and host reports.",
    );
  }
  s.access.senior_staff_roles.forEach((id, i) => checkedRole("staff", `access.senior_staff_roles.${i}`, id, "Host Management"));
  s.access.ticket_support_roles.forEach((id, i) => checkedRole("tickets", `access.ticket_support_roles.${i}`, id, "Ticket Support"));
  s.access.developer_roles.forEach((id, i) => checkedRole("tickets", `access.developer_roles.${i}`, id, "Developer"));

  const used = new Map<string, string[]>();
  const markUsed = (id: string | null, label: string) => {
    if (id) used.set(id, [...(used.get(id) ?? []), label]);
  };
  for (const branch of BRANCHES) {
    if (!s.branches[branch].enabled) continue;
    for (const rank of RANKS) {
      if (rank !== "Full" && !s.branches[branch].ranks_on[rank]) continue;
      const id = s.branches[branch].ranks[rank];
      givenRole("branches", `branches.${branch}.ranks.${rank}`, id, `${branch} ${RANK_INFO[rank].label}`, true);
      markUsed(id, `${branch} ${rank} host`);
    }
    givenRole("roles", `roles.verified.${branch}`, s.roles.verified[branch], `${branch} Verified`, true);
    givenRole("roles", `roles.trusted.${branch}`, s.roles.trusted[branch], `${branch} Trusted`, true);
    givenRole("roles", `roles.game_ban.${branch}`, s.roles.game_ban[branch], `${branch} game ban`, true);
    givenRole("roles", `roles.dishonored.${branch}`, s.roles.dishonored[branch], `${branch} Dishonored`, false);
    markUsed(s.roles.trusted[branch], `${branch} Trusted`);
    markUsed(s.roles.game_ban[branch], `${branch} game ban`);
    const ping = s.roles.ping[branch];
    if (!ping) add("warning", "roles", `roles.ping.${branch}`, `No ${branch} notification ping role — ${BRANCH_INFO[branch].games} announcements won't ping anyone.`);
    else {
      const role = roles.get(ping);
      if (!role) add("error", "roles", `roles.ping.${branch}`, `The ${branch} notification ping role no longer exists.`);
      else if (!role.mentionable && !hasPermission(snap.bot.permissions, 17)) {
        add("warning", "roles", `roles.ping.${branch}`, `${role.name} isn't mentionable and GameMaster lacks Mention Everyone — the ping won't notify anyone.`);
      }
    }
  }
  if (s.rules.host_senior_at < s.rules.host_full_at) {
    add("warning", "branches", "rules.host_senior_at", "Senior needs fewer Acclamations than Full — GameMaster will use the Full number for both.");
  }
  givenRole("roles", "roles.vip", s.roles.vip, "VIP", false);
  markUsed(s.roles.vip, "VIP");
  if (s.roles.crash_report_ping) checkedRole("roles", "roles.crash_report_ping", s.roles.crash_report_ping, "crash report ping");
  if (s.features.valor_merit) {
    givenRole("features", "roles.valor", s.roles.valor, "Hearts of Valor", true);
    markUsed(s.roles.valor, "Hearts of Valor");
  }
  for (const [id, labels] of used) {
    if (labels.length > 1) {
      const role = roles.get(id);
      add("warning", stepOfPath(labels[0].includes("host") ? "branches" : "roles"), `dup.${id}`, `${role?.name ?? "One role"} is used for ${labels.join(" and ")} — each usually needs its own role.`);
    }
  }

  for (const field of CHANNEL_FIELDS) channel("channels", `channels.${field.key}`, s.channels[field.key], field.label.toLowerCase(), field.kind, field.required);
  for (const field of TICKET_CHANNEL_FIELDS) channel("tickets", `channels.${field.key}`, s.channels[field.key], field.label.toLowerCase(), field.kind, field.required);
  if (s.channels.tickets && !s.channels.ticket_category) {
    add("warning", "tickets", "channels.ticket_category", "No ticket category — new tickets would be made at the top of the server. Pick a category staff can see.");
  }
  if (s.channels.tickets && s.access.ticket_support_roles.length === 0) {
    add("warning", "tickets", "access.ticket_support_roles", "No Ticket Support role — only Host Management and admins can handle verification tickets.");
  }
  if (s.lobby_voices.length === 0) {
    add("error", "channels", "lobby_voices", "Pick at least one game lobby voice channel — otherwise players waiting in the lobby are counted as present in games.");
  }
  s.lobby_voices.forEach((id, i) => {
    const found = channels.get(id);
    if (!found) add("error", "channels", `lobby_voices.${i}`, "A game lobby voice channel no longer exists — remove it.");
    else if (found.type !== "voice" && found.type !== "stage") add("error", "channels", `lobby_voices.${i}`, `#${found.name} isn't a voice channel.`);
  });
  for (const branch of BRANCHES) {
    if (!s.branches[branch].enabled) continue;
    channel("channels", `voice.${branch}.after_category`, s.voice[branch].after_category, `${branch} game voice category`, "category", false);
    channel("channels", `voice.${branch}.before_category`, s.voice[branch].before_category, `${branch} "stay above" category`, "category", false);
  }

  const activeModes = MODE_CATALOG.filter((mode) => s.branches[mode.branch].enabled && s.modes[mode.key]?.enabled);
  if (activeModes.length === 0) add("error", "modes", "modes", "Turn on at least one game mode.");
  for (const mode of activeModes) {
    const settings = s.modes[mode.key];
    for (const field of MODE_CHANNEL_FIELDS) {
      channel("modes", `modes.${mode.key}.${field.key}`, settings[field.key], `${mode.label} ${field.label.toLowerCase()}`, "text", field.required);
    }
    if (!settings.ping_role) continue; // the branch's notification ping role is used
    {
      const role = roles.get(settings.ping_role);
      if (!role) add("error", "modes", `modes.${mode.key}.ping_role`, `${mode.label}'s ping role no longer exists.`);
      else if (!role.mentionable && !hasPermission(snap.bot.permissions, 17)) {
        add("warning", "modes", `modes.${mode.key}.ping_role`, `${role.name} isn't mentionable and GameMaster lacks Mention Everyone — the ping won't notify anyone.`);
      }
    }
  }
  return issues;
}

/** Modes that are off (their own switch or their branch's) — hidden on the calendar. */
export function disabledModes(s: ServerSettings | null): string[] {
  if (!s) return [];
  return MODE_CATALOG.filter((mode) => !s.branches[mode.branch].enabled || !s.modes[mode.key]?.enabled).map((mode) => mode.key);
}

/** Steps that still have blocking problems. */
export function blockingSteps(issues: SettingsIssue[]): Set<StepId> {
  return new Set(issues.filter((issue) => issue.level === "error").map((issue) => issue.step));
}

// ————— API shapes —————

export type ServerAccess = "owner" | "admin" | "staff";
export type SetupState = "not_added" | "needs_setup" | "active";

export interface ServerSummary {
  id: string;
  name: string;
  icon_url: string | null;
  access: ServerAccess;
  bot_present: boolean;
  setup: SetupState;
  is_home: boolean;
  member_count: number | null;
}

export type ServersResponse =
  | { status: "anonymous" }
  | { status: "needs_scope"; username: string }
  | { status: "unavailable"; message: string }
  | { status: "ok"; username: string; servers: ServerSummary[]; demo: boolean };

export interface HistoryEntry {
  version: number;
  actor_name: string | null;
  summary: string | null;
  changes: { path: string; before: unknown; after: unknown }[];
  created_at: number;
}

export interface ServerDetail {
  server: ServerSummary;
  settings: ServerSettings;
  version: number;
  setup_step: StepId | null;
  completed_at: number | null;
  updated_at: number | null;
  snapshot: GuildSnapshot | null;
  history: HistoryEntry[];
  /** The viewer's Discord id (the bot ignores its own "you" in staff lists). */
  viewer_id: string;
}

export interface SaveSettingsBody {
  settings: ServerSettings;
  version: number;
  step?: StepId;
  finish?: boolean;
}

/** POST /api/servers/<id>/create — "Create for me" (bot: _process_web_server_setup). */
export interface CreateItemBody {
  op: "create_role" | "create_channel";
  kind?: "text" | "voice" | "category" | "forum";
  name: string;
  color?: string;
  mentionable?: boolean;
  hoist?: boolean;
  parent_id?: string | null;
}

/** A short history line: which steps a save touched. */
export function changeSummary(changes: { path: string }[], finish: boolean): string {
  const steps = [...new Set(changes.map((change) => stepOfPath(change.path)))]
    .map((id) => STEPS.find((step) => step.id === id)?.label ?? id);
  const what = changes.length === 0 ? "" : `${steps.join(", ")} (${changes.length} change${changes.length === 1 ? "" : "s"})`;
  if (finish) return what ? `Finished setup — ${what}` : "Finished setup";
  return what ? `Changed ${what}` : "No changes";
}
