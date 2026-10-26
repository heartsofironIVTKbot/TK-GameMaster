import { demoDirectory } from "@/lib/liveDemo";
import { HOST_BRANCH_VALUES, type HostBranch } from "@/lib/hostBranches";
import type { RoleScanChange, RoleScanResult, RoleScanState } from "@/lib/roleScanTypes";
import type { HostProfile, RequestState, ScheduleRequestStatus } from "@/lib/scheduleTypes";
import {
  HOST_TIERS,
  LINK_RE,
  VERIFIED_TRACKS,
  VIP_LINK_MAX_LEN,
  VIP_MAX_LINKS,
  VIP_NOTE_MAX,
  VIP_REASON_MAX,
  VIP_REASON_MIN,
  vipCategoryMeta,
  vipPlatform,
  type HostTier,
  type MemberRoles,
  type VerifiedTrack,
  type VipCategory,
  type VipDetails,
  type VipGrant,
} from "@/lib/memberRolesTypes";

/**
 * Preview mode (SCHEDULER_DEMO=1) for verification and VIP on the Database
 * page: sample records and a simulated bot with the same rules as bot.py.py's
 * apply_verification / apply_vip_grant / apply_vip_remove / apply_vip_decision.
 * Showcases: Otto is RP + Hist Verified (with who did it), Wilhelm is a
 * Content Creator VIP (also VIP on another server), Lena has a Highly Trusted
 * VIP from another server waiting for approval, Pieter said he isn't PDX staff.
 */

const DEMO_HOST_ID = "100000000000000001";
const OTHER_SERVER = "Kaiserreich Community";
const DAY = 86_400;

interface DemoVerifyEvent {
  user: string;
  track: VerifiedTrack;
  action: "verified_granted" | "verified_removed";
  by: string;
  at: number;
  reason: string | null;
}

interface DemoGrant extends Omit<VipGrant, "granted_by" | "decided_by"> {
  user_id: string;
  server: string | null; // null = this server
  granted_by: string | null;
  decided_by: string | null;
}

interface DemoHostTier {
  tier: HostTier;
  by: string | null;
  at: number | null;
  note: string | null;
}

interface DemoState {
  /** Keyed "<user id>:<branch>". */
  hostTiers: Map<string, DemoHostTier>;
  verified: Map<string, Record<VerifiedTrack, boolean>>;
  events: DemoVerifyEvent[];
  vipRole: Set<string>;
  grants: DemoGrant[];
}

const nowSec = () => Math.floor(Date.now() / 1000);
const id = (index: number) => demoDirectory()[index].discord_id;

