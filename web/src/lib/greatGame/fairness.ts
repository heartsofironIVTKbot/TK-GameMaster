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
 */

export function newSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function commitOf(seed: string): string {
  return crypto.createHash("sha256").update(seed, "utf8").digest("hex");
}

/**
 * An unbiased index in [0, n) for action `seq` of `kind`: 32-bit words of the
 * HMAC, rejecting the top sliver so every index is equally likely; a fresh
 * block (counter) if all eight words fall in it.
 */
export function drawIndex(seed: string, seq: number, kind: string, n: number): number {
  if (n <= 0) throw new Error("nothing to draw from");
  if (n === 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (let counter = 0; counter < 64; counter++) {
    const digest = crypto.createHmac("sha256", seed).update(`${seq}:${kind}:${counter}`).digest();
    for (let word = 0; word < 8; word++) {
      const value = digest.readUInt32BE(word * 4);
      if (value < limit) return value % n;
    }
  }
  return 0;
}

/** Draw one item: the list is sorted first so the result only depends on its contents. */
export function drawFrom<T extends string>(seed: string, seq: number, kind: string, items: T[]): T {
  const sorted = [...items].sort();
  return sorted[drawIndex(seed, seq, kind, sorted.length)];
}
