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
export function normalizeProviderUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  let s = input.trim().toLowerCase();
  s = s.replace(LEADING_SCHEME_SLASHES, '');
  s = s.replace(LEADING_BARE_SCHEME, '');
  if (s.startsWith(WWW_PREFIX)) s = s.slice(WWW_PREFIX.length);
  s = s.replace(TRAILING_SLASHES, '');
  return s;
}

/* -------------------------------------------------------------------------- */
/* Levenshtein partial ratio (mirror-domain fallback scoring)                 */
/* -------------------------------------------------------------------------- */

/**
 * Similarity threshold for the mirror-domain fallback, on a 0–100 scale.
 * Mirrors the upstream constant: a match requires a score STRICTLY greater
 * than 80 (`ExtractorApi.kt:959–961`). Deliberately NOT configurable —
 * configurability invites threshold drift away from the documented behavior.
 */
export const MIRROR_MATCH_THRESHOLD = 80;

/** Inputs longer than this are truncated before fuzzy scoring (bound cost). */
const MAX_FUZZY_INPUT_LENGTH = 2048;

/**
 * Levenshtein-based similarity ratio (0–100) between two equal-ish strings,
 * using the same normalization upstream's `Levenshtein.ratio` uses: an
 * edit-distance where substitution costs 2 (= delete + insert), scored as
 * `(lenA + lenB - distance) / (lenA + lenB) * 100`. Two empty strings are
 * 100; one empty string scores 0.
 */
export function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 100;
  // DP over the shorter string as the row so memory stays O(shorter).
  let rows = a;
  let cols = b;
  if (rows.length < cols.length) [rows, cols] = [cols, rows];

  let prev = new Array<number>(cols.length + 1);
  for (let j = 0; j <= cols.length; j++) prev[j] = j;
  for (let i = 1; i <= rows.length; i++) {
    const cur: number[] = new Array<number>(cols.length + 1);
    cur[0] = i;
    const rowChar = rows[i - 1] ?? '';
    for (let j = 1; j <= cols.length; j++) {
      const up = (prev[j] ?? Number.MAX_SAFE_INTEGER) + 1;
      const left = (cur[j - 1] ?? Number.MAX_SAFE_INTEGER) + 1;
      const diag =
        (prev[j - 1] ?? Number.MAX_SAFE_INTEGER) + (rowChar === cols[j - 1] ? 0 : 2);
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
export function levenshteinPartialRatio(pattern: string, text: string): number {
  if (typeof pattern !== 'string' || typeof text !== 'string') return 0;
  let shorter = pattern;
  let longer = text;
  if (shorter.length > longer.length) [shorter, longer] = [longer, shorter];
  if (shorter.length === 0) return longer.length === 0 ? 100 : 0;
  shorter = shorter.slice(0, MAX_FUZZY_INPUT_LENGTH);
  longer = longer.slice(0, MAX_FUZZY_INPUT_LENGTH);

  let best = 0;
  for (let start = 0; start + shorter.length <= longer.length; start++) {
    const score = levenshteinRatio(shorter, longer.slice(start, start + shorter.length));
    if (score > best) {
      best = score;
      if (best === 100) break; // cannot improve
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Match results                                                              */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

/** Characters that may legitimately follow a `mainUrl` prefix inside a URL. */
const PREFIX_BOUNDARIES = new Set(['/', '?', '#', ':']);

function hasPrefixBoundary(normalizedUrl: string, patternLength: number): boolean {
  if (normalizedUrl.length === patternLength) return true; // exact match
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
  readonly #providers: Provider[] = [];

  /**
   * Registers a provider. Fail-fast on invalid registrations (first-party
   * code contract): a provider must be an object with a non-empty `name`,
   * a `mainUrl` that is non-empty after normalization (an empty pattern
   * would prefix-match EVERYTHING), and callable lifecycle methods.
   *
   * See {@link RegistryRegistration} for duplicate-name behavior.
   */
  register(provider: Provider): RegistryRegistration {
    if (typeof provider !== 'object' || provider === null) {
      throw new TypeError('ProviderRegistry.register: provider must be an object');
    }
    if (typeof provider.name !== 'string' || provider.name.trim() === '') {
      throw new TypeError(`ProviderRegistry.register: provider.name must be a non-empty string`);
    }
    if (normalizeProviderUrl(provider.mainUrl) === '') {
      throw new TypeError(
        `ProviderRegistry.register: provider "${provider.name}" has an empty mainUrl after normalization`,
      );
    }
    for (const method of ['getMainPage', 'search', 'load', 'loadLinks'] as const) {
      if (typeof provider[method] !== 'function') {
        throw new TypeError(
          `ProviderRegistry.register: provider "${provider.name}" is missing a callable ${method}()`,
        );
      }
    }
    if (provider.quickSearch !== undefined && typeof provider.quickSearch !== 'function') {
      throw new TypeError(
        `ProviderRegistry.register: provider "${provider.name}" has a non-callable quickSearch`,
      );
    }

    const existingIndex = this.#providers.findIndex((p) => p.name === provider.name);
    if (existingIndex >= 0) {
      if (this.#providers[existingIndex] === provider) return 'existing';
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
  unregister(providerOrName: Provider | string): boolean {
    const index =
      typeof providerOrName === 'string'
        ? this.#providers.findIndex((p) => p.name === providerOrName)
        : this.#providers.indexOf(providerOrName);
    if (index < 0) return false;
    this.#providers.splice(index, 1);
    return true;
  }

  /**
   * Resolves a provider by exact display name (upstream `getApiFromNameNull`,
   * MainAPI.kt:155–163). Name comparison is exact and case-sensitive, like
   * upstream's `it.name == apiName`. Returns `null` for unknown names.
   */
  getByName(name: unknown): Provider | null {
    if (typeof name !== 'string') return null;
    return this.#providers.find((p) => p.name === name) ?? null;
  }

  /**
   * Resolves a provider by URL: newest-wins prefix matching, then the
   * conservative mirror-domain fallback (see module docs). Never throws —
   * malformed, empty, or unknown URLs return `null`.
   */
  getByUrl(url: unknown): RegistryUrlMatch | null {
    const normalized = normalizeProviderUrl(url);
    if (normalized === '') return null;

    // Stage 1 — prefix, newest-first (reverse registration order).
    for (let i = this.#providers.length - 1; i >= 0; i--) {
      const provider = this.#providers[i] as Provider;
      const pattern = normalizeProviderUrl(provider.mainUrl);
      if (pattern === '') continue; // cannot happen post-validation; defensive
      if (normalized.startsWith(pattern) && hasPrefixBoundary(normalized, pattern.length)) {
        return { method: 'prefix', provider };
      }
    }

    // Stage 2 — mirror-domain fallback, newest-first, strict > threshold.
    for (let i = this.#providers.length - 1; i >= 0; i--) {
      const provider = this.#providers[i] as Provider;
      const pattern = normalizeProviderUrl(provider.mainUrl);
      const score = levenshteinPartialRatio(pattern, normalized);
      if (score > MIRROR_MATCH_THRESHOLD) {
        return { method: 'mirror', provider, score };
      }
    }

    return null;
  }

  /**
   * Snapshot of the registered providers in registration order (oldest
   * first). The returned array is a copy; mutating it does not affect the
   * registry.
   */
  list(): readonly Provider[] {
    return [...this.#providers];
  }

  /** Number of registered providers. */
  get size(): number {
    return this.#providers.length;
  }
}
