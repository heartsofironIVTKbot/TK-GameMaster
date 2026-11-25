/**
 * Great Game fair draws, the part that runs anywhere (the server deciding a
 * draw, and the replay page checking it afterwards in the browser).
 *
 * Every random result of the night comes from HMAC-SHA256(seed, "<seq>:<kind>:<counter>")
 * over a list sorted the same way each time. SHA-256 is written out here in
 * plain TypeScript, so the page needs nothing from the server to recompute a
 * draw, and the server and the page can never disagree.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const utf8 = (text: string) => new TextEncoder().encode(text);

/** SHA-256 of some bytes. */
export function sha256(data: Uint8Array): Uint8Array {
  const length = data.length;
  const blocks = Math.ceil((length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(data);
  padded[length] = 0x80;
  const bits = length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 0x1_0000_0000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < blocks; block++) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

/** HMAC-SHA256 with a text key and a text message (both UTF-8). */
export function hmacSha256(key: string, message: string): Uint8Array {
  let keyBytes: Uint8Array = utf8(key);
  if (keyBytes.length > 64) keyBytes = sha256(keyBytes);
  const inner = new Uint8Array(64 + utf8(message).length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    const byte = keyBytes[i] ?? 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  inner.set(utf8(message), 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The public fingerprint of a seed: its SHA-256 in hex. */
export function commitOf(seed: string): string {
  return toHex(sha256(utf8(seed)));
}

/**
 * An unbiased index in [0, n) for action `seq` of `kind`: 32-bit words of the
 * HMAC, rejecting the top sliver so every index is equally likely; a fresh
 * block (counter) if all eight words fall in it.
 */
export function drawIndex(seed: string, seq: number, kind: string, n: number): number {
  return drawTrace(seed, seq, kind, n).index;
}

/** The same as drawIndex, with the working shown (for the receipts). */
export function drawTrace(seed: string, seq: number, kind: string, n: number): { index: number; message: string; word: number; value: number } {
  if (n <= 0) throw new Error("nothing to draw from");
  if (n === 1) return { index: 0, message: "", word: -1, value: 0 };
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (let counter = 0; counter < 64; counter++) {
    const message = `${seq}:${kind}:${counter}`;
    const digest = hmacSha256(seed, message);
    const view = new DataView(digest.buffer);
    for (let word = 0; word < 8; word++) {
      const value = view.getUint32(word * 4);
      if (value < limit) return { index: value % n, message, word, value };
    }
  }
  return { index: 0, message: "", word: -1, value: 0 };
}

/** Draw one item: the list is sorted first so the result only depends on its contents. */
export function drawFrom<T extends string>(seed: string, seq: number, kind: string, items: T[]): T {
  const sorted = [...items].sort();
  return sorted[drawIndex(seed, seq, kind, sorted.length)];
}
