import L from "leaflet";
import { lighten } from "./nationGeometry";

/**
 * Nation highlight system.
 *
 * The base GeoJSON layer is completely static (one fill + thin border per
 * nation). Every dynamic visual state is drawn by this module in dedicated,
 * non-interactive overlay panes instead of styling the base paths:
 *
 *  - hover    soft nation-colored glow + raised "pop", breathing while held
 *  - taken    flat grey wash, no border (reserved by someone else: disabled)
 *  - pending  yellow clockwise "chasing snake" neon border (selected, free)
 *  - self     solid green neon border with a soft pulsing glow (your nation)
 *  - locked   solid red neon border + dimmed fill (clicked a taken minor —
 *             can't be co-oped; also the host lock editor's active group)
 *  - coop     electric-blue beaded border (reserved major power inspected)
 *  - others   dashed yellow border, softly breathing (other players on the
 *             same game's map have this nation selected — live)
 *
 * Why overlays instead of CSS classes on the base paths:
 *  - Each pane owns its own <svg>, so an animation only repaints its own few
 *    strokes — never the 288 filled nation polygons beneath.
 *  - Neon glow is stacked strokes (wide faint halo + bright core): no CSS
 *    `filter`, so nothing to re-rasterize per frame and nothing to crop.
 *  - Pulses animate the pane's `opacity` (compositor-only); only the snake
 *    animates `stroke-dashoffset`, and it is paused while the map moves.
 *  - Overlay panes sit above every base path, so highlighted borders are never
 *    hidden by a neighbor's fill.
 *
 * Zero extra projection: the base layer has already projected, clipped and
 * simplified every nation for the current view. Overlays do not re-project
 * anything — they MIRROR the base paths' `d` strings (all three world copies
 * concatenated) into their own stroke elements after every Leaflet update.
 * That makes them pixel-identical to the borders by construction and costs only
 * a string join, instead of a second pass over ~470k vertices on every zoom.
 */

export type HighlightKind = "hover" | "taken" | "locked" | "self" | "coop" | "others" | "pending";

/** The seven major powers: a reserved one opens the Co-Op flow when clicked. */
export const MAJOR_TAGS: ReadonlySet<string> = new Set([
  "GER",
  "SOV",
  "USA",
  "ENG",
  "FRA",
  "ITA",
  "JAP",
]);

/** The base polygon (one world copy) currently under the cursor. */
export interface HoverTarget {
  tag: string;
  layer: L.Polygon;
}

export interface HighlightState {
  hover: HoverTarget | null;
  /** Selected nation that is still free: yellow chasing snake. */
  pendingTag: string | null;
  /** Selected nation that is a reserved major power: electric blue. */
  coopTag: string | null;
  /** Several nations in the blue style at once (host lock map: the lock
      groups that are not being edited). Used instead of `coopTag` when set. */
  coopTags?: readonly string[];
  /** Nations reserved by the current user: green. */
  selfTags: readonly string[];
  /** Nations reserved by other players: grey "disabled" wash. */
  takenTags?: readonly string[];
  /** Red border: a clicked taken minor (live map) or the host lock editor's
      active group. */
  lockedTags: readonly string[];
  /** Nations other players on the same game's map have selected (live). */
  othersTags?: readonly string[];
}

/** Pane z-order: hover sits under the reservation borders so they stay crisp. */
const PANE_Z: Record<HighlightKind, number> = {
  hover: 405,
  taken: 408,
  locked: 410,
  self: 420,
  coop: 430,
  others: 435,
  pending: 440,
};
const KINDS = Object.keys(PANE_Z) as HighlightKind[];

function paneName(kind: HighlightKind): string {
  return `nation-${kind}`;
}

/**
 * Neon palette. `core` is the bright thin line, `glow` the soft halo, `tint`
 * a faint wash over the nation. Locked darkens (unavailable); self/coop
 * brighten (yours / shared).
 */
const PALETTE = {
  taken: { wash: "#232a35", edge: "#9aa4b2" },
  locked: { core: "#ff5266", glow: "#ff2442", dim: "#240208" },
  self: { core: "#62ffa8", glow: "#19f57a", tint: "#8affc0" },
  coop: { core: "#3cc4ff", glow: "#1f6bff", tint: "#7fd0ff", accent: "#f2fbff" },
  pending: {
    track: "#ffd60a",
    glow: "#ffb000",
    body: "#ffe14d",
    head: "#fffbe6",
  },
} as const;

/**
 * Snake dash pattern period in px (dash + gap). Must match the hardcoded
 * 240px `to` value in globals.css `@keyframes nationSnakeChase` so the
 * marching loop is seamless.
 */
