"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { orientGeometryForClockwiseTravel } from "./nationGeometry";
import {
  MAJOR_TAGS,
  NationHighlightController,
  type HighlightState,
  type HoverTarget,
} from "./nationHighlights";
import CountryDetailsDrawer from "./CountryDetailsDrawer";
import HotJoinBar from "./HotJoinBar";
import CapitalAvatars, { type CapitalAvatarEntry } from "./CapitalAvatars";
import PlayerProfilePopover, { reservationBadges } from "./PlayerProfilePopover";
import {
  isPlayerDrag,
  readDragPlayer,
  type DropPoint,
  type HostPlayer,
} from "./live/hostTypes";
import mapCapitalsData from "@/data/mapCapitals.json";
import { boardDisplayName, classifyRegions } from "@/data/nationCategories";
import { reservationLookup } from "@/lib/reservationMatch";
import { versionedMapUrl } from "@/lib/mapVersion";
import { useLiveLobby, useShareSelection } from "./live/useLiveLobby";
import LiveSelectionLabels, { type LiveSelectionLabel } from "./live/LiveSelectionLabels";
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  type ScenarioId,
} from "@/data/scenarioData";
import type {
  AuthUser,
  GameLobby,
  LobbyGameLock,
  LobbyReservation,
  NationFeatureCollection,
  NationFeatureProps,
  RosterNation,
  SelectionKind,
} from "@/lib/types";

interface MapViewerProps {
  /** Active scenario id; selects the GeoJSON + the drawer's data lookup. */
  scenarioId?: ScenarioId;
  className?: string;
  /** Active lobbies + the selected one — hoisted to the page so the top bar
      and the reservation picker share the same live game info. */
  games: GameLobby[];
  selectedThread: string;
  onSelectThread: (threadId: string) => void;
  /** Currently inspected nation — hoisted so the top bar can render the
      selection chip + drawer minimize/close controls above the drawer. */
  selected: NationFeatureProps | null;
  onSelectNation: (nation: NationFeatureProps | null) => void;
  /** Whether the country drawer is collapsed (top bar arrow toggles it). */
  drawerMinimized: boolean;
  /** Toggle the drawer collapse state (owned by the page). */
  onToggleDrawer: () => void;
  /** Reports the chip metadata (name + selection kind + owner) upward. */
  onSelectionSummaryChange: (summary: {
    nationName: string;
    kind: SelectionKind;
    ownerLabel: string | null;
  } | null) => void;
  /** Authenticated user, hoisted to the page (drives the nickname modal + the
      reservation roster). Falls back to null (anonymous) when not logged in. */
  authUser?: AuthUser | null;
  /** Reports the deduped nation list (one per tag) upward for the roster. */
  onNationsChange?: (nations: RosterNation[]) => void;
  /** Reports live lobby reservations upward for the roster drawer. */
  onReservationsChange?: (reservations: LobbyReservation[]) => void;
  /** Reports the active lobby's host lock state (Locked Nations section). */
  onGameLockChange?: (lock: LobbyGameLock | null) => void;
  /** Imperative camera request: pan/zoom to this nation tag (roster click). */
  focusRequest?: { tag: string; nonce: number } | null;
  /** Live map host tools: drop players onto nations (null when off). */
  hostTools?: MapHostTools | null;
  /** Bump to reload the lobby's reservations right away (after host edits). */
  reservationsNonce?: number;
  /** The viewer is a host: avatar profile cards offer "View portfolio". */
  viewerIsHost?: boolean;
  /** Draft games: open the "join the draft" pop-up (nations aren't reserved directly). */
  onJoinDraft?: () => void;
  /** Nations the host locked (the roster's "Locked Nations"): greyed out like taken ones. */
  hostLockedTags?: string[];
}

/** Capital marker positions per map (scripts/build_capitals.py). */
const MAP_CAPITALS: Record<string, Record<string, number[]>> = mapCapitalsData;

