"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, useMap } from "react-leaflet";
import {
  computePixelWorld,
  createWorldCrs,
  INERTIA_MAX_SPEED,
  MapSetup,
  MAX_ZOOM,
  useMapRemountKey,
  withWorldCopies,
  type PixelWorld,
  type ViewIntent,
} from "@/components/MapViewer";
import { versionedMapUrl } from "@/lib/mapVersion";
import type { GGState } from "@/lib/greatGame/model";
import type { NationFeature, NationFeatureCollection } from "@/lib/types";
import type { Considering } from "./useGreatGame";

/**
 * The Great Game map: the live map's Road to 56 world (same geometry, same
 * wrap-around and zoom), painted by the event:
 *
 *  - a claimed nation (a team's major or pick) keeps its colour under
 *    diagonal stripes in the team's colour;
 *  - the nation a captain is looking at glows yellow for everyone;
 *  - a banned nation turns AI grey with a BANNED stamp;
 *  - from the assignment window on, every unclaimed nation is AI grey, and
 *    once the teams lock each team's nations go solid in its colour.
 */

const AI = "#3b3650";
const SEA = "#0d0820";
const BORDER = "#0b0716";
/** Opens on Europe, a little zoomed in. */
const EUROPE: ViewIntent = { cxFrac: 0.54, cyFrac: 0.8, zoomOffset: 1.3 };

export interface MapPaint {
  fill: string;
  hatch: string | null;
  stamp: boolean;
}

export function paintFor(state: GGState): (tag: string, base: string) => MapPaint {
  const owner = new Map<string, string>();
  const banned = new Set<string>();
  for (const team of state.teams) {
    if (team.major) owner.set(team.major, team.id);
    for (const pick of team.picks) if (pick) owner.set(pick, team.id);
    if (team.ban) banned.add(team.ban);
  }
  const color = new Map(state.teams.map((team) => [team.id, team.color]));
  const late = state.phase === "assign" || state.phase === "locked";
  const locked = state.phase === "locked";
  return (tag, base) => {
    const team = owner.get(tag);
    if (team) return locked ? { fill: color.get(team) ?? base, hatch: null, stamp: false } : { fill: base, hatch: team, stamp: false };
    if (banned.has(tag)) return { fill: AI, hatch: null, stamp: !late };
    return { fill: late ? AI : base, hatch: null, stamp: false };
  };
}

/** Largest ring's centre per tag (for the stamps). */
function anchors(collection: NationFeatureCollection): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const best = new Map<string, number>();
  for (const feature of collection.features) {
    const tag = feature.properties.tag;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) {
      const ring = polygon[0];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area > (best.get(tag) ?? -1)) {
        best.set(tag, area);
        out.set(tag, [(minY + maxY) / 2, (minX + maxX) / 2]);
      }
    }
  }
  return out;
}

