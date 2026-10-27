/** Closed tickets on the website (/tickets). The bot saves them at close (bot.py.py _ticket_save_record). */

export { TICKET_KINDS } from "@/lib/ticketAccess";

export type TicketStatus = "Resolved" | "Unresolved";

export interface TicketSummary {
  id: string;
  guild_id: string;
  guild_name: string | null;
  number: number;
  kind: string;
  kind_label: string;
  channel_name: string;
  opener_id: string;
  opener_name: string | null;
  status: string;
  closed_by_name: string | null;
  close_reason: string | null;
  opened_at: number;
  closed_at: number;
  message_count: number;
  /** The viewer opened it. */
  mine: boolean;
}

export interface TicketEmbed {
  title: string | null;
  description: string | null;
  fields: { name: string; value: string }[];
}

export interface TicketFile {
  id: string;
  filename: string;
  content_type: string | null;
  bytes: number;
  /** False: too big, failed to download, or cleared after 180 days. */
  kept: boolean;
  /** Shown inline (png / jpg / gif / webp only). */
  image: boolean;
}

export interface TicketMessage {
  position: number;
  author_id: string;
  author_name: string;
  is_bot: boolean;
  created_at: number;
  content: string | null;
  embeds: TicketEmbed[];
  files: TicketFile[];
}

export interface TicketDetail {
  ticket: TicketSummary & { host_id: string | null; closed_by_id: string | null };
  messages: TicketMessage[];
}

export interface TicketListPage {
  tickets: TicketSummary[];
  /** Pass back as ?before= for the next page (null = no more). */
  next_before: string | null;
}

/** Content types the browser may show inline; everything else downloads. */
export const INLINE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