export const SNAKE_PERIOD = 240;
const SNAKE_CLASS = "nation-snake";

const PANE_ACTIVE_CLASS = "nation-pane-active";
/** Debounce after the last map movement before new hover is allowed again. */
const MOTION_SETTLE_MS = 140;
/**
 * Hover "breathing": the hover pane's opacity swings full → dim → full.
 * Driven by the Web Animations API (not a stylesheet rule) so it always runs:
 * no dependence on CSS rebuilds, and it is an in-place fade, so it also runs
 * under prefers-reduced-motion. Pane opacity is compositor-only (no repaint).
 */
const HOVER_BREATH_KEYFRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }];
const HOVER_BREATH_MS = 1600;
/**
 * The hover glow lingers this long after the cursor leaves, so sweeping across
 * a border swaps A→B at full opacity instead of dipping through darkness.
 */
const HOVER_LINGER_MS = 130;
const HOVER_FADE_MS = 240;
/** Other players' selections breathe slower and shallower than hover. */
const OTHERS_BREATH_KEYFRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }];
const OTHERS_BREATH_MS = 2200;

// --- stroke layers ---------------------------------------------------------

/** One painted layer of a highlight (a fill, a stroke, or both). */
interface LayerSpec {
  className?: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  /** Stroke width in px (pixel-locked; does not change with zoom). */
  width?: number;
  dash?: readonly [number, number];
  /** Vertical offset in px (the hover shadow), pixel-locked. */
  offsetY?: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function setOrRemove(
  element: Element,
  name: string,
  value: string | null,
): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function applySpec(element: SVGPathElement, spec: LayerSpec): void {
  setOrRemove(element, "class", spec.className ?? null);
  element.setAttribute("pointer-events", "none");
  element.setAttribute("fill", spec.fill ?? "none");
  setOrRemove(
    element,
    "fill-opacity",
    spec.fill ? String(spec.fillOpacity ?? 1) : null,
  );
  // Leaflet polygons use evenodd so lakes/enclaves stay holes.
  setOrRemove(element, "fill-rule", spec.fill ? "evenodd" : null);
  element.setAttribute("stroke", spec.stroke ?? "none");
  setOrRemove(
    element,
    "stroke-opacity",
    spec.stroke ? String(spec.strokeOpacity ?? 1) : null,
  );
  setOrRemove(element, "stroke-linejoin", spec.stroke ? "round" : null);
  setOrRemove(element, "stroke-linecap", spec.stroke ? "round" : null);
  // Pixel-locked stroke width: constant regardless of zoom level.
  setOrRemove(
    element,
    "stroke-width",
    spec.stroke && spec.width !== undefined ? String(spec.width) : null,
  );
  setOrRemove(
    element,
    "stroke-dasharray",
    spec.dash ? `${spec.dash[0]} ${spec.dash[1]}` : null,
  );
  // Constant vertical offset (hover shadow), not zoom-scaled.
  element.style.transform = spec.offsetY
    ? `translate(0px, ${spec.offsetY}px)`
    : "";
}

/**
 * A stack of stroke/fill layers that mirrors the rendered geometry of a set of
 * base-layer paths. It never projects anything itself.
 */
class MirrorOverlay {
  private readonly elements: SVGPathElement[] = [];
  private sources: readonly SVGPathElement[] = [];
  private lastD: string | null = null;

  constructor(private readonly group: SVGGElement) {}

  /** Replace the layer stack (in place when the layer count is unchanged). */
  setRecipe(specs: readonly LayerSpec[]): void {
    while (this.elements.length < specs.length) {
      const element = document.createElementNS(SVG_NS, "path");
      this.group.appendChild(element);
      this.elements.push(element);
      this.lastD = null; // new elements start without geometry
    }
    while (this.elements.length > specs.length) {
      this.elements.pop()?.remove();
    }
    specs.forEach((spec, index) => applySpec(this.elements[index], spec));
  }

  setSources(sources: readonly SVGPathElement[]): void {
    this.sources = sources;
  }

  hasSources(): boolean {
    return this.sources.length > 0;
  }

