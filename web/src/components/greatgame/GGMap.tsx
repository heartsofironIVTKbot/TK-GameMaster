"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, useMap } from "react-leaflet";
import {
  computePixelWorld,
  createWorldCrs,
  HighlightsBridge,
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
import type { HighlightState, HoverTarget } from "@/components/nationHighlights";
import { AvatarsContext } from "./ggUi";
import type { Considering } from "./useGreatGame";
import mapCapitals from "@/data/mapCapitals.json";

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
 *
 * During the bans and the draft the map is painted for reading at a glance:
 * the minors still free keep their bright colours, banned ones go dark red
 * with a red cross-hatch and a BANNED stamp, the majors sit calm in their
 * team's colour, a drafted minor goes solid in its team's colour, and
 * everything outside the pool is grey.
 */

const AI = "#3b3650";
const OUT = "#262138";
const BANNED_FILL = "#3d0c19";

/** `color` mixed into the night: majors stay recognisable without shouting. */
function calm(color: string, amount = 0.42): string {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const n = parseInt(full, 16);
  const mix = (v: number, base: number) => Math.round(base + (v - base) * amount);
  const r = mix((n >> 16) & 255, 22);
  const g = mix((n >> 8) & 255, 12);
  const b = mix(n & 255, 44);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
const SEA = "#0d0820";
const BORDER = "#0b0716";
/** Opens on Europe, a little zoomed in. */
const EUROPE: ViewIntent = { cxFrac: 0.54, cyFrac: 0.8, zoomOffset: 1.3 };
/** On the map steps (bans, draft): closer in, so Europe can sit below the top bar. */
const EUROPE_CLOSE: ViewIntent = { cxFrac: 0.545, cyFrac: 0.79, zoomOffset: 1.85 };

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
  if (state.phase === "assign") {
    // Each team's four nations solid in its colour; the rest of the world grey.
    return (tag, base) => {
      const team = owner.get(tag);
      return team ? { fill: color.get(team) ?? base, hatch: null, stamp: false } : { fill: OUT, hatch: null, stamp: false };
    };
  }
  if (state.phase === "bans" || state.phase === "draft") {
    const pool = new Set(state.config.pool);
    const majors = new Set(state.teams.map((team) => team.major).filter(Boolean));
    return (tag, base) => {
      const team = owner.get(tag);
      // Majors calm in their team's colour; a drafted minor solid in it, so each team's bloc shows.
      if (team) return { fill: majors.has(tag) ? calm(color.get(team) ?? base) : (color.get(team) ?? base), hatch: null, stamp: false };
      if (banned.has(tag)) return { fill: BANNED_FILL, hatch: "banned", stamp: true };
      return { fill: pool.has(tag) ? base : OUT, hatch: null, stamp: false };
    };
  }
  return (tag, base) => {
    const team = owner.get(tag);
    if (team) return locked ? { fill: color.get(team) ?? base, hatch: null, stamp: false } : { fill: base, hatch: team, stamp: false };
    if (banned.has(tag)) return { fill: AI, hatch: null, stamp: !late };
    return { fill: late ? AI : base, hatch: null, stamp: false };
  };
}

/** Stamp icons, made once per nation (a new icon would remount the marker and replay its slam). */
const STAMPS = new Map<string, L.DivIcon>();
function stampIcon(tag: string, fresh: boolean): L.DivIcon {
  const key = `${tag}:${fresh ? "new" : "old"}`;
  let icon = STAMPS.get(key) ?? STAMPS.get(`${tag}:new`);
  if (!icon) {
    icon = L.divIcon({ className: "", html: `<div class="gg-stamp${fresh ? " is-new" : ""}">BANNED</div>`, iconSize: [96, 28], iconAnchor: [48, 14] });
    STAMPS.set(key, icon);
  }
  return icon;
}

/** A placed player's pin: their Discord picture (or initial) ringed in the team's colour. Made once per player and nation. */
const PINS = new Map<string, L.DivIcon>();
function pinIcon(id: string, name: string, src: string | undefined, color: string, fresh: boolean): L.DivIcon {
  const base = `${id}:${src ?? ""}:${color}`;
  let icon = PINS.get(`${base}:${fresh ? "new" : "old"}`) ?? PINS.get(`${base}:new`);
  if (!icon) {
    const safe = name.replace(/[<>&"]/g, "");
    const face = src ? `<img src="${src.replace(/"/g, "")}" alt="" />` : `<span>${safe.slice(0, 1).toUpperCase()}</span>`;
    icon = L.divIcon({
      className: "",
      html: `<div class="gg-pin${fresh ? " is-new" : ""}" style="--team:${color}">${face}<b>${safe}</b></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    PINS.set(`${base}:${fresh ? "new" : "old"}`, icon);
  }
  return icon;
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
      defs.innerHTML =
        teams
          .map(
            (team) =>
              `<pattern id="gg-h-${team.id}" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)"><rect width="4" height="9" fill="${team.color}"/></pattern>`,
          )
          .join("") +
        // A banned nation: a red cross-hatch.
        `<pattern id="gg-h-banned" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><rect width="10" height="10" fill="#3d0c19"/><rect width="3" height="10" fill="#ff3b3b" opacity=".55"/><rect width="10" height="3" fill="#ff3b3b" opacity=".35"/></pattern>`;
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

/**
 * Draw an outline whole, always. Leaflet skips (draws empty) any path that lies outside
 * its drawing area at the moment it last rebuilt the paths, even with noClip. PanOnlySVG
 * only rebuilds after a zoom, so after a long pan, or when worldCopyJump wraps the view
 * onto another of the three world copies (which happens as soon as a drag starts over
 * Europe), the land there had never been drawn and the map went blank until the next
 * zoom. Every path on this map goes through here, so nothing is ever left undrawn.
 */
function drawWhole(layer: L.Layer) {
  const path = layer as L.Polygon & { _clipPoints: () => void; _parts: unknown; _rings: unknown };
  path.options.noClip = true;
  path._clipPoints = function (this: { _parts: unknown; _rings: unknown }) {
    this._parts = this._rings;
  };
}

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
 * The map's first view leaves room for the team drawer on the left and the
 * top bar: Europe opens in the middle of what's actually visible.
 */
function FrameVisible({ world, intent, left, top, right, bottom = 0 }: { world: PixelWorld; intent: ViewIntent; left: number; top: number; right: number; bottom?: number }) {
  const map = useMap();
  useEffect(() => {
    // Applied once the map has settled after loading. Loading can leave a zoom-out to the whole world
    // queued (Leaflet animates it on the next frame); if that lands after us, frame again.
    let zoomSet: number | null = null;
    // Room above the world's top for the top bar, fading to none at the zoom floor (no drag up and down there).
    const bound = (zoom: number) => {
      const slack = Math.max(0, Math.min(1, (zoom - map.getMinZoom()) / 0.6));
      map.setMaxBounds(L.latLngBounds([world.minY, -Infinity], [world.maxY + (top * slack) / Math.pow(2, zoom), Infinity]));
    };
    const onZoom = () => bound(map.getZoom());
    map.on("zoomend", onZoom);
    const frame = () => {
      const width = world.maxX - world.minX;
      const height = world.maxY - world.minY;
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const fill = Math.max(0, Math.log2(Math.max(size.x / width, size.y / height)));
      const zoom = Math.min(map.getMaxZoom(), fill + intent.zoomOffset);
      // Let the map scroll a little past the world's top, so the north of Europe can sit below the top bar.
      bound(zoom);
      map.setView(L.latLng(world.minY + intent.cyFrac * height, world.minX + intent.cxFrac * width), zoom, { animate: false });
      map.panBy([(right - left) / 2, (bottom - top) / 2], { animate: false });
      zoomSet = zoom;
    };
    const late = () => {
      if (zoomSet !== null && Math.abs(map.getZoom() - zoomSet) > 0.01) frame();
    };
    const id = window.setTimeout(() => {
      frame();
      map.on("zoomend", late);
      window.setTimeout(() => map.off("zoomend", late), 2000);
    }, 350);
    return () => {
      window.clearTimeout(id);
      map.off("zoomend", late);
      map.off("zoomend", onZoom);
    };
    // Only the first view (per map).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

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
  const mapStep = state.phase === "bans" || state.phase === "draft" || state.phase === "assign" || state.phase === "locked";
  const viewRef = useRef<ViewIntent | null>(mapStep ? EUROPE_CLOSE : EUROPE);
  const baseRef = useRef<L.GeoJSON | null>(null);
  const renderer = useMemo(() => new PanOnlySVG({ padding: 1 }), []);
  // onEachFeature runs once per nation: it reaches the latest handler through a ref.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const [hover, setHover] = useState<string | null>(null);
  // The hovered nation for the live map's glow (drawn above every neighbour).
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
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
    return {
      fillColor: look.fill,
      fillOpacity: 1,
      color: BORDER,
      weight: 0.8,
      fillRule: "evenodd",
    };
  }, []);

  const lockedTags = useMemo(() => {
    if (!raw) return [] as string[];
    const inDraft = new Set([...state.config.pool, ...state.config.majors]);
    const out = new Set<string>();
    for (const feature of raw.features) {
      const tag = feature.properties.tag;
      if (feature.properties.slot_key !== null && tag && !inDraft.has(tag)) out.add(tag);
    }
    return [...out];
  }, [raw, state.config.pool, state.config.majors]);
  const highlights = useMemo<HighlightState>(
    () => ({ hover: hoverTarget, pendingTag: selected, coopTag: null, selfTags: [], lockedTags: [], takenTags: lockedTags }),
    [hoverTarget, selected, lockedTags],
  );

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
  // Who is eyeing what: a label over the nation, in the team's colour.
  const eyes = useMemo(() => {
    const out: { key: string; at: [number, number]; icon: L.DivIcon }[] = [];
    for (const [teamId, entry] of Object.entries(considering)) {
      const team = state.teams.find((t) => t.id === teamId);
      if (!entry || !team || !anchorMap.has(entry.tag)) continue;
      const name = team.name.replace(/[<>&"]/g, "");
      out.push({
        key: `${teamId}:${entry.tag}`,
        at: anchorMap.get(entry.tag)!,
        icon: L.divIcon({ className: "", html: `<div class="gg-eye" style="--team:${team.color}"><b>${name}</b> eyeing…</div>`, iconSize: [0, 0], iconAnchor: [0, 60] }),
      });
    }
    return out;
  }, [considering, state.teams, anchorMap]);
  const glow = useMemo(() => {
    if (!data || !glowTags.size) return null;
    return { type: "FeatureCollection" as const, features: data.features.filter((feature) => glowTags.has(feature.properties.tag)) };
  }, [data, glowTags]);

  // Placed players' avatars on their nations' capitals (from the line-ups on), like the live map.
  const avatars = useContext(AvatarsContext);
  const pins = useMemo(() => {
    if (state.phase !== "assign" && state.phase !== "locked") return [];
    const capitals = (mapCapitals as Record<string, Record<string, number[]>>).road_to_56 ?? {};
    const undone = new Set(state.log.filter((entry) => entry.kind === "undo").map((entry) => Number(entry.payload.seq)));
    const out: { key: string; at: [number, number]; icon: L.DivIcon }[] = [];
    for (const team of state.teams) {
      for (const [personId, tag] of Object.entries(team.assign)) {
        const point = capitals[tag] ?? null;
        const at: [number, number] | null = point ? [point[1], point[0]] : (anchorMap.get(tag) ?? null);
        if (!at) continue;
        const who = state.config.people.find((entry) => entry.id === personId);
        const action = [...state.log].reverse().find((entry) => entry.kind === "assign.set" && entry.payload.person === personId && !undone.has(entry.seq));
        const fresh = action ? state.now - action.at < 4000 : false;
        out.push({ key: `${personId}:${tag}`, at, icon: pinIcon(personId, who?.name ?? "?", avatars[personId], team.color, fresh) });
      }
    }
    return out;
  }, [state.phase, state.teams, state.config.people, state.log, state.now, anchorMap, avatars]);

  // A nation drafted just now flashes white in its team's colour outline.
  const flash = useMemo(() => {
    if (!data) return null;
    const undone = new Set(state.log.filter((entry) => entry.kind === "undo").map((entry) => Number(entry.payload.seq)));
    const latest = [...state.log].reverse().find((entry) => entry.kind === "pick.set" && !undone.has(entry.seq) && entry.payload.tag);
    if (!latest || state.now - latest.at > 4000) return null;
    const tag = String(latest.payload.tag);
    const team = state.teams.find((entry) => entry.id === latest.payload.team);
    return { key: `${latest.seq}:${tag}`, color: team?.color ?? "#fff", data: { type: "FeatureCollection" as const, features: data.features.filter((feature) => feature.properties.tag === tag) } };
  }, [data, state.log, state.now, state.teams]);

  // A stamp slams down when its ban is fresh; bans already in when the page opened just sit there.
  const stamps = useMemo(() => {
    const out: { tag: string; at: [number, number]; icon: L.DivIcon }[] = [];
    const undone = new Set(state.log.filter((entry) => entry.kind === "undo").map((entry) => Number(entry.payload.seq)));
    for (const team of state.teams) {
      if (!team.ban || !anchorMap.has(team.ban) || !paint(team.ban, "").stamp) continue;
      const action = [...state.log].reverse().find((entry) => entry.kind === "ban.set" && entry.payload.tag === team.ban && !undone.has(entry.seq));
      const fresh = action ? state.now - action.at < 4000 : false;
      out.push({ tag: team.ban, at: anchorMap.get(team.ban)!, icon: stampIcon(team.ban, fresh) });
    }
    return out;
  }, [state.teams, state.log, state.now, anchorMap, paint]);

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
      <HighlightsBridge geoJsonRef={baseRef} layerKey={0} state={highlights} onMotionChange={onMoving} />
      <MotionWatch onMoving={onMoving} />
      <FrameVisible world={world} intent={mapStep ? EUROPE_CLOSE : EUROPE} left={340} top={140} right={state.phase === "bans" || state.phase === "draft" ? 300 : 0} bottom={state.phase === "assign" ? 230 : 0} />
      <Patterns teams={state.teams} />
      <GeoJSON
        ref={baseRef}
        data={data}
        style={baseStyle as L.StyleFunction}
        onEachFeature={(feature: NationFeature, layer) => {
          const tag = feature.properties.tag;
          const path = layer as L.Polygon;
          // Draw whole nations, always (no chopped edges, no blank land after a pan or a wrap).
          drawWhole(path);
          const label = known[tag] ?? feature.properties.name;
          // Decorative ownerless land: no hover, no click (as on the live map).
          if (feature.properties.slot_key === null) return;
          path.on({
            mouseover: () => {
              if (moving.current) return;
              if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
              hoverTimer.current = window.setTimeout(() => {
                hoverTimer.current = null;
                if (moving.current) return;
                setHover(label);
                setHoverTarget({ tag, layer: path });
              }, HOVER_DEBOUNCE_MS);
            },
            mouseout: () => {
              if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
              hoverTimer.current = null;
              setHover(null);
              setHoverTarget((current) => (current?.layer === path ? null : current));
            },
            click: () => {
              // Locked nations open too: the panel says they're locked.
              onSelectRef.current(tag);
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
            drawWhole(layer);
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
            drawWhole(layer);
          }}
          style={{ fillColor: "#ffd23f", fillOpacity: 0.12, color: "#ffd23f", weight: 4, className: "gg-glow" }}
          {...{ renderer }}
        />
      )}
      {flash && (
        <GeoJSON
          key={`f:${flash.key}`}
          data={flash.data}
          interactive={false}
          onEachFeature={(_feature: NationFeature, layer) => {
            drawWhole(layer);
          }}
          style={{ fillColor: "#ffffff", fillOpacity: 0, color: flash.color, weight: 4, className: "gg-pick-flash" }}
          {...{ renderer }}
        />
      )}
      {stamps.map((stamp) => (
        <Marker
          key={stamp.tag}
          position={stamp.at}
          interactive={false}
          icon={stamp.icon}
        />
      ))}
      {pins.map((pin) => (
        <Marker key={pin.key} position={pin.at} interactive={false} icon={pin.icon} />
      ))}
      {eyes.map((eye) => (
        <Marker key={eye.key} position={eye.at} interactive={false} icon={eye.icon} />
      ))}
    </MapContainer>
    {hover && (
      <div
        className="pointer-events-none absolute left-1/2 top-[164px] z-[950] -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-bold shadow-xl backdrop-blur-md"
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
