/**
 * The provider registry — roadmap Phase 1 task 3, the clean-room TypeScript
 * encoding of the URL-based provider resolution verified upstream (see
 * `docs/provider-architecture.md` §3.1 and §5.2, `ExtractorApi.kt:926–986` and
 * `MainAPI.kt:167` at `recloudstream/cloudstream@eb962b4`).
 *
 * Matching algorithm (two stages, both scanning newest-first):
 *
 *  1. **Prefix stage.** The normalized provider `mainUrl` must be a prefix of
 *     the normalized input URL, AND the character right after the prefix must
 *     be a boundary (end of string, `/`, `?`, `#` or `:`) — so `example.com`
 *     matches `example.com/watch` and `example.com:8080` but never
 *     `example.com.evil.io`. The first provider that matches wins; the scan
 *     runs in reverse registration order, so the newest-registered provider
 *     takes precedence over older matching providers (upstream:
 *     "Iterate in reverse order so the new registered ExtractorApi takes
 *     priority", `ExtractorApi.kt:936`).
 *  2. **Mirror stage** (only when NO provider prefix-matched). Fuzzy
 *     mirror-domain fallback: the newest-first scan returns the first provider
 *     whose normalized `mainUrl` scores a Levenshtein partial-ratio of
 *     strictly more than 80 (0–100) against the normalized URL — mirroring the
 *     documented upstream fallback (`Levenshtein.partialRatio(mainUrl, url) >
 *     80`, `ExtractorApi.kt:952–966`, comment: "this is to match mirror
 *     domains - like example.com, example.net").
 *
 * Documented divergences from upstream (recorded in `docs/decisions.md` D16):
 *
 *  - **Consistent normalization on BOTH sides.** Upstream lowercases only the
 *    incoming URL and strips only `https:` (its `schemaStripRegex` misses
 *    `http:`). Here both the URL and every `mainUrl` go through the same
 *    {@link normalizeProviderUrl}: trim, lowercase, strip `https://` /
 *    `http://` / protocol-relative `//` / bare `https:`-style scheme, strip one
 *    leading `www.`, strip trailing slashes.
 *  - **Prefix boundary check.** Upstream prefix matching is a naive
 *    `startsWith`; the boundary check here is deliberate hardening so a
 *    partial-domain prefix cannot hijack another site.
 *  - **Fuzzy over normalized strings.** Upstream compares raw strings; with
 *    shared scheme prefixes inflating partial-ratio scores. Normalized inputs
 *    are strictly more conservative (no common-prefix inflation).
 *  - **No network unshortening.** Upstream resolves URL shorteners first
 *    (`unshortenLinkSafe`, a network call). Phase 1 is network-free; link
 *    unshortening becomes a Phase 2 pre-step that runs BEFORE registry lookup.
 *
 * Inherent property of the documented fallback (worth stating for reviewers):
 * any URL that CONTAINS a provider's normalized `mainUrl` verbatim scores a
 * partial ratio of 100 — so the boundary check routes such URLs from the
 * prefix stage to the mirror stage (or decides WHICH provider wins a race),
 * it cannot suppress the match entirely. Upstream behaves the same way
 * overall: its naive prefix match resolves `example.com.evil.io` to the
 * `example.com` provider too. Suppression of look-alike domains is not a
 * registry concern; it belongs to the Phase 2 SSRF/content guard.
 *
 * Safety properties (pinned by tests):
 *  - Lookups NEVER throw: malformed, empty, or unknown URLs return `null`.
 *    No `URL` parsing is used — matching is pure string logic, so no runtime
 *    exception paths exist in the lookup path.
 *  - Registration is fail-fast (first-party providers only; a broken
 *    registration is a programming error, rejected with `TypeError`).
 *  - No dynamic loading: providers are first-party `Provider` objects handed
 *    in by this codebase. No `.cs3` loading, no external code execution, no
 *    network I/O happens anywhere in this module.
 */
