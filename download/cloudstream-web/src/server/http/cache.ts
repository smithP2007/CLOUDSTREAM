/**
 * Generic bounded TTL cache with LRU eviction — used for the response cache
 * and the validated-DNS cache in the Phase 2 HTTP engine.
 *
 * Design: `Map` insertion order IS the LRU order (ES2015+ guarantee). `get`
 * touches (re-inserts) so frequently-used entries survive eviction; expired
 * entries are purged lazily on access and proactively on insert. Memory is
 * bounded by entry count and, optionally, by the sum of `sizeOf(value)`.
 */

export interface TtlCacheOptions<V> {
  /** Maximum number of live entries. Must be >= 1. */
  maxEntries: number;
  /**
   * Optional byte budget: the sum of `sizeOf(value)` over live entries must
   * not exceed it. When omitted, only `maxEntries` bounds the cache.
   */
  maxBytes?: number;
  /** Size function for the byte budget (defaults to constant 1). */
  sizeOf?: (value: V) => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
  bytes: number;
}

export class TtlCache<V> {
  readonly #entries = new Map<string, Entry<V>>();
  readonly #maxEntries: number;
  readonly #maxBytes: number | null;
  readonly #sizeOf: (value: V) => number;

  constructor(options: TtlCacheOptions<V>) {
    if (!Number.isFinite(options.maxEntries) || options.maxEntries < 1) {
      throw new TypeError('TtlCache: maxEntries must be a finite number >= 1');
    }
    this.#maxEntries = Math.floor(options.maxEntries);
    this.#maxBytes =
      options.maxBytes === undefined ? null : Math.max(0, Math.floor(options.maxBytes));
    this.#sizeOf = options.sizeOf ?? (() => 1);
  }

  get size(): number {
    return this.#entries.size;
  }

  get bytes(): number {
    let total = 0;
    for (const entry of this.#entries.values()) total += entry.bytes;
    return total;
  }

  /**
   * Returns the live (unexpired) value for `key`, touching LRU order.
   * Expired entries are removed and return `undefined`.
   */
  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    // LRU touch: re-insert to move to the back of iteration order.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  /** Whether a live (unexpired) entry exists — does NOT touch LRU order. */
  has(key: string): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) return false;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Stores `value` under `key` for `ttlMs`. Returns whether the value was
   * stored (oversized values under a byte budget are rejected, never cached
   * partially).
   */
  set(key: string, value: V, ttlMs: number): boolean {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
    const bytes = this.#sizeOf(value);
    if (this.#maxBytes !== null && bytes > this.#maxBytes) return false;
    this.#purgeExpired();
    // Delete-then-set so replacing a key refreshes its LRU position.
    this.#entries.delete(key);
    while (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
    if (this.#maxBytes !== null) {
      while (this.bytes + bytes > this.#maxBytes && this.#entries.size > 0) {
        const oldest = this.#entries.keys().next();
        if (oldest.done) break;
        this.#entries.delete(oldest.value);
      }
      if (this.bytes + bytes > this.#maxBytes) return false;
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs, bytes });
    return true;
  }

  /** Deletes `key`; returns whether a live entry was removed. */
  delete(key: string): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) return false;
    this.#entries.delete(key);
    return entry.expiresAt > Date.now();
  }

  /** Removes all expired entries. Returns how many were removed. */
  purgeExpired(): number {
    return this.#purgeExpired();
  }

  clear(): void {
    this.#entries.clear();
  }

  #purgeExpired(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
