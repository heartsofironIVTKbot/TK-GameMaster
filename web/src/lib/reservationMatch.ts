import { canonicalName, nationMatchKeys } from "@/data/nationCategories";
import type { LobbyReservation } from "@/lib/types";

/**
 * Find a map nation's reservation even when the bot and the map name it
 * differently: the bot (draft picks, host placements) stores "Germany" while
 * the Vanilla map calls the same nation "German Reich". The exact slot name
 * wins; otherwise the same name matching the roster sections use.
 */

const COOP_RE = /^(.*)_coop(?:_\d+)?$/;

interface MapNation {
  tag: string;
  slot_key?: string | null;
  name: string;
}

export interface ReservationLookup {
  /** The main (non-co-op) reservation of a map nation. */
  main(nation: MapNation): LobbyReservation | undefined;
  /** The co-op players of a map nation. */
  coops(nation: MapNation): LobbyReservation[];
}

export function reservationLookup(reservations: readonly LobbyReservation[]): ReservationLookup {
  const exact = new Map<string, LobbyReservation>();
  const byKey = new Map<string, LobbyReservation>();
  const coopExact = new Map<string, LobbyReservation[]>();
  const coopByKey = new Map<string, LobbyReservation[]>();
  const push = (map: Map<string, LobbyReservation[]>, key: string, reservation: LobbyReservation) =>
    map.set(key, [...(map.get(key) ?? []), reservation]);
  for (const reservation of reservations) {
    const slot = reservation.slot_key;
    if (slot.startsWith("_FILL_")) continue;
    const coop = slot.match(COOP_RE);
    if (coop) {
      push(coopExact, coop[1], reservation);
      push(coopByKey, canonicalName(coop[1]), reservation);
    } else {
      exact.set(slot, reservation);
      const key = canonicalName(slot);
      if (!byKey.has(key)) byKey.set(key, reservation);
    }
  }
  const keysOf = (nation: MapNation) => nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name);
  return {
    main(nation) {
      const direct = nation.slot_key ? exact.get(nation.slot_key) : undefined;
      if (direct) return direct;
      for (const key of keysOf(nation)) {
        const hit = byKey.get(key);
        if (hit) return hit;
      }
      return undefined;
    },
    coops(nation) {
      const direct = nation.slot_key ? coopExact.get(nation.slot_key) : undefined;
      if (direct) return direct;
      for (const key of keysOf(nation)) {
        const hit = coopByKey.get(key);
        if (hit) return hit;
      }
      return [];
    },
  };
}
