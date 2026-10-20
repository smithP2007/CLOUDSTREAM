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
export declare class TtlCache<V> {
    #private;
    constructor(options: TtlCacheOptions<V>);
    get size(): number;
    get bytes(): number;
    /**
     * Returns the live (unexpired) value for `key`, touching LRU order.
     * Expired entries are removed and return `undefined`.
     */
    get(key: string): V | undefined;
    /** Whether a live (unexpired) entry exists — does NOT touch LRU order. */
    has(key: string): boolean;
    /**
     * Stores `value` under `key` for `ttlMs`. Returns whether the value was
     * stored (oversized values under a byte budget are rejected, never cached
     * partially).
     */
    set(key: string, value: V, ttlMs: number): boolean;
    /** Deletes `key`; returns whether a live entry was removed. */
    delete(key: string): boolean;
    /**
     * Snapshot of the keys that are currently LIVE (unexpired). Order follows
     * LRU (oldest first). Used by higher layers that index entries externally
     * (e.g. per-provider invalidation in the link pipeline).
     */
    keys(): string[];
    /** Removes all expired entries. Returns how many were removed. */
    purgeExpired(): number;
    clear(): void;
}
//# sourceMappingURL=cache.d.ts.map