function seed(): DemoState {
  const now = nowSec();
  const verified = new Map<string, Record<VerifiedTrack, boolean>>();
  for (const member of demoDirectory()) verified.set(member.discord_id, { Roleplay: member.verified, Historical: false });
  const both = (userId: string) => verified.set(userId, { Roleplay: true, Historical: true });
  both(id(1));
  both(id(3));
  both(id(4));
  const grant = (fields: Partial<DemoGrant> & Pick<DemoGrant, "user_id" | "category" | "status">): DemoGrant => ({
    grant_id: Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32),
    details: {},
    from_server: null,
    server: null,
    granted_by: DEMO_HOST_ID,
    granted_at: now - 30 * DAY,
    decided_by: null,
    decided_at: null,
    decision_note: null,
    ...fields,
  });
  // Same hosts as the demo Host standing cards (databaseDemo initialHost).
  // Demo Host: Senior in both; Erwin: Full RP + Assistant HIST; Winston: Assistant RP; Lena: Senior HIST.
  const hostTiers = new Map<string, DemoHostTier>([
    [`${id(0)}:RP`, { tier: "Senior", by: null, at: null, note: null }],
    [`${id(0)}:HIST`, { tier: "Senior", by: null, at: null, note: null }],
    [`${id(3)}:RP`, { tier: "Full", by: "200000000000000002", at: now - 20 * DAY, note: "Solid hosting" }],
    [`${id(3)}:HIST`, { tier: "Assistant", by: DEMO_HOST_ID, at: now - 4 * DAY, note: "Starting on Historical" }],
    [`${id(7)}:RP`, { tier: "Assistant", by: DEMO_HOST_ID, at: now - 9 * DAY, note: null }],
    [`${id(9)}:HIST`, { tier: "Senior", by: null, at: null, note: null }],
  ]);
  return {
    hostTiers,
    verified,
    events: [
      { user: id(1), track: "Roleplay", action: "verified_granted", by: "200000000000000002", at: now - 90 * DAY, reason: "Ticket #118" },
      { user: id(1), track: "Historical", action: "verified_granted", by: DEMO_HOST_ID, at: now - 6 * DAY, reason: "Ticket #204" },
    ],
    vipRole: new Set([id(4)]),
    grants: [
      grant({
        user_id: id(4),
        category: "content_creator",
        status: "active",
        granted_at: now - 40 * DAY,
        details: {
          links: [
            { platform: "YouTube", url: "https://www.youtube.com/@kaiserbill" },
            { platform: "Twitch", url: "https://www.twitch.tv/kaiserbill" },
          ],
        },
      }),
      grant({
        user_id: id(4),
        category: "content_creator",
        status: "active",
        server: OTHER_SERVER,
        granted_by: "300000000000000003",
        granted_at: now - 120 * DAY,
        details: { links: [{ platform: "YouTube", url: "https://www.youtube.com/@kaiserbill" }] },
      }),
      grant({
        user_id: id(9),
        category: "highly_trusted",
        status: "pending",
        from_server: OTHER_SERVER,
        granted_by: null,
        granted_at: now - 2 * 3600,
        details: { reason: "Has moderated the Kaiserreich Community for three years and ran our winter tournament." },
      }),
      grant({
        user_id: id(11),
        category: "pdx_staff",
        status: "removed",
        granted_at: now - 12 * DAY,
        decided_by: id(11),
        decided_at: now - 12 * DAY + 600,
        decision_note: "Said they aren't Paradox staff",
      }),
    ],
  };
}

function store(): DemoState {
  const holder = globalThis as { __gmMemberRolesDemoV3?: DemoState };
  if (!holder.__gmMemberRolesDemoV3) holder.__gmMemberRolesDemoV3 = seed();
  return holder.__gmMemberRolesDemoV3;
}

/** The demo member's rank in a branch (the demo Host standing card reads and promotes it too). */
export function demoHostTier(userId: string, branch: HostBranch): HostTier {
  return store().hostTiers.get(`${userId}:${branch}`)?.tier ?? "None";
}

export function setDemoHostTier(userId: string, branch: HostBranch, tier: HostTier): void {
  const key = `${userId}:${branch}`;
  const current = store().hostTiers.get(key);
  store().hostTiers.set(key, { tier, by: current?.by ?? null, at: current?.at ?? null, note: current?.note ?? null });
}

function nameOf(userId: string | null): string | null {
  if (!userId) return null;
  if (userId === DEMO_HOST_ID) return "Demo Host";
  if (userId === "200000000000000002") return "Senior Host";
  if (userId === "300000000000000003") return "Casino Host";
  const member = demoDirectory().find((entry) => entry.discord_id === userId);
  return member ? member.display_name || member.username : `#${userId}`;
}

/** Per-mode verification for the demo portfolio (Trusted needs the mode's Verified). */
export function demoIsVerified(userId: string, track: VerifiedTrack): boolean {
  return store().verified.get(userId)?.[track] ?? false;
}

