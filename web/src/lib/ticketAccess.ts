import type { ServerSettings } from "@/lib/serverSettingsTypes";

/**
 * Who may read a closed ticket on the website — the same people who could
 * see the ticket channel in Discord. Every ticket API goes through
 * canViewTicket. No runtime imports, so tests/ticketAccess.test.mjs can load
 * this file straight into Node.
 */

export type TicketGroup = "support" | "management" | "hosts" | "developers";

/** Keep in sync with bot.py.py TICKET_KINDS (labels, who handles them, private transcripts). */
export const TICKET_KINDS: Record<string, { label: string; staff: TicketGroup[]; private: boolean }> = {
  Verification: { label: "RP Verification", staff: ["support", "management"], private: false },
  "Hist-Verification": { label: "Historical Verification", staff: ["support", "management"], private: false },
  "Host-App": { label: "RP Host Application", staff: ["management"], private: true },
  "Hist-Host-App": { label: "HIST Host Application", staff: ["management"], private: true },
  "Report-Host": { label: "Host Report", staff: ["management"], private: true },
  Appeal: { label: "Appeal", staff: ["hosts", "management"], private: false },
  Behavior: { label: "Player Report", staff: ["hosts", "management"], private: false },
  Commend: { label: "Commend Request", staff: ["hosts", "management"], private: false },
  Question: { label: "General Question", staff: ["hosts", "management"], private: false },
  Bug: { label: "Bug Report / Suggestion", staff: ["developers", "management"], private: false },
};

export interface TicketViewer {
  id: string;
  /** Server admin (or owner) of the ticket's server. */
  isAdmin: boolean;
  /** The viewer's role ids in the ticket's server. */
  roleIds: Set<string>;
}

export interface TicketSubject {
  kind: string;
  opener_id: string;
  /** Game-support tickets: the game's host (they could see the channel). */
  host_id: string | null;
  /** Host reports: the reported host — never shown the ticket. */
  target_id: string | null;
}

type AccessSettings = Pick<ServerSettings, "access" | "branches">;

/** Role ids in one ticket group, from the server's settings. */
export function groupRoleIds(group: TicketGroup, settings: AccessSettings | null): string[] {
  if (!settings) return [];
  switch (group) {
    case "support":
      return settings.access.ticket_support_roles;
    case "management":
      return settings.access.senior_staff_roles;
    case "developers":
      return settings.access.developer_roles;
    case "hosts": {
      const ids: string[] = [];
      for (const branch of Object.values(settings.branches)) {
        if (!branch.enabled) continue;
        const { ranks, ranks_on: on } = branch;
        if (ranks.Assistant && on.Assistant) ids.push(ranks.Assistant);
        if (ranks.Full) ids.push(ranks.Full);
        if (ranks.Senior && on.Senior) ids.push(ranks.Senior);
      }
      return ids;
    }
  }
}

export function canViewTicket(viewer: TicketViewer, ticket: TicketSubject, settings: AccessSettings | null): boolean {
  if (!viewer.id) return false;
  if (ticket.target_id && ticket.target_id === viewer.id) return false;
  if (ticket.opener_id === viewer.id) return true;
  if (ticket.host_id && ticket.host_id === viewer.id) return true;
  if (viewer.isAdmin) return true;
  const groups = TICKET_KINDS[ticket.kind]?.staff ?? (["management"] as TicketGroup[]);
  return groups.some((group) => groupRoleIds(group, settings).some((id) => viewer.roleIds.has(id)));
}
