import L from "leaflet";

/**
 * Smooth arrow-key panning for the Leaflet maps.
 *
 * Leaflet pans a fixed 80 px per key press with its own short animation, and
 * a held key repeats ~30 times a second, restarting that animation each time:
 * the map jerked along. Here a held arrow glides the map at a steady speed
 * (eased in and out, diagonals with two keys, Shift for faster), moved the
 * way a mouse drag moves it: the drawn map is only shifted each frame, and
 * the redraw-ahead of a long drag (nationHighlights.ts) covers long holds.
 * The map redraws once when the keys are let go. + / - zoom stay Leaflet's.
 */

type MapInternals = L.Map & {
  _rawPanBy(offset: L.Point): void;
  _stop(): void;
  _limitOffset(offset: L.Point, bounds?: L.LatLngBounds): L.Point;
  _panAnim?: { _inProgress?: boolean };
  keyboard: L.Handler & { _focused?: boolean };
};

/** Pixels per second at full speed (Shift: faster). */
const SPEED = 900;
const SPEED_SHIFT = 2200;
/** How quickly the speed eases in / out (time constant). */
const EASE_MS = 90;

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function attachSmoothKeyboardPan(map: L.Map): () => void {
  const m = map as MapInternals;
  const pressed = new Set<string>();
  let shift = false;
  let vx = 0;
  let vy = 0;
  let frame = 0;
  let lastTime = 0;
  let moving = false;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    vx = 0;
    vy = 0;
    if (!moving) return;
    moving = false;
    // Back onto the centre world copy (the map has one copy either side).
    const center = map.getCenter();
    const wrapped = map.wrapLatLng(center);
    if (wrapped.lng !== center.lng) map.setView(wrapped, map.getZoom(), { animate: false });
    map.fire("moveend");
  };

  const step = (now: number) => {
    frame = 0;
    const dt = Math.min(64, Math.max(1, now - (lastTime || now - 16)));
    lastTime = now;
    let dx = 0;
    let dy = 0;
    for (const key of pressed) {
      dx += DIRECTIONS[key][0];
      dy += DIRECTIONS[key][1];
    }
    const length = Math.hypot(dx, dy);
    const speed = shift ? SPEED_SHIFT : SPEED;
    const tx = length ? (dx / length) * speed : 0;
    const ty = length ? (dy / length) * speed : 0;
    const ease = 1 - Math.exp(-dt / EASE_MS);
    vx += (tx - vx) * ease;
    vy += (ty - vy) * ease;
    if (!length && Math.hypot(vx, vy) < 20) {
      stop();
      return;
    }
    let offset = L.point((vx * dt) / 1000, (vy * dt) / 1000);
    if (map.options.maxBounds) offset = m._limitOffset(offset, map.options.maxBounds as L.LatLngBounds);
    if (offset.x || offset.y) {
      m._rawPanBy(offset);
      map.fire("move");
    }
    frame = requestAnimationFrame(step);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.key in DIRECTIONS) || event.altKey || event.ctrlKey || event.metaKey) return;
    // Only while the map has the keyboard (Leaflet's own rule): typing in a box is left alone.
    if (!m.keyboard?._focused) return;
    // Leaflet's step pan (on document, bubbling) never sees it.
    event.preventDefault();
    event.stopPropagation();
    shift = event.shiftKey;
    pressed.add(event.key);
    if (!moving) {
      if (m._panAnim?._inProgress) m._stop();
      moving = true;
      lastTime = 0;
      map.fire("movestart");
    }
    if (!frame) frame = requestAnimationFrame(step);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!(event.key in DIRECTIONS)) {
      if (event.key === "Shift") shift = false;
      return;
    }
    pressed.delete(event.key);
  };

  // Lost focus or the tab hidden: a key-up would never come.
  const release = () => pressed.clear();

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", release);
  map.on("blur", release);
  map.on("dragstart", release);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", release);
    map.off("blur", release);
    map.off("dragstart", release);
    pressed.clear();
    try {
      stop();
    } catch {
      // The map is already being torn down.
    }
  };
}
