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
const MAX_COOKIE_VALUE_LENGTH = 4096;
function parseHttpDate(value) {
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}
function defaultRequestPath(pathname) {
    const lastSlash = pathname.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : pathname.slice(0, lastSlash);
}
function pathMatches(requestPath, cookiePath) {
    if (requestPath === cookiePath)
        return true;
    if (requestPath.startsWith(cookiePath)) {
        return cookiePath.endsWith('/') || requestPath.charAt(cookiePath.length) === '/';
    }
    return false;
}
function domainMatches(host, cookieDomain) {
    return host === cookieDomain || host.endsWith('.' + cookieDomain);
}
export class CookieJar {
    #cookies = new Map();
    #maxCookies;
    constructor(options = {}) {
        this.#maxCookies = Math.max(1, options.maxCookies ?? 100);
    }
    get size() {
        this.#purgeExpired();
        return this.#cookies.size;
    }
    clear() {
        this.#cookies.clear();
    }
    /**
     * Parses `set-cookie` values from a response and stores them. Values that
     * fail validation (unparseable, too long, `Domain=` pointing OUTSIDE the
     * setting host) are ignored — a response cannot plant cookies for foreign
     * domains.
     */
    storeFromResponse(setCookies, requestUrl) {
        const host = requestUrl.hostname.toLowerCase();
        for (const raw of setCookies) {
            const cookie = this.#parseSetCookie(raw, host, requestUrl.pathname || '/');
            if (cookie !== null)
                this.#store(cookie);
        }
    }
    /**
     * Builds the `Cookie` header value for a request, or `null` when no cookie
     * matches (scheme, domain, path, expiry all enforced).
     */
    headerFor(url) {
        this.#purgeExpired();
        const host = url.hostname.toLowerCase();
        const secure = url.protocol === 'https:';
        const requestPath = url.pathname || '/';
        const matched = [];
        for (const cookie of this.#cookies.values()) {
            if (cookie.secure && !secure)
                continue;
            if (!domainMatches(host, cookie.domain))
                continue;
            if (!pathMatches(requestPath, cookie.path))
                continue;
            matched.push(cookie);
        }
        if (matched.length === 0)
            return null;
        // Order: longer paths first (RFC 6265 §5.4), then oldest first.
        matched.sort((a, b) => {
            if (b.path.length !== a.path.length)
                return b.path.length - a.path.length;
            return a.createdAt - b.createdAt;
        });
        return matched.map((c) => `${c.name}=${c.value}`).join('; ');
    }
    #parseSetCookie(raw, requestHost, requestPath) {
        const trimmed = raw.trim();
        const separator = trimmed.indexOf(';');
        const pair = separator < 0 ? trimmed : trimmed.slice(0, separator);
        const eq = pair.indexOf('=');
        if (eq <= 0)
            return null;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (name === '' || value.length > MAX_COOKIE_VALUE_LENGTH)
            return null;
        const attributes = separator < 0 ? '' : trimmed.slice(separator + 1);
        let domain = requestHost;
        let path = null;
        let secure = false;
        let expiresAt = null;
        for (const attribute of attributes.split(';')) {
            const attrEq = attribute.indexOf('=');
            const attrName = (attrEq < 0 ? attribute : attribute.slice(0, attrEq)).trim().toLowerCase();
            const attrValue = attrEq < 0 ? '' : attribute.slice(attrEq + 1).trim();
            if (attrName === 'domain') {
                const candidate = attrValue.replace(/^\./, '').toLowerCase();
                // Only accept domains at or above the setting host (§5.3 step 6).
                if (candidate !== '' && domainMatches(requestHost, candidate))
                    domain = candidate;
            }
            else if (attrName === 'path') {
                if (attrValue.startsWith('/'))
                    path = attrValue;
            }
            else if (attrName === 'secure') {
                secure = true;
            }
            else if (attrName === 'max-age') {
                const seconds = Number(attrValue);
                if (Number.isFinite(seconds)) {
                    if (seconds <= 0)
                        return null; // deletion directive — nothing to store
                    expiresAt = Date.now() + seconds * 1000;
                }
            }
            else if (attrName === 'expires') {
                const parsed = parseHttpDate(attrValue);
                if (parsed !== null) {
                    if (parsed <= Date.now())
                        return null; // already expired — deletion
                    expiresAt = parsed;
                }
            }
            // http-only / samesite / partitioned: parsed, intentionally unused.
        }
        return {
            name,
            value,
            domain,
            path: path ?? defaultRequestPath(requestPath),
            secure,
            expiresAt,
            createdAt: Date.now(),
        };
    }
    #store(cookie) {
        const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
        const existing = this.#cookies.get(key);
        if (existing !== undefined) {
            // Replace in place, keep original creation order for sorting stability.
            this.#cookies.set(key, { ...cookie, createdAt: existing.createdAt });
            return;
        }
        while (this.#cookies.size >= this.#maxCookies) {
            const victim = this.#evictionCandidate();
            if (victim === null)
                break;
            this.#cookies.delete(victim);
        }
        this.#cookies.set(key, cookie);
    }
    #evictionCandidate() {
        let soonestExpiry = Infinity;
        let victim = null;
        for (const [key, cookie] of this.#cookies) {
            const expiry = cookie.expiresAt ?? Number.MAX_SAFE_INTEGER;
            if (expiry < soonestExpiry) {
                soonestExpiry = expiry;
                victim = key;
            }
        }
        return victim;
    }
    #purgeExpired() {
        const now = Date.now();
        for (const [key, cookie] of this.#cookies) {
            if (cookie.expiresAt !== null && cookie.expiresAt <= now)
                this.#cookies.delete(key);
        }
    }
}
//# sourceMappingURL=cookies.js.map