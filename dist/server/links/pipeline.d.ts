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
import type { LinkCollection, PlaybackLink, SubtitleFile } from '../../core/types';
/** Default TTL: mirrors the verified upstream 20-minute link cache. */
export declare const DEFAULT_LINK_TTL_MS: number;
/** Default entry cap for the resolved-link cache. */
export declare const DEFAULT_LINK_CACHE_MAX_ENTRIES = 500;
/** Default byte budget for the resolved-link cache (rough JSON size estimate). */
export declare const DEFAULT_LINK_CACHE_MAX_BYTES: number;
/**
 * Scope used when the caller does not pass one. Results cached under this
 * scope must be credential-free (see {@link linksHaveCredentials}).
 */
export declare const SHARED_CACHE_SCOPE = "shared";
/**
 * Playback-link header names that make a link credential-bearing. The
 * comparison is case-insensitive over header NAMES — values are never read.
 */
export declare const CREDENTIAL_HEADER_NAMES: ReadonlySet<string>;
/**
 * True when any link carries a header in {@link CREDENTIAL_HEADER_NAMES}
 * (case-insensitive name match; values are ignored, never inspected).
 */
export declare function linksHaveCredentials(links: readonly PlaybackLink[]): boolean;
/**
 * Subtitle dedupe key with normalization: language is trimmed and
 * case-folded (BCP-47 tags are case-insensitive: `EN`, `en`, `eN` are the
 * same tag), URLs are trimmed only (paths are case-sensitive). First
 * occurrence wins.
 */
export declare function dedupeSubtitlesNormalized(subtitles: readonly SubtitleFile[]): SubtitleFile[];
export interface NormalizedCollection {
    /** Validated + deduped + sorted collection, ready to cache/serve. */
    collection: LinkCollection;
    /** Items dropped by (re-)validation — on top of any already counted upstream. */
    dropped: number;
}
/**
 * Validates and normalizes a raw collection: schema-validates every link and
 * subtitle (invalid → dropped, counted — D12), dedupes links first-wins,
 * sorts by quality descending (stable, unknown last), dedupes subtitles by
 * normalized (language, url). Input is never mutated.
 */
export declare function normalizeLinkCollection(input: LinkCollection): NormalizedCollection;
export interface LinkPipelineOptions {
    /** Cache TTL for resolved collections. Default {@link DEFAULT_LINK_TTL_MS}. */
    ttlMs?: number;
    /** Maximum cached collections. Default {@link DEFAULT_LINK_CACHE_MAX_ENTRIES}. */
    maxEntries?: number;
    /** Byte budget (rough JSON-size estimate). Default {@link DEFAULT_LINK_CACHE_MAX_BYTES}. */
    maxBytes?: number;
}
export type LinkResolveSource = {
    kind: 'miss';
    fresh: true;
} | {
    kind: 'hit';
    fresh: false;
} | {
    kind: 'inflight';
    fresh: false;
};
export interface LinkResolveResult {
    collection: LinkCollection;
    /** Where the collection came from: a fresh load, the TTL cache, or a shared in-flight load. */
    source: LinkResolveSource['kind'];
}
export interface LinkResolveRequest {
    /** Provider identity (registry name — unique per registry). */
    providerName: string;
    /** Opaque episode identity, exactly as the provider issued it. */
    episodeId: string;
    /**
     * Cache scope. Default {@link SHARED_CACHE_SCOPE} (credential-free results
     * only). Pass a per-user identifier to cache credentialed results for that
     * user alone.
     */
    scope?: string;
    /** The actual loader (e.g. provider-host `loadLinks` call). Called at most once per key. */
    load: () => Promise<LinkCollection>;
    /** Per-request TTL override (must be > 0 to store). */
    ttlMs?: number;
}
/**
 * Bounded, single-flight TTL cache for resolved link collections.
 * In-memory only: entries are lost on restart, and nothing here is
 * persisted or shared across processes (D19 limitations).
 */
export declare class LinkPipeline {
    #private;
    constructor(options?: LinkPipelineOptions);
    /**
     * Resolves links for (provider, episode): returns the cached collection
     * while it is live, shares one in-flight load across concurrent callers,
     * and otherwise runs `load()` exactly once, validates + normalizes the
     * result, and caches it.
     *
     * Errors from `load()` propagate to EVERY awaiter of that load and are
     * never cached (a failed resolution is retried on the next call).
     */
    resolve(request: LinkResolveRequest): Promise<LinkResolveResult>;
    /** Drops one cached entry (default scope when omitted). */
    invalidate(providerName: string, episodeId: string, scope?: string): boolean;
    /** Drops every cached entry of one provider (all scopes). */
    invalidateProvider(providerName: string): number;
    /** Drops everything (all scopes, all providers, in-flight loads keep running). */
    clear(): void;
    /** Rough memory gauge for tests/monitoring — no entry payloads. */
    stats(): {
        entries: number;
        bytes: number;
        inflight: number;
    };
}
//# sourceMappingURL=pipeline.d.ts.map