/** The team stripe patterns live in the map's own SVG (paths fill with url(#gg-h-<team>)). */
function Patterns({ teams }: { teams: { id: string; color: string }[] }) {
  const map = useMap();
  const key = teams.map((team) => `${team.id}:${team.color}`).join(",");
  useEffect(() => {
    const install = () => {
      const svg = map.getPanes().overlayPane.querySelector("svg");
      if (!svg) return false;
      let defs = svg.querySelector("defs#gg-defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.setAttribute("id", "gg-defs");
        svg.insertBefore(defs, svg.firstChild);
      }
      defs.innerHTML = teams
        .map(
          (team) =>
            `<pattern id="gg-h-${team.id}" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)"><rect width="4" height="9" fill="${team.color}"/></pattern>`,
        )
        .join("");
      return true;
    };
    if (install()) return undefined;
    const id = setInterval(() => {
      if (install()) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * Leaflet redraws only when a move ends, so a long drag or a hard flick ran
 * past the drawn area and the map vanished. Like the live map
 * (nationHighlights.ts), redraw for the view now whenever it gets close to the
 * drawn edge mid-drag.
 */
function RedrawAhead({ renderer }: { renderer: L.SVG }) {
  const map = useMap();
  useEffect(() => {
    let queued = false;
    const check = () => {
      const base = renderer as L.SVG & { _bounds?: L.Bounds; _update?: () => void; _zoom?: number };
      const leaflet = map as L.Map & { _animatingZoom?: boolean };
      const drawn = base._bounds;
      if (!base._update || !drawn?.min || !drawn.max || leaflet._animatingZoom) return;
      if (base._zoom !== undefined && base._zoom !== map.getZoom()) return;
      const size = map.getSize();
      const margin = Math.min(size.x, size.y) * 0.35;
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      const bottomRight = map.containerPointToLayerPoint([size.x, size.y]);
      if (
        topLeft.x - drawn.min.x < margin ||
        topLeft.y - drawn.min.y < margin ||
        drawn.max.x - bottomRight.x < margin ||
        drawn.max.y - bottomRight.y < margin
      ) {
        base._update();
      }
    };
    const onMove = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        check();
      });
    };
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, [map, renderer]);
  return null;
}

/**
 * An SVG renderer that doesn't redraw every nation on a plain pan.
 *
 * Leaflet's SVG renderer, whenever it moves its drawing area (at the end of
 * every drag, and mid-drag via RedrawAhead), rebuilds the outline of every
 * path: thousands of polygons in three world copies, so a drag stuttered
 * about once a second. Every path here is drawn whole (noClip), so a pan
 * within the same zoom leaves every outline exactly as it was: only the SVG's
 * box has to move. The outlines are rebuilt only when the zoom changed since
 * they were last drawn (paths drawn for the first time, or after a reset,
 * draw themselves).
 */
type RendererInternals = L.SVG & {
  _map: L.Map & { _animatingZoom?: boolean };
  _bounds: L.Bounds;
  _container: SVGSVGElement;
  _svgSize?: L.Point;
  _pathsZoom?: number;
};

const PanOnlySVG = L.SVG.extend({
  _update(this: RendererInternals) {
    const map = this._map;
    if (map._animatingZoom && this._bounds) return;
    (L.Renderer.prototype as unknown as { _update: () => void })._update.call(this);
    const bounds = this._bounds;
    const size = bounds.getSize();
    const container = this._container;
    if (!this._svgSize || !this._svgSize.equals(size)) {
      this._svgSize = size;
      container.setAttribute("width", String(size.x));
      container.setAttribute("height", String(size.y));
    }
    L.DomUtil.setPosition(container as unknown as HTMLElement, bounds.min!);
    container.setAttribute("viewBox", [bounds.min!.x, bounds.min!.y, size.x, size.y].join(" "));
    const zoom = map.getZoom();
    if (this._pathsZoom !== zoom) {
      this._pathsZoom = zoom;
      this.fire("update");
    }
  },
}) as unknown as new (options?: L.RendererOptions) => L.SVG;

/**
 * Tells the page while the map is being dragged or zoomed (no hover name then).
 */
function MotionWatch({ onMoving }: { onMoving: (moving: boolean) => void }) {
  const map = useMap();
  useEffect(() => {
    const start = () => onMoving(true);
    const end = () => onMoving(false);
    map.on("movestart zoomstart", start);
    map.on("moveend zoomend", end);
    return () => {
      map.off("movestart zoomstart", start);
      map.off("moveend zoomend", end);
    };
  }, [map, onMoving]);
  return null;
}

/** Hovered nation's name: the same pill as the live map, under the pennant. */
const HOVER_DEBOUNCE_MS = 100;

function GGMap({
  state,
  considering,
  selected,
  onSelect,
}: {
  state: GGState;
  considering: Considering;
  selected: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const [data, setData] = useState<NationFeatureCollection | null>(null);
  const [raw, setRaw] = useState<NationFeatureCollection | null>(null);
  const [world, setWorld] = useState<PixelWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mapKey = useMapRemountKey();
  const viewRef = useRef<ViewIntent | null>(EUROPE);
  const baseRef = useRef<L.GeoJSON | null>(null);
  const renderer = useMemo(() => new PanOnlySVG({ padding: 1 }), []);
  // onEachFeature runs once per nation: it reaches the latest handler through a ref.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const [hover, setHover] = useState<string | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const moving = useRef(false);
  const onMoving = useCallback((value: boolean) => {
    moving.current = value;
    if (value) {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
      setHover(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(versionedMapUrl("/maps/road_to_56.geojson"))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<NationFeatureCollection>;
      })
      .then((collection) => {
        if (cancelled) return;
        const pixel = computePixelWorld(collection);
        setWorld(pixel);
        setRaw(collection);
        setData(withWorldCopies(collection, pixel));
      })
      .catch((reason: unknown) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => {
      cancelled = true;
    };
  }, []);

  const crs = useMemo(() => (world ? createWorldCrs(world) : L.CRS.Simple), [world]);
  const paint = useMemo(() => paintFor(state), [state]);
  const known = state.config.names;
  const anchorMap = useMemo(() => (raw ? anchors(raw) : new Map<string, [number, number]>()), [raw]);

  // Leaflet calls the style function outside React: it reads the latest paint through refs.
  const paintRef = useRef(paint);
  const selectedRef = useRef(selected);

  const baseStyle = useCallback((feature?: NationFeature): L.PathOptions => {
    if (!feature) return {};
    const tag = feature.properties.tag;
    const look = paintRef.current(tag, feature.properties.color ?? "#555");
    const isSelected = selectedRef.current === tag;
    return {
      fillColor: look.fill,
      fillOpacity: 1,
      color: isSelected ? "#ffffff" : BORDER,
      weight: isSelected ? 2.5 : 0.8,
      fillRule: "evenodd",
    };
  }, []);

  // Repaint in place when the event or the selection changes.
  useEffect(() => {
    paintRef.current = paint;
    selectedRef.current = selected;
    baseRef.current?.setStyle(baseStyle as L.StyleFunction);
  }, [paint, selected, baseStyle]);

  const hatched = useMemo(() => {
    if (!data) return null;
    const features = data.features.filter((feature) => paint(feature.properties.tag, "").hatch);
    return { type: "FeatureCollection" as const, features };
  }, [data, paint]);
  const hatchKey = useMemo(
    () => (hatched ? hatched.features.map((feature) => `${feature.properties.tag}`).join(",") + state.teams.map((t) => t.color).join("") : ""),
    [hatched, state.teams],
  );

  const glowTags = useMemo(() => new Set(Object.values(considering).flatMap((entry) => (entry ? [entry.tag] : []))), [considering]);
  const glow = useMemo(() => {
    if (!data || !glowTags.size) return null;
    return { type: "FeatureCollection" as const, features: data.features.filter((feature) => glowTags.has(feature.properties.tag)) };
  }, [data, glowTags]);

  const stamps = useMemo(() => {
    const out: { tag: string; at: [number, number] }[] = [];
    for (const team of state.teams) {
      if (team.ban && anchorMap.has(team.ban) && paint(team.ban, "").stamp) out.push({ tag: team.ban, at: anchorMap.get(team.ban)! });
    }
    return out;
  }, [state.teams, anchorMap, paint]);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "var(--gg-fg-2)" }}>
        The map didn&apos;t load ({error}). Reload the page.
      </div>
    );
  }
  if (!data || !world) return <div className="absolute inset-0" style={{ background: SEA }} />;

  return (
    <>
    <MapContainer
      key={mapKey}
      crs={crs}
      center={[world.minY + (world.maxY - world.minY) / 2, world.minX + (world.maxX - world.minX) / 2]}
      zoom={0}
      maxZoom={MAX_ZOOM}
      zoomControl={false}
      maxBoundsViscosity={1}
      worldCopyJump
      zoomSnap={0}
      zoomDelta={0.25}
      doubleClickZoom={false}
      inertia
      inertiaMaxSpeed={INERTIA_MAX_SPEED}
      attributionControl={false}
      className="h-full w-full"
      style={{ background: SEA }}
    >
      <MapSetup world={world} initialViewRef={viewRef} />
      <RedrawAhead renderer={renderer} />
      <MotionWatch onMoving={onMoving} />
      <Patterns teams={state.teams} />
      <GeoJSON
        ref={baseRef}
        data={data}
        style={baseStyle as L.StyleFunction}
        onEachFeature={(feature: NationFeature, layer) => {
          const tag = feature.properties.tag;
          const path = layer as L.Polygon;
          // Draw whole nations, never clipped to the old view (no chopped edges while panning).
          path.options.noClip = true;
          const label = known[tag] ?? feature.properties.name;
          path.on({
            mouseover: () => {
              if (moving.current) return;
              if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
              hoverTimer.current = window.setTimeout(() => {
                hoverTimer.current = null;
                if (moving.current) return;
                setHover(label);
                if (known[tag] && selectedRef.current !== tag) path.setStyle({ color: "#efe9ff", weight: 1.8 });
              }, HOVER_DEBOUNCE_MS);
            },
            mouseout: () => {
              if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
              hoverTimer.current = null;
              setHover(null);
              path.setStyle(baseStyle(feature));
            },
            click: () => {
              if (known[tag]) onSelectRef.current(tag);
            },
          });
        }}
        {...{ renderer }}
      />
      {hatched && (
        <GeoJSON
          key={`h:${hatchKey}`}
          data={hatched}
          interactive={false}
          onEachFeature={(_feature: NationFeature, layer) => {
            (layer as L.Polygon).options.noClip = true;
          }}
          style={
            ((feature?: NationFeature) => ({
              fillColor: `url(#gg-h-${feature ? paint(feature.properties.tag, "").hatch : ""})`,
              fillOpacity: 1,
              stroke: false,
            })) as L.StyleFunction
          }
          {...{ renderer }}
        />
      )}
      {glow && (
        <GeoJSON
          key={`g:${[...glowTags].join(",")}`}
          data={glow}
          interactive={false}
          onEachFeature={(_feature: NationFeature, layer) => {
            (layer as L.Polygon).options.noClip = true;
          }}
          style={{ fillColor: "#ffd23f", fillOpacity: 0.28, color: "#ffd23f", weight: 3, className: "gg-glow" }}
          {...{ renderer }}
        />
      )}
      {stamps.map((stamp) => (
        <Marker
          key={stamp.tag}
          position={stamp.at}
          interactive={false}
          icon={L.divIcon({ className: "", html: '<div class="gg-stamp">BANNED</div>', iconSize: [70, 20], iconAnchor: [35, 10] })}
        />
      ))}
    </MapContainer>
    {hover && (
      <div
        className="pointer-events-none absolute left-1/2 top-[252px] z-[950] -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-bold shadow-xl backdrop-blur-md"
        style={{ background: "rgba(14,8,30,.82)", border: "1px solid rgba(255,255,255,.15)", color: "var(--gg-fg)" }}
      >
        {hover}
      </div>
    )}
    </>
  );
}

// The page re-renders 5 times a second for its clocks; the map only when its own inputs change.
export default memo(GGMap);
