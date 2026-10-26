import type { RowDataPacket } from "mysql2";
import { currentGuildId, playerRecords, readBotConfig } from "@/lib/currentGuild";
import { getPool } from "@/lib/db";
import { lookupMembers } from "@/lib/memberDirectory";
import { demoMemberRoles } from "@/lib/memberRolesDemo";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import type { HostProfile } from "@/lib/scheduleTypes";
import { HOST_RANKS, type HostBranch, type HostRank } from "@/lib/hostBranches";
import {
  VERIFIED_TRACKS,
  type HostTier,
  type MemberRoles,
  type Verification,
  type VipCategory,
  type VipDetails,
  type VipGrant,
  type VipStatus,
} from "@/lib/memberRolesTypes";

/**
 * A member's verification and VIP on the Database page, read from what the
 * bot keeps: users (hoi4_verified = RP, hist_verified = Hist, vip), the
 * moderation_events log (who verified them), vip_grants (shared by every
 * server running the bot) and web_member_directory (their current roles).
 * Changes go to the bot as "member_roles" requests. Per server (multi-server):
 * the home server's records are in users, other servers' in guild_users.
 */

export interface RoleIds {
  rp_verified: string | null;
  hist_verified: string | null;
  vip: string | null;
  /** Trusted (RP / Historical) and Hearts of Valor — the player card's checks. */
  rp_trusted: string | null;
  hist_trusted: string | null;
  valor: string | null;
  /** Rank roles per host branch (HIST is null until the bot has created them). */
  host_ranks: Record<HostBranch, Record<HostRank, string | null>>;
}

const NO_RANKS: Record<HostRank, string | null> = { Assistant: null, Full: null, Senior: null };
/** Every server, home included, knows only what its setup chose (published by the bot). */
const NO_ROLES: RoleIds = {
  rp_verified: null,
  hist_verified: null,
  vip: null,
  rp_trusted: null,
  hist_trusted: null,
  valor: null,
  host_ranks: { RP: { ...NO_RANKS }, HIST: { ...NO_RANKS } },
};
const roleCache = new Map<string, { at: number; value: RoleIds }>();

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

async function optional<T extends RowDataPacket>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    const [rows] = await getPool().query<T[]>(sql, params);
    return rows;
  } catch (error) {
    if (errorCode(error) === "ER_NO_SUCH_TABLE" || errorCode(error) === "ER_BAD_FIELD_ERROR") return [];
    throw error;
  }
}

