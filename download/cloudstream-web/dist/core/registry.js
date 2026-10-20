/**
 * The provider registry — roadmap Phase 1 task 3, the clean-room TypeScript
 * encoding of the URL-based provider resolution verified upstream (see
 * `docs/provider-architecture.md` §3.1 and §5.2, `ExtractorApi.kt:926–986` and
 * `MainAPI.kt:167` at `recloudstream/cloudstream@eb962b4`), HARDENED per the
 * security review recorded in `docs/decisions.md` D17.
 *
 * Matching algorithm (three checks, newest-first scan order preserved):
 *
 *  1. **Prefix check.** The normalized provider `mainUrl` must be a prefix of
 *     the normalized input URL, AND the character right after the prefix must
 *     be a boundary (end of string, `/`, `?`, `#` or `:`) — so `example.com`
 *     matches `example.com/watch` and `example.com:8080` but never
 *     `example.com.evil.io`. (Upstream: "Iterate in reverse order so the new
 *     registered ExtractorApi takes priority", `ExtractorApi.kt:936`; the
 *     boundary check is our hardening — upstream's `startsWith` is naive.)
 *  2. **Subdomain check** (path-less patterns only). The URL host equals the
 *     pattern host or is a label-boundary subdomain of it (`x.example.com` for
 *     pattern `example.com`). Safe by construction: DNS delegation means only
 *     the operator of `example.com` can publish hosts under it. Upstream got
 *     this behavior accidentally, via the fuzzy fallback scoring 100.
 *  3. **Mirror check** (structural rule; replaces the score-gated fuzzy scan).
 *     Align the pattern host's labels to the TAIL of the URL host's labels:
 *     all labels EXCEPT the final one must be exactly equal, and the final
 *     label (the TLD) must differ — e.g. `streamtape.to` ↔ `streamtape.com`,
 *     which is the documented upstream intent ("to match mirror domains - like
 *     example.com, example.net"). The reported `score` is a Levenshtein
 *     partial ratio over HOSTS ONLY (informational/audit).
 *
 * Why the mirror rule is structural, not score-gated (D17): the upstream
 * `Levenshtein.partialRatio(mainUrl, url) > 80` scan ran over the FULL URL, so
 * any URL containing the provider's `mainUrl` verbatim — in the path, the
 * query, or a hostile subdomain position like `example.com.evil.io` — scored
 * 100 and hijacked the match. Host-only scoring does not fix that by itself
 * (containment in a hostile suffix still scores 100), and a pure score gate
 * cannot separate `example.net` (legitimate mirror, 72.7) from
 * `example.com.evil.io` (attacker, 100). The structural rule keeps the
 * legitimate-mirror behavior and eliminates every look-alike vector except
 * exact name+TLD swaps, which are indistinguishable from mirrors by design
 * (residual risk documented in D17; mitigated by provider curation + kill
 * switch, never by the registry).
 *
 * Safety properties (pinned by tests):
 *  - Lookups NEVER throw: malformed, empty, or unknown URLs return `null`.
 *    No `URL` parsing is used — matching is pure string logic, so no runtime
 *    exception paths exist in the lookup path.
 *  - A hostname appearing ONLY in the path or query can never select a
 *    provider (mirror/subdomain checks are host-scoped).
 *  - Registration is fail-fast (first-party providers only; a broken
 *    registration is a programming error, rejected with `TypeError`).
 *  - No dynamic loading: providers are first-party `Provider` objects handed
 *    in by this codebase. No `.cs3` loading, no external code execution, no
 *    network I/O happens anywhere in this module.
 */
/* -------------------------------------------------------------------------- */
/* URL normalization                                                          */
/* -------------------------------------------------------------------------- */
/** Strips `https://`, `http://` and protocol-relative `//` leading forms. */
const LEADING_SCHEME_SLASHES = /^(?:https?:)?\/\//;
/** Defensive strip for scheme-without-slashes forms (`https:example.com`). */
const LEADING_BARE_SCHEME = /^https?:/;
const WWW_PREFIX = 'www.';
const TRAILING_SLASHES = /\/+$/;
/**
 * Normalizes a URL (or a provider `mainUrl`) for comparison. Applied
 * consistently to BOTH sides of every match, so both sides always see the
 * same transformation:
 *
 *  1. trim surrounding whitespace;
 *  2. lowercase (hosts and paths — case differences must never hide a match);
 *  3. strip the leading scheme (`https://`, `http://`, protocol-relative
 *     `//`, or a bare `https:`/`http:` without slashes);
 *  4. strip ONE leading `www.` (mirrors upstream's regex, which strips `www.`
 *     right after the scheme — done on both sides here, so `www.` and apex
 *     domains are equivalent);
 *  5. strip trailing slashes (so a `mainUrl` declared as `…/` and one declared
 *     as `…` are interchangeable — upstream keeps them and thereby misses
 *     prefix matches for providers declared with a trailing slash).
 *
 * Ports, query strings, userinfo and paths are preserved. Non-string input
 * normalizes to `''` (which can never match anything) instead of throwing.
 */
