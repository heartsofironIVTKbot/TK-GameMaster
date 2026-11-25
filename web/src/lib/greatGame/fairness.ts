import crypto from "node:crypto";

/**
 * Great Game fairness ("the sealed envelope").
 *
 * When the event is created the server picks a secret seed and publishes only
 * its SHA-256 (the commit) for the announcement. Every random result of the
 * night comes from HMAC-SHA256(seed, "<seq>:<kind>") over a list sorted the
 * same way each time, so once the seed is revealed after the teams lock,
 * anyone can recompute every draw and check it against the log. The seed
 * stays on the server until then.
 *
 * The draws themselves live in draw.ts, which runs on the server and in the
 * replay page alike.
 */

export { commitOf, drawFrom, drawIndex } from "./draw";

export function newSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}
