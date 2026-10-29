// Run from web\:  node --test tests/ironlegion.test.mjs
// Require IronLegion: a game's own switch over the server's, the stored values
// and the verify link (docs/server-setup.md, "Require IronLegion").
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ironLegionRequired,
  ironLegionRule,
  ironLegionValue,
  ironLegionVerifyUrl,
  parseRequireIronLegion,
} from "../src/lib/ironlegion.ts";

test("a game's own switch wins over the server's", () => {
  assert.equal(ironLegionRequired(true, false), true);
  assert.equal(ironLegionRequired(false, true), false);
});

test("no switch on the game follows the server", () => {
  assert.equal(ironLegionRequired(null, true), true);
  assert.equal(ironLegionRequired(undefined, false), false);
});

test("stored values: only booleans count, anything else is the server's setting", () => {
  assert.equal(parseRequireIronLegion(true), true);
  assert.equal(parseRequireIronLegion(false), false);
  for (const raw of [null, undefined, "true", 1, 0, {}]) assert.equal(parseRequireIronLegion(raw), null);
});

test("the three choices round-trip", () => {
  for (const value of [true, false, null]) assert.equal(ironLegionValue(ironLegionRule(value)), value);
  assert.equal(ironLegionRule(undefined), "server");
});

test("the link to IronLegion's channel, or none without one", () => {
  assert.equal(ironLegionVerifyUrl("111", "222"), "https://discord.com/channels/111/222");
  assert.equal(ironLegionVerifyUrl("111", null), null);
  assert.equal(ironLegionVerifyUrl("111", undefined), null);
});