export function normalizeProviderUrl(input) {
    if (typeof input !== 'string')
        return '';
    let s = input.trim().toLowerCase();
    s = s.replace(LEADING_SCHEME_SLASHES, '');
    s = s.replace(LEADING_BARE_SCHEME, '');
    if (s.startsWith(WWW_PREFIX))
        s = s.slice(WWW_PREFIX.length);
    s = s.replace(TRAILING_SLASHES, '');
    return s;
}
/* -------------------------------------------------------------------------- */
/* Levenshtein partial ratio (mirror-domain fallback scoring)                 */
/* -------------------------------------------------------------------------- */
/** Inputs longer than this are truncated before fuzzy scoring (bound cost). */
const MAX_FUZZY_INPUT_LENGTH = 2048;
/**
 * Levenshtein-based similarity ratio (0–100) between two equal-ish strings,
 * using the same normalization upstream's `Levenshtein.ratio` uses: an
 * edit-distance where substitution costs 2 (= delete + insert), scored as
 * `(lenA + lenB - distance) / (lenA + lenB) * 100`. Two empty strings are
 * 100; one empty string scores 0.
 *
 * NOTE (D17): upstream's `> 80` score threshold is no longer a match gate —
 * the mirror rule is structural (label alignment). This function is retained
 * for the informational mirror `score` and as a public utility.
 */
export function levenshteinRatio(a, b) {
    if (a.length === 0 && b.length === 0)
        return 100;
    // DP over the shorter string as the row so memory stays O(shorter).
    let rows = a;
    let cols = b;
    if (rows.length < cols.length)
        [rows, cols] = [cols, rows];
    let prev = new Array(cols.length + 1);
    for (let j = 0; j <= cols.length; j++)
        prev[j] = j;
    for (let i = 1; i <= rows.length; i++) {
        const cur = new Array(cols.length + 1);
        cur[0] = i;
        const rowChar = rows[i - 1] ?? '';
        for (let j = 1; j <= cols.length; j++) {
            const up = (prev[j] ?? Number.MAX_SAFE_INTEGER) + 1;
            const left = (cur[j - 1] ?? Number.MAX_SAFE_INTEGER) + 1;
            const diag = (prev[j - 1] ?? Number.MAX_SAFE_INTEGER) + (rowChar === cols[j - 1] ? 0 : 2);
            cur[j] = Math.min(up, left, diag);
        }
        prev = cur;
    }
    // Loop bounds guarantee this exists; the fallback is the all-mismatch distance.
    const distance = prev[cols.length] ?? rows.length + cols.length;
    return ((rows.length + cols.length - distance) / (rows.length + cols.length)) * 100;
}
/**
 * Levenshtein PARTIAL ratio (0–100): slides a window the length of the
 * shorter string across the longer string and returns the best window
 * score. This mirrors `Levenshtein.partialRatio` semantics used upstream —
 * a short `mainUrl` can score high against a long URL even when the URL has
 * extra path/query content around the mirrored domain.
 *
 * Determinism: windows are scanned left to right and ties keep the EARLIEST
 * window, so the result is a pure function of the inputs. Exact (no
 * approximation), with inputs truncated at {@link MAX_FUZZY_INPUT_LENGTH} to
 * bound the worst-case cost.
 */
