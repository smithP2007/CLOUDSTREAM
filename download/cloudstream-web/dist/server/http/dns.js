/**
 * Guarded DNS resolver — the anti-rebinding core of the HTTP engine.
 *
 * Contract (see `docs/decisions.md` D18):
 *  1. `validateAndCache(hostname)` resolves ALL A + AAAA records, validates
 *     EVERY record through the destination guard, and caches the validated
 *     set for `ttlMs`. Any blocked record, resolution failure, or empty
 *     result rejects the host (fail closed) — a dual public/private answer
 *     cannot be used to slip past validation.
 *  2. `lookupForAgent()` returns the `lookup` function handed to undici's
 *     connector. It serves ONLY addresses from the validated cache (or
 *     re-validates through the same pipeline on a cache miss). The TCP
 *     connection therefore cannot resolve to any address that did not pass
 *     the guard — validation and connection cannot disagree (no TOCTOU
 *     window: there is exactly one source of truth, the validated cache).
 *
 * The resolver functions are injectable for tests (mocked DNS); production
 * uses `dns/promises` `resolve4`/`resolve6`, which follow CNAMEs to their
 * final address records and do NOT consult `/etc/hosts`.
 */
import { resolve4, resolve6 } from 'node:dns/promises';
import { TtlCache } from './cache';
import { isApprovedHost, isPublicDestinationIp, parseIpv4, parseIpv6, } from './guard';
export class DnsValidationError extends Error {
    kind;
    constructor(kind, message) {
        super(message);
        this.name = 'DnsValidationError';
        this.kind = kind;
    }
}
export class GuardedDnsResolver {
    #cache;
    #ttlMs;
    #resolve4;
    #resolve6;
    #approved;
    #inFlight = new Map();
    constructor(options = {}) {
        this.#ttlMs = options.ttlMs ?? 60_000;
        this.#cache = new TtlCache({
            maxEntries: options.maxEntries ?? 256,
        });
        this.#resolve4 = options.resolve4Fn ?? ((host) => resolve4(host));
        this.#resolve6 = options.resolve6Fn ?? ((host) => resolve6(host));
        this.#approved = options.approvedDestinations ?? [];
    }
    /** Number of live validated hostnames (observability). */
    get size() {
        return this.#cache.size;
    }
    /** Drops all validated entries (used by tests; safe to call anytime). */
    clear() {
        this.#cache.clear();
        this.#inFlight.clear();
    }
    /**
     * Resolves, validates, and caches every address record for `hostname`.
     * Throws {@link DnsValidationError} (kind `blocked` or `failure`) — callers
     * must treat any throw as "destination refused".
     */
    async validateAndCache(hostname) {
        const cached = this.#cache.get(hostname);
        if (cached !== undefined)
            return cached;
        const existing = this.#inFlight.get(hostname);
        if (existing !== undefined)
            return existing;
        const promise = this.#resolveAndValidate(hostname).finally(() => {
            this.#inFlight.delete(hostname);
        });
        this.#inFlight.set(hostname, promise);
        return promise;
    }
    /** Returns the live validated set, or `undefined` when absent/expired. */
    getValidated(hostname) {
        return this.#cache.get(hostname);
    }
    /**
     * Seeds the cache with an already-validated IP literal (the guard classifies
     * literals before DNS is ever consulted). Required so the connector's
     * lookup finds IP-literal destinations.
     */
    pinLiteral(hostname, parsed) {
        const family = parsed.length === 4 ? 4 : 6;
        const address = family === 4
            ? parsed.join('.')
            : parsed.map((g) => g.toString(16)).join(':');
        this.#cache.set(hostname, [{ address, family, parsed }], this.#ttlMs);
    }
    /**
     * The `lookup` function for undici's `Agent.connect`. Serves ONLY validated
     * addresses; on a miss it re-validates through the full pipeline (async —
     * the connector's lookup is callback-based). Any failure → error callback
     * (fail closed). The connector then connects to one of THESE addresses
     * while using the ORIGINAL hostname for Host/SNI — DNS cannot be re-bound.
     */
    lookupForAgent() {
        return (hostname, options, callback) => {
            const requestedFamily = options.family ?? 0;
            if (requestedFamily !== 0 && requestedFamily !== 4 && requestedFamily !== 6) {
                callback(new Error(`guard: unsupported lookup family ${String(requestedFamily)}`));
                return;
            }
            const serve = (entry) => {
                const wanted = requestedFamily;
                const filtered = wanted === 0 ? entry : entry.filter((a) => a.family === wanted);
                if (filtered.length === 0) {
                    callback(new Error(`guard: no validated ${wanted === 0 ? '' : `IPv${wanted} `}record for '${hostname}'`));
                    return;
                }
                callback(null, filtered.map((a) => ({ address: a.address, family: a.family })));
            };
            const cached = this.#cache.get(hostname);
            if (cached !== undefined) {
                serve(cached);
                return;
            }
            // Cache miss (e.g. keep-alive socket died after TTL): re-validate via
            // the exact same pipeline. Fail closed on any rejection.
            this.validateAndCache(hostname).then((entry) => serve(entry), (error) => callback(error instanceof Error
                ? error
                : new Error(`guard: DNS validation failed for '${hostname}'`)));
        };
    }
    async #resolveAndValidate(hostname) {
        const results = await Promise.allSettled([
            this.#resolve4(hostname),
            this.#resolve6(hostname),
        ]);
        const v4 = results[0]?.status === 'fulfilled' ? (results[0].value ?? []) : null;
        const v6 = results[1]?.status === 'fulfilled' ? (results[1].value ?? []) : null;
        if (v4 === null && v6 === null) {
            throw new DnsValidationError('failure', `DNS resolution failed for '${hostname}'`);
        }
        const validated = [];
        for (const [addresses, family] of [
            [v4, 4],
            [v6, 6],
        ]) {
            if (addresses === null)
                continue; // that family failed entirely; the other may succeed
            for (const raw of addresses) {
                const parsed = family === 4 ? parseIpv4(raw) : parseIpv6(raw);
                if (parsed === null) {
                    // Resolver returned something unparseable — fail closed.
                    throw new DnsValidationError('failure', `DNS returned an unparseable address for '${hostname}'`);
                }
                const verdict = isPublicDestinationIp(parsed);
                if (!verdict.public && !isApprovedHost(hostname, this.#approved)) {
                    // ANY non-public record rejects the host (fail closed — prevents
                    // dual-record rebinding where a public answer masks a private one).
                    // Exception: explicitly approved hostnames (operator's own LAN hosts).
                    throw new DnsValidationError('blocked', `DNS for '${hostname}' resolved to a non-public address (${verdict.detail})`);
                }
                if (!validated.some((a) => a.address === raw)) {
                    validated.push({ address: raw, family, parsed });
                }
            }
        }
        if (validated.length === 0) {
            throw new DnsValidationError('failure', `DNS returned no addresses for '${hostname}'`);
        }
        this.#cache.set(hostname, validated, this.#ttlMs);
        return validated;
    }
}
//# sourceMappingURL=dns.js.map