export function demoMemberRoles(userId: string, viewer: HostProfile): MemberRoles {
  const state = store();
  const toGrant = (grant: DemoGrant): VipGrant => ({
    grant_id: grant.grant_id,
    category: grant.category,
    details: grant.details,
    status: grant.status,
    from_server: grant.from_server,
    granted_by: nameOf(grant.granted_by),
    granted_at: grant.granted_at,
    decided_by: nameOf(grant.decided_by),
    decided_at: grant.decided_at,
    decision_note: grant.decision_note,
  });
  const mine = state.grants.filter((grant) => grant.user_id === userId);
  const local = mine.filter((grant) => grant.server === null).sort((a, b) => b.granted_at - a.granted_at);
  const active = local.find((grant) => grant.status === "active");
  const pending = local.find((grant) => grant.status === "pending");
  const hostBranch = (branch: HostBranch) => {
    const host = state.hostTiers.get(`${userId}:${branch}`);
    return {
      branch,
      tier: host?.tier ?? "None",
      changed_by: nameOf(host?.by ?? null),
      changed_at: host?.at ?? null,
      note: host?.note ?? null,
      roles_ready: true,
      tiers: ["None", "Assistant", "Full", "Senior"] as HostTier[],
    };
  };
  return {
    host: { branches: [hostBranch("RP"), hostBranch("HIST")] },
    verification: VERIFIED_TRACKS.map(({ track, label }) => {
      const has = demoIsVerified(userId, track);
      const latest = state.events.filter((event) => event.user === userId && event.track === track).sort((a, b) => b.at - a.at)[0];
      return {
        track,
        label,
        has,
        granted_by: has && latest?.action === "verified_granted" ? nameOf(latest.by) : null,
        granted_at: has && latest?.action === "verified_granted" ? latest.at : null,
        removed_by: !has && latest?.action === "verified_removed" ? nameOf(latest.by) : null,
        removed_at: !has && latest?.action === "verified_removed" ? latest.at : null,
        removed_reason: !has && latest?.action === "verified_removed" ? latest.reason : null,
        role_ready: true,
      };
    }),
    vip: {
      has_role: state.vipRole.has(userId),
      current: active ? toGrant(active) : null,
      pending: pending ? toGrant(pending) : null,
      history: local.filter((grant) => grant.status === "removed" || grant.status === "declined").map(toGrant),
      elsewhere: mine
        .filter((grant) => grant.server !== null && grant.status === "active")
        .map((grant) => ({ server: grant.server as string, category: grant.category, granted_at: grant.granted_at })),
    },
    can_manage: viewer.is_staff,
  };
}

// --- the simulated bot ----------------------------------------------------------

type DemoOutcome = { status: RequestState; result: ScheduleRequestStatus["result"]; error: string | null };
const refuse = (error: string): DemoOutcome => ({ status: "error", result: null, error });
const done = (title: string, summary: string, notes: string[] = []): DemoOutcome => ({
  status: "done",
  result: { moderation: { title, summary, notes, stats: {}, log_url: "https://discord.com/channels/@me" } },
  error: null,
});

function details(category: VipCategory, payload: Record<string, unknown>): VipDetails | string {
  if (category === "content_creator") {
    const raw = Array.isArray(payload.links) ? payload.links.map((link) => String(link ?? "").trim()).filter(Boolean) : [];
    const seen = new Set<string>();
    const links = [];
    for (const url of raw) {
      if (url.length > VIP_LINK_MAX_LEN || !LINK_RE.test(url)) return `❌ \`${url.slice(0, 60)}\` isn't a valid link — use the full https:// address.`;
      if (seen.has(url.toLowerCase())) continue;
      seen.add(url.toLowerCase());
      links.push({ platform: vipPlatform(url), url });
    }
    if (links.length === 0) return "❌ Add at least one channel link (YouTube, Twitch, Kick…).";
    if (links.length > VIP_MAX_LINKS) return `❌ At most ${VIP_MAX_LINKS} links.`;
    return { links };
  }
  if (category === "pdx_staff") {
    const note = String(payload.note ?? "").replace(/\s+/g, " ").trim().slice(0, VIP_NOTE_MAX);
    return note ? { note } : {};
  }
  const reason = String(payload.reason ?? "").trim();
  if (reason.length < VIP_REASON_MIN) return `❌ Say why they're highly trusted (at least ${VIP_REASON_MIN} characters).`;
  return { reason: reason.slice(0, VIP_REASON_MAX) };
}