/** "/maps/road_to_56.geojson" → "road_to_56". */
function mapNameOf(url: string): string {
  return url.replace(/^.*\//, "").replace(/\.geojson$/, "");
}

/** What the map needs from the page's host tools. */
export interface MapHostTools {
  /** Click-to-place: a nation click places this player instead of selecting. */
  heldPlayer: HostPlayer | null;
  onDropPlayer: (nation: NationFeatureProps, player: HostPlayer, point: DropPoint) => void;
  onPlaceHeld: (nation: NationFeatureProps, point: DropPoint) => void;
  /** Reserved players' avatars can be dragged (full Host Tool; off when only
   *  draft pool players are being dropped). */
  dragAvatars: boolean;
}

// The base layer is static: nation color + a thin dark border. All dynamic
// states (hover/pending/self/locked/coop) live in nationHighlights.ts overlays.
const DEFAULT_FILL = "#374151";
const DEFAULT_STROKE = "#101827";
// Default zoom ceiling (about one level above the height-filling zoom on
// typical screens): enough magnification for dense European states
// (Luxembourg, Danzig, Liechtenstein) without reaching the high-zoom vector
// clipping breakage. MapSetup raises it dynamically when a tall viewport
// needs a higher fill zoom, so the world always touches the viewport edges.
export const MAX_ZOOM = 2;
// Authentic HOI4 tactical map ocean blue (also the map background).
export const OCEAN_BLUE = "#16283b";
// Hover debounce: the highlight only applies once the cursor has rested on a
// nation this long, so fast sweeps across dense regions don't flash.
const HOVER_DEBOUNCE_MS = 100;
// Keep lobby reservations live (the bot syncs web reservations every ~10s).
// While the live connection (/api/live) is up, changes are pushed and the
// poll is only a slow safety net.
const RESERVATION_POLL_MS = 8000;
/** With live updates on (they also reconnect by themselves when they go quiet). */
const RESERVATION_SAFETY_POLL_MS = 300_000;
// Custom SVG renderer with a large clipping padding: geometries well outside
// the visible area stay rendered during fast panning, so no vector pop-in or
// vertical cutoff appears mid-drag. Created per component instance (never
// shared across mounts) — a renderer can only belong to one map at a time.
export function createPaddedRenderer(): L.SVG {
  return L.svg({ padding: 3.0 }) as L.SVG;
}

/** Human-readable owner label for the locked/unreserve CTA. */
function ownerLabelText(ownerLabel: string | null): string {
  if (!ownerLabel) return "another player";
  return ownerLabel.startsWith("Discord user ") ? ownerLabel : `@${ownerLabel}`;
}

// Pixel-space extent of the map world, computed from the loaded GeoJSON.
// The map plumbing below is exported for the host lock map
// (components/schedule/HostLockMap.tsx), which renders the same worlds.
export interface PixelWorld {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Saved viewport, expressed in world-relative fractions so it survives
 * scenario switches between differently-scaled map worlds (vanilla's mapchart
 * extent vs Road to 56's full game raster). Fractions map the same geographic
 * spot across both worlds, so switching scenarios no longer jumps the camera
 * to the Pacific.
 */
export interface ViewIntent {
  /** Horizontal center as a fraction of the world width (wrapped 0..1). */
  cxFrac: number;
  /** Vertical center as a fraction of the world height (clamped 0..1). */
  cyFrac: number;
  /** Zoom levels above the height/width-filling zoom. */
  zoomOffset: number;
}

export function computePixelWorld(collection: NationFeatureCollection): PixelWorld {
  // Game-derived maps (build_state_map_svg.py) declare the full world
  // rectangle explicitly so the ocean fills the viewport; mapchart-based
  // maps fall back to the land extent.
  if (collection.world_bounds) {
    const [minX, minY, maxX, maxY] = collection.world_bounds;
    return { minX, minY, maxX, maxY };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * CRS for the pixel-space world with horizontal wrapping enabled.
 *
 * The GeoJSON uses L.CRS.Simple pixel coordinates (y-up, x in
 * [minX, maxX]). Extending CRS.Simple with a ``wrapLng`` range equal to the
 * world's pixel width makes ``worldCopyJump`` wrap at exactly the map's own
 * left/right edges — true infinite 360° horizontal scrolling without any
 * lat/lng reprojection or aspect distortion.
 */
export function createWorldCrs(world: PixelWorld): L.CRS {
  const base = L.CRS.Simple as L.CRS & { projection: L.Projection };
  return L.extend({}, base, {
    // CRS.Simple is `infinite`, which makes getProjectedBounds() return null
    // — and worldCopyJump's load hook calls getPixelWorldBounds().getSize(),
    // crashing on null. A finite projection bounds fixes it and makes the
    // wrap width equal to the world's pixel width.
    infinite: false,
    wrapLng: [world.minX, world.maxX],
    projection: L.extend({}, base.projection, {
      bounds: L.bounds(
        L.point(world.minX, world.minY),
        L.point(world.maxX, world.maxY),
      ),
    }),
  }) as L.CRS;
}

function shiftGeometryX(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  offset: number,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const shiftRing = (ring: number[][]) =>
    ring.map(([x, y]) => [x + offset, y] as number[]);
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map(shiftRing),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) => polygon.map(shiftRing)),
  };
}

/**
 * Duplicate the world into three horizontal copies (left at -width, center
 * as-is, right at +width) so panning across the seam always has geometry
 * under the viewport; ``worldCopyJump`` then re-anchors seamlessly.
 *
 * Ring winding is normalized once here (exterior counter-clockwise, holes
 * clockwise) so the highlight overlays, which mirror the rendered paths, make
 * the pending-selection dash travel clockwise. Fill is unaffected: the map
 * renders with fill-rule evenodd.
 */
export function withWorldCopies(
  collection: NationFeatureCollection,
  world: PixelWorld,
): NationFeatureCollection {
  const width = world.maxX - world.minX;
  const oriented = collection.features.map((feature) => ({
    ...feature,
    geometry: orientGeometryForClockwiseTravel(feature.geometry),
  }));
  return {
    type: "FeatureCollection",
    features: [-width, 0, width].flatMap((offset) =>
      oriented.map((feature) => ({
        ...feature,
        geometry: shiftGeometryX(feature.geometry, offset),
      })),
    ),
  };
}

/**
 * Key for a <MapContainer> that survives Next.js keeping pages alive.
 *
 * With cacheComponents, a page you navigate away from stays mounted but
 * hidden (React <Activity>). Hiding runs effect cleanups — react-leaflet's
 * MapContainer then removes its Leaflet map — but showing the page again
 * doesn't build a new one, so every map call crashed ("Cannot read
 * properties of undefined (reading '_leaflet_pos')"), e.g. on Calendar →
 * Edit game → back → Edit again. Bumping the key when the page is hidden
 * makes the map rebuild fresh (at the same viewport) when it's shown again.
 */
export function useMapRemountKey(): number {
  const [generation, setGeneration] = useState(0);
  useLayoutEffect(() => () => setGeneration((value) => value + 1), []);
  return generation;
}

export function MapSetup({
  world,
  initialViewRef,
  onViewportChange,
}: {
  world: PixelWorld;
  /** Last recorded viewport (kept by MapViewer); applied when a world loads. */
  initialViewRef: RefObject<ViewIntent | null>;
  /** Reports the live viewport so MapViewer can restore it after a switch. */
  onViewportChange?: (view: ViewIntent) => void;
}) {
  const map = useMap();

  useEffect(() => {
    map.whenReady(() => {
      const width = world.maxX - world.minX;
      const height = world.maxY - world.minY;
      // A map built while its page was hidden measured 0×0 — measure again.
      map.invalidateSize({ pan: false });
      const size = map.getSize();
      // Compute the height-filling zoom directly from the container size:
      // Leaflet's getBoundsZoom caps at maxZoom, which left void bars on
      // tall screens. Computing it here guarantees the world's top edge
      // lands exactly on the viewport's top edge (and the bottom edge on
      // the bottom) at every load.
      const fillZoom = Math.max(
        0,
        Math.log2(
          Math.max(
            size.x / (world.maxX - world.minX),
            size.y / (world.maxY - world.minY),
          ),
        ),
      );
      // Raise the zoom ceiling when a tall viewport needs more than the
      // default cap, keeping ~1 level of headroom above the fill.
      map.setMaxZoom(Math.max(MAX_ZOOM, fillZoom + 1));
      // Lock the zoom floor to the fill so zooming out can never reveal
      // void bars above/below the world.
      map.setMinZoom(fillZoom);
      // Vertical panning is hard-clamped to the world extent (no polar
      // void); horizontal panning is unbounded — the world copies plus
      // worldCopyJump make it a seamless infinite 360° scroll.
      map.setMaxBounds([
        [world.minY, -Infinity],
        [world.maxY, Infinity],
      ]);

      // Restore the previous scenario's viewport (world-relative fractions)
      // when one was recorded; otherwise deterministic world-centered load
      // (explicit center+zoom — fitBounds on a full-width wrapped world is
      // ambiguous and could center the view on a wrapped copy, i.e. the
      // Pacific Ocean).
      const intent = initialViewRef?.current ?? null;
      if (intent) {
        const center = L.latLng(
          world.minY + intent.cyFrac * height,
          world.minX + intent.cxFrac * width,
        );
        const zoom = Math.min(
          map.getMaxZoom(),
          Math.max(fillZoom, fillZoom + intent.zoomOffset),
        );
        map.setView(center, zoom, { animate: false });
      } else {
        map.setView(
          L.latLng(
            world.minY + height / 2,
            world.minX + width / 2,
          ),
          fillZoom,
          { animate: false },
        );
      }
    });
  }, [map, world, initialViewRef]);

  // Record the live viewport (as world fractions + zoom offset) so a
  // scenario switch can restore it instead of jumping to the world center.
  useEffect(() => {
    if (!onViewportChange) return undefined;
    const report = () => {
      const center = map.getCenter();
      const size = map.getSize();
      const width = world.maxX - world.minX;
      const height = world.maxY - world.minY;
      if (width <= 0 || height <= 0) return;
      const fillZoom = Math.max(
        0,
        Math.log2(Math.max(size.x / width, size.y / height)),
      );
      let cxFrac = (center.lng - world.minX) / width;
      cxFrac = ((cxFrac % 1) + 1) % 1;
      const cyFrac = Math.min(
        1,
        Math.max(0, (center.lat - world.minY) / height),
      );
      onViewportChange({
        cxFrac,
        cyFrac,
        zoomOffset: map.getZoom() - fillZoom,
      });
    };
    map.on("moveend", report);
    map.on("zoomend", report);
    return () => {
      map.off("moveend", report);
      map.off("zoomend", report);
    };
  }, [map, world, onViewportChange]);

  // Disable scroll-wheel zoom for the duration of an active pan. Leaflet's
  // drag handler re-anchors to the container origin, so a wheel zoom that
  // fires mid-drag re-projects the map and makes the pan leap/flicker.
  // ``dragstart`` only fires once a real drag begins (after the move
  // threshold); ``dragend`` restores the wheel handler on pointer release.
  useEffect(() => {
    const disableWheel = () => map.scrollWheelZoom.disable();
    const enableWheel = () => map.scrollWheelZoom.enable();
    map.on("dragstart", disableWheel);
    map.on("dragend", enableWheel);
    return () => {
      map.off("dragstart", disableWheel);
      map.off("dragend", enableWheel);
      enableWheel();
    };
  }, [map]);
  return null;
}

/**
 * Bridges React state to the imperative overlay controller. It owns no DOM: it
 * creates the controller once the base GeoJSON layer exists and feeds it the
 * latest nation states (the controller diffs, so unchanged nations cost nothing).
 */
export function HighlightsBridge({
  geoJsonRef,
  layerKey,
  state,
  onMotionChange,
}: {
  geoJsonRef: RefObject<L.GeoJSON | null>;
  /** Changes when the base layer is rebuilt, so the controller re-indexes it. */
  layerKey: number;
  state: HighlightState;
  onMotionChange: (moving: boolean) => void;
}) {
  const map = useMap();
  const controllerRef = useRef<NationHighlightController | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    const layer = geoJsonRef.current;
    if (!layer) return undefined;
    const controller = new NationHighlightController(
      map,
      layer,
      onMotionChange,
    );
    controllerRef.current = controller;
    controller.apply(stateRef.current);
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [map, geoJsonRef, layerKey, onMotionChange]);

  useEffect(() => {
    stateRef.current = state;
    controllerRef.current?.apply(state);
  }, [state]);

  return null;
}

/**
 * Bounds of a feature's LARGEST polygon (by ring area). Colonial/multi-island
 * nations (New Zealand + Chatham Islands, German East Asia's scattered
 * holdings) span nearly the whole map; fitting to their full bounds would
 * zoom all the way out. The largest ring is the homeland.
 */
function largestPartBounds(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [[number, number], [number, number]] | null {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.coordinates;
  let best: [[number, number], [number, number]] | null = null;
  let bestArea = -1;
  for (const polygon of polygons) {
    const ring = polygon[0] ?? [];
    if (ring.length < 3) continue;
    // Shoelace area.
    let area = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[(index + 1) % ring.length];
      area += x1 * y2 - x2 * y1;
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    }
    if (Math.abs(area) > bestArea) {
      bestArea = Math.abs(area);
      best = [
        [minY, minX],
        [maxY, maxX],
      ];
    }
  }
  return best;
}

/**
 * Pans/zooms the camera to a requested nation (roster row click). The page
 * bumps ``nonce`` on every request, so clicking the same nation twice still
 * re-focuses.
 */
export function FocusController({
  request,
  geoJsonRef,
}: {
  request: { tag: string; nonce: number } | null;
  geoJsonRef: RefObject<L.GeoJSON | null>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!request) return;
    const layer = geoJsonRef.current;
    if (!layer) return;
    // Three world copies exist per nation (left/center/right); the CENTER
    // copy's geometry sits inside the world rectangle, so fit to it.
    const matches: L.Polygon[] = [];
    for (const child of layer.getLayers()) {
      const polygon = child as L.Polygon;
      const feature = polygon.feature as
        | GeoJSON.Feature<GeoJSON.Geometry, NationFeatureProps>
        | undefined;
      if (feature?.properties?.tag === request.tag) matches.push(polygon);
    }
    const polygon = matches.length > 0
      ? matches[Math.floor(matches.length / 2)]
      : null;
    if (!polygon) return;
    const feature = polygon.feature as
      | GeoJSON.Feature<GeoJSON.Geometry, NationFeatureProps>
      | undefined;
    const geometry = feature?.geometry;
    // Colonial/multi-island nations (New Zealand + Chatham Islands, German
    // East Asia) span nearly the whole map — fitting to their FULL bounds
    // would zoom the camera back out to the world view. Fit to the largest
    // part (the homeland) instead. The original smooth fitBounds behaviour
    // and MAX_ZOOM cap are otherwise unchanged.
    const partBounds =
      geometry &&
      (geometry.type === "Polygon" || geometry.type === "MultiPolygon")
        ? largestPartBounds(geometry)
        : null;
    map.fitBounds(
      partBounds ? L.latLngBounds(partBounds) : polygon.getBounds(),
      {
        padding: [48, 48],
        maxZoom: MAX_ZOOM,
      },
    );
  }, [request, map, geoJsonRef]);

  return null;
}

