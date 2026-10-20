/**
 * Server-side link pipeline (roadmap Phase 2 step 4, D19) — the host-side
 * "resolve once, reuse for the TTL window" layer that mirrors the verified
 * upstream 20-minute link cache (`RepoLinkGenerator.kt:73`).
 *
 * Responsibilities, in order:
 *  1. VALIDATE every `PlaybackLink` / `SubtitleFile` against the Phase 1
 *     Zod schemas (D12 policy: invalid items are dropped and counted, never
 *     crash the stream) — reusing the exact schemas the provider host uses,
 *     so behavior stays consistent with `src/core/provider-host.ts`.
 *  2. NORMALIZE: dedupe links by URL (first occurrence wins), sort by
 *     quality descending (unknown last, stable — `sortUrls` semantics,
 *     `MainAPI.kt:769–771`), dedupe subtitles by NORMALIZED (language, url).
 *  3. CACHE the normalized collection in a bounded TTL cache keyed by
 *     (cache scope, provider name, episode id), with single-flight
 *     de-duplication so concurrent resolutions share one load.
 *
 * Cross-user protection (owner instruction, 2026-10-20): collections whose
 * links carry credential-bearing headers (`authorization`, cookies, API
 * tokens — see {@link CREDENTIAL_HEADER_NAMES}) are NEVER stored under the
 * default shared scope. They are only cached when the caller supplies an
 * explicit per-user `scope`, so one user's credentialed playback result can
 * never be served to another user. Non-credentialed results stay shareable.
 *
 * The pipeline owns NO network access and NO provider logic: `load` does the
 * fetching (typically `provider.loadLinks` through the provider host), the
 * pipeline validates/normalizes/caches the outcome.
 */
import { TtlCache } from '../http/cache';
import { dedupeLinks, sortLinksByQualityDesc } from '../../core/links';
import { PlaybackLinkSchema, SubtitleFileSchema } from '../../core/schemas';
/** Default TTL: mirrors the verified upstream 20-minute link cache. */
export const DEFAULT_LINK_TTL_MS = 20 * 60 * 1000;
/** Default entry cap for the resolved-link cache. */
export const DEFAULT_LINK_CACHE_MAX_ENTRIES = 500;
/** Default byte budget for the resolved-link cache (rough JSON size estimate). */
export const DEFAULT_LINK_CACHE_MAX_BYTES = 8 * 1024 * 1024;
/**
 * Scope used when the caller does not pass one. Results cached under this
 * scope must be credential-free (see {@link linksHaveCredentials}).
 */
export const SHARED_CACHE_SCOPE = 'shared';
/**
 * Playback-link header names that make a link credential-bearing. The
 * comparison is case-insensitive over header NAMES — values are never read.
 */
export const CREDENTIAL_HEADER_NAMES = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
]);
/**
 * True when any link carries a header in {@link CREDENTIAL_HEADER_NAMES}
 * (case-insensitive name match; values are ignored, never inspected).
 */
export function linksHaveCredentials(links) {
    return links.some((link) => {
        if (link.headers === undefined || link.headers === null)
            return false;
        return Object.keys(link.headers).some((name) => CREDENTIAL_HEADER_NAMES.has(name.toLowerCase()));
    });
}
/**
 * Subtitle dedupe key with normalization: language is trimmed and
 * case-folded (BCP-47 tags are case-insensitive: `EN`, `en`, `eN` are the
 * same tag), URLs are trimmed only (paths are case-sensitive). First
 * occurrence wins.
 */
