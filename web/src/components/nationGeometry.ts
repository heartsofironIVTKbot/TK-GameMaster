/**
 * Pure geometry/color helpers for the nation highlight system (no Leaflet, no
 * DOM — importable from Node for tests).
 */

type Ring = number[][];
type Polygon = Ring[];

/**
 * Shoelace area of a ring of [x, y] points in y-up space:
 * positive = counter-clockwise, negative = clockwise.
 */
export function ringSignedArea(ring: ReadonlyArray<readonly number[]>): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * Re-wind a polygon's rings so a dash pattern travels CLOCKWISE around the
 * nation: exterior rings counter-clockwise (an SVG dash pattern advances
 * against the path direction as stroke-dashoffset grows) and holes clockwise,
 * which keeps the circulation consistent around the nation's land.
 *
 * Fill is unaffected (the map renders with fill-rule: evenodd). Rings already
 * wound correctly are returned as-is (same array reference).
 */
export function orientPolygonForClockwiseTravel(polygon: Polygon): Polygon {
  return polygon.map((ring, index) => {
    const area = ringSignedArea(ring);
    if (area === 0) return ring;
    const isCounterClockwise = area > 0;
    const wantCounterClockwise = index === 0;
    return isCounterClockwise === wantCounterClockwise
      ? ring
      : ring.slice().reverse();
  });
}

type PolygonalGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/**
 * Apply `orientPolygonForClockwiseTravel` to every polygon of a geometry.
 * Done once at load so every rendered path (and every highlight mirrored from
 * it) has a deterministic winding.
 */
export function orientGeometryForClockwiseTravel<G extends PolygonalGeometry>(
  geometry: G,
): G {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: orientPolygonForClockwiseTravel(geometry.coordinates),
    };
  }
  return {
    ...geometry,
    coordinates: geometry.coordinates.map(orientPolygonForClockwiseTravel),
  };
}

// --- color -------------------------------------------------------------------

function hexToHsl(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const channel = (p: number, q: number, t: number) => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = channel(p, q, h + 1 / 3);
    g = channel(p, q, h);
    b = channel(p, q, h - 1 / 3);
  }
  const toHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Lighten toward white by `amount` (0..1), nudging saturation up slightly. */
export function lighten(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const [h, s, l] = hsl;
  return hslToHex(h, Math.min(1, s * 1.08), l + (1 - l) * amount);
}
