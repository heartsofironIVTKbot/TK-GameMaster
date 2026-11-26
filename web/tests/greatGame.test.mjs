// Run from web\:  node --test tests/greatGame.test.mjs
// The Great Game engine (lib/greatGame): a whole night from the drum to the
// lock, the turn order, captains vs organizers, fixes, undo, timeouts, and
// that every random result can be recomputed from the revealed seed.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

// lib/greatGame imports its siblings without ".ts" (Next resolves those).
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      if (specifier.startsWith("./") && !/\\.[a-z]+$/.test(specifier)) {
        try { return await next(specifier + ".ts", context); } catch {}
      }
      return next(specifier, context);
    }`),
);

const { buildState, draftOrder, strengthOrder, membersOf } = await import("../src/lib/greatGame/engine.ts");
const { decide, timeoutAction, colorDistance } = await import("../src/lib/greatGame/decide.ts");
const { commitOf, drawFrom, newSeed } = await import("../src/lib/greatGame/fairness.ts");
const { demoConfig, DEMO_ORGANIZER } = await import("../src/lib/greatGame/demo.ts");
const { checkReceipts } = await import("../src/lib/greatGame/receipts.ts");

function makeEvent() {
  const config = demoConfig();
  const seed = newSeed();
  const log = [];
  let clock = 1_000_000;
  const state = () => buildState("demo", config, log, { commit: commitOf(seed), seed: null }, clock);
  const org = { id: DEMO_ORGANIZER, organizer: true, captainOf: null };
  const captain = (teamId) => ({ id: config.teams.find((t) => t.id === teamId).captain_id, organizer: false, captainOf: teamId });
  const run = (actor, body, { expectError = false, advance = 1000 } = {}) => {
    clock += advance;
    const s = state();
    const nextSeq = (log.at(-1)?.seq ?? 0) + 1;
    const d = decide(s, actor, body, seed, nextSeq);
    if (expectError) {
      assert.equal(d.ok, false, `expected a refusal for ${JSON.stringify(body)}`);
      return d.error;
    }
    assert.equal(d.ok, true, d.error);
    log.push({ ...d.action, seq: nextSeq, at: clock });
    return state();
  };
  return { config, seed, log, state, org, captain, run, tick: (ms) => (clock += ms), now: () => clock };
}

const COLORS = ["#ff7a1a", "#3d7bff", "#efe7d4", "#1fd49a", "#b4ec3f", "#9b5de5", "#00a6a6"];

function playToDraft(e) {
  const { run, org, captain, config } = e;
  config.teams.forEach((t, i) => run(captain(t.id), { kind: "team.set", team: t.id, name: `Team ${String.fromCharCode(65 + i)}`, color: COLORS[i] }));
  config.teams.forEach((t) => run(org, { kind: "team.set", team: t.id, approved: true }));
  assert.equal(e.state().phase_done, true);
  run(org, { kind: "phase.set", phase: "drum" });
  for (let i = 0; i < 7; i++) run(org, { kind: "drum.draw" });
  run(org, { kind: "phase.set", phase: "wheel" });
  // Six spins: the last one also hands the last major to the last team.
  for (let i = 0; i < 6; i++) run(org, { kind: "wheel.spin" });
  assert.equal(e.state().phase_done, true);
  run(org, { kind: "phase.set", phase: "vice" });
  for (let i = 0; i < 7; i++) run(captain(e.state().turn.team), { kind: "vice.draw" });
  run(org, { kind: "phase.set", phase: "recruits" });
  // Thirteen cards: the last one also deals the last recruit to the last slot.
  for (let i = 0; i < 13; i++) run(captain(e.state().turn.team), { kind: "recruit.draw" });
  assert.equal(e.state().phase_done, true);
  run(org, { kind: "phase.set", phase: "bans" });
}

test("a whole night: every slot fills, turns follow the agreed orders", () => {
  const e = makeEvent();
  playToDraft(e);
  let s = e.state();
  assert.deepEqual(new Set(s.teams.map((t) => t.major)), new Set(e.config.majors), "each team gets a different major");
  assert.equal(new Set(s.teams.flatMap((t) => membersOf(t))).size, 28, "28 different people placed");
  assert.ok(s.teams.some((t) => t.vice === "filler:vice7"), "the filler vice-captain is drawn like anyone else");

  // Bans: strongest major first.
  const strong = strengthOrder(s.teams, s.config.majors).map((t) => t.major);
  assert.deepEqual(strong, ["SOV", "USA", "GER", "FRA", "ENG", "JAP", "ITA"]);
  const bans = ["FIN", "MEX", "POL", "SPR", "IRE", "CHI", "GRE"];
  for (const tag of bans) {
    const team = e.state().turn.team;
    assert.equal(s.teams.find((t) => t.id === team).major, strong[bans.indexOf(tag)]);
    s = e.run(e.captain(team), { kind: "ban.set", tag });
  }
  assert.equal(s.phase_done, true);
  e.run(e.org, { kind: "phase.set", phase: "draft" });

  // Draft: Italy first, snake.
  const order = draftOrder(e.state().teams, e.config.majors);
  const majorOf = (id) => e.state().teams.find((t) => t.id === id).major;
  assert.deepEqual(order.slice(0, 7).map((p) => majorOf(p.team)), ["ITA", "JAP", "ENG", "FRA", "GER", "USA", "SOV"]);
  assert.deepEqual(order.slice(7, 9).map((p) => majorOf(p.team)), ["SOV", "USA"]);
  const free = () => e.config.pool.filter((tag) => !e.state().teams.some((t) => t.ban === tag || t.picks.includes(tag)));
  for (let i = 0; i < 21; i++) {
    const team = e.state().turn.team;
    assert.equal(e.state().turn.pick, i + 1);
    e.run(e.captain(team), { kind: "pick.set", tag: free()[0] });
  }
  assert.equal(e.state().phase_done, true);

  // Assignment: captains place their own players, the clock places the rest.
  e.run(e.org, { kind: "phase.set", phase: "assign" });
  const t1 = e.state().teams[0];
  e.run(e.captain(t1.id), { kind: "assign.set", team: t1.id, person: t1.captain, tag: t1.major });
  e.tick(601_000);
  const auto = timeoutAction(e.state(), e.seed, e.log.length + 1, e.now());
  assert.equal(auto?.kind, "assign.auto");
  e.log.push({ ...auto, seq: e.log.length + 1, at: e.now() });
  s = e.state();
  assert.equal(s.phase_done, true);
  assert.equal(s.teams[0].assign[t1.captain], t1.major, "a placement the captain made stays");
  for (const team of s.teams) assert.equal(new Set(Object.values(team.assign)).size, 4, "4 players on 4 different nations");
  e.run(e.org, { kind: "phase.set", phase: "locked" });
  assert.equal(e.state().phase, "locked");
});

test("captains can only act on their own turn; organizers can always, as a logged fix", () => {
  const e = makeEvent();
  playToDraft(e);
  const s = e.state();
  const onClock = s.turn.team;
  const other = s.teams.find((t) => t.id !== onClock).id;
  assert.match(e.run(e.captain(other), { kind: "ban.set", tag: "FIN" }, { expectError: true }), /another team's turn|isn't your turn/);
  assert.match(e.run(e.captain(onClock), { kind: "drum.draw" }, { expectError: true }), /Only organizers/);
  // An organizer bans for a team that isn't on the clock: allowed, marked as a fix.
  e.run(e.org, { kind: "ban.set", team: other, tag: "FIN", reason: "captain asked in voice" });
  const fix = e.log.at(-1);
  assert.equal(fix.override, true);
  assert.equal(fix.reason, "captain asked in voice");
  // The same nation can't be banned twice.
  assert.match(e.run(e.captain(onClock), { kind: "ban.set", tag: "FIN" }, { expectError: true }), /already banned/);
});

test("undo puts a slot back and the turn returns to it", () => {
  const e = makeEvent();
  playToDraft(e);
  const first = e.state().turn.team;
  e.run(e.captain(first), { kind: "ban.set", tag: "FIN" });
  assert.notEqual(e.state().turn.team, first);
  const seq = e.log.at(-1).seq;
  e.run(e.org, { kind: "undo", seq, reason: "misclick" });
  assert.equal(e.state().turn.team, first);
  assert.equal(e.state().teams.find((t) => t.id === first).ban, null);
  assert.match(e.run(e.org, { kind: "undo", seq }, { expectError: true }), /Already undone/);
});

test("pause stops the clock and only organizers act while paused", () => {
  const e = makeEvent();
  playToDraft(e);
  const started = e.state().turn.started_at;
  e.run(e.org, { kind: "pause.set", on: true });
  e.tick(120_000);
  assert.equal(timeoutAction(e.state(), e.seed, 999, e.now()), null, "no timeout while paused");
  assert.match(e.run(e.captain(e.state().turn.team), { kind: "ban.set", tag: "FIN" }, { expectError: true }), /paused/);
  e.run(e.org, { kind: "pause.set", on: false });
  assert.ok(e.state().turn.started_at > started + 100_000, "the clock picks up where it stopped");
});

test("team colours too close to another team's or the map's signal colours are refused", () => {
  const e = makeEvent();
  const t = e.config.teams;
  e.run(e.captain(t[0].id), { kind: "team.set", team: t[0].id, color: "#d62828" });
  assert.match(e.run(e.captain(t[1].id), { kind: "team.set", team: t[1].id, color: "#e03030" }, { expectError: true }), /too close/);
  assert.match(e.run(e.captain(t[1].id), { kind: "team.set", team: t[1].id, color: "#ffd440" }, { expectError: true }), /signals/);
  e.run(e.captain(t[1].id), { kind: "team.set", team: t[1].id, color: "#2a6fdb" });
  assert.ok(colorDistance("#d62828", "#2a6fdb") > 50);
});

test("every random result can be recomputed from the seed once it's revealed", () => {
  const e = makeEvent();
  playToDraft(e);
  const replay = [];
  for (const action of e.log) {
    if (action.kind === "wheel.spin") {
      const before = buildState("demo", e.config, e.log.filter((a) => a.seq < action.seq), { commit: "", seed: null }, 0);
      const taken = new Set(before.teams.map((t) => t.major).filter(Boolean));
      const left = e.config.majors.filter((m) => !taken.has(m));
      replay.push(drawFrom(e.seed, action.seq, "wheel.spin", left) === action.payload.tag);
    }
  }
  // Six spins: the seventh major goes with the sixth spin.
  assert.equal(replay.length, 6);
  assert.ok(replay.every(Boolean), "every wheel spin matches the seed");
  assert.equal(commitOf(e.seed).length, 64);

  // The replay's receipts re-run every draw of the night (drum, reel, tickets, cards) and all match;
  // a changed result is caught, and a wrong seed fails.
  const fairness = { commit: commitOf(e.seed), seed: e.seed };
  const check = checkReceipts("demo", e.config, e.log, fairness);
  assert.equal(check.receipts.length, 7 + 6 + 7 + 13);
  assert.equal(check.mismatches, 0);
  assert.equal(check.commitOk, true);
  const tampered = structuredClone(e.log);
  const spin = tampered.find((a) => a.kind === "wheel.spin");
  spin.payload.tag = e.config.majors.find((m) => m !== spin.payload.tag);
  assert.ok(checkReceipts("demo", e.config, tampered, fairness).mismatches > 0, "a changed result is caught");
  assert.equal(checkReceipts("demo", e.config, e.log, { ...fairness, seed: "0".repeat(64) }).commitOk, false);
});

test("a replacement takes over a player's place everywhere", () => {
  const e = makeEvent();
  playToDraft(e);
  const team = e.state().teams[2];
  const leaving = team.recruits[0];
  e.run(e.org, { kind: "person.set", person: { id: "123456789012345678", name: "Reserve Player", role: "recruit" }, replaces: leaving, reason: "dropped out" });
  const after = e.state().teams[2];
  assert.equal(after.recruits[0], "123456789012345678");
  assert.ok(!e.state().config.people.some((p) => p.id === leaving));
});

test("an organizer who also plays can run the night but can't fix their own team", () => {
  const e = makeEvent();
  playToDraft(e);
  const s = e.state();
  const playerOrg = e.config.people.find((p) => p.organizer && p.role === "recruit");
  const own = s.teams.find((t) => t.recruits.includes(playerOrg.id));
  const other = s.teams.find((t) => t.id !== own.id && t.id !== s.turn.team);
  const actor = { id: playerOrg.id, organizer: true, captainOf: null, teamOf: own.id };
  const nextSeq = () => e.log.length + 1;
  // Fixing their own team, the ranking or the order: refused.
  for (const body of [
    { kind: "ban.set", team: own.id, tag: "FIN", reason: "x" },
    { kind: "config.set", majors: [...e.config.majors].reverse(), reason: "x" },
    { kind: "member.set", team: own.id, slot: "vice", person: "", reason: "x" },
  ]) {
    const d = decide(s, actor, body, e.seed, nextSeq());
    assert.equal(d.ok, false, JSON.stringify(body));
    assert.match(d.error, /another organizer/);
  }
  // Fixing another team, pausing, moving on: allowed.
  assert.equal(decide(s, actor, { kind: "ban.set", team: other.id, tag: "FIN", reason: "x" }, e.seed, nextSeq()).ok, true);
  assert.equal(decide(s, actor, { kind: "pause.set", on: true }, e.seed, nextSeq()).ok, true);
});
