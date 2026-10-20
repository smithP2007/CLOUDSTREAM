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
 * The provider matched because the URL host IS the pattern host or a
 * label-boundary subdomain of it (path-less patterns only). Safe by DNS
 * delegation: only the pattern's operator can publish such hosts.
 */
export interface RegistrySubdomainMatch {
    readonly method: 'subdomain';
    readonly provider: Provider;
}
/**
 * The provider matched via the structural mirror rule (same domain name,
 * different final label/TLD — the documented upstream intent). `score` is an
 * INFORMATIONAL Levenshtein partial ratio over hosts only (0–100); it does
 * NOT gate the match — the structural label rule decides (D17).
 */
export interface RegistryMirrorMatch {
    readonly method: 'mirror';
    readonly provider: Provider;
    readonly score: number;
}
export type RegistryUrlMatch = RegistryPrefixMatch | RegistrySubdomainMatch | RegistryMirrorMatch;
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