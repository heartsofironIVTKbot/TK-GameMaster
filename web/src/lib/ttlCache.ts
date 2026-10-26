/**
 * Tiny in-process cache for API reads (scale plan, Phase 0).
 *
 *  - entries expire after `ttlMs`
 *  - concurrent misses for the same key share ONE loader call, so a burst of
 *    100 viewers asking at once costs a single database read
 *  - bounded size (oldest entries are dropped first)
 *  - failed loads are not cached
 *
 * Per server process: with several instances each keeps its own copy, which
 * is fine for short TTLs.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  async get(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const request = loader()
      .then((value) => {
        this.entries.delete(key); // re-insert at the end (newest)
        this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value;
          if (oldest === undefined) break;
          this.entries.delete(oldest);
        }
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, request);
    return request;
  }

  /** Drop a key so the next read reloads (after a write we made ourselves). */
  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Drop every key that matches (e.g. one player's cards on every server). */
  deleteWhere(test: (key: string) => boolean): void {
    for (const key of [...this.entries.keys()]) {
      if (test(key)) this.entries.delete(key);
    }
  }
}

/**
 * Module-level caches survive across requests but must also survive
 * dev-server hot reloads without piling up copies.
 */
export function sharedCache<T>(name: string, ttlMs: number, maxEntries?: number): TtlCache<T> {
  const holder = globalThis as { __gmCaches?: Map<string, TtlCache<unknown>> };
  holder.__gmCaches ??= new Map();
  let cache = holder.__gmCaches.get(name) as TtlCache<T> | undefined;
  if (!cache) {
    cache = new TtlCache<T>(ttlMs, maxEntries);
    holder.__gmCaches.set(name, cache as TtlCache<unknown>);
  }
  return cache;
}