  /** Re-read the mirrored `d`. Stroke widths are static (see applySpec). */
  sync(): void {
    if (this.elements.length === 0) return;
    let d = "";
    for (const source of this.sources) {
      const part = source.getAttribute("d");
      // "M0 0" is Leaflet's sentinel for "nothing visible in this view": a
      // stroked zero-length subpath would draw a stray dot.
      if (part && part !== "M0 0") d += part;
    }
    if (d !== this.lastD) {
      for (const element of this.elements) element.setAttribute("d", d);
      this.lastD = d;
    }
  }
}

// --- recipes (bottom → top) ------------------------------------------------

/** Static grey wash: the nation reads as taken/disabled without any border
    noise. No animation, so 100 taken nations cost nothing per frame. */
const TAKEN_RECIPE: readonly LayerSpec[] = [
  {
    fill: PALETTE.taken.wash,
    fillOpacity: 0.7,
    stroke: PALETTE.taken.edge,
    strokeOpacity: 0.22,
    width: 0.8,
  },
];

const LOCKED_RECIPE: readonly LayerSpec[] = [
  {
    fill: PALETTE.locked.dim,
    fillOpacity: 0.32,
    stroke: PALETTE.locked.glow,
    strokeOpacity: 0.3,
    width: 8,
  },
  { stroke: PALETTE.locked.core, strokeOpacity: 1, width: 1.9 },
];

const SELF_RECIPE: readonly LayerSpec[] = [
  {
    fill: PALETTE.self.tint,
    fillOpacity: 0.14,
    stroke: PALETTE.self.glow,
    strokeOpacity: 0.34,
    width: 9,
  },
  { stroke: PALETTE.self.core, strokeOpacity: 1, width: 2.1 },
];

const COOP_RECIPE: readonly LayerSpec[] = [
  {
    fill: PALETTE.coop.tint,
    fillOpacity: 0.14,
    stroke: PALETTE.coop.glow,
    strokeOpacity: 0.36,
    width: 9,
  },
  { stroke: PALETTE.coop.core, strokeOpacity: 1, width: 2.3 },
  // Beaded white rail along the core: the "shared border" Co-Op cue.
  {
    stroke: PALETTE.coop.accent,
    strokeOpacity: 0.95,
    width: 1,
    dash: [1.2, 5.8],
  },
];

/** Other players' live selections: the pending yellow, but a still, dashed
    border and a faint wash — never the snake (no per-frame dash animation,
    however many players are clicking around). The pane breathes instead. */
const OTHERS_RECIPE: readonly LayerSpec[] = [
  {
    fill: PALETTE.pending.body,
    fillOpacity: 0.1,
    stroke: PALETTE.pending.glow,
    strokeOpacity: 0.3,
    width: 8,
  },
  { stroke: PALETTE.pending.track, strokeOpacity: 0.95, width: 1.8, dash: [7, 5] },
];

const PENDING_RECIPE: readonly LayerSpec[] = (() => {
  const dash = (length: number) => [length, SNAKE_PERIOD - length] as const;
  return [
    // Faint full outline so the pending nation is readable between snakes.
    { stroke: PALETTE.pending.track, strokeOpacity: 0.34, width: 2 },
    // Three dashed layers share one pattern period and one leading edge; the
    // longer, fainter layers trail behind the short bright head — a tapered,
    // glowing comet without any filter.
    {
      className: SNAKE_CLASS,
      stroke: PALETTE.pending.glow,
      strokeOpacity: 0.28,
      width: 9,
      dash: dash(150),
    },
    {
      className: SNAKE_CLASS,
      stroke: PALETTE.pending.body,
      strokeOpacity: 0.92,
      width: 3.2,
      dash: dash(84),
    },
    {
      className: SNAKE_CLASS,
      stroke: PALETTE.pending.head,
      strokeOpacity: 1,
      width: 1.7,
      dash: dash(30),
    },
  ];
})();

function hoverRecipe(baseColor: string): readonly LayerSpec[] {
  const glow = lighten(baseColor, 0.4);
  const lift = lighten(baseColor, 0.18);
  const rim = lighten(baseColor, 0.8);
  return [
    // Raised-tile shadow: two offset, stroke-only rims (no blur, no filter).
    // Stroke-only on purpose — a filled shadow would dim the nation itself.
    { stroke: "#000000", strokeOpacity: 0.1, width: 13, offsetY: 4 },
    { stroke: "#000000", strokeOpacity: 0.18, width: 7, offsetY: 3.5 },
    // Brightened copy drawn above neighbors' borders: the "pop".
    { fill: lift, fillOpacity: 0.6 },
    // Nation-colored soft glow, then a light rim.
    { stroke: glow, strokeOpacity: 0.14, width: 10 },
    { stroke: glow, strokeOpacity: 0.3, width: 5 },
    { stroke: rim, strokeOpacity: 0.95, width: 1.3 },
  ];
}

// --- controller ------------------------------------------------------------

interface RendererInternals {
  _rootGroup?: SVGGElement;
}

/**
 * Owns the overlay panes/renderers and keeps the mirrored overlays in sync with
 * the React-derived state and with the base layer's geometry. All three world
 * copies of a nation are mirrored for the persistent states (taken/pending/
 * self/locked/coop); hover mirrors just the copy under the cursor.
 */
export class NationHighlightController {
  private readonly map: L.Map;
  private readonly onMotionChange: ((moving: boolean) => void) | undefined;
  private readonly baseLayers = new Map<string, L.Polygon[]>();
  private readonly baseColors = new Map<string, string>();
  private readonly renderers = new Map<HighlightKind, L.SVG>();
  private readonly overlays = new Map<HighlightKind, MirrorOverlay>();
  private readonly signatures = new Map<HighlightKind, string>();
  private hoverSignature = "";
  private settleTimer: number | null = null;
  private lingerTimer: number | null = null;
  private fadeTimer: number | null = null;
  private hoverBreath: Animation | null = null;
  private othersBreath: Animation | null = null;
  private destroyed = false;

