/** Shared domain types for the map viewer, top bar, and country drawer. */

import type { LobbyDraft } from "@/lib/draft";

export interface NationFeatureProps {
  tag: string;
  name: string;
  /** ``null`` on void (ownerless) features — they can never be reserved. */
  slot_key: string | null;
  /** Base-game HOI4 nation color ("#RRGGBB") from scripts/svg_to_geojson.py. */
  color?: string;
}

export type NationFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  NationFeatureProps
>;

export type NationFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  NationFeatureProps
> & {
  /** Full world rectangle [minX, minY, maxX, maxY] when the source SVG
      carries an explicit ocean/background path (scripts/build_state_map_svg.py
      emits one; the mapchart SVG does not). The viewer fits this extent so
      the ocean background fills the viewport edge-to-edge. */
  world_bounds?: [number, number, number, number];
};

export interface GameLobby {
  thread_id: string;
  mode: string | null;
  thread_name: string | null;
  /** Scheduled session start, epoch seconds (null until the host sets it). */
  start_timestamp?: number | null;
  /** Discord user id of the lobby host (shown as a badge in the roster). */
  host_id?: string | number | null;
  /** Game already in progress (players can ask to hot-join; hosts add late joiners). */
  game_started?: boolean | number | null;
}

export interface LobbyReservation {
  slot_key: string;
  user_id: string | number;
  rerolls_used?: number;
  /** Shown as the owner's name when the API provides it; else the Discord id. */
  username?: string | null;
  /** HOI4 in-game nickname from the users table (roster tag + popover). */
  ingame_nickname?: string | null;
  /** Badge source: user passed the bot's HOI4 verification gate. */
  hoi4_verified?: boolean | null;
  /** Badge source: host tier ('None' = no badge). */
  host_tier?: string | null;
  /** Discord display name + avatar (bot-mirrored member directory). */
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface AuthUser {
  discord_id: string;
  username: string;
  avatar: string | null;
  /** Discord profile banner hash (CDN: /banners/{id}/{banner}.png). */
  banner?: string | null;
  /** Discord accent color (integer) — banner gradient fallback. */
  accent_color?: number | null;
  /** HOI4 in-game nickname (empty until the onboarding modal is saved). */
  ingame_nickname?: string | null;
}

/** users-table profile returned by /api/auth/me (null when the DB is down). */
export interface MeProfile {
  ingame_nickname: string | null;
  hoi4_verified: boolean;
  host_tier: string | null;
  merit_points: number;
}

/**
 * How the selected nation relates to the active lobby:
 *  - pending  free: being inspected / about to be claimed (yellow snake)
 *  - self     reserved by the signed-in user (green)
 *  - locked   reserved by someone else, not claimable (red)
 *  - coop     reserved major power: Co-Op inspection (electric blue)
 */
export type SelectionKind = "pending" | "self" | "locked" | "coop";

/** Host lock state of the active lobby (from the bot's game document). */
export interface LobbyGameLock {
  /** Global lockdown: no new claims at all. */
  lockdown: boolean;
  /** Host-disabled nation names or whole categories ("Axis", "Europe", ...). */
  locked_regions: string[];
  /** A preset's own nation groups (bot names); absent = the mode's usual grouping. */
  nation_layout?: { name: string; tiers: { label: string | null; nations: string[] }[] }[] | null;
  /** Nations the preset leaves out: not playable, so not listed at all. */
  hidden_nations?: string[];
  /** Draft games: teams, whose turn, and the shared sign-up pool. */
  draft?: LobbyDraft | null;
  /** The game requires IronLegion Steam verification: where to verify (null url = the server's panel). */
  ironlegion?: { verify_url: string | null } | null;
}

/** Roster row state: how a nation relates to the active lobby. */
export type NationRowStatus =
  | "available"
  | "pending"
  | "self"
  | "reserved"
  | "locked";

/** Coarse geographic region used by the Reservation Board grouping. */
export type RegionId =
  | "Europe"
  | "Middle East"
  | "Asia"
  | "Oceania"
  | "North America"
  | "South America"
  | "Africa"
  | "Other";

/** A nation as reported to the Reservation Board: map feature properties +
 * its computed geographic region (see data/nationCategories.ts). */
export type RosterNation = NationFeatureProps & {
  region: RegionId;
};