/** The VIP bundle's Verified roles (recorded as "Comes with VIP", like the bot). */
function giveVipVerified(state: DemoState, userId: string, hostId: string, now: number) {
  const current = state.verified.get(userId) ?? { Roleplay: false, Historical: false };
  for (const track of ["Roleplay", "Historical"] as const) {
    if (!current[track]) {
      state.events.push({ user: userId, track, action: "verified_granted", by: hostId, at: now, reason: "Comes with VIP" });
    }
  }
  state.verified.set(userId, { Roleplay: true, Historical: true });
}

// --- the role check (formerly /scan) ------------------------------------------------

interface DemoScanState {
  done: Set<string>;
  last: { preview: RoleScanResult | null; apply: RoleScanResult | null };
}

function scanStore(): DemoScanState {
  const holder = globalThis as { __gmRoleScanDemoV1?: DemoScanState };
  if (!holder.__gmRoleScanDemoV1) {
    const now = nowSec();
    holder.__gmRoleScanDemoV1 = {
      done: new Set(),
      last: {
        preview: null,
        // Yesterday's automatic run.
        apply: {
          applied: true, trigger: "daily", by: null, finished_at: now - 15 * 3600, members_checked: 412, members_scanned: 96,
          counts: { trusted_add: 1, trusted_remove: 0, valor_add: 0, valor_remove: 0, dishonored_add: 0, dishonored_remove: 0, record: 1 },
          total: 2,
          changes: [
            { user_id: id(1), name: "Otto", kind: "trusted_add", role: "HOI4 RP Trusted", detail: "6 commends" },
            { user_id: id(5), name: "Jan", kind: "record", role: "Host tier", detail: "database fixed to None" },
          ],
          errors: [],
        },
      },
    };
  }
  return holder.__gmRoleScanDemoV1;
}

/** What the demo server's roles would change (the bot's scan rules, on sample data). */
function demoScanChanges(): RoleScanChange[] {
  const scan = scanStore();
  const changes: RoleScanChange[] = [];
  const add = (index: number, kind: RoleScanChange["kind"], role: string, detail: string, when = true) => {
    const member = demoDirectory()[index];
    const key = `${member.discord_id}:${kind}:${role}`;
    const name = member.display_name || member.username || member.discord_id;
    if (when && !scan.done.has(key)) changes.push({ user_id: member.discord_id, name, kind, role, detail });
  };
  // Historical Trusted now needs Hist Verified.
  add(9, "trusted_remove", "HOI4 MP Trusted", "no Hist Verified", !demoIsVerified(id(9), "Historical"));
  add(2, "trusted_remove", "HOI4 MP Trusted", "no Hist Verified", !demoIsVerified(id(2), "Historical"));
  add(6, "trusted_remove", "HOI4 RP Trusted", "4 commends (needs 5)");
  add(10, "valor_add", "Hearts of Valor", "26 Merit");
  add(13, "dishonored_remove", "Dishonored", "no active restriction");
  add(12, "record", "RP Verified", "database says verified — fixed to match Discord", !demoIsVerified(id(12), "Roleplay"));
  return changes;
}

function demoScanResult(applied: boolean, hostId: string | null, trigger: RoleScanResult["trigger"]): RoleScanResult {
  const changes = demoScanChanges();
  const counts = { trusted_add: 0, trusted_remove: 0, valor_add: 0, valor_remove: 0, dishonored_add: 0, dishonored_remove: 0, record: 0 };
  for (const change of changes) counts[change.kind] += 1;
  return {
    applied, trigger, by: hostId, by_name: nameOf(hostId), finished_at: nowSec(),
    members_checked: 412, members_scanned: 96, counts, total: changes.length, changes, errors: [],
  };
}