  constructor(
    map: L.Map,
    geoJson: L.GeoJSON,
    onMotionChange?: (moving: boolean) => void,
  ) {
    this.map = map;
    this.onMotionChange = onMotionChange;

    geoJson.eachLayer((layer) => {
      const polygon = layer as L.Polygon & {
        feature?: GeoJSON.Feature<
          GeoJSON.Geometry,
          { tag?: string; color?: string }
        >;
      };
      const tag = polygon.feature?.properties?.tag;
      if (!tag) return;
      const list = this.baseLayers.get(tag) ?? [];
      list.push(polygon);
      this.baseLayers.set(tag, list);
      const color = polygon.feature?.properties?.color;
      if (color && !this.baseColors.has(tag)) this.baseColors.set(tag, color);
    });

    for (const kind of KINDS) {
      const name = paneName(kind);
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(PANE_Z[kind]);
      pane.style.pointerEvents = "none";
      // Same padding as the base renderer, so the mirrored geometry (clipped
      // to the base renderer's padded bounds) is never cut off while panning.
      const renderer = L.svg({ pane: name, padding: 3.0 }) as L.SVG;
      map.addLayer(renderer);
      const group = (renderer as unknown as RendererInternals)._rootGroup;
      if (!group) continue;
      this.renderers.set(kind, renderer);
      const overlay = new MirrorOverlay(group);
      this.overlays.set(kind, overlay);
    }
    this.overlays.get("taken")?.setRecipe(TAKEN_RECIPE);
    this.overlays.get("locked")?.setRecipe(LOCKED_RECIPE);
    this.overlays.get("self")?.setRecipe(SELF_RECIPE);
    this.overlays.get("coop")?.setRecipe(COOP_RECIPE);
    this.overlays.get("others")?.setRecipe(OTHERS_RECIPE);
    this.overlays.get("pending")?.setRecipe(PENDING_RECIPE);

    // Registered after the base renderer's own listeners, so by the time this
    // runs Leaflet has already refreshed every base path's `d` for the view.
    map.on("movestart zoomstart", this.handleMotionStart);
    map.on("moveend", this.handleMoveEnd);
  }

  /** Reconcile the overlays with the latest nation states. */
  apply(state: HighlightState): void {
    if (this.destroyed) return;
    this.syncTags("taken", state.takenTags ?? []);
    this.syncTags("locked", state.lockedTags);
    this.syncTags("self", state.selfTags);
    this.syncTags(
      "coop",
      state.coopTags ?? (state.coopTag ? [state.coopTag] : []),
    );
    this.syncTags("others", state.othersTags ?? []);
    this.syncOthersBreath((state.othersTags ?? []).length > 0);
    this.syncTags("pending", state.pendingTag ? [state.pendingTag] : []);
    this.syncHover(state.hover);
  }

