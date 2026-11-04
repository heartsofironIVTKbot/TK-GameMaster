// Run from web\:  node --test tests/tutorial.test.mjs
// Guided tours (docs/tutorial.md): saving and merging progress, and that every
// control a tour points at is really marked on a page.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { cleanProgress, hasSeen, mergeProgress, sameProgress } from "../src/components/tutorial/progress.ts";
import { TOURS, TOUR_IDS, TOURS_BY_ID } from "../src/components/tutorial/tours.ts";

const done = (version = 1, at = 100) => ({ status: "done", version, at });

test("cleaning keeps known tours with good records only", () => {
  const clean = cleanProgress(
    {
      autoStart: false,
      tours: {
        "map-player": done(),
        calendar: { status: "skipped", version: 2, at: 5 },
        "no-such-tour": done(),
        games: { status: "maybe", version: 1, at: 1 },
        presets: { status: "done", version: 0, at: 1 },
      },
    },
    TOUR_IDS,
  );
  assert.equal(clean.autoStart, false);
  assert.deepEqual(Object.keys(clean.tours).sort(), ["calendar", "map-player"]);
});

test("anything that isn't progress becomes empty progress, tours on", () => {
  for (const raw of [null, undefined, "x", 7, [], { tours: "x" }]) {
    const clean = cleanProgress(raw, TOUR_IDS);
    assert.equal(clean.autoStart, true);
    assert.deepEqual(clean.tours, {});
  }
});

test("merging: a tour seen in either copy counts; the account's switch wins", () => {
  const account = { autoStart: false, tours: { "map-player": done(1, 10) } };
  const local = { autoStart: true, tours: { calendar: done(1, 20), "map-player": done(1, 5) } };
  const merged = mergeProgress(account, local);
  assert.equal(merged.autoStart, false);
  assert.deepEqual(Object.keys(merged.tours).sort(), ["calendar", "map-player"]);
  assert.equal(merged.tours["map-player"].at, 10);
});

test("merging: the newer version of a tour wins", () => {
  const merged = mergeProgress({ autoStart: true, tours: { games: done(1, 50) } }, { autoStart: true, tours: { games: done(2, 1) } });
  assert.equal(merged.tours.games.version, 2);
});

test("same progress ignores when it was saved", () => {
  assert.ok(sameProgress({ autoStart: true, tours: { games: done(1, 1) } }, { autoStart: true, tours: { games: done(1, 99) } }));
  assert.ok(!sameProgress({ autoStart: true, tours: {} }, { autoStart: false, tours: {} }));
});

test("raising a tour's version shows it again", () => {
  const tour = TOURS_BY_ID.get("games");
  assert.ok(hasSeen({ autoStart: true, tours: { games: done(tour.version) } }, tour));
  assert.ok(!hasSeen({ autoStart: true, tours: { games: done(tour.version - 1 || 0) } }, { ...tour, version: tour.version + 1 }));
});

test("tours are well formed", () => {
  assert.equal(TOUR_IDS.size, TOURS.length, "tour ids are unique");
  for (const tour of TOURS) {
    assert.ok(tour.steps.length > 0, `${tour.id} has steps`);
    assert.ok(tour.paths.length > 0 && tour.paths.every((p) => p.startsWith("/") && (!p.includes("*") || p.endsWith("/*"))), `${tour.id} paths`);
    for (const id of tour.after ?? []) assert.ok(TOUR_IDS.has(id), `${tour.id} waits for unknown tour ${id}`);
    if (tour.next) {
      const next = TOURS_BY_ID.get(tour.next.tour);
      assert.ok(next, `${tour.id} chains to unknown tour ${tour.next.tour}`);
      assert.ok(next.paths.includes(tour.next.href), `${tour.id} chains to a page ${tour.next.tour} doesn't run on`);
    }
    for (const step of tour.steps) {
      assert.ok(step.title.trim() && step.body.trim(), `${tour.id}: a step has no text`);
      // IronLegion is "authenticate"; "Verified" is GameMaster's own role (same sentence = about IronLegion).
      assert.ok(!/IronLegion[^.]{0,60}\bverif|\bverif\w*[^.]{0,60}IronLegion/i.test(step.body), `${tour.id}: IronLegion says authenticate`);
    }
  }
});

/** Every data-tour name written in the site's components and pages. */
function markedNames() {
  const names = new Set(["help.button"]);
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) {
        const source = readFileSync(full, "utf8");
        for (const match of source.matchAll(/data-tour="([^"]+)"/g)) for (const name of match[1].split(/\s+/)) names.add(name);
        for (const match of source.matchAll(/data-tour=\{`([^`]+)`\}/g)) {
          for (const name of match[1].split(/\s+/)) {
            if (name === "setup.tab.${entry.id}") {
              for (const tab of ["game", "announce", "players", "extras", "review"]) names.add(`setup.tab.${tab}`);
            } else names.add(name);
          }
        }
      }
    }
  };
  walk(path.join(import.meta.dirname, "..", "src"));
  return names;
}

test("every control a tour points at is marked on a page", () => {
  const names = markedNames();
  for (const tour of TOURS) {
    const used = [tour.anchor, ...tour.steps.map((step) => step.target)].filter(Boolean);
    for (const step of tour.steps) {
      const wait = step.waitFor;
      if (wait && "selector" in wait) used.push(...[...wait.selector.matchAll(/data-tour~="([^"]+)"/g)].map((m) => m[1]));
    }
    for (const name of used) assert.ok(names.has(name), `${tour.id} points at "${name}", which no page marks`);
  }
});
