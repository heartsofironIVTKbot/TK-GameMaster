// Run from web\:  node --test tests/returnTo.test.mjs
// Game setup → preset pages → back to the same game (2026-11-11).
import assert from "node:assert/strict";
import { test } from "node:test";
import { backToGame, safeBack, setupAddress, withBack } from "../src/lib/returnTo.ts";

test("only game setup addresses are accepted", () => {
  assert.equal(safeBack("/schedule/new?date=2026-11-12"), "/schedule/new?date=2026-11-12");
  assert.equal(safeBack("/schedule/edit?slot=abc"), "/schedule/edit?slot=abc");
  assert.equal(safeBack("/schedule/new"), "/schedule/new");
  assert.equal(safeBack("https://evil.example/schedule/new"), null);
  assert.equal(safeBack("//evil.example/schedule/new"), null);
  assert.equal(safeBack("/presets"), null);
  assert.equal(safeBack(""), null);
  assert.equal(safeBack(null), null);
});

test("links out of setup carry the way back", () => {
  assert.equal(withBack("/presets/new?mode=Roleplay", "/schedule/new?date=2026-11-12"), "/presets/new?mode=Roleplay&back=%2Fschedule%2Fnew%3Fdate%3D2026-11-12");
  assert.equal(withBack("/presets", null), "/presets");
});

test("going back resumes the game, with the picked preset", () => {
  assert.equal(backToGame("/schedule/new?date=2026-11-12"), "/schedule/new?date=2026-11-12&resume=1");
  assert.equal(backToGame("/schedule/new?date=2026-11-12&preset=old", "a".repeat(32)), `/schedule/new?date=2026-11-12&resume=1&preset=${"a".repeat(32)}`);
  assert.equal(backToGame("/schedule/edit?slot=x"), "/schedule/edit?slot=x&resume=1");
});

test("the setup page's own address drops one-time bits", () => {
  assert.equal(setupAddress("/schedule/new", "?date=2026-11-12&resume=1&preset=abc"), "/schedule/new?date=2026-11-12");
});