  private syncOthersBreath(active: boolean): void {
    const pane = this.map.getPane(paneName("others"));
    if (!active) {
      this.othersBreath?.cancel();
      this.othersBreath = null;
      return;
    }
    if (pane && !this.othersBreath && typeof pane.animate === "function") {
      this.othersBreath = pane.animate(OTHERS_BREATH_KEYFRAMES, {
        duration: OTHERS_BREATH_MS,
        iterations: Infinity,
        easing: "ease-in-out",
      });
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.map.off("movestart zoomstart", this.handleMotionStart);
    this.map.off("moveend", this.handleMoveEnd);
    for (const timer of [this.settleTimer, this.lingerTimer, this.fadeTimer]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    this.hoverBreath?.cancel();
    this.hoverBreath = null;
    this.othersBreath?.cancel();
    this.othersBreath = null;
    for (const renderer of this.renderers.values()) {
      if (this.map.hasLayer(renderer)) this.map.removeLayer(renderer);
    }
  }

  /** Re-mirror a subset of overlays after Leaflet refreshed the base geometry. */
  private syncOverlays(kinds: readonly HighlightKind[]): void {
    for (const kind of kinds) {
      const overlay = this.overlays.get(kind);
      if (overlay?.hasSources()) overlay.sync();
    }
  }

  /**
   * Every overlay is re-mirrored immediately on `moveend`: the overlay
   * renderers reset their container to the new view in the same tick, so any
   * overlay left on its old `d` (even for the 140ms settle delay) renders at
   * the previous zoom's size — a shrunken/grown ghost copy of the nation.
   * The many-nation "taken" wash costs one string join + one `d` write per
   * gesture end (a few ms), which is cheap next to that glitch.
   */
  private syncImmediate(): void {
    this.syncOverlays(KINDS);
  }

  private readonly handleMotionStart = (): void => {
    if (this.settleTimer !== null) {
      window.clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    // Suppress NEW hover while the map moves so fast sweeps across dense
    // regions don't thrash the highlight. Existing hover keeps breathing —
    // animations no longer pause during pan/zoom.
    this.onMotionChange?.(true);
  };

  /** Re-mirror the lightweight overlays the instant a move finishes. */
  private readonly handleMoveEnd = (): void => {
    // The base layer has just re-projected on this moveend (Leaflet re-projects
    // at moveend, not zoomend), so mirror every overlay NOW — the base path
    // `d` strings are fresh.
    this.syncImmediate();
    // Settle delay: new hover stays suppressed until the gesture has ended.
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      this.onMotionChange?.(false);
    }, MOTION_SETTLE_MS);
  };

  /** Rendered base-path elements of a nation (one per world copy). */
  private pathsOf(tag: string): SVGPathElement[] {
    const paths: SVGPathElement[] = [];
    for (const layer of this.baseLayers.get(tag) ?? []) {
      const element = layer.getElement();
      if (element) paths.push(element as SVGPathElement);
    }
    return paths;
  }

  private syncTags(kind: HighlightKind, tags: readonly string[]): void {
    const overlay = this.overlays.get(kind);
    if (!overlay) return;
    const signature = [...tags].sort().join("|");
    if (this.signatures.get(kind) === signature) return;
    this.signatures.set(kind, signature);
    overlay.setSources(tags.flatMap((tag) => this.pathsOf(tag)));
    overlay.sync();
  }

  private syncHover(hover: HoverTarget | null): void {
    const overlay = this.overlays.get("hover");
    const pane = this.map.getPane(paneName("hover"));
    if (!overlay) return;

    if (hover) {
      if (this.lingerTimer !== null) {
        window.clearTimeout(this.lingerTimer);
        this.lingerTimer = null;
      }
      if (this.fadeTimer !== null) {
        window.clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
      }
      const signature = `${hover.tag}:${L.stamp(hover.layer)}`;
      if (this.hoverSignature !== signature) {
        this.hoverSignature = signature;
        overlay.setRecipe(
          hoverRecipe(this.baseColors.get(hover.tag) ?? "#94a3b8"),
        );
        // Only the copy under the cursor.
        const element = hover.layer.getElement();
        overlay.setSources(element ? [element as SVGPathElement] : []);
        overlay.sync();
      }
      pane?.classList.add(PANE_ACTIVE_CLASS);
      // One continuous breath across nation-to-nation sweeps (no restart).
      if (pane && !this.hoverBreath && typeof pane.animate === "function") {
        this.hoverBreath = pane.animate(HOVER_BREATH_KEYFRAMES, {
          duration: HOVER_BREATH_MS,
          iterations: Infinity,
          easing: "ease-in-out",
        });
      }
      return;
    }

    // Nothing mounted, or a linger/fade-out is already underway.
    if (
      !this.hoverSignature ||
      this.lingerTimer !== null ||
      this.fadeTimer !== null
    ) {
      return;
    }
    this.lingerTimer = window.setTimeout(() => {
      this.lingerTimer = null;
      this.hoverBreath?.cancel();
      this.hoverBreath = null;
      pane?.classList.remove(PANE_ACTIVE_CLASS);
      // Release the mirrored geometry once the fade-out has finished.
      this.fadeTimer = window.setTimeout(() => {
        this.fadeTimer = null;
        this.hoverSignature = "";
        overlay.setSources([]);
        overlay.sync();
      }, HOVER_FADE_MS);
    }, HOVER_LINGER_MS);
  }
}