export function dedupeSubtitlesNormalized(subtitles) {
    const seen = new Set();
    const kept = [];
    for (const sub of subtitles) {
        const key = `${sub.language.trim().toLowerCase()}\u0000${sub.url.trim()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        kept.push(sub);
    }
    return kept;
}
/**
 * Validates and normalizes a raw collection: schema-validates every link and
 * subtitle (invalid → dropped, counted — D12), dedupes links first-wins,
 * sorts by quality descending (stable, unknown last), dedupes subtitles by
 * normalized (language, url). Input is never mutated.
 */
export function normalizeLinkCollection(input) {
    let dropped = 0;
    const validLinks = [];
    for (const item of input.links) {
        const checked = PlaybackLinkSchema.safeParse(item);
        if (!checked.success) {
            dropped += 1;
            continue;
        }
        validLinks.push(checked.data);
    }
    // Reuse the Phase 1 helper: first occurrence wins, order preserved.
    const links = dedupeLinks(validLinks);
    const subtitles = [];
    const seenSubtitle = new Set();
    for (const item of input.subtitles) {
        const checked = SubtitleFileSchema.safeParse(item);
        if (!checked.success) {
            dropped += 1;
            continue;
        }
        const key = `${checked.data.language.trim().toLowerCase()}\u0000${checked.data.url.trim()}`;
        if (seenSubtitle.has(key))
            continue;
        seenSubtitle.add(key);
        subtitles.push(checked.data);
    }
    return {
        collection: {
            handled: input.handled === true,
            links: sortLinksByQualityDesc(links),
            subtitles,
            rejectedItems: input.rejectedItems + dropped,
        },
        dropped,
    };
}
/**
 * Bounded, single-flight TTL cache for resolved link collections.
 * In-memory only: entries are lost on restart, and nothing here is
 * persisted or shared across processes (D19 limitations).
 */
export class LinkPipeline {
    #cache;
    #defaultTtlMs;
    #inflight = new Map();
    constructor(options = {}) {
        this.#defaultTtlMs = options.ttlMs ?? DEFAULT_LINK_TTL_MS;
        this.#cache = new TtlCache({
            maxEntries: options.maxEntries ?? DEFAULT_LINK_CACHE_MAX_ENTRIES,
            maxBytes: options.maxBytes ?? DEFAULT_LINK_CACHE_MAX_BYTES,
            sizeOf: estimateCollectionBytes,
        });
    }
    /**
     * Resolves links for (provider, episode): returns the cached collection
     * while it is live, shares one in-flight load across concurrent callers,
     * and otherwise runs `load()` exactly once, validates + normalizes the
     * result, and caches it.
     *
     * Errors from `load()` propagate to EVERY awaiter of that load and are
     * never cached (a failed resolution is retried on the next call).
     */
    async resolve(request) {
        const { key, scope } = cacheKeyFor(request);
        const cached = this.#cache.get(key);
        if (cached !== undefined) {
            return { collection: cached, source: 'hit' };
        }
        const existing = this.#inflight.get(key);
        if (existing !== undefined) {
            return { collection: await existing, source: 'inflight' };
        }
        const load = this.#runLoad(request, key, scope);
        this.#inflight.set(key, load);
        try {
            const collection = await load;
            return { collection, source: 'miss' };
        }
        finally {
            this.#inflight.delete(key);
        }
    }
    /** Drops one cached entry (default scope when omitted). */
    invalidate(providerName, episodeId, scope) {
        const key = JSON.stringify([scope ?? SHARED_CACHE_SCOPE, providerName, episodeId]);
        return this.#cache.delete(key);
    }
    /** Drops every cached entry of one provider (all scopes). */
    invalidateProvider(providerName) {
        let removed = 0;
        for (const key of this.#cache.keys()) {
            if (keyMatchesProvider(key, providerName)) {
                this.#cache.delete(key);
                removed += 1;
            }
        }
        return removed;
    }
    /** Drops everything (all scopes, all providers, in-flight loads keep running). */
    clear() {
        this.#cache.clear();
    }
    /** Rough memory gauge for tests/monitoring — no entry payloads. */
    stats() {
        return {
            entries: this.#cache.size,
            bytes: this.#cache.bytes,
            inflight: this.#inflight.size,
        };
    }
    #runLoad(request, key, scope) {
        const promise = (async () => {
            const raw = await request.load();
            const { collection } = normalizeLinkCollection(raw);
            const ttlMs = request.ttlMs ?? this.#defaultTtlMs;
            const shareable = !(scope === SHARED_CACHE_SCOPE && linksHaveCredentials(collection.links));
            if (shareable) {
                this.#cache.set(key, collection, ttlMs);
            }
            return collection;
        })();
        return promise;
    }
}
/* -------------------------------------------------------------------------- */
/* Internals                                                                    */
/* -------------------------------------------------------------------------- */
function cacheKeyFor(request) {
    const scope = request.scope ?? SHARED_CACHE_SCOPE;
    // JSON array key: collision-free delimiters, cheap to parse for invalidation.
    return {
        key: JSON.stringify([scope, request.providerName, request.episodeId]),
        scope,
    };
}
function keyMatchesProvider(key, providerName) {
    try {
        const parsed = JSON.parse(key);
        return (Array.isArray(parsed) && parsed.length === 3 && parsed[1] === providerName);
    }
    catch {
        return false;
    }
}
/** Rough byte estimate: JSON length of the collection (strings are ASCII-ish here). */
function estimateCollectionBytes(collection) {
    return JSON.stringify(collection).length;
}
//# sourceMappingURL=pipeline.js.map