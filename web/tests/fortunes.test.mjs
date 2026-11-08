// Run from web\:  node --test tests/fortunes.test.mjs
// Fortunes of War: the host's on_startup script (docs/casino-integration.md, step 7).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFortunesScript } from "../src/lib/fortunesScript.ts";

const row = (over) => ({
  user_id: "1",
  name: "Otto",
  nation: "Germany",
  tag: "GER",
  priority: 3,
  state: "locked",
  card: "fortunes_of_war_blitzkrieg",
  card_name: "Blitzkrieg",
  redraws_used: 0,
  max_redraws: 2,
  ...over,
});

test("no cards: no script", () => {
  assert.deepEqual(buildFortunesScript([]), { script: null, skipped: [] });
  assert.equal(buildFortunesScript([row({ state: "dealt", card: null })]).script, null);
});

test("locked and pending cards make one line each, sorted by tag", () => {
  const { script, skipped } = buildFortunesScript([
    row({ user_id: "2", name: "Winston", nation: "United Kingdom", tag: "ENG", state: "pending", card: "fortunes_of_war_maritime_heritage" }),
    row(),
  ]);
  assert.equal(
    script,
    "on_startup = {\n    effect = {\n        ENG = { add_ideas = fortunes_of_war_maritime_heritage }\n        GER = { add_ideas = fortunes_of_war_blitzkrieg }\n    }\n}",
  );
  assert.deepEqual(skipped, []);
});

test("the main holder's card wins over a co-op's on the same tag", () => {
  const { script, skipped } = buildFortunesScript([
    row({ user_id: "3", name: "Erwin", priority: 2, card: "fortunes_of_war_no_step_back" }),
    row(),
  ]);
  assert.match(script, /GER = \{ add_ideas = fortunes_of_war_blitzkrieg \}/);
  assert.doesNotMatch(script, /no_step_back/);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0], /Erwin/);
});

test("off the board or no tag: left out, with the reason", () => {
  const { script, skipped } = buildFortunesScript([
    row({ nation: null, tag: null }),
    row({ user_id: "4", name: "Jan", nation: "Atlantis", tag: null }),
  ]);
  assert.equal(script, null);
  assert.equal(skipped.length, 2);
  assert.match(skipped[0], /not on the board/);
  assert.match(skipped[1], /no HOI4 tag/);
});
