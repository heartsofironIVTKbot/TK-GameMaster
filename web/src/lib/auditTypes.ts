/** Audit trail (the staff-only /audit page). Rows live in `audit_trail`. */

export const AUDIT_CATEGORIES = [
  "reservation",
  "roster",
  "game",
  "draft",
  "moderation",
  "host",
  "roles",
  "message",
  "settings",
  "system",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  reservation: "Reservations",
  roster: "Roster",
  game: "Games",
  draft: "Drafts",
  moderation: "Moderation",
  host: "Hosts",
  roles: "Roles",
  message: "Messages",
  settings: "Settings",
  system: "System",
};

export type AuditSource = "web" | "bot" | "discord";

export interface AuditEvent {
  id: number;
  created_at: number;
  category: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  target_id: string | null;
  target_name: string | null;
  game_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  source: string;
}

export interface AuditEventInput {
  guildId: string;
  category: AuditCategory;
  action: string;
  summary: string;
  actorId?: string | null;
  actorName?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  gameId?: string | null;
  details?: Record<string, unknown> | null;
  source?: AuditSource;
}

export interface AuditQuery {
  category?: string;
  action?: string;
  actor?: string;
  target?: string;
  /** Either the actor or the target. */
  player?: string;
  game?: string;
  q?: string;
  from?: number;
  to?: number;
  before?: number;
  limit?: number;
}

export interface AuditPage {
  events: AuditEvent[];
  next_before: number | null;
  /** Events per category in the last 7 days (first page only). */
  counts?: Partial<Record<string, number>>;
}

export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 200;
export const AUDIT_EXPORT_MAX = 10_000;