export function levenshteinPartialRatio(pattern, text) {
    if (typeof pattern !== 'string' || typeof text !== 'string')
        return 0;
    let shorter = pattern;
    let longer = text;
    if (shorter.length > longer.length)
        [shorter, longer] = [longer, shorter];
    if (shorter.length === 0)
        return longer.length === 0 ? 100 : 0;
    shorter = shorter.slice(0, MAX_FUZZY_INPUT_LENGTH);
    longer = longer.slice(0, MAX_FUZZY_INPUT_LENGTH);
    let best = 0;
    for (let start = 0; start + shorter.length <= longer.length; start++) {
        const score = levenshteinRatio(shorter, longer.slice(start, start + shorter.length));
        if (score > best) {
            best = score;
            if (best === 100)
                break; // cannot improve
        }
    }
    return best;
}
/* -------------------------------------------------------------------------- */
/* Host extraction (mirror/subdomain checks are host-scoped — D17)            */
/* -------------------------------------------------------------------------- */
/** Domain-like host charset: lowercase alnum, dots, hyphens (punycode-safe). */
const DOMAIN_LIKE = /^[a-z0-9.-]+$/;
const MAX_HOST_LENGTH = 253;
/** Strips a `:port` suffix (decimal digits only) from a host:port string. */
function stripPort(hostPort) {
    if (hostPort.startsWith('['))
        return hostPort; // IPv6 literal — not domain-like, gated later
    const colon = hostPort.lastIndexOf(':');
    if (colon >= 0 && /^\d+$/.test(hostPort.slice(colon + 1)))
        return hostPort.slice(0, colon);
    return hostPort;
}
/**
 * Extracts and validates the HOSTNAME from a normalized URL (or normalized
 * `mainUrl`). Returns `null` for anything that is not a plain domain-like
 * host: IPv6 literals, userinfo, empty/double labels, over-long hosts. The
 * mirror and subdomain checks ONLY run on hosts returned here, so nothing
 * that appears in a URL's path or query can influence them.
 */
function extractUrlHost(normalizedUrl) {
    const hostPort = normalizedUrl.split('/', 1)[0] ?? '';
    let host = stripPort(hostPort);
    if (host.endsWith('.'))
        host = host.slice(0, -1); // one trailing dot (FQDN form)
    if (host === '' || host.length > MAX_HOST_LENGTH)
        return null;
    if (!DOMAIN_LIKE.test(host))
        return null;
    const labels = host.split('.');
    if (labels.some((label) => label === ''))
        return null; // empty label (leading/double dot)
    return host;
}
/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */
/** Characters that may legitimately follow a `mainUrl` prefix inside a URL. */
const PREFIX_BOUNDARIES = new Set(['/', '?', '#', ':']);
function hasPrefixBoundary(normalizedUrl, patternLength) {
    if (normalizedUrl.length === patternLength)
        return true; // exact match
    return PREFIX_BOUNDARIES.has(normalizedUrl[patternLength] ?? '');
}
/**
 * Typed, ordered provider registry for the {@link Provider} contract — the
 * web equivalent of upstream's `allProviders` list + `getApiFromNameNull` /
 * `getApiFromUrlNull` lookups (MainAPI.kt:115–176) with the extractor-style
 * newest-wins matching semantics (ExtractorApi.kt:926–986, see module docs).
 */
