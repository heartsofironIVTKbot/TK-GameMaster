// Run from web\:  node --test tests/coopPromote.test.mjs
// When a major's main player leaves, the first co-op becomes main (2026-11-11).
import assert from "node:assert/strict";
import { test } from "node:test";
import { coopPromotions } from "../src/lib/coopPromote.ts";

const taken = (entries) => new Map(Object.entries(entries));

test("main gone: the first co-op becomes main, the second moves up", () => {
  assert.deepEqual(coopPromotions(taken({ Germany_coop: "2", Germany_coop_2: "3", France: "9" }), ["Germany"]), [
    { user_id: "2", from: "Germany_coop", to: "Germany" },
    { user_id: "3", from: "Germany_coop_2", to: "Germany_coop" },
  ]);
});

test("a lone co-op becomes main", () => {
  assert.deepEqual(coopPromotions(taken({ Germany_coop: "2" }), ["Germany"]), [{ user_id: "2", from: "Germany_coop", to: "Germany" }]);
});

test("a nation with no co-op, or another nation's co-op, moves nothing", () => {
  assert.deepEqual(coopPromotions(taken({ Italy_coop: "2" }), ["Germany"]), []);
});

test("a gap closes when the main is still there", () => {
  assert.deepEqual(coopPromotions(taken({ Germany: "1", Germany_coop_2: "3" }), ["Germany"]), [
    { user_id: "3", from: "Germany_coop_2", to: "Germany_coop" },
  ]);
});

test("fillers and co-op keys are never treated as nations", () => {
  assert.deepEqual(coopPromotions(taken({ _FILL_Spare_coop: "2" }), ["_FILL_Spare", "Germany_coop"]), []);
});
