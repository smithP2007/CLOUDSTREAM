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
import { type ApprovedDestination, type ParsedIpv4, type ParsedIpv6 } from './guard';
export interface ValidatedAddress {
    address: string;
    /** Node lookup-family convention: 4 = IPv4, 6 = IPv6. */
    family: 4 | 6;
    parsed: ParsedIpv4 | ParsedIpv6;
}
export type DnsResolverFn = (hostname: string) => Promise<string[]>;
export declare class DnsValidationError extends Error {
    readonly kind: 'blocked' | 'failure';
    constructor(kind: 'blocked' | 'failure', message: string);
}
export interface GuardedDnsOptions {
    /** Cache TTL for validated record sets (default 60 s). */
    ttlMs?: number;
    /** Cache bound (default 256 hostnames). */
    maxEntries?: number;
    /** Injectable resolvers (tests). Default: dns/promises resolve4/resolve6. */
    resolve4Fn?: DnsResolverFn;
    resolve6Fn?: DnsResolverFn;
    /**
     * Operator-approved destinations: a hostname whose IP records fall in a
     * blocked range (e.g. a LAN media server) is allowed when the HOSTNAME is
     * explicitly approved. Ports are enforced at URL-validation time.
     */
    approvedDestinations?: readonly ApprovedDestination[];
}
interface LookupOptionsLike {
    family?: number;
    all?: boolean;
}
export declare class GuardedDnsResolver {
    #private;
    constructor(options?: GuardedDnsOptions);
    /** Number of live validated hostnames (observability). */
    get size(): number;
    /** Drops all validated entries (used by tests; safe to call anytime). */
    clear(): void;
    /**
     * Resolves, validates, and caches every address record for `hostname`.
     * Throws {@link DnsValidationError} (kind `blocked` or `failure`) — callers
     * must treat any throw as "destination refused".
     */
    validateAndCache(hostname: string): Promise<ValidatedAddress[]>;
    /** Returns the live validated set, or `undefined` when absent/expired. */
    getValidated(hostname: string): ValidatedAddress[] | undefined;
    /**
     * Seeds the cache with an already-validated IP literal (the guard classifies
     * literals before DNS is ever consulted). Required so the connector's
     * lookup finds IP-literal destinations.
     */
    pinLiteral(hostname: string, parsed: ParsedIpv4 | ParsedIpv6): void;
    /**
     * The `lookup` function for undici's `Agent.connect`. Serves ONLY validated
     * addresses; on a miss it re-validates through the full pipeline (async —
     * the connector's lookup is callback-based). Any failure → error callback
     * (fail closed). The connector then connects to one of THESE addresses
     * while using the ORIGINAL hostname for Host/SNI — DNS cannot be re-bound.
     */
    lookupForAgent(): (hostname: string, options: LookupOptionsLike, callback: (err: Error | null, addresses?: Array<{
        address: string;
        family: number;
    }>) => void) => void;
}
export {};
//# sourceMappingURL=dns.d.ts.map