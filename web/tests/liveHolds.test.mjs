// Run from web\:  node --test tests/liveHolds.test.mjs
// The map's 30-second nation holds (lib/live/hub.ts): hopping to another
// nation and back must not restart the clock (2026-11-12: a player kept a
// nation forever that way). The hub's one database import is stubbed.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const stub = `export const invalidateLobby = () => {};
export const lobbyVersion = async () => "v1";
export const lobbySnapshot = async () => ({ reservations: [] });`;
register(
  `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === "@/lib/lobbySnapshot") return { url: "data:text/javascript,${encodeURIComponent(stub)}", shortCircuit: true };
  return next(specifier, context);
}`)}`,
);
const { LiveHub, HOLD_MS, HOLD_COOLDOWN_MS } = await import("../src/lib/live/hub.ts");

const GAME = "900000000000000001";
let now = 1_000_000;
Date.now = () => now;

function hubWith(...users) {
  const hub = new LiveHub();
  for (const user of users) {
    hub.subscribe(GAME, { id: hub.newClientId(), userId: user, send: () => true, close: () => {} }, "v1");
  }
  return hub;
}
const pick = (hub, user, tag) => hub.select(GAME, { user_id: user, name: user, tag });

test("a pick holds the nation for 30 s", () => {
  const hub = hubWith("ivan");
  assert.deepEqual(pick(hub, "ivan", "GER"), { status: "holding", ends_in_ms: HOLD_MS });
  assert.equal(hub.holderOf(GAME, "GER")?.user_id, "ivan");
});

test("hopping away and back carries on the same 30 s", () => {
  const hub = hubWith("ivan", "otto");
  pick(hub, "ivan", "GER");
  now += 20_000;
  pick(hub, "ivan", "ITA");
  assert.equal(hub.holderOf(GAME, "GER"), null, "the nation is free while they're away");
  now += 1_000;
  const back = pick(hub, "ivan", "GER");
  assert.equal(back.status, "holding");
  assert.equal(back.ends_in_ms, HOLD_MS - 21_000, "not a fresh 30 s");
});

test("back after the 30 s ran out: the usual wait, others get their turn", () => {
  const hub = hubWith("ivan", "otto");
  pick(hub, "ivan", "GER");
  now += 29_000;
  pick(hub, "ivan", "ITA");
  now += 2_000;
  const back = pick(hub, "ivan", "GER");
  assert.equal(back.status, "cooldown");
  assert.ok(back.ends_in_ms > 0 && back.ends_in_ms <= HOLD_COOLDOWN_MS);
  assert.equal(pick(hub, "otto", "GER").status, "holding", "someone else can take it meanwhile");
});

test("after the wait, a new 30 s", () => {
  const hub = hubWith("ivan");
  pick(hub, "ivan", "GER");
  now += 10_000;
  pick(hub, "ivan", null);
  now += 20_000 + HOLD_COOLDOWN_MS + 1;
  assert.deepEqual(pick(hub, "ivan", "GER"), { status: "holding", ends_in_ms: HOLD_MS });
});

test("someone else's hold can't be taken", () => {
  const hub = hubWith("ivan", "otto");
  pick(hub, "ivan", "GER");
  now += 5_000;
  const answer = pick(hub, "otto", "GER");
  assert.equal(answer.status, "held");
  assert.equal(answer.name, "ivan");
});