/**
 * One roster entry per nation of a loaded (world-copied) map, with its
 * geographic region. The CENTER world copy is used for each nation's
 * centroid: the left/right copies are shifted by ±world-width, which would
 * skew the longitude classification. The Middle East region only exists on
 * the modern-day maps.
 */
export function buildRosterNations(
  data: NationFeatureCollection,
  world: PixelWorld,
  scenarioId: ScenarioId,
): RosterNation[] {
  const includeMiddleEast = scenarioId.startsWith("modern_");
  const centerX = (world.minX + world.maxX) / 2;
  const candidates = new Map<
    string,
    { props: NationFeatureProps; centroid: { x: number; y: number } }
  >();
  for (const feature of data.features) {
    const props = feature.properties;
    if (!props.slot_key) continue; // void tiles are not nations
    const geometry = feature.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      continue;
    }
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const polygon of polygons) {
      for (const [x, y] of polygon[0] ?? []) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
    if (count === 0) continue;
    const centroid = { x: sumX / count, y: sumY / count };
    const best = candidates.get(props.tag);
    if (
      !best ||
      Math.abs(centroid.x - centerX) < Math.abs(best.centroid.x - centerX)
    ) {
      candidates.set(props.tag, { props, centroid });
    }
  }
  // Nearest-anchor region classification (projection-independent): the
  // game map crops the poles and colonial tags skew centroids, so raw
  // lon/lat math misclassifies; nearby anchor nations do not.
  const entries = [...candidates.values()].map(
    ({ props, centroid }) => ({
      tag: props.tag,
      slotKey: props.slot_key ?? "",
      name: props.name,
      x: centroid.x,
      y: centroid.y,
      worldWidth: world.maxX - world.minX,
    }),
  );
  const regions = classifyRegions(entries, includeMiddleEast);
  return entries.map((entry) => {
    const candidate = candidates.get(entry.tag);
    return {
      ...(candidate?.props ?? {
        tag: entry.tag,
        name: entry.name,
        slot_key: entry.slotKey,
      }),
      region: regions.get(entry.tag) ?? "Other",
    };
  });
}