import type { Provider } from './provider';
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
export declare function normalizeProviderUrl(input: unknown): string;
/**
 * Similarity threshold for the mirror-domain fallback, on a 0–100 scale.
 * Mirrors the upstream constant: a match requires a score STRICTLY greater
 * than 80 (`ExtractorApi.kt:959–961`). Deliberately NOT configurable —
 * configurability invites threshold drift away from the documented behavior.
 */
export declare const MIRROR_MATCH_THRESHOLD = 80;
/**
 * Levenshtein-based similarity ratio (0–100) between two equal-ish strings,
 * using the same normalization upstream's `Levenshtein.ratio` uses: an
 * edit-distance where substitution costs 2 (= delete + insert), scored as
 * `(lenA + lenB - distance) / (lenA + lenB) * 100`. Two empty strings are
 * 100; one empty string scores 0.
 */
export declare function levenshteinRatio(a: string, b: string): number;
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
export declare function levenshteinPartialRatio(pattern: string, text: string): number;
/** The provider matched because its normalized `mainUrl` prefixes the URL. */
export interface RegistryPrefixMatch {
    readonly method: 'prefix';
    readonly provider: Provider;
}
/**
 * The provider matched via the mirror-domain fallback. `score` is the
 * partial-ratio of the WINNING provider (not necessarily the best score in
 * the registry — the newest-first scan stops at the first provider over the
 * threshold, mirroring upstream).
 */
export interface RegistryMirrorMatch {
    readonly method: 'mirror';
    readonly provider: Provider;
    readonly score: number;
}
export type RegistryUrlMatch = RegistryPrefixMatch | RegistryMirrorMatch;
/**
 * Outcome of {@link ProviderRegistry.register}.
 *  - `added` — new provider appended (newest position);
 *  - `existing` — the IDENTICAL instance was already registered (no-op);
 *  - `replaced` — a different instance with the same `name` replaced it
 *    (mirrors the upstream clone-site override concept, `MainAPI.kt:506–520`);
 *    the replacement takes the newest position.
 */
export type RegistryRegistration = 'added' | 'existing' | 'replaced';
/**
 * Typed, ordered provider registry for the {@link Provider} contract — the
 * web equivalent of upstream's `allProviders` list + `getApiFromNameNull` /
 * `getApiFromUrlNull` lookups (MainAPI.kt:115–176) with the extractor-style
 * newest-wins matching semantics (ExtractorApi.kt:926–986, see module docs).
 */
export declare class ProviderRegistry {
    #private;
    /**
     * Registers a provider. Fail-fast on invalid registrations (first-party
     * code contract): a provider must be an object with a non-empty `name`,
     * a `mainUrl` that is non-empty after normalization (an empty pattern
     * would prefix-match EVERYTHING), and callable lifecycle methods.
     *
     * See {@link RegistryRegistration} for duplicate-name behavior.
     */
    register(provider: Provider): RegistryRegistration;
    /**
     * Removes a provider by name or by instance. Returns whether anything was
     * removed. Unknown names are safe no-ops.
     */
    unregister(providerOrName: Provider | string): boolean;
    /**
     * Resolves a provider by exact display name (upstream `getApiFromNameNull`,
     * MainAPI.kt:155–163). Name comparison is exact and case-sensitive, like
     * upstream's `it.name == apiName`. Returns `null` for unknown names.
     */
    getByName(name: unknown): Provider | null;
    /**
     * Resolves a provider by URL: newest-wins prefix matching, then the
     * conservative mirror-domain fallback (see module docs). Never throws —
     * malformed, empty, or unknown URLs return `null`.
     */
    getByUrl(url: unknown): RegistryUrlMatch | null;
    /**
     * Snapshot of the registered providers in registration order (oldest
     * first). The returned array is a copy; mutating it does not affect the
     * registry.
     */
    list(): readonly Provider[];
    /** Number of registered providers. */
    get size(): number;
}
//# sourceMappingURL=registry.d.ts.map