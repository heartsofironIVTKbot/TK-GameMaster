import type { LobbyReservation } from "@/lib/types";

/**
 * Live map host tools — shared shapes. A "player" is anyone the host can
 * drag: a search result (no slot yet) or someone already on the board.
 */

export interface HostPlayer {
  user_id: string;
  name: string;
  avatar_url: string | null;
  /** Their current reservation slot in this lobby (null = not on it). */
  from_slot: string | null;
}

/** Drop point (viewport px) — where the action menus open. */
export interface DropPoint {
  x: number;
  y: number;
}

const DRAG_MIME = "application/x-gm-player";

export function writeDragPlayer(event: React.DragEvent | DragEvent, player: HostPlayer): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(player));
  event.dataTransfer.setData("text/plain", player.name);
  event.dataTransfer.effectAllowed = "move";
}

/** True while something we can drop is being dragged (dragover/dragenter). */
export function isPlayerDrag(event: React.DragEvent | DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(DRAG_MIME);
}

export function readDragPlayer(event: React.DragEvent | DragEvent): HostPlayer | null {
  try {
    const raw = event.dataTransfer?.getData(DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HostPlayer;
    return typeof parsed?.user_id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Best name for a reserved player: in-game nickname, Discord name, id. */
export function reservationName(reservation: LobbyReservation): string {
  return (
    reservation.ingame_nickname?.trim() ||
    reservation.display_name?.trim() ||
    reservation.username?.trim() ||
    `#${reservation.user_id}`
  ).slice(0, 32);
}

export function playerFromReservation(reservation: LobbyReservation): HostPlayer {
  return {
    user_id: String(reservation.user_id),
    name: reservationName(reservation),
    avatar_url: reservation.avatar_url ?? null,
    from_slot: reservation.slot_key,
  };
}

/** "German Reich_coop_2" → "German Reich (Co-op 2)", "_FILL_Free_Georgia" → "Free Georgia". */
export function prettySlot(slotKey: string): string {
  if (slotKey.startsWith("_FILL_")) return slotKey.slice(6).replace(/_/g, " ").trim() || "Filler";
  const coop = slotKey.match(/^(.*)_coop(?:_(\d+))?$/);
  if (coop) return `${coop[1]} (Co-op${coop[2] ? ` ${coop[2]}` : ""})`;
  return slotKey;
}