type LobbyReply =
  | { unchanged: true; version: string }
  | {
      unchanged: false;
      version: string | null;
      reservations: LobbyReservation[];
      lock: LobbyGameLock | null;
    };

/** A lobby payload (GET /api/reserve, or pushed by /api/live) → map state. */
function parseLobby(raw: unknown): LobbyReply | null {
  if (typeof raw !== "object" || raw === null) return null;
  const result = raw as {
    unchanged?: boolean;
    version?: string;
    reservations?: LobbyReservation[];
    game?: {
      lockdown?: boolean;
      locked_regions?: string[];
      nation_layout?: LobbyGameLock["nation_layout"];
      layout_disabled_nations?: string[];
      draft?: LobbyGameLock["draft"];
      ironlegion?: LobbyGameLock["ironlegion"];
    } | null;
  };
  if (result.unchanged && result.version) return { unchanged: true, version: result.version };
  const game = result.game ?? null;
  return {
    unchanged: false,
    version: result.version ?? null,
    reservations: Array.isArray(result.reservations) ? result.reservations : [],
    lock: game
      ? {
          lockdown: Boolean(game.lockdown),
          locked_regions: Array.isArray(game.locked_regions)
            ? game.locked_regions
            : [],
          nation_layout: Array.isArray(game.nation_layout) ? game.nation_layout : null,
          hidden_nations: Array.isArray(game.layout_disabled_nations)
            ? game.layout_disabled_nations
            : [],
          draft: game.draft ?? null,
          ironlegion: game.ironlegion ?? null,
        }
      : null,
  };
}

/**
 * Fetch a lobby's reservations + host lock state; null on any failure.
 * `known` is the version from the previous response: while the lobby is
 * unchanged the server answers `{ unchanged: true }` without rebuilding it.
 */
async function fetchReservations(
  threadId: string,
  known: string | null = null,
): Promise<LobbyReply | null> {
  try {
    const params = new URLSearchParams({ thread_id: threadId });
    if (known) params.set("known", known);
    const response = await fetch(`/api/reserve?${params}`, { cache: "no-store" });
    if (!response.ok) return null;
    return parseLobby(await response.json());
  } catch {
    return null;
  }
}

function sameReservations(
  a: readonly LobbyReservation[],
  b: readonly LobbyReservation[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, index) =>
      item.slot_key === b[index].slot_key &&
      String(item.user_id) === String(b[index].user_id) &&
      (item.username ?? null) === (b[index].username ?? null) &&
      (item.ingame_nickname ?? null) === (b[index].ingame_nickname ?? null) &&
      (item.hoi4_verified ?? null) === (b[index].hoi4_verified ?? null) &&
      (item.host_tier ?? null) === (b[index].host_tier ?? null),
  );
}

/**
 * Interactive map of HOI4 nations rendered from a nation-level GeoJSON
 * FeatureCollection.
 *
 * Coordinates live in the SVG's pixel space with a flipped (y-up) axis, so
 * the map uses a ``CRS.Simple``-derived CRS extended with a ``wrapLng`` range
 * equal to the world's pixel width. The GeoJSON is duplicated into three
 * horizontal world copies (left/center/right) and ``worldCopyJump`` is
 * enabled, giving seamless infinite 360° horizontal scrolling.
 *
 * Each feature is one nation (``{tag, name, slot_key, color}``). The base
 * layer never changes after load; hover, selection and the live lobby
 * reservations are drawn as overlay highlights (see nationHighlights.ts):
 *
 *  1. hover    soft nation-colored glow + raised pop, breathing
 *  2. pending  yellow clockwise "chasing snake" (selected, still free)
 *  3. self     green neon, pulsing (reserved by you)
 *  4. taken    grey wash (reserved by another player)
 *  5. locked   red neon (clicked a taken minor: no Co-Op possible)
 *  6. co-op    electric blue (clicked a taken major: Co-Op inspection)
 *  7. others   dashed, breathing yellow + name tag: nations other players on
 *              this game's map have selected right now (/api/live)
 */
