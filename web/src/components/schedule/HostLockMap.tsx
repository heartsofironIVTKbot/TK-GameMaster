"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  FocusController,
  HighlightsBridge,
  MAX_ZOOM,
  INERTIA_MAX_SPEED,
  MapSetup,
  OCEAN,
  buildRosterNations,
  capitalsForMap,
  computePixelWorld,
  createPaddedRenderer,
  createWorldCrs,
  useMapRemountKey,
  withWorldCopies,
  type PixelWorld,
  type ViewIntent,
} from "@/components/MapViewer";
import type { HighlightState, HoverTarget } from "@/components/nationHighlights";
import { SCENARIOS, type ScenarioId } from "@/data/scenarioData";
import { versionedMapUrl } from "@/lib/mapVersion";
import type {
  NationFeatureCollection,
  NationFeatureProps,
  RosterNation,
} from "@/lib/types";

/**
 * The scenario map in "host lock" mode: clicking a nation toggles it in the
 * lock group being edited. Same rendering pipeline as the reservation map
 * (MapViewer) — world copies, wrapped CRS, overlay highlights — but without
 * lobbies or reservations:
 *
 *   red neon   nations in the lock group being edited
 *   blue       nations in the host's other lock groups
 *
 * The preset editor passes its own, lighter sets instead (purple: being
 * edited, thin blue: the other groups, red or grey: not playable).
 */

const DEFAULT_FILL = "#374151";
const DEFAULT_STROKE = "#101827";
const HOVER_DEBOUNCE_MS = 80;

interface HostLockMapProps {
  scenarioId: ScenarioId;
  /** Tags of the lock group being edited (red). */
  activeTags?: readonly string[];
  /** Tags of the other lock groups (blue). */
  otherTags?: readonly string[];
  /** Preset editor: the group being edited (purple). */
  editingTags?: readonly string[];
  /** Preset editor: the other groups (thin blue). */
  groupTags?: readonly string[];
  /** Preset editor: not-playable nations in red… */
  excludedTags?: readonly string[];
  /** …or greyed out, the way players see them. */
  greyTags?: readonly string[];
  onNationClick: (nation: NationFeatureProps) => void;
  /** One entry per nation once the map has loaded. */
  onNationsChange: (nations: RosterNation[]) => void;
  onHoverChange?: (nation: NationFeatureProps | null) => void;
  focusRequest?: { tag: string; nonce: number } | null;
}

const NONE: readonly string[] = [];

export default function HostLockMap({
  scenarioId,
  activeTags = NONE,
  otherTags = NONE,
  editingTags = NONE,
  groupTags = NONE,
  excludedTags = NONE,
  greyTags = NONE,
  onNationClick,
  onNationsChange,
  onHoverChange,
  focusRequest = null,
}: HostLockMapProps) {
  const url = SCENARIOS[scenarioId].mapUrl;
  const [loaded, setLoaded] = useState<{
    url: string;
    data: NationFeatureCollection;
    world: PixelWorld;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const paddedRenderer = useMemo(() => createPaddedRenderer(), []);
  const mapKey = useMapRemountKey();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const viewIntentRef = useRef<ViewIntent | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const movingRef = useRef(false);

  // The GeoJSON layer binds its handlers once, so they read these refs.
  const clickRef = useRef(onNationClick);
  const hoverChangeRef = useRef(onHoverChange);
  useEffect(() => {
    clickRef.current = onNationClick;
    hoverChangeRef.current = onHoverChange;
  }, [onNationClick, onHoverChange]);

  useEffect(() => {
    let cancelled = false;
    fetch(versionedMapUrl(url))
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load map: HTTP ${response.status}`);
        return response.json() as Promise<NationFeatureCollection>;
      })
      .then((collection) => {
        if (cancelled) return;
        const world = computePixelWorld(collection);
        setLoaded({ url, data: withWorldCopies(collection, world), world });
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = loaded?.url === url ? loaded : null;

  useEffect(() => {
    if (current) onNationsChange(buildRosterNations(current.data, current.world, scenarioId));
  }, [current, scenarioId, onNationsChange]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  const crs = useMemo(
    () => (current ? createWorldCrs(current.world) : L.CRS.Simple),
    [current],
  );

  const handleMotionChange = useCallback((moving: boolean) => {
    movingRef.current = moving;
  }, []);
  const handleViewportChange = useCallback((view: ViewIntent) => {
    viewIntentRef.current = view;
  }, []);

  const baseStyle = useCallback(
    (feature?: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>): L.PathOptions => {
      const props = feature?.properties as NationFeatureProps | undefined;
      return {
        color: DEFAULT_STROKE,
        weight: 0.8,
        lineJoin: "round",
        lineCap: "round",
        fillColor: props?.color ?? DEFAULT_FILL,
        fillOpacity: 0.8,
      };
    },
    [],
  );

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>, layer: L.Layer) => {
      const props = feature.properties as NationFeatureProps | undefined;
      const path = layer as L.Polygon;
      if (!props || props.tag === "VOID" || !props.slot_key) {
        path.options.interactive = false;
        return;
      }
      path.options.noClip = true;
      path.on({
        mouseover: () => {
          if (movingRef.current) return;
          if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = window.setTimeout(() => {
            hoverTimerRef.current = null;
            if (movingRef.current) return;
            setHover({ tag: props.tag, layer: path });
            hoverChangeRef.current?.(props);
          }, HOVER_DEBOUNCE_MS);
        },
        mouseout: () => {
          if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
          setHover(null);
          hoverChangeRef.current?.(null);
        },
        click: () => clickRef.current(props),
      });
    },
    [],
  );

  const highlightState = useMemo<HighlightState>(
    () => ({
      hover,
      pendingTag: null,
      coopTag: null,
      coopTags: otherTags,
      selfTags: [],
      lockedTags: activeTags,
      editingTags,
      groupTags,
      excludedTags,
      takenTags: greyTags,
    }),
    [hover, activeTags, otherTags, editingTags, groupTags, excludedTags, greyTags],
  );

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0f1d21] p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }
  if (!current) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0f1d21] text-sm text-ink-400">
        Loading map…
      </div>
    );
  }

  const { world, data } = current;
  const worldWidth = world.maxX - world.minX;
  const worldHeight = world.maxY - world.minY;
  const initialZoom = Math.max(
    0,
    Math.log2(Math.max(window.innerWidth / worldWidth, window.innerHeight / worldHeight)),
  );

  return (
    <MapContainer
      key={`${url}:${mapKey}`}
      crs={crs}
      center={[world.minY + worldHeight / 2, world.minX + worldWidth / 2]}
      zoom={initialZoom}
      maxZoom={MAX_ZOOM}
      maxBoundsViscosity={1.0}
      worldCopyJump
      // A flick glides at most a few hundred px (Leaflet's default has no
      // cap): further than the drawn area around the view and, zoomed in,
      // half the map blinks out until it's redrawn.
      inertiaMaxSpeed={INERTIA_MAX_SPEED}
      zoomSnap={0}
      zoomDelta={0.1}
      doubleClickZoom={false}
      attributionControl={false}
      zoomControl={false}
      className="h-full w-full"
      style={{ background: OCEAN, cursor: "pointer" }}
    >
      <MapSetup world={world} initialViewRef={viewIntentRef} onViewportChange={handleViewportChange} />
      <FocusController request={focusRequest} geoJsonRef={geoJsonRef} capitals={capitalsForMap(url)} />
      <GeoJSON
        ref={geoJsonRef}
        key={url}
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
    </MapContainer>
  );
}
