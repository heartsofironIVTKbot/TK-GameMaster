/**
 * Member roles on the Database page (bot.py.py "MEMBER ROLES" — formerly
 * /verify and /make_vip). Client-safe.
 *
 * Verification is split by game type: RP Verified (Roleplay games) and Hist
 * Verified (Historical games). VIP has a category: Content Creator (channel
 * links), PDX Staff (the member gets a DM with a "This isn't me" button) or
 * Highly Trusted (a written reason). Content Creator and PDX Staff VIPs carry
 * over to other servers running the bot by themselves; Highly Trusted ones
 * need that server's staff to approve them.
 */

import type { HostBranch, HostRank } from "@/lib/hostBranches";

export type VerifiedTrack = "Roleplay" | "Historical";
export type VipCategory = "content_creator" | "pdx_staff" | "highly_trusted";
export type VipStatus = "active" | "pending" | "removed" | "declined";
export type MemberRoleOp = "verify" | "unverify" | "vip_grant" | "vip_remove" | "vip_approve" | "vip_decline" | "host_tier";
/** A rank in one host branch ("None" = not in it) — the bot's HOST_TIER_CHOICES. */
export type HostTier = "None" | HostRank;

export const MEMBER_ROLE_OPS: readonly MemberRoleOp[] = [
  "verify",
  "unverify",
  "vip_grant",
  "vip_remove",
  "vip_approve",
  "vip_decline",
  "host_tier",
];
export const HOST_TIERS: readonly { value: HostTier; label: string }[] = [
  { value: "None", label: "None" },
  { value: "Assistant", label: "Assistant" },
  { value: "Full", label: "Full" },
  { value: "Senior", label: "Senior" },
];
export const VERIFIED_TRACKS: readonly { track: VerifiedTrack; label: string; games: string }[] = [
  { track: "Roleplay", label: "RP Verified", games: "Roleplay games" },
  { track: "Historical", label: "Hist Verified", games: "Historical games" },
];

export const VIP_CATEGORIES: readonly {
  value: VipCategory;
  label: string;
  icon: string;
  description: string;
  /** Carries over to other servers without approval. */
  transferable: boolean;
}[] = [
  {
    value: "content_creator",
    label: "Content Creator",
    icon: "🎥",
    description: "YouTube, Twitch, Kick… Add their channel links.",
    transferable: true,
  },
  {
    value: "pdx_staff",
    label: "PDX Staff",
    icon: "🛠️",
    description: "Paradox staff. They get a DM about it, with a \"This isn't me\" button.",
    transferable: true,
  },
  {
    value: "highly_trusted",
    label: "Highly Trusted",
    icon: "🤝",
    description: "Say why they're highly trusted. Other servers have to approve it.",
    transferable: false,
  },
];

/** Mirrors VIP_MAX_LINKS / VIP_REASON_MIN / VIP_REASON_MAX / VIP_NOTE_MAX in bot.py.py. */
export const VIP_MAX_LINKS = 6;
export const VIP_LINK_MAX_LEN = 200;
export const VIP_REASON_MIN = 20;
export const VIP_REASON_MAX = 1000;
export const VIP_NOTE_MAX = 300;

export interface VipLink {
  platform: string;
  url: string;
}

export interface VipDetails {
  links?: VipLink[];
  reason?: string;
  note?: string;
}

export interface Verification {
  track: VerifiedTrack;
  label: string;
  has: boolean;
  /** Who gave it and when (null = before records were kept, or never). */
  granted_by: string | null;
  granted_at: number | null;
  /** The last removal, when they don't have it. */
  removed_by: string | null;
  removed_at: number | null;
  removed_reason: string | null;
  /** False until the bot has set up the role (Hist Verified, on its first start). */
  role_ready: boolean;
}

export interface VipGrant {
  grant_id: string;
  category: VipCategory;
  details: VipDetails;
  status: VipStatus;
  /** The server it came from (carried over), else null. */
  from_server: string | null;
  granted_by: string | null;
  granted_at: number;
  decided_by: string | null;
  decided_at: number | null;
  decision_note: string | null;
}

export interface VipElsewhere {
  server: string;
  category: VipCategory;
  granted_at: number;
}

export interface MemberRoles {
  verification: Verification[];
  vip: {
    /** Holds the VIP role here (also when it was given before records were kept). */
    has_role: boolean;
    current: VipGrant | null;
    /** A Highly Trusted VIP from another server waiting for this server's approval. */
    pending: VipGrant | null;
    /** Earlier VIPs here, newest first. */
    history: VipGrant[];
    /** Active VIPs on other servers. */
    elsewhere: VipElsewhere[];
  };
  /** Host rank in each branch on this server (host roles don't carry over to other servers). */
  host: {
    branches: {
      branch: HostBranch;
      tier: HostTier;
      /** The last change made on the website (null = set before records were kept). */
      changed_by: string | null;
      changed_at: number | null;
      note: string | null;
      /** False until the bot has created this branch's rank roles. */
      roles_ready: boolean;
      /** The ranks this server uses in the branch ("None" first); switched-off tiers are left out. */
      tiers: HostTier[];
    }[];
  };
  /** Host Management (and admins) may change these. */
  can_manage: boolean;
}

/** POST /api/schedule/requests {action: "member_roles", payload}. */
export interface MemberRolesPayload {
  user_id: string;
  op: MemberRoleOp;
  track?: VerifiedTrack;
  tier?: HostTier;
  branch?: HostBranch;
  category?: VipCategory;
  links?: string[];
  reason?: string;
  note?: string;
}

export function vipCategoryMeta(category: string) {
  return VIP_CATEGORIES.find((entry) => entry.value === category) ?? null;
}

/** The platform the bot shows for a link (its _vip_platform). */
export function vipPlatform(url: string): string {
  const host = (url.match(/^https?:\/\/([^/:?#]+)/i)?.[1] ?? "").toLowerCase().replace(/^www\./, "");
  const platforms: [string, string[]][] = [
    ["YouTube", ["youtube.com", "youtu.be"]],
    ["Twitch", ["twitch.tv"]],
    ["Kick", ["kick.com"]],
    ["TikTok", ["tiktok.com"]],
    ["X", ["twitter.com", "x.com"]],
  ];
  for (const [name, domains] of platforms) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return name;
  }
  return "Other";
}

export const LINK_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
