import L from "leaflet";

/**
 * Smooth, stepless mouse-wheel / trackpad zoom for the Leaflet maps.
 *
 * Leaflet's own wheel zoom turns each wheel notch into a separate animated
 * zoom and re-projects every nation at the end of each one, so zooming felt
 * like "levels". Here the wheel only moves a target zoom; every animation frame
 * the view glides toward it, keeping the point under the cursor fixed.
 *
 * Performance: each frame is a plain `_move` (the same path Leaflet's pinch
 * zoom uses), so the drawn map is only scaled with a CSS transform. Nations
 * are re-projected once when the glide ends, and once more mid-glide only if
 * zooming out would show past the drawn area.
 */

type MapInternals = L.Map & {
  _move(center: L.LatLng, zoom: number): L.Map;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): L.Map;
  _moveEnd(zoomChanged: boolean): L.Map;
  _stop(): void;
  _limitCenter(center: L.LatLng, zoom: number, bounds?: L.LatLngBounds): L.LatLng;
  _animatingZoom?: boolean;
};

/** Zoom levels per wheel pixel: a mouse notch (~100 px) is about a quarter of a level. */
const ZOOM_PER_PX = 0.0025;
/** Trackpad pinch arrives as ctrl+wheel with small deltas: make it livelier. */
const ZOOM_PER_PX_PINCH = 0.008;
/** One event can't jump further than this (fast-spinning wheels, page mode). */
const MAX_EVENT_PX = 200;
/** Glide time constant: about 95% of the way after 3× this. */
const GLIDE_MS = 120;
/** Close enough to the target to stop. */
const DONE_EPSILON = 0.001;
/**
 * The drawn area is one screen past each edge (DRAW_PADDING = 1), so zooming
 * out more than log2(3) ≈ 1.58 levels would show undrawn space. Redraw before.
 */
const MAX_UNDRAWN_ZOOM_OUT = 1.2;

export function attachSmoothWheelZoom(map: L.Map): () => void {
  const m = map as MapInternals;
  const container = map.getContainer();

  let target: number | null = null;
  let frame = 0;
  let lastTime = 0;
  let anchorPoint = L.point(0, 0);
  let anchorLatLng = L.latLng(0, 0);
  let drawnZoom = 0;

  // Leaflet scales the drawn map with a 3D transform, which the browser
  // treats as a picture: stretched while zooming in, it went soft until the
  // glide ended. The same move as a 2D transform keeps the outlines vector,
  // redrawn sharp each frame.
  const sharpen = () => {
    for (const svg of container.querySelectorAll<SVGElement>("svg.leaflet-zoom-animated")) {
      const value = svg.style.transform;
      if (value.startsWith("translate3d(")) {
        svg.style.transform = value.replace(/translate3d\(([^,]+),\s*([^,]+),\s*[^)]+\)/, "translate($1, $2)");
      }
    }
  };

  const finish = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (target === null) return;
    target = null;
    m._moveEnd(true);
  };

  const step = (now: number) => {
    frame = 0;
    if (target === null) return;
    const dt = Math.min(64, Math.max(1, now - (lastTime || now - 16)));
    lastTime = now;
    const zoom = map.getZoom();
    const diff = target - zoom;
    const next = Math.abs(diff) < DONE_EPSILON ? target : zoom + diff * (1 - Math.exp(-dt / GLIDE_MS));

    // Keep the point under the cursor fixed (exact, so it never drifts).
    const viewHalf = map.getSize().divideBy(2);
    const centerPoint = map.project(anchorLatLng, next).subtract(anchorPoint.subtract(viewHalf));
    const center = m._limitCenter(map.unproject(centerPoint, next), next, map.options.maxBounds as L.LatLngBounds | undefined);
    m._move(center, next);
    sharpen();

    if (next === target) {
      finish();
      return;
    }
    // Zoomed far out since the last redraw: settle once so no edge shows blank.
    if (drawnZoom - next > MAX_UNDRAWN_ZOOM_OUT) {
      m._moveEnd(true);
      m._moveStart(true, false);
      drawnZoom = next;
    }
    frame = requestAnimationFrame(step);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const dragging = map.dragging as L.Handler & { _draggable?: { _moving?: boolean } };
    if (m._animatingZoom || dragging?._draggable?._moving) return;

    let px = event.deltaY;
    if (event.deltaMode === 1) px *= 20;
    else if (event.deltaMode === 2) px *= 400;
    if (!px) return;
    px = Math.max(-MAX_EVENT_PX, Math.min(MAX_EVENT_PX, px));
    const rate = event.ctrlKey ? ZOOM_PER_PX_PINCH : ZOOM_PER_PX;

    const current = map.getZoom();
    const base = target ?? current;
    const nextTarget = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), base - px * rate));

    anchorPoint = map.mouseEventToContainerPoint(event as unknown as MouseEvent);
    anchorLatLng = map.containerPointToLatLng(anchorPoint);

    if (target === null) {
      if (Math.abs(nextTarget - current) < DONE_EPSILON) return;
      m._stop();
      m._moveStart(true, false);
      drawnZoom = current;
      lastTime = 0;
    }
    target = nextTarget;
    if (!frame) frame = requestAnimationFrame(step);
  };

  // A drag that starts mid-glide takes over from the glide.
  const onDragStart = () => finish();

  map.scrollWheelZoom.disable();
  container.addEventListener("wheel", onWheel, { passive: false });
  map.on("dragstart", onDragStart);
  return () => {
    container.removeEventListener("wheel", onWheel);
    map.off("dragstart", onDragStart);
    try {
      finish();
    } catch {
      // The map is already being torn down: nothing left to settle.
    }
  };
}