function json(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const value: unknown = JSON.parse(raw);
      return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/** The role ids the bot published for a server (Hist Verified is created at startup). */
export async function memberRoleIds(guildId?: string): Promise<RoleIds> {
  if (isSchedulerDemo()) {
    return {
      rp_verified: "700000000000000001",
      hist_verified: "700000000000000002",
      vip: "700000000000000003",
      rp_trusted: "700000000000000004",
      hist_trusted: "700000000000000005",
      valor: "700000000000000006",
      host_ranks: {
        RP: { Assistant: "700000000000000021", Full: "700000000000000022", Senior: "700000000000000023" },
        HIST: { Assistant: "700000000000000011", Full: "700000000000000012", Senior: "700000000000000013" },
      },
    };
  }
  const guild = guildId ?? (await currentGuildId());
  const cached = roleCache.get(guild);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  let published: unknown = null;
  try {
    published = await readBotConfig(guild, "web_member_roles");
  } catch (error) {
    if (errorCode(error) !== "ER_NO_SUCH_TABLE" && errorCode(error) !== "ER_BAD_FIELD_ERROR") throw error;
  }
  const raw = json(published);
  const fallbackOf = NO_ROLES;
  const id = (value: unknown) => (typeof value === "string" && /^\d{5,25}$/.test(value) ? value : null);
  const ranks = json(raw.host_ranks);
  const branchRanks = (branch: HostBranch): Record<HostRank, string | null> => {
    const fromBot = json(ranks[branch]);
    const fallback = fallbackOf.host_ranks[branch];
    return {
      Assistant: id(fromBot.Assistant) ?? fallback.Assistant,
      Full: id(fromBot.Full) ?? fallback.Full,
      Senior: id(fromBot.Senior) ?? fallback.Senior,
    };
  };
  const value: RoleIds = {
    rp_verified: id(raw.rp_verified) ?? fallbackOf.rp_verified,
    hist_verified: id(raw.hist_verified),
    vip: id(raw.vip) ?? fallbackOf.vip,
    rp_trusted: id(raw.rp_trusted) ?? fallbackOf.rp_trusted,
    hist_trusted: id(raw.hist_trusted) ?? fallbackOf.hist_trusted,
    valor: id(raw.valor) ?? fallbackOf.valor,
    host_ranks: { RP: branchRanks("RP"), HIST: branchRanks("HIST") },
  };
  roleCache.set(guild, { at: Date.now(), value });
  return value;
}

interface UserRow extends RowDataPacket {
  [column: string]: unknown;
}
interface EventRow extends RowDataPacket {
  action: string;
  mode: string | null;
  reason: string | null;
  actor_id: string | null;
  created_at: number | string;
}
interface GrantRow extends RowDataPacket {
  grant_id: string;
  guild_id: string;
  guild_name: string | null;
  category: string;
  details: unknown;
  status: string;
  source_guild_name: string | null;
  source_grant_id: string | null;
  granted_by: string | null;
  granted_at: number | string;
  decided_by: string | null;
  decided_at: number | string | null;
  decision_note: string | null;
}
interface DirectoryRow extends RowDataPacket {
  role_ids: string | null;
}

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const flag = (value: unknown) => value === true || value === 1 || value === "1";
const VIP_CATEGORY_SET = new Set<VipCategory>(["content_creator", "pdx_staff", "highly_trusted"]);
const VIP_STATUS_SET = new Set<VipStatus>(["active", "pending", "removed", "declined"]);

function toDetails(raw: unknown): VipDetails {
  const data = json(raw);
  const links = Array.isArray(data.links)
    ? data.links
        .map((link) => json(link))
        .filter((link) => typeof link.url === "string")
        .map((link) => ({ platform: String(link.platform ?? "Other"), url: String(link.url) }))
    : undefined;
  return {
    ...(links ? { links } : {}),
    ...(typeof data.reason === "string" ? { reason: data.reason } : {}),
    ...(typeof data.note === "string" ? { note: data.note } : {}),
  };
}

export async function getMemberRoles(userId: string, viewer: HostProfile): Promise<MemberRoles> {
  if (isSchedulerDemo()) return demoMemberRoles(userId, viewer);
  const guildId = viewer.guild_id;
  const records = playerRecords(guildId);
  const [users, events, grants, directory, roleIds] = await Promise.all([
    optional<UserRow>(`SELECT * FROM ${records.table} WHERE ${records.where}`, [...records.whereParams, userId]),
    optional<EventRow>(
      `SELECT action, mode, reason, CAST(actor_id AS CHAR) AS actor_id, created_at FROM moderation_events
       WHERE guild_id = ? AND user_id = CAST(? AS UNSIGNED) AND action IN ('verified_granted', 'verified_removed', 'host_tier_set')
       ORDER BY created_at DESC, id DESC LIMIT 40`,
      [guildId, userId],
    ),
    optional<GrantRow>("SELECT * FROM vip_grants WHERE user_id = ? ORDER BY granted_at DESC LIMIT 50", [userId]),
    optional<DirectoryRow>("SELECT role_ids FROM web_member_directory WHERE guild_id = ? AND user_id = ?", [guildId, userId]),
    memberRoleIds(guildId),
  ]);
  const user = users[0] ?? {};
  // Read the role ids as digit strings — JSON.parse would round 19-digit snowflakes.
  const roles = directory[0]?.role_ids ? new Set(directory[0].role_ids.match(/\d{5,25}/g) ?? []) : null;

  const actorIds = [
    ...events.map((event) => event.actor_id),
    ...grants.flatMap((grant) => [grant.granted_by, grant.decided_by]),
  ].filter((id): id is string => Boolean(id));
  const people = await lookupMembers(actorIds, guildId);
  const nameOf = (id: string | null) => {
    if (!id) return null;
    const person = people.get(id);
    return person ? person.display_name || person.username || `#${id}` : `#${id}`;
  };

  const verification: Verification[] = VERIFIED_TRACKS.map(({ track, label }) => {
    const roleId = track === "Roleplay" ? roleIds.rp_verified : roleIds.hist_verified;
    const column = track === "Roleplay" ? "hoi4_verified" : "hist_verified";
    const has = roles && roleId ? roles.has(roleId) : flag(user[column]);
    const latest = events.find((event) => event.mode === track && event.action !== "host_tier_set");
    const granted = latest?.action === "verified_granted" ? latest : null;
    const removed = latest?.action === "verified_removed" ? latest : null;
    return {
      track,
      label,
      has,
      granted_by: has && granted ? nameOf(granted.actor_id) : null,
      granted_at: has && granted ? num(granted.created_at) : null,
      removed_by: !has && removed ? nameOf(removed.actor_id) : null,
      removed_at: !has && removed ? num(removed.created_at) : null,
      removed_reason: !has && removed ? removed.reason : null,
      role_ready: Boolean(roleId),
    };
  });

  const toGrant = (row: GrantRow): VipGrant | null => {
    const category = row.category as VipCategory;
    const status = row.status as VipStatus;
    if (!VIP_CATEGORY_SET.has(category) || !VIP_STATUS_SET.has(status)) return null;
    return {
      grant_id: row.grant_id,
      category,
      details: toDetails(row.details),
      status,
      from_server: row.source_grant_id ? row.source_guild_name || "another server" : null,
      granted_by: nameOf(row.granted_by),
      granted_at: num(row.granted_at),
      decided_by: nameOf(row.decided_by),
      decided_at: row.decided_at === null ? null : num(row.decided_at),
      decision_note: row.decision_note,
    };
  };
  const local = grants.filter((row) => String(row.guild_id) === guildId).map(toGrant).filter((grant): grant is VipGrant => grant !== null);
  const elsewhere = grants
    .filter((row) => String(row.guild_id) !== guildId && row.status === "active" && !row.source_grant_id)
    .filter((row) => VIP_CATEGORY_SET.has(row.category as VipCategory))
    .map((row) => ({ server: row.guild_name || "Another server", category: row.category as VipCategory, granted_at: num(row.granted_at) }));

  const hostBranch = (branch: HostBranch) => {
    const rankRoles = roleIds.host_ranks[branch];
    const fromRoles: HostTier | null = roles
      ? ([...HOST_RANKS].reverse().find((rank) => {
          const id = rankRoles[rank];
          return Boolean(id && roles.has(id));
        }) ?? "None")
      : null;
    const column = String(user[branch === "RP" ? "hoi4_host_tier" : "hist_host_tier"] ?? "None").replace("Trial", "Assistant");
    const fromColumn: HostTier = (HOST_RANKS as readonly string[]).includes(column) ? (column as HostRank) : "None";
    // Older changes (before the branches) have no mode — they were RP.
    const event = events.find((entry) => entry.action === "host_tier_set" && (entry.mode ?? "RP") === branch);
    return {
      branch,
      tier: fromRoles ?? fromColumn,
      changed_by: event ? nameOf(event.actor_id) : null,
      changed_at: event ? num(event.created_at) : null,
      note: event?.reason ?? null,
      // Assistant and Senior can be switched off in the server settings (no role then).
      roles_ready: Boolean(rankRoles.Full),
      tiers: ["None", ...HOST_RANKS.filter((rank) => Boolean(rankRoles[rank]))] as HostTier[],
    };
  };

  return {
    verification,
    host: { branches: [hostBranch("RP"), hostBranch("HIST")] },
    vip: {
      has_role: roles && roleIds.vip ? roles.has(roleIds.vip) : flag(user.vip),
      current: local.find((grant) => grant.status === "active") ?? null,
      pending: local.find((grant) => grant.status === "pending") ?? null,
      history: local.filter((grant) => grant.status === "removed" || grant.status === "declined").slice(0, 10),
      elsewhere,
    },
    can_manage: viewer.is_staff,
  };
}
