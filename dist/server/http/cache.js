/**
 * Generic bounded TTL cache with LRU eviction — used for the response cache
 * and the validated-DNS cache in the Phase 2 HTTP engine.
 *
 * Design: `Map` insertion order IS the LRU order (ES2015+ guarantee). `get`
 * touches (re-inserts) so frequently-used entries survive eviction; expired
 * entries are purged lazily on access and proactively on insert. Memory is
 * bounded by entry count and, optionally, by the sum of `sizeOf(value)`.
 */
export class TtlCache {
    #entries = new Map();
    #maxEntries;
    #maxBytes;
    #sizeOf;
    constructor(options) {
        if (!Number.isFinite(options.maxEntries) || options.maxEntries < 1) {
            throw new TypeError('TtlCache: maxEntries must be a finite number >= 1');
        }
        this.#maxEntries = Math.floor(options.maxEntries);
        this.#maxBytes =
            options.maxBytes === undefined ? null : Math.max(0, Math.floor(options.maxBytes));
        this.#sizeOf = options.sizeOf ?? (() => 1);
    }
    get size() {
        return this.#entries.size;
    }
    get bytes() {
        let total = 0;
        for (const entry of this.#entries.values())
            total += entry.bytes;
        return total;
    }
    /**
     * Returns the live (unexpired) value for `key`, touching LRU order.
     * Expired entries are removed and return `undefined`.
     */
    get(key) {
        const entry = this.#entries.get(key);
        if (entry === undefined)
            return undefined;
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
    has(key) {
        const entry = this.#entries.get(key);
        if (entry === undefined)
            return false;
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
    set(key, value, ttlMs) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0)
            return false;
        const bytes = this.#sizeOf(value);
        if (this.#maxBytes !== null && bytes > this.#maxBytes)
            return false;
        this.#purgeExpired();
        // Delete-then-set so replacing a key refreshes its LRU position.
        this.#entries.delete(key);
        while (this.#entries.size >= this.#maxEntries) {
            const oldest = this.#entries.keys().next();
            if (oldest.done)
                break;
            this.#entries.delete(oldest.value);
        }
        if (this.#maxBytes !== null) {
            while (this.bytes + bytes > this.#maxBytes && this.#entries.size > 0) {
                const oldest = this.#entries.keys().next();
                if (oldest.done)
                    break;
                this.#entries.delete(oldest.value);
            }
            if (this.bytes + bytes > this.#maxBytes)
                return false;
        }
        this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs, bytes });
        return true;
    }
    /** Deletes `key`; returns whether a live entry was removed. */
    delete(key) {
        const entry = this.#entries.get(key);
        if (entry === undefined)
            return false;
        this.#entries.delete(key);
        return entry.expiresAt > Date.now();
    }
    /** Removes all expired entries. Returns how many were removed. */
    purgeExpired() {
        return this.#purgeExpired();
    }
    clear() {
        this.#entries.clear();
    }
    #purgeExpired() {
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
//# sourceMappingURL=cache.js.map