export default function MapViewer({
  scenarioId = DEFAULT_SCENARIO,
  className,
  games,
  selectedThread,
  onSelectThread,
  selected,
  onSelectNation,
  drawerMinimized,
  onToggleDrawer,
  onSelectionSummaryChange,
  authUser = null,
  onNationsChange,
  onReservationsChange,
  onGameLockChange,
  focusRequest = null,
  hostTools = null,
  reservationsNonce = 0,
  viewerIsHost = false,
  onJoinDraft,
  hostLockedTags,
}: MapViewerProps) {
  const geoJsonUrl = SCENARIOS[scenarioId]?.mapUrl ?? SCENARIOS[DEFAULT_SCENARIO].mapUrl;
  const [data, setData] = useState<NationFeatureCollection | null>(null);
  // The URL the loaded data belongs to. react-leaflet's GeoJSON never updates
  // its data after creation, so the map only mounts once the CURRENT url's
  // data has arrived (otherwise a TFB->OAK switch would silently keep
  // rendering TFB's shapes — both have 52 nations, so a feature-count key
  // can't tell them apart).
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [world, setWorld] = useState<PixelWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The nation (and world copy) under the cursor, once the debounce elapsed.
  const [hover, setHover] = useState<HoverTarget | null>(null);

  // Reservation state (the selected nation itself is hoisted to the page;
  // the authenticated user is too, so /api/auth/me is fetched once in the
  // page and shared with the roster drawer).
  const [reserving, setReserving] = useState(false);
  const [reserveMessage, setReserveMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [lobbyState, setLobbyState] = useState<{
    threadId: string;
    reservations: LobbyReservation[];
    lock: LobbyGameLock | null;
  } | null>(null);

  // One padded SVG renderer per component instance — a renderer instance can
  // only belong to one map, so it must never be shared across remounts.
  const paddedRenderer = useMemo(() => createPaddedRenderer(), []);

  // The base nation layer, read by the highlight controller.
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  // Pending hover-debounce timer (canceled on mouseout before it fires).
  const hoverTimerRef = useRef<number | null>(null);
  // Last recorded viewport (world fractions + zoom offset): restored on
  // scenario switches so the camera stays put instead of jumping to the
  // world center / Pacific.
  const viewIntentRef = useRef<ViewIntent | null>(null);
  const mapKey = useMapRemountKey();
  // True while the map pans/zooms: NEW hover is blocked (existing hover keeps
  // breathing) so dragging across dense regions never thrashes highlights.
  const movingRef = useRef(false);
  // Host tools: read by the GeoJSON click handler (bound once per layer).
  const hostToolsRef = useRef<MapHostTools | null>(hostTools);
  useEffect(() => {
    hostToolsRef.current = hostTools;
  }, [hostTools]);
  // Nation under a dragged player (highlighted as the drop target).
  const [dropTag, setDropTag] = useState<string | null>(null);
  // Rendered path element → nation, built once per drag (drop hit-testing).
  const pathNationsRef = useRef<WeakMap<Element, NationFeatureProps> | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // Clear any pending hover timer on unmount.
  useEffect(() => clearHoverTimer, [clearHoverTimer]);

  const handleMotionChange = useCallback((moving: boolean) => {
    // Keep the existing hover breathing during pan/zoom; only block NEW hover
    // (via movingRef) so fast sweeps across dense regions don't flash.
    movingRef.current = moving;
  }, []);

  const handleViewportChange = useCallback((view: ViewIntent) => {
    viewIntentRef.current = view;
  }, []);

  // Wrapped pixel-space CRS built from the loaded world extent — enables
  // worldCopyJump at the map's exact left/right edges.
  const crs = useMemo(
    () => (world ? createWorldCrs(world) : L.CRS.Simple),
    [world],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(versionedMapUrl(geoJsonUrl))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load map: HTTP ${response.status}`);
        }
        return response.json() as Promise<NationFeatureCollection>;
      })
      .then((collection) => {
        if (cancelled) return;
        const pixelWorld = computePixelWorld(collection);
        setWorld(pixelWorld);
        setData(withWorldCopies(collection, pixelWorld));
        setLoadedUrl(geoJsonUrl);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [geoJsonUrl]);

  // Store a lobby's reservations, keeping the previous state object when
  // nothing changed so identical polls don't re-render or re-diff highlights.
  const applyReservations = useCallback(
    (
      threadId: string,
      reservations: LobbyReservation[],
      lock: LobbyGameLock | null,
    ) => {
      setLobbyState((current) =>
        current?.threadId === threadId &&
        sameReservations(current.reservations, reservations) &&
        current.lock?.lockdown === lock?.lockdown &&
        current.lock?.locked_regions.join("\u0000") ===
          (lock?.locked_regions ?? []).join("\u0000") &&
        JSON.stringify(current.lock?.nation_layout ?? null) ===
          JSON.stringify(lock?.nation_layout ?? null) &&
        JSON.stringify(current.lock?.draft ?? null) ===
          JSON.stringify(lock?.draft ?? null)
          ? current
          : { threadId, reservations, lock },
      );
    },
    [],
  );

  // The lobby version this viewer already shows (sent with every poll, so an
  // unchanged lobby costs the server one cheap shared lookup).
  const lobbyVersionRef = useRef<{ threadId: string; version: string } | null>(null);
  // Late replies for a lobby the viewer already switched away from are dropped.
  const selectedThreadRef = useRef(selectedThread);
  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);
  const loadLobby = useCallback(
    async (threadId: string): Promise<boolean> => {
      const known = lobbyVersionRef.current?.threadId === threadId ? lobbyVersionRef.current.version : null;
      const fetched = await fetchReservations(threadId, known);
      if (!fetched || threadId !== selectedThreadRef.current) return false;
      if (fetched.unchanged) return true;
      lobbyVersionRef.current = fetched.version ? { threadId, version: fetched.version } : null;
      applyReservations(threadId, fetched.reservations, fetched.lock);
      return true;
    },
    [applyReservations],
  );

  const refreshLobbyReservations = useCallback(async () => {
    if (!selectedThread) return;
    await loadLobby(selectedThread);
  }, [selectedThread, loadLobby]);

  // Pushed lobby changes + other players' selections + the viewer count.
  const handleLivePayload = useCallback(
    (payload: unknown) => {
      const threadId = selectedThreadRef.current;
      const parsed = parseLobby(payload);
      if (!threadId || !parsed) return;
      if (parsed.unchanged) {
        if (lobbyVersionRef.current?.threadId === threadId) lobbyVersionRef.current = { threadId, version: parsed.version };
        return;
      }
      lobbyVersionRef.current = parsed.version ? { threadId, version: parsed.version } : null;
      applyReservations(threadId, parsed.reservations, parsed.lock);
    },
    [applyReservations],
  );
  const knownLobbyVersion = useCallback(
    () => (lobbyVersionRef.current?.threadId === selectedThreadRef.current ? lobbyVersionRef.current.version : null),
    [],
  );
  const live = useLiveLobby(selectedThread || null, handleLivePayload, knownLobbyVersion);

  /** Nation under a viewport point (the base path the pointer is over). */
  const nationAtPoint = useCallback((x: number, y: number): NationFeatureProps | null => {
    const layer = geoJsonRef.current;
    if (!layer) return null;
    if (!pathNationsRef.current) {
      const index = new WeakMap<Element, NationFeatureProps>();
      layer.eachLayer((child) => {
        const path = child as L.Polygon;
        const element = path.getElement();
        const props = (path.feature as GeoJSON.Feature<GeoJSON.Geometry, NationFeatureProps> | undefined)
          ?.properties;
        if (element && props?.slot_key) index.set(element, props);
      });
      pathNationsRef.current = index;
    }
    const element = document.elementFromPoint(x, y);
    return element ? (pathNationsRef.current.get(element) ?? null) : null;
  }, []);

  // Load the lobby's reservations on selection and keep them live: poll while
  // the tab is visible and refresh immediately when it becomes visible again
  // (or when `reservationsNonce` bumps — host tools edits just landed).
  // With the live connection up, the poll slows to a safety net, and the
  // connection itself catches up after a hidden tab (no reload on connect).
  const liveConnected = live.connected;
  const liveConnectedRef = useRef(liveConnected);
  useEffect(() => {
    liveConnectedRef.current = liveConnected;
  }, [liveConnected]);
  useEffect(() => {
    if (!selectedThread) return undefined;
    let cancelled = false;
    void loadLobby(selectedThread);
    const onVisibility = () => {
      if (!cancelled && !document.hidden && !liveConnectedRef.current) void loadLobby(selectedThread);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedThread, loadLobby, reservationsNonce]);
  useEffect(() => {
    if (!selectedThread) return undefined;
    const interval = window.setInterval(() => {
      if (!document.hidden) void loadLobby(selectedThread);
    }, liveConnected ? RESERVATION_SAFETY_POLL_MS : RESERVATION_POLL_MS);
    return () => window.clearInterval(interval);
  }, [selectedThread, loadLobby, liveConnected]);

  // Static base style: never depends on hover/selection, so react-leaflet
  // never re-styles the 288 base paths when those change.
  const baseStyle = useCallback(
    (
      feature?: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>,
    ): L.PathOptions => {
      const props = feature?.properties as NationFeatureProps | undefined;
      return {
        color: DEFAULT_STROKE,
        weight: 0.8,
        // Rounded joins/caps keep adjacent nation edges clean: shared
        // borders that dissolve in the union never render jagged dark
        // corners (and any hairline remnant reads as a soft seam, not a
        // black slice line).
        lineJoin: "round",
        lineCap: "round",
        fillColor: props?.color ?? DEFAULT_FILL,
        fillOpacity: 0.8,
      };
    },
    [],
  );

  const onEachFeature = useCallback(
    (
      feature: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>,
      layer: L.Layer,
    ) => {
      const props = feature.properties as NationFeatureProps | undefined;
      const path = layer as L.Polygon;
      // Void (ownerless) tiles are decorative grey land: no hover, no click,
      // no reservation. Mod authors deliberately void states for balance/lag.
      if (props?.tag === "VOID") {
        path.options.interactive = false;
        return;
      }
      // Render the full nation polygon instead of clipping it to the padded
      // viewport, so partially-visible countries never "chop" while panning
      // zoomed-in.
      path.options.noClip = true;
      path.on({
        mouseover: () => {
          if (movingRef.current || !props) return;
          // Debounce: rapid cursor sweeps across dense regions (Europe/China)
          // must not flash; the highlight only applies once the cursor has
          // rested on the nation for HOVER_DEBOUNCE_MS.
          clearHoverTimer();
          hoverTimerRef.current = window.setTimeout(() => {
            hoverTimerRef.current = null;
            if (movingRef.current) return;
            setHover({ tag: props.tag, layer: path });
          }, HOVER_DEBOUNCE_MS);
        },
        mouseout: () => {
          // Leaving before the debounce elapses cancels the pending highlight.
          clearHoverTimer();
          setHover(null);
        },
        click: (event: L.LeafletMouseEvent) => {
          if (!props) return;
          const tools = hostToolsRef.current;
          if (tools?.heldPlayer && props.slot_key) {
            tools.onPlaceHeld(props, {
              x: event.originalEvent.clientX,
              y: event.originalEvent.clientY,
            });
            return;
          }
          onSelectNation(props);
          setReserveMessage(null);
        },
      });
    },
    [clearHoverTimer, onSelectNation],
  );

  const handleReserve = useCallback(async () => {
    if (!selected?.slot_key || !selectedThread) return;
    const slotKey = selected.slot_key;
    setReserving(true);
    setReserveMessage(null);
    try {
      const response = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: selectedThread,
          slot_key: slotKey,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;
      if (response.ok) {
        setReserveMessage({
          kind: "success",
          text: `Reserved ${slotKey}!`,
        });
        await refreshLobbyReservations();
      } else {
        setReserveMessage({
          kind: "error",
          text: result?.error ?? `Reservation failed (HTTP ${response.status})`,
        });
        // A lost race means someone else just took it: show the lock now.
        if (response.status === 409) await refreshLobbyReservations();
      }
    } catch {
      setReserveMessage({ kind: "error", text: "Network error — try again." });
    } finally {
      setReserving(false);
    }
  }, [selected, selectedThread, refreshLobbyReservations]);

  const handleUnreserve = useCallback(async () => {
    if (!selectedThread) return;
    setReserving(true);
    setReserveMessage(null);
    try {
      const response = await fetch("/api/reserve", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: selectedThread }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;
      if (response.ok) {
        setReserveMessage({
          kind: "success",
          text: "Reservation removed.",
        });
        await refreshLobbyReservations();
      } else {
        setReserveMessage({
          kind: "error",
          text: result?.error ?? `Unreserve failed (HTTP ${response.status})`,
        });
      }
    } catch {
      setReserveMessage({ kind: "error", text: "Network error — try again." });
    } finally {
      setReserving(false);
    }
  }, [selectedThread, refreshLobbyReservations]);

  const lobbyReservations = useMemo(
    () =>
      lobbyState?.threadId === selectedThread ? lobbyState.reservations : [],
    [lobbyState, selectedThread],
  );
  const lobbyLock = useMemo(
    () => (lobbyState?.threadId === selectedThread ? lobbyState.lock : null),
    [lobbyState, selectedThread],
  );
  const mySlot = useMemo(
    () =>
      authUser
        ? (lobbyReservations.find(
            (reservation) =>
              String(reservation.user_id) === authUser.discord_id,
          ) ?? null)
        : null,
    [lobbyReservations, authUser],
  );

  // Report the deduped nation list upward once per map load — the page's
  // reservation roster renders one row per nation. The geographic region is
  // computed from each nation's centroid (choosing the CENTER world copy:
  // the left/right copies are shifted by ±world-width, which would skew the
  // longitude classification). The Middle East region only exists on the
  // modern-day maps.
  useEffect(() => {
    if (!onNationsChange || !data || !world) return;
    onNationsChange(buildRosterNations(data, world, scenarioId));
  }, [data, world, scenarioId, onNationsChange]);

  // Report live reservations upward for the roster drawer.
  useEffect(() => {
    onReservationsChange?.(lobbyReservations);
  }, [lobbyReservations, onReservationsChange]);

  // Report the active lobby's host lock state (Locked Nations section).
  useEffect(() => {
    onGameLockChange?.(lobbyLock);
  }, [lobbyLock, onGameLockChange]);

  // tag -> nation properties, from the first occurrence of each nation
  // (the three world copies share their properties). Void features carry no
  // slot key and are skipped.
  const tagNations = useMemo(() => {
    const nations = new Map<string, NationFeatureProps>();
    for (const feature of data?.features ?? []) {
      if (!feature.properties.slot_key) continue;
      if (!nations.has(feature.properties.tag)) {
        nations.set(feature.properties.tag, feature.properties);
      }
    }
    return nations;
  }, [data]);

  // A nation's reservation — also when the bot names it differently
  // ("Germany" from a draft pick vs the map's "German Reich").
  const reservationsOf = useMemo(() => reservationLookup(lobbyReservations), [lobbyReservations]);

  // Reserved nations split by owner: yours (green) vs everyone else (red).
  const { selfTags, lockedTags } = useMemo(() => {
    const self: string[] = [];
    const locked: string[] = [];
    for (const [tag, nation] of tagNations) {
      const reservation = reservationsOf.main(nation);
      if (!reservation) continue;
      if (authUser && String(reservation.user_id) === authUser.discord_id) {
        self.push(tag);
      } else {
        locked.push(tag);
      }
    }
    // Host-locked nations get the same grey as taken ones (unless they're yours).
    const mine = new Set(self);
    for (const tag of hostLockedTags ?? []) {
      if (!mine.has(tag) && !locked.includes(tag)) locked.push(tag);
    }
    return { selfTags: self, lockedTags: locked };
  }, [tagNations, reservationsOf, authUser, hostLockedTags]);

  // Name pop-up for the nation under the cursor (just the name).
  const hoverName = useMemo(() => {
    if (!hover) return null;
    const nation = tagNations.get(hover.tag);
    return nation ? boardDisplayName(scenarioId, nation.tag, nation.name) : null;
  }, [hover, tagNations, scenarioId]);

  const selectedReservation = selected?.slot_key
    ? (reservationsOf.main(selected) ?? null)
    : null;

  const selectionKind = useMemo<SelectionKind | null>(() => {
    if (!selected) return null;
    if (!selectedReservation) return "pending";
    if (authUser && String(selectedReservation.user_id) === authUser.discord_id) {
      return "self";
    }
    // Majors stay open to Co-Op; minors are simply taken.
    return MAJOR_TAGS.has(selected.tag) ? "coop" : "locked";
  }, [selected, selectedReservation, authUser]);

  const ownerLabel = selectedReservation
    ? (selectedReservation.username?.trim() ||
      `Discord user ${selectedReservation.user_id}`)
    : null;

  // Report the chip metadata to the page so the top bar can render the
  // selection status + drawer controls on the Rules/Mods row.
  useEffect(() => {
    onSelectionSummaryChange(
      selected && selectionKind
        ? {
            nationName: selected.name,
            kind: selectionKind,
            ownerLabel,
          }
        : null,
    );
  }, [selected, selectionKind, ownerLabel, onSelectionSummaryChange]);

  // Other players' live selections: free nations only (a nation that just got
  // taken drops its glow), never the viewer's own.
  const liveSelections = live.selections;
  const othersByTag = useMemo(() => {
    const taken = new Set([...selfTags, ...lockedTags]);
    const byTag = new Map<string, string[]>();
    for (const selection of liveSelections) {
      if (authUser && selection.user_id === authUser.discord_id) continue;
      if (taken.has(selection.tag) || !tagNations.has(selection.tag)) continue;
      byTag.set(selection.tag, [...(byTag.get(selection.tag) ?? []), selection.name]);
    }
    return byTag;
  }, [liveSelections, authUser, selfTags, lockedTags, tagNations]);
  const othersTags = useMemo(() => [...othersByTag.keys()], [othersByTag]);
  const selectionLabels = useMemo<LiveSelectionLabel[]>(() => {
    const capitals = MAP_CAPITALS[mapNameOf(geoJsonUrl)] ?? {};
    const labels: LiveSelectionLabel[] = [];
    for (const [tag, names] of othersByTag) {
      const point = capitals[tag];
      if (point) labels.push({ tag, x: point[0], y: point[1], names });
    }
    return labels;
  }, [othersByTag, geoJsonUrl]);

  // Share this player's own pick (a free nation, reservable right now).
  const gameStarted = Boolean(selectedThread && games.find((game) => game.thread_id === selectedThread)?.game_started);
  const sharedTag =
    selectionKind === "pending" && selected && !dropTag && !gameStarted && !lobbyLock?.draft ? selected.tag : null;
  useShareSelection(selectedThread || null, sharedTag, Boolean(authUser));

  const highlightState = useMemo<HighlightState>(
    () => ({
      othersTags,
      // The selected nation has its own state; hover is for the others.
      hover: hover && hover.tag !== selected?.tag ? hover : null,
      // A player being dragged over a nation marks it as the drop target.
      pendingTag: dropTag ?? (selectionKind === "pending" && selected ? selected.tag : null),
      coopTag: selectionKind === "coop" && selected ? selected.tag : null,
      selfTags,
      // Other players' nations are greyed out; a Co-Op-inspected major drops
      // the grey so its blue "open for Co-Op" state reads clearly.
      takenTags:
        selectionKind === "coop" && selected
          ? lockedTags.filter((tag) => tag !== selected.tag)
          : lockedTags,
      // Red only when the player clicks a taken nation that can't be co-oped.
      lockedTags: selectionKind === "locked" && selected ? [selected.tag] : [],
    }),
    [hover, selected, selectionKind, selfTags, lockedTags, dropTag, othersTags],
  );

  // Reserved players' avatars on their nations' capitals (co-ops beside them).
  const capitalEntries = useMemo<CapitalAvatarEntry[]>(() => {
    const capitals = MAP_CAPITALS[mapNameOf(geoJsonUrl)] ?? {};
    const entries: CapitalAvatarEntry[] = [];
    for (const [tag, nation] of tagNations) {
      const reservation = reservationsOf.main(nation);
      const point = reservation ? capitals[tag] : undefined;
      if (!reservation || !point) continue;
      entries.push({
        key: reservation.slot_key,
        x: point[0],
        y: point[1],
        main: reservation,
        coops: [...reservationsOf.coops(nation)].sort((a, b) => a.slot_key.localeCompare(b.slot_key)),
        isSelf: authUser !== null && String(reservation.user_id) === authUser.discord_id,
      });
    }
    return entries;
  }, [geoJsonUrl, tagNations, reservationsOf, authUser]);

  // Profile card opened from a map avatar (anchored beside it).
  const [avatarProfile, setAvatarProfile] = useState<{
    reservation: LobbyReservation;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);
  const handleOpenAvatar = useCallback((reservation: LobbyReservation, rect: DOMRect) => {
    setAvatarProfile({
      reservation,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    });
  }, []);
  const activeHostId = games.find((game) => game.thread_id === selectedThread)?.host_id ?? null;
  const gameRunning = gameStarted;

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#16283b] p-4 text-red-400">
        {error}
      </div>
    );
  }
  if (loadedUrl !== geoJsonUrl || data === null || world === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#16283b] text-zinc-400">
        Loading map…
      </div>
    );
  }

  // Deterministic initial center+zoom (MapSetup re-applies the exact view
  // on ready; ``bounds`` is deliberately avoided — fitting a full-width
  // wrapped world is ambiguous and jumped the view to a wrapped copy, i.e.
  // the Pacific/Australia).
  const worldWidth = world.maxX - world.minX;
  const worldHeight = world.maxY - world.minY;
  const initialCenter: L.LatLngExpression = [
    world.minY + worldHeight / 2,
    world.minX + worldWidth / 2,
  ];
  const initialZoom = Math.max(
    0,
    Math.log2(
      Math.max(
        (typeof window !== "undefined" ? window.innerWidth : 1280) / worldWidth,
        (typeof window !== "undefined" ? window.innerHeight : 800) / worldHeight,
      ),
    ),
  );

  return (
    <div className={className ?? "h-screen w-screen relative overflow-hidden bg-[#16283b]"}>
      <div
        className="relative h-full w-full"
        onDragEnter={() => {
          // Paths can change between drags (scenario switch) — re-index.
          if (hostTools) pathNationsRef.current = null;
        }}
        onDragOver={(event) => {
          if (!hostTools || !isPlayerDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const nation = nationAtPoint(event.clientX, event.clientY);
          const tag = nation?.tag ?? null;
          setDropTag((current) => (current === tag ? current : tag));
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTag(null);
        }}
        onDrop={(event) => {
          setDropTag(null);
          if (!hostTools) return;
          const player = readDragPlayer(event);
          if (!player) return;
          event.preventDefault();
          const nation = nationAtPoint(event.clientX, event.clientY);
          if (nation) hostTools.onDropPlayer(nation, player, { x: event.clientX, y: event.clientY });
        }}
      >
        <MapContainer
          key={`${geoJsonUrl}:${mapKey}`}
          crs={crs}
          center={initialCenter}
          zoom={initialZoom}
          maxZoom={MAX_ZOOM}
          maxBoundsViscosity={1.0}
          worldCopyJump={true}
          zoomSnap={0.01}
          zoomDelta={0.1}
          zoomAnimation={true}
          inertia={true}
          wheelPxPerZoomLevel={150}
          wheelDebounceTime={10}
          attributionControl={false}
          className="h-full w-full"
          style={{ background: OCEAN_BLUE }}
        >
          <MapSetup
            world={world}
            initialViewRef={viewIntentRef}
            onViewportChange={handleViewportChange}
          />
          <FocusController request={focusRequest} geoJsonRef={geoJsonRef} />
          <GeoJSON
            ref={geoJsonRef}
            key={geoJsonUrl}
            data={data}
            style={baseStyle}
            onEachFeature={onEachFeature}
            {...{ renderer: paddedRenderer }}
          />
          <HighlightsBridge
            geoJsonRef={geoJsonRef}
            layerKey={data.features.length}
            state={highlightState}
            onMotionChange={handleMotionChange}
          />
          <CapitalAvatars
            entries={capitalEntries}
            worldWidth={worldWidth}
            draggable={hostTools?.dragAvatars ?? false}
            onOpen={handleOpenAvatar}
          />
          <LiveSelectionLabels labels={selectionLabels} worldWidth={worldWidth} />
        </MapContainer>

        {/* Live: how many people have this game's map open right now. */}
        {live.connected && live.viewers !== null && live.viewers > 1 && (
          <div
            className="pointer-events-none absolute bottom-4 z-[900] flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur-md transition-[right]"
            style={{ right: selected ? (drawerMinimized ? 64 : 396) : 16 }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {live.viewers} viewing
          </div>
        )}

        {/* Hovered nation's name — the same pill as the game setup map. */}
        {hoverName && (
          <div className="pointer-events-none absolute left-1/2 top-[124px] z-[950] -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/80 px-4 py-1.5 text-xs font-bold text-slate-100 shadow-xl backdrop-blur-md">
            {hoverName}
          </div>
        )}

        {avatarProfile && (
          <PlayerProfilePopover
            key={`${avatarProfile.reservation.user_id}:${avatarProfile.rect.left}:${avatarProfile.rect.top}`}
            userId={String(avatarProfile.reservation.user_id)}
            username={avatarProfile.reservation.username ?? null}
            ingameNickname={avatarProfile.reservation.ingame_nickname ?? null}
            avatarUrl={avatarProfile.reservation.avatar_url ?? null}
            bannerUrl={null}
            accentColor={null}
            badges={reservationBadges(avatarProfile.reservation, activeHostId)}
            onClose={() => setAvatarProfile(null)}
            canViewPortfolio={viewerIsHost}
            anchorRect={avatarProfile.rect}
          />
        )}

        {selected && selectionKind && (
          <CountryDetailsDrawer
            selected={selected}
            selectionKind={selectionKind}
            ownerLabel={ownerLabel}
            authUser={authUser}
            mySlot={mySlot}
            games={games}
            selectedThread={selectedThread}
            minimized={drawerMinimized}
            scenarioId={scenarioId}
            onSelectThread={onSelectThread}
            onToggleMinimized={onToggleDrawer}
          />
        )}

        {/* Bottom-center reserve CTA: appears whenever a nation is selected.
            Glowing gold for a free nation, red for unreserving your own,
            locked/co-op states show a disabled notice. */}
        {/* A running game: hot-join requests + crash reports instead of reserving. */}
        {gameRunning && (
          <HotJoinBar
            threadId={selectedThread}
            selected={selected}
            selectionKind={selectionKind}
            ownerLabel={ownerLabel ? ownerLabelText(ownerLabel) : null}
            authUser={authUser}
            onChanged={() => void refreshLobbyReservations()}
          />
        )}
        {/* Draft games: nations are handed out by the captains — no direct reserving. */}
        {selected && selectionKind && lobbyLock?.draft && !gameRunning && (
          <div className="absolute bottom-6 left-1/2 z-[900] flex -translate-x-1/2 flex-col items-center gap-2">
            <p className="rounded-xl border border-amber-300/30 bg-slate-950/80 px-4 py-2 text-center text-xs font-semibold text-amber-100 shadow-xl backdrop-blur-md">
              🎯 Draft game — the team captains place players on nations.
            </p>
            {lobbyLock.draft.phase === "ENLISTING" && onJoinDraft && (
              <button
                type="button"
                onClick={onJoinDraft}
                className="reserve-cta-glow rounded-xl bg-amber-400 px-8 py-3 text-base font-black uppercase tracking-wider text-slate-950 shadow-2xl transition-transform hover:scale-105"
              >
                Join the draft
              </button>
            )}
          </div>
        )}
        {selected && selectionKind && !lobbyLock?.draft && !gameRunning && (
          <div className="absolute bottom-6 left-1/2 z-[900] flex -translate-x-1/2 flex-col items-center gap-2">
            {selectionKind === "pending" &&
              (authUser ? (
                <button
                  type="button"
                  className="reserve-cta-glow rounded-xl bg-amber-400 px-10 py-3.5 text-lg font-black uppercase tracking-wider text-slate-950 shadow-2xl transition-transform hover:scale-105 disabled:opacity-60"
                  disabled={!selectedThread || reserving}
                  onClick={handleReserve}
                >
                  {reserving ? "Reserving…" : "Reserve Nation"}
                </button>
              ) : (
                <a
                  href="/api/auth/login"
                  className="reserve-cta-glow rounded-xl bg-amber-400 px-10 py-3.5 text-lg font-black uppercase tracking-wider text-slate-950 shadow-2xl transition-transform hover:scale-105"
                >
                  Login &amp; Reserve
                </a>
              ))}
            {selectionKind === "self" && (
              <button
                type="button"
                className="reserve-cta-glow rounded-xl bg-red-500 px-10 py-3.5 text-lg font-black uppercase tracking-wider text-white shadow-2xl transition-transform hover:scale-105 disabled:opacity-60"
                disabled={reserving}
                onClick={handleUnreserve}
              >
                {reserving ? "Unreserving…" : "Unreserve Nation"}
              </button>
            )}
            {selectionKind === "locked" && (
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-xl border border-rose-400/40 bg-rose-950/70 px-8 py-3 text-sm font-bold uppercase tracking-wide text-rose-200/70"
              >
                Reserved by {ownerLabelText(ownerLabel)}
              </button>
            )}
            {selectionKind === "coop" && (
              <button
                type="button"
                disabled
                title="Co-Op requests are coming soon"
                className="cursor-not-allowed rounded-xl border border-sky-300/40 bg-sky-950/70 px-8 py-3 text-sm font-bold uppercase tracking-wide text-sky-100/60"
              >
                Request Co-Op
              </button>
            )}
            {reserveMessage && (
              <p
                className={`rounded-md bg-slate-950/70 px-3 py-1.5 text-xs ${
                  reserveMessage.kind === "success"
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {reserveMessage.text}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
