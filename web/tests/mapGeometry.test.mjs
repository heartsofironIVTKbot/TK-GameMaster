// Run from web\:  node --test tests/mapGeometry.test.mjs
// Dropping the points in the middle of straight border runs leaves every
// nation's outline exactly as it was, on every map (2026-11-11).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { dropCollinearPoints, ringSignedArea } from "../src/components/nationGeometry.ts";

const MAPS = path.join(import.meta.dirname, "..", "public", "maps");

function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

const onSegment = (a, b, p) => {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const within =
    p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;
  return Math.abs(cross) < 1e-6 && within;
};

test("a square with points along its sides keeps just its corners", () => {
  const ring = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0]];
  assert.deepEqual(dropCollinearPoints(ring), [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
});

test("a spike that doubles back is kept", () => {
  const ring = [[0, 0], [4, 0], [2, 0], [2, 2], [0, 0]];
  assert.equal(dropCollinearPoints(ring).length, ring.length);
});

test("tiny rings are left alone", () => {
  const ring = [[0, 0], [1, 0], [0, 1], [0, 0]];
  assert.equal(dropCollinearPoints(ring), ring);
});

for (const file of fs.readdirSync(MAPS).filter((name) => name.endsWith(".geojson"))) {
  test(`${file}: every outline is unchanged, with far fewer points`, () => {
    const collection = JSON.parse(fs.readFileSync(path.join(MAPS, file), "utf8"));
    let before = 0;
    let after = 0;
    for (const feature of collection.features) {
      for (const ring of ringsOf(feature.geometry)) {
        const kept = dropCollinearPoints(ring);
        before += ring.length;
        after += kept.length;
        // Same enclosed area.
        const a = ringSignedArea(ring);
        assert.ok(Math.abs(ringSignedArea(kept) - a) <= 1e-6 * Math.max(1, Math.abs(a)), `${feature.properties?.tag}: area changed`);
        // Walking the original ring, every dropped point lies on the kept edge it was part of.
        const keys = new Set(kept.map((p) => `${p[0]},${p[1]}`));
        const open = ring.slice(0, -1);
        const start = open.findIndex((p) => keys.has(`${p[0]},${p[1]}`));
        assert.ok(start >= 0);
        let corner = open[start];
        const between = [];
        for (let step = 1; step <= open.length; step += 1) {
          const point = open[(start + step) % open.length];
          if (keys.has(`${point[0]},${point[1]}`)) {
            for (const dropped of between) assert.ok(onSegment(corner, point, dropped), `${feature.properties?.tag}: a dropped point was off the edge`);
            between.length = 0;
            corner = point;
          } else {
            between.push(point);
          }
        }
      }
    }
    assert.ok(after < before * 0.8, `only ${before - after} of ${before} points dropped`);
  });
}
