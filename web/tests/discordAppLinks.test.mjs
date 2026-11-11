// Run from web\:  node --test tests/discordAppLinks.test.mjs
// discord.com message / channel links open the Discord app (2026-11-11).
import assert from "node:assert/strict";
import { test } from "node:test";
import { discordAppHref } from "../src/lib/discordLinks.ts";

test("message and channel links become app links", () => {
  assert.equal(discordAppHref("https://discord.com/channels/1/2/3"), "discord://-/channels/1/2/3");
  assert.equal(discordAppHref("https://discord.com/channels/1/2"), "discord://-/channels/1/2");
  assert.equal(discordAppHref("https://ptb.discord.com/channels/1/2/3"), "discord://-/channels/1/2/3");
  assert.equal(discordAppHref("https://discordapp.com/channels/@me"), "discord://-/channels/@me");
});

test("anything else is left alone", () => {
  assert.equal(discordAppHref("https://discord.com/invite/abc"), null);
  assert.equal(discordAppHref("https://hoi4gamemaster.online/map"), null);
  assert.equal(discordAppHref("https://evil.example/discord.com/channels/1/2"), null);
});