export class ProviderRegistry {
    /** Registration order: index 0 = oldest, last index = newest. */
    #providers = [];
    /**
     * Registers a provider. Fail-fast on invalid registrations (first-party
     * code contract): a provider must be an object with a non-empty `name`,
     * a `mainUrl` that is non-empty after normalization (an empty pattern
     * would prefix-match EVERYTHING), and callable lifecycle methods.
     *
     * See {@link RegistryRegistration} for duplicate-name behavior.
     */
    register(provider) {
        if (typeof provider !== 'object' || provider === null) {
            throw new TypeError('ProviderRegistry.register: provider must be an object');
        }
        if (typeof provider.name !== 'string' || provider.name.trim() === '') {
            throw new TypeError(`ProviderRegistry.register: provider.name must be a non-empty string`);
        }
        if (normalizeProviderUrl(provider.mainUrl) === '') {
            throw new TypeError(`ProviderRegistry.register: provider "${provider.name}" has an empty mainUrl after normalization`);
        }
        for (const method of ['getMainPage', 'search', 'load', 'loadLinks']) {
            if (typeof provider[method] !== 'function') {
                throw new TypeError(`ProviderRegistry.register: provider "${provider.name}" is missing a callable ${method}()`);
            }
        }
        if (provider.quickSearch !== undefined && typeof provider.quickSearch !== 'function') {
            throw new TypeError(`ProviderRegistry.register: provider "${provider.name}" has a non-callable quickSearch`);
        }
        const existingIndex = this.#providers.findIndex((p) => p.name === provider.name);
        if (existingIndex >= 0) {
            if (this.#providers[existingIndex] === provider)
                return 'existing';
            // Replacement (upstream clone-site override): drop the old instance,
            // append the new one at the newest position.
            this.#providers.splice(existingIndex, 1);
            this.#providers.push(provider);
            return 'replaced';
        }
        this.#providers.push(provider);
        return 'added';
    }
    /**
     * Removes a provider by name or by instance. Returns whether anything was
     * removed. Unknown names are safe no-ops.
     */
    unregister(providerOrName) {
        const index = typeof providerOrName === 'string'
            ? this.#providers.findIndex((p) => p.name === providerOrName)
            : this.#providers.indexOf(providerOrName);
        if (index < 0)
            return false;
        this.#providers.splice(index, 1);
        return true;
    }
    /**
     * Resolves a provider by exact display name (upstream `getApiFromNameNull`,
     * MainAPI.kt:155–163). Name comparison is exact and case-sensitive, like
     * upstream's `it.name == apiName`. Returns `null` for unknown names.
     */
    getByName(name) {
        if (typeof name !== 'string')
            return null;
        return this.#providers.find((p) => p.name === name) ?? null;
    }
    /**
     * Resolves a provider by URL (hardened algorithm, D17 — see module docs):
     *
     *  Stage 1, newest-first: prefix check (full normalized URL + boundary
     *  guard) OR same-host/subdomain check (path-less patterns, host-scoped).
     *  Stage 2, newest-first: structural mirror rule — the pattern host's labels
     *  align to the tail of the URL host's labels with ONLY the final label
     *  (TLD) differing. The mirror `score` is informational (host-only partial
     *  ratio), not a gate.
     *
     * Never throws — malformed, empty, or unknown URLs return `null`. A hostname
     * appearing only in the path or query can never select a provider.
     */
    getByUrl(url) {
        const normalized = normalizeProviderUrl(url);
        if (normalized === '')
            return null;
        const urlHost = extractUrlHost(normalized);
        // Stage 1 — deterministic host matching, newest-first (reverse order).
        for (let i = this.#providers.length - 1; i >= 0; i--) {
            const provider = this.#providers[i];
            const pattern = normalizeProviderUrl(provider.mainUrl);
            if (pattern === '')
                continue; // cannot happen post-validation; defensive
            // (a) Prefix: full-URL prefix with boundary guard.
            if (normalized.startsWith(pattern) && hasPrefixBoundary(normalized, pattern.length)) {
                return { method: 'prefix', provider };
            }
            // (b) Same host / label-boundary subdomain — path-less patterns only.
            if (!pattern.includes('/') && urlHost !== null) {
                const patternHost = extractUrlHost(pattern);
                if (patternHost !== null &&
                    (urlHost === patternHost || urlHost.endsWith('.' + patternHost))) {
                    return { method: 'subdomain', provider };
                }
            }
        }
        // Stage 2 — structural mirror rule, newest-first (D17).
        if (urlHost !== null) {
            for (let i = this.#providers.length - 1; i >= 0; i--) {
                const provider = this.#providers[i];
                const pattern = normalizeProviderUrl(provider.mainUrl);
                if (pattern.includes('/'))
                    continue; // path-bearing patterns match by prefix only
                const patternHost = extractUrlHost(pattern);
                if (patternHost === null || patternHost === urlHost)
                    continue;
                const patternLabels = patternHost.split('.');
                if (patternLabels.length < 2)
                    continue; // need name + TLD to mirror
                const urlLabels = urlHost.split('.');
                if (urlLabels.length < patternLabels.length)
                    continue;
                const tail = urlLabels.slice(urlLabels.length - patternLabels.length);
                const nameLabelsEqual = patternLabels
                    .slice(0, -1)
                    .every((label, index) => tail[index] === label);
                const tldDiffers = tail[tail.length - 1] !== patternLabels[patternLabels.length - 1];
                if (nameLabelsEqual && tldDiffers) {
                    return {
                        method: 'mirror',
                        provider,
                        score: levenshteinPartialRatio(patternHost, urlHost),
                    };
                }
            }
        }
        return null;
    }
    /**
     * Snapshot of the registered providers in registration order (oldest
     * first). The returned array is a copy; mutating it does not affect the
     * registry.
     */
    list() {
        return [...this.#providers];
    }
    /** Number of registered providers. */
    get size() {
        return this.#providers.length;
    }
}
//# sourceMappingURL=registry.js.map