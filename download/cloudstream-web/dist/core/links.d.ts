/**
 * Link-pipeline helpers — the host-side behaviors verified upstream in
 * `RepoLinkGenerator.kt` (dedupe by URL, subtitle dedupe) and `sortUrls`
 * (quality-descending sort, MainAPI.kt:769–771), re-implemented clean-room.
 *
 * Why this module exists (per instruction): these behaviors cannot responsibly
 * live in type declarations alone, and keeping them out of `provider-host.ts`
 * keeps the host focused on error boundary + timeout concerns. Design is
 * deliberately minimal: pure functions + one collector factory (decision
 * recorded in docs/decisions.md D14).
 *
 * Sorting semantics (pinned by tests):
 *  - quality descending, highest first;
 *  - `null` quality (= unknown) always sorts LAST;
 *  - ties (equal quality, or equal unknown) keep emission order — the sort is
 *    stable (ES2019+ `Array.prototype.sort` guarantee) and dedupe keeps the
 *    FIRST occurrence of each URL, so the combined pipeline is deterministic.
 */
import type { LinkCollection, PlaybackLink, SubtitleFile } from './types';
/** Comparator: quality descending; unknown last; ties keep order (stable). */
export declare function compareLinksByQualityDesc(a: PlaybackLink, b: PlaybackLink): number;
/**
 * Returns a NEW array sorted by quality descending (input not mutated).
 * Deterministic for equal or unknown quality: stable sort keeps emission order.
 */
export declare function sortLinksByQualityDesc(links: readonly PlaybackLink[]): PlaybackLink[];
/**
 * Removes links whose `url` was already seen. First occurrence wins, so
 * emission order decides which representation survives (upstream semantics:
 * concurrent-set dedupe, `RepoLinkGenerator.kt:66–69`).
 */
export declare function dedupeLinks(links: readonly PlaybackLink[]): PlaybackLink[];
/**
 * Removes subtitles whose (language, url) pair was already seen.
 * (Upstream additionally de-HTML-ifies and dedupes subtitle *names*,
 * `RepoLinkGenerator.kt:112–134`; name normalization is a Phase 2 concern.)
 */
export declare function dedupeSubtitles(subtitles: readonly SubtitleFile[]): SubtitleFile[];
/**
 * Structural discrimination between the two emit payload kinds. Every valid
 * `SubtitleFile` has `language`; `PlaybackLink` never does. This runs BEFORE
 * schema validation so a malformed item is validated against the schema it
 * most plausibly belongs to and counted as rejected otherwise (D12).
 */
export declare function isSubtitleItem(item: unknown): item is SubtitleFile;
export interface LinkCollector {
    /**
     * Emit-style callback to hand to `Provider.loadLinks`. Never throws into the
     * provider: invalid items are counted (`rejectedItems`) and dropped.
     * Emissions after {@link LinkCollector.close} are dropped silently.
     */
    readonly emit: (item: PlaybackLink | SubtitleFile) => void;
    /** Records the provider's `loadLinks` boolean return. */
    setHandled(handled: boolean): void;
    /** Stops accepting emissions (called by the host when the call settles). */
    close(): void;
    /**
     * Snapshot of the collected result: links deduped then quality-sorted
     * (highest first, unknown last, stable), subtitles deduped per
     * (language, url).
     */
    result(): LinkCollection;
}
/**
 * Creates the collector the host uses to turn the streaming `emit` callbacks
 * into one deterministic {@link LinkCollection}.
 */
export declare function createLinkCollector(): LinkCollector;
//# sourceMappingURL=links.d.ts.map