export function demoRoleScanState(isStaff: boolean): RoleScanState {
  const { last } = scanStore();
  return { preview: last.preview, apply: last.apply, can_run: isStaff, daily_at_utc: "04:00" };
}

/** The bot's _process_web_role_scan (it runs in the background there; instant here). */
export function applyDemoRoleScan(payload: Record<string, unknown>, hostId: string, isStaff: boolean): DemoOutcome {
  if (!isStaff) return refuse("❌ Only Host Management (or admins) can run the role check.");
  const mode = payload.mode;
  if (mode !== "preview" && mode !== "apply") return refuse("❌ Choose preview or apply.");
  const scan = scanStore();
  const result = demoScanResult(mode === "apply", hostId, "web");
  if (mode === "apply") for (const change of result.changes) scan.done.add(`${change.user_id}:${change.kind}:${change.role}`);
  scan.last[mode] = result;
  return { status: "done", result: { role_scan: result }, error: null };
}

/** The bot's _process_web_member_roles (staff check, then the op). */
export function applyDemoMemberRoles(payload: Record<string, unknown>, hostId: string, isStaff: boolean): DemoOutcome {
  const state = store();
  const userId = String(payload.user_id ?? "");
  const member = demoDirectory().find((entry) => entry.discord_id === userId);
  const name = member ? member.display_name || member.username : `#${userId}`;
  const op = String(payload.op ?? "");
  const now = nowSec();
  const reason = String(payload.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

  if (op === "verify" || op === "unverify") {
    if (!isStaff) return refuse("❌ Only admins and Host Management can verify players.");
    const track = VERIFIED_TRACKS.find((entry) => entry.track === payload.track);
    if (!track) return refuse("❌ Pick RP Verified or Hist Verified.");
    if (!member) return refuse("❌ They're not in the server.");
    const grant = op === "verify";
    if (!grant && reason.length < 3) return refuse("❌ Please give a reason for taking it away.");
    const current = state.verified.get(userId) ?? { Roleplay: false, Historical: false };
    const already = current[track.track] === grant;
    current[track.track] = grant;
    state.verified.set(userId, current);
    state.events.push({ user: userId, track: track.track, action: grant ? "verified_granted" : "verified_removed", by: hostId, at: now, reason: reason || null });
    const notes = already ? [grant ? `ℹ️ Already had **${track.label}**.` : `ℹ️ They didn't have ${track.label}.`] : [];
    if (!grant && !already) notes.push(`Their ${track.track === "Roleplay" ? "HOI4 RP" : "HOI4 MP"} Trusted role (if they have it) goes at the next role scan.`);
    return done(`🪪 ${track.label} ${grant ? "Granted" : "Removed"}`, `${name} — ${track.label} ${grant ? "given" : "taken away"}.`, notes);
  }

  if (op === "host_tier") {
    if (!isStaff) return refuse("❌ Only Host Management (or admins) can change host roles.");
    const branch = HOST_BRANCH_VALUES.find((value) => value === payload.branch);
    if (!branch) return refuse("❌ Pick a host branch: RP or HIST.");
    const tier = HOST_TIERS.find((entry) => entry.value === payload.tier);
    if (!tier) return refuse("❌ Pick a host rank: Assistant, Full, Senior or none.");
    if (userId === hostId) return refuse("❌ You can't change your own host role — ask another Host Management member.");
    if (tier.value === "None" && reason.length < 3) return refuse("❌ Please give a reason for taking the host role away.");
    if (!member) return refuse("❌ They're not in the server.");
    const key = `${userId}:${branch}`;
    const before = state.hostTiers.get(key)?.tier ?? "None";
    if (before === tier.value) {
      return refuse(tier.value === "None" ? `ℹ️ They aren't in the ${branch} branch.` : `ℹ️ They're already ${tier.value} ${branch} Host.`);
    }
    state.hostTiers.set(key, { tier: tier.value, by: hostId, at: now, note: reason || null });
    const label = (value: HostTier) => (value === "None" ? `no ${branch} host role` : `${value} ${branch} Host`);
    return done(
      tier.value === "None" ? `🎖️ ${branch} Host Role Removed` : `🎖️ ${branch} Host Rank Updated`,
      `${name}: ${label(before)} → ${label(tier.value).replace(/^no/, "No")}.`,
    );
  }

  if (!isStaff) {
    return refuse(op === "vip_remove" ? "❌ Only Host Management can take VIP away." : "❌ Only Host Management (or admins) can give VIP.");
  }
  const local = state.grants.filter((grant) => grant.user_id === userId && grant.server === null);

  if (op === "vip_grant") {
    const category = vipCategoryMeta(String(payload.category ?? ""));
    if (!category) return refuse("❌ Pick a VIP category: Content Creator, PDX Staff or Highly Trusted.");
    const parsed = details(category.value, payload);
    if (typeof parsed === "string") return refuse(parsed);
    if (userId === hostId) return refuse("❌ You can't give yourself VIP — ask another Host Management member.");
    if (!member) return refuse("❌ They're not in the server — VIP can only be given to members.");
    const notes: string[] = [];
    for (const grant of local) {
      if (grant.status === "active" || grant.status === "pending") {
        Object.assign(grant, { status: "removed", decided_by: hostId, decided_at: now, decision_note: "Replaced by a new VIP grant" });
        notes.push(`Replaced their earlier ${vipCategoryMeta(grant.category)?.label} VIP.`);
      }
    }
    state.grants.push({
      grant_id: crypto.randomUUID().replace(/-/g, ""),
      user_id: userId,
      category: category.value,
      details: parsed,
      status: "active",
      from_server: null,
      server: null,
      granted_by: hostId,
      granted_at: now,
      decided_by: null,
      decided_at: null,
      decision_note: null,
    });
    state.vipRole.add(userId);
    giveVipVerified(state, userId, hostId, now);
    notes.push("VIP, RP Verified, Hist Verified, HOI4 RP Trusted and HOI4 MP Trusted given.");
    if (category.value === "pdx_staff") notes.push("They got a DM about it, with a \"This isn't me\" button.");
    return done(`🌟 VIP — ${category.label}`, `${name} is now VIP (${category.label}).`, notes);
  }

  if (op === "vip_remove") {
    if (reason.length < 3) return refuse("❌ Please give a reason.");
    const active = local.filter((grant) => grant.status === "active");
    if (active.length === 0 && !state.vipRole.has(userId)) return refuse("ℹ️ They aren't VIP here.");
    for (const grant of active) Object.assign(grant, { status: "removed", decided_by: hostId, decided_at: now, decision_note: reason });
    state.vipRole.delete(userId);
    return done("🚫 VIP Removed", `${name} is no longer VIP.`, ["✅ Removed **VIP**. Their Verified and Trusted roles stay."]);
  }

  if (op === "vip_approve" || op === "vip_decline") {
    const pending = local.find((grant) => grant.status === "pending");
    if (!pending) return refuse("ℹ️ There's no VIP from another server waiting for approval.");
    const approve = op === "vip_approve";
    Object.assign(pending, { status: approve ? "active" : "declined", decided_by: hostId, decided_at: now, decision_note: reason || null });
    if (approve) {
      state.vipRole.add(userId);
      giveVipVerified(state, userId, hostId, now);
    }
    const origin = pending.from_server ?? "another server";
    return done(
      approve ? `🌟 VIP from ${origin} approved` : `✖️ VIP from ${origin} declined`,
      `${name} — ${vipCategoryMeta(pending.category)?.label} VIP ${approve ? "given here" : "not given here"}.`,
    );
  }
  return refuse(`❌ Unknown role action: ${op}.`);
}
