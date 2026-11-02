// Run from web\:  node --test tests/roleplay.test.mjs
// The public roleplay archive (docs/ai-log-analysis.md): reading log lines,
// out-of-character chat, and that the website and the bot agree on it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { OOC_WORDS, isOocText, parseLogLine, searchTerms, verdictOf, verdictRank } from "../src/lib/rpArchiveTypes.ts";

test("a log line: tag, in-game name and text", () => {
  assert.deepEqual(parseLogLine("GERWilhelm: The Reich marches west."), {
    tag: "GER",
    speaker: "Wilhelm",
    text: "The Reich marches west.",
    ooc: false,
  });
  const wrapped = parseLogLine("[12:01] (SOVNikolai): Comrades, rise!");
  assert.equal(wrapped.tag, "SOV");
  assert.equal(wrapped.text, "Comrades, rise!");
});

test("system lines and joins aren't anyone's roleplay", () => {
  assert.equal(parseLogLine("Game saved").tag, null);
  assert.equal(parseLogLine("GERWilhelm: joined").ooc, true);
  assert.equal(parseLogLine("===== CHAT LOG FILE 2 of 3: b.txt =====").ooc, true);
});

test("out-of-character chat is marked", () => {
  for (const text of ["unpause", "lag?", "gg wp", "((brb))", "ooc: who has the save", "p"]) assert.ok(isOocText(text), text);
  for (const text of ["Our troops march on Paris.", "Save the King!", "No."]) assert.ok(!isOocText(text), text);
});

test("the website's out-of-character words are the bot's", () => {
  const bot = readFileSync(path.join(import.meta.dirname, "..", "..", "GameMaster Bot", "bot.py.py"), "utf8");
  const block = bot.match(/_OOC_WORDS = frozenset\("""([\s\S]*?)"""/);
  assert.ok(block, "bot.py.py has _OOC_WORDS");
  const botWords = new Set(block[1].split(/\s+/).filter(Boolean));
  assert.deepEqual([...OOC_WORDS].sort(), [...botWords].sort());
});

test("verdicts, best first", () => {
  const two = verdictOf({ commends: 2, merit: 0 }, "rewarded");
  const merit = verdictOf({ commends: 0, merit: 4 }, "rewarded");
  const none = verdictOf({ commends: 0, merit: 0 }, "toxic");
  const noRp = verdictOf({ commends: 0, merit: 0 }, "no_rp");
  assert.equal(two.label, "⭐ 2 commends");
  assert.equal(none.label, "No reward", "conduct is never named publicly");
  assert.ok(verdictRank(two) > verdictRank(merit) && verdictRank(merit) > verdictRank(none) && verdictRank(none) > verdictRank(noRp));
});

test("search words", () => {
  assert.deepEqual(searchTerms("  Wilhelm   GERMANY "), ["wilhelm", "germany"]);
  assert.deepEqual(searchTerms(""), []);
});
