import type { ActivityItem } from "@/lib/moderationTypes";
import type { StepId } from "@/lib/serverSettingsTypes";

/**
 * Multi-server Stage 3 (docs/server-setup.md): the owner dashboard, the
 * Health tab's live checks and the public /status page. Client-safe.
 */

/** One-click repairs the bot runs (POST /api/servers/<id>/fix). */
export type FixOp = "refresh" | "sync_commands" | "resend_welcome" | "test_post" | "schedule_panel";

export const FIX_ACTIONS: readonly { op: FixOp; label: string; icon: string; hint: string }[] = [
  { op: "refresh", label: "Re-check now", icon: "🔄", hint: "GameMaster re-reads this server's roles, channels and its own permissions." },
  { op: "sync_commands", label: "Re-sync commands", icon: "⌨️", hint: "Re-registers GameMaster's slash commands here (when they're missing or outdated)." },
  { op: "test_post", label: "Test the audit log", icon: "🧪", hint: "Posts a short test message in the audit log channel." },
  {
    op: "schedule_panel",
    label: "Re-post scheduling panel",
    icon: "📅",
    hint: "Posts the scheduling panel again in its channel, pins it and removes the old one.",
  },
  { op: "resend_welcome", label: "Re-send welcome", icon: "👋", hint: "Sends the setup welcome again (owner's DMs, else the system channel)." },
];

export type CheckLevel = "ok" | "warning" | "error";

/** A live check (the settings' own checks come from settingsIssues). */
export interface StatusCheck {
  id: string;
  level: CheckLevel;
  title: string;
  detail: string;
  /** How to fix it: a one-click action, a setup step, or a page. */
  fix?: { op: FixOp } | { step: StepId } | { href: string; label: string };
}

export interface ServerLiveStatus {
  /** null = the bot has never reported a heartbeat (older bot version). */
  bot_online: boolean | null;
  last_beat: number | null;
  started_at: number | null;
  latency_ms: number | null;
  /** When the bot last reported this server's roles / channels. */
  snapshot_at: number | null;
  commands: { synced_at: number | null; count: number | null; error: string | null } | null;
  requests: { stuck: number; failed_24h: number; recent_errors: { action: string; error: string; at: number }[] };
  checks: StatusCheck[];
}

export interface DashboardGame {
  id: string;
  mode: string;
  name: string;
  /** Start (scheduled or actual), epoch seconds. */
  ts: number;
  host_name: string | null;
  players: number | null;
  /** The game's attendance page (recent games). */
  url: string | null;
}

export interface ServerDashboard {
  status: ServerLiveStatus;
  usage: {
    days: number;
    games_hosted: number;
    players: number;
    hosts: number;
    /** Share of reserved players who showed up (games with attendance taken). */
    attendance_rate: number | null;
    modes: { mode: string; games: number }[];
  };
  upcoming: DashboardGame[];
  recent: DashboardGame[];
  staff: {
    top_hosts: { id: string; name: string; avatar_url: string | null; games: number }[];
    moderation: ActivityItem[];
  };
}

/** GET /api/status — public. */
export interface PublicStatus {
  state: "online" | "offline" | "unknown";
  last_beat: number | null;
  started_at: number | null;
  latency_ms: number | null;
  /** Communities GameMaster runs in right now. */
  servers: number | null;
  /** Oldest first; percent null = no data that day. */
  days: { day: string; percent: number | null }[];
  uptime_30d: number | null;
  incidents: { kind: "outage" | "restart"; started_at: number; ended_at: number | null; detail: string | null }[];
  checked_at: number;
}
