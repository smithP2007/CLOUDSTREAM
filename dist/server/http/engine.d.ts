/**
 * The HTTP engine — roadmap Phase 2 task 1 (`src/server/http/`), the web
 * equivalent of upstream nicehttp (OkHttp wrapper) minus the Android parts.
 * Built on `undici` with an `Agent` whose connector `lookup` is the guarded
 * DNS resolver, so every TCP connection uses ONLY addresses that passed the
 * SSRF guard (DNS validation and connection cannot disagree — D18).
 *
 * Per-request pipeline (each hop of a redirect chain repeats 1–5):
 *  1. URL parse + destination guard (scheme/credentials/hostname/IP rules;
 *     explicit `approvedDestinations` are the only private-host exception).
 *  2. robots.txt gate for GET/HEAD (opt-out per request; RFC 9309-ish).
 *  3. DNS: resolve all records, validate every one (fail closed on ANY
 *     non-public record), cache the validated set; the connector lookup
 *     serves only that set.
 *  4. Dispatch with a total-deadline `AbortController` (timeout + caller
 *     signal + size cap all funnel into one cancellation path).
 *  5. Read the response under a hard byte cap.
 *
 * Redirects are followed MANUALLY: every `Location` is re-validated through
 * the same pipeline (a redirect can never reach a prohibited destination),
 * redirect limits are enforced, and cross-origin hops drop credential-bearing
 * headers (authorization) and jar cookies. 301/302/303 switch to GET;
 * 307/308 preserve method and body.
 *
 * Typed results only: `fetch` NEVER throws for expected failures (invalid
 * URLs, blocked destinations, DNS failures, timeouts, aborts, size caps,
 * redirect loops, robots denials, network errors). Cookies/credentials are
 * never placed in events (origin+path only) or error messages.
 *
 * Security limitations are recorded in `docs/decisions.md` D18 — notably:
 * this is a LIBRARY for first-party provider code, not a proxy route; no HTTP
 * surface accepts client-supplied URLs in this phase.
 */
import type { CookieJar } from './cookies';
import { GuardedDnsResolver, type ValidatedAddress } from './dns';
import { type ApprovedDestination } from './guard';
/** Abort reason when the engine's total deadline elapses. */
export declare class HttpTimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(timeoutMs: number);
}
export type HttpFailureKind = 'invalidUrl' | 'blockedDestination' | 'dnsFailure' | 'timeout' | 'aborted' | 'tooManyRedirects' | 'invalidRedirect' | 'responseTooLarge' | 'robotsDisallowed' | 'networkError' | 'unsupportedMethod' | 'internalError';
export interface HttpFailure {
    kind: HttpFailureKind;
    message: string;
    /** The URL the failure is attributed to (final hop when redirected). */
    url?: string;
    cause?: unknown;
}
export interface HttpResponse {
    status: number;
    /** Lowercased header names; duplicate values joined with ', '. */
    headers: Record<string, string>;
    body: Uint8Array;
    /** Final URL after redirects. */
    url: string;
    redirected: boolean;
    fromCache: boolean;
    /** Hops taken (request URLs), excluding the initial URL. */
    redirectChain: string[];
    text(): string;
    json(): unknown;
}
export type HttpResult = {
    ok: true;
    response: HttpResponse;
} | {
    ok: false;
    failure: HttpFailure;
};
export interface HttpEngineConfig {
    /** Audit label for events (e.g. the provider name). Never a secret. */
    providerName?: string;
    userAgent?: string;
    /** Per-provider profile headers (first-party configuration, e.g. UA/referer). */
    defaultHeaders?: Record<string, string>;
    /** Opt-in cookie jar. Absent = the engine stores and sends NO cookies. */
    cookieJar?: CookieJar;
    /** Total deadline per fetch INCLUDING redirects (default 30 s). */
    timeoutMs?: number;
    /** Connector connect timeout (default 10 s). */
    connectTimeoutMs?: number;
    maxRedirects?: number;
    /** Response body cap (default 10 MiB). */
    maxBytes?: number;
    /** Response cache TTL for GET/HEAD 2xx (default 30 s; 0 disables caching). */
    cacheTtlMs?: number;
    cacheMaxEntries?: number;
    cacheMaxBytes?: number;
    /** Validated-DNS cache TTL (default 60 s). */
    dnsTtlMs?: number;
    /** robots.txt gating for GET/HEAD (default true). */
    respectRobots?: boolean;
    /** Explicitly approved destinations (the only private-host exception). */
    approvedDestinations?: readonly ApprovedDestination[];
    /** Injectable guarded DNS resolver (tests / shared composition). */
    dns?: GuardedDnsResolver;
    /** Optional event sink. Events contain origin+path only — never queries. */
    onRequestEvent?: (event: HttpEngineEvent) => void;
}
export type HttpEngineEvent = {
    kind: 'request';
    provider?: string;
    origin: string;
    path: string;
} | {
    kind: 'redirect';
    provider?: string;
    origin: string;
    path: string;
    status: number;
} | {
    kind: 'cacheHit';
    provider?: string;
    origin: string;
    path: string;
} | {
    kind: 'dnsValidated';
    provider?: string;
    host: string;
    addresses: number;
} | {
    kind: 'blocked';
    provider?: string;
    reason: string;
    detail: string;
};
export interface HttpRequestOptions {
    method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: string | Uint8Array;
    signal?: AbortSignal;
    /** Overrides the engine default for THIS request. */
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    /** 'default' caches eligible responses; 'no-store' bypasses (default 'default'). */
    cache?: 'default' | 'no-store';
    /** Per-request robots override (default: engine config). */
    respectRobots?: boolean;
}
export declare class HttpEngine {
    #private;
    constructor(config?: HttpEngineConfig);
    /** Closes pooled connections (used by tests/shutdown). */
    close(): Promise<void>;
    /**
     * Performs a guarded, size-capped, timeout-bounded, redirect-validating
     * request. Never throws for expected failures — see {@link HttpResult}.
     */
    fetch(rawUrl: string | URL, options?: HttpRequestOptions): Promise<HttpResult>;
}
export type { ValidatedAddress };
//# sourceMappingURL=engine.d.ts.map