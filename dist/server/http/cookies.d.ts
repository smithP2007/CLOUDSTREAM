/**
 * Minimal RFC 6265-style cookie jar for the HTTP engine, scoped PER PROVIDER
 * (roadmap Phase 2 task 1: "cookie jar … where required by permitted provider
 * integrations"). An engine instance holds at most one jar; two engines never
 * share jars, so one provider's cookies can never attach to another
 * provider's requests (pinned by tests).
 *
 * Simplifications (documented in D18):
 *  - SameSite is parsed but ignored (a server-side jar does not surf).
 *  - No public-suffix list: a `Domain=` attribute is accepted when it is a
 *    suffix of the setting host; abuse potential is bounded because jars are
 *    per-provider and providers are first-party reviewed code.
 *  - Cookies are capped (count + value length) so a hostile response cannot
 *    grow memory unboundedly.
 */
export interface StoredCookie {
    name: string;
    value: string;
    /** Domain the cookie applies to (no leading dot). */
    domain: string;
    path: string;
    secure: boolean;
    expiresAt: number | null;
    createdAt: number;
}
export interface CookieJarOptions {
    /** Maximum stored cookies; eviction drops the soonest-expiring first. */
    maxCookies?: number;
}
export declare class CookieJar {
    #private;
    constructor(options?: CookieJarOptions);
    get size(): number;
    clear(): void;
    /**
     * Parses `set-cookie` values from a response and stores them. Values that
     * fail validation (unparseable, too long, `Domain=` pointing OUTSIDE the
     * setting host) are ignored — a response cannot plant cookies for foreign
     * domains.
     */
    storeFromResponse(setCookies: readonly string[], requestUrl: URL): void;
    /**
     * Builds the `Cookie` header value for a request, or `null` when no cookie
     * matches (scheme, domain, path, expiry all enforced).
     */
    headerFor(url: URL): string | null;
}
//# sourceMappingURL=cookies.d.ts.map