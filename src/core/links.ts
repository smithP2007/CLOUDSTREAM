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

import type {
  LinkCollection,
  PlaybackLink,
  SubtitleFile,
} from './types';

import { PlaybackLinkSchema, SubtitleFileSchema } from './schemas';

/** Sort rank for `quality: null` — strictly below every valid quality (min 0). */
const UNKNOWN_QUALITY_RANK = -1;

/** Comparator: quality descending; unknown last; ties keep order (stable). */
export function compareLinksByQualityDesc(a: PlaybackLink, b: PlaybackLink): number {
  const rankA = a.quality ?? UNKNOWN_QUALITY_RANK;
  const rankB = b.quality ?? UNKNOWN_QUALITY_RANK;
  return rankB - rankA;
}

/**
 * Returns a NEW array sorted by quality descending (input not mutated).
 * Deterministic for equal or unknown quality: stable sort keeps emission order.
 */
export function sortLinksByQualityDesc(links: readonly PlaybackLink[]): PlaybackLink[] {
  return [...links].sort(compareLinksByQualityDesc);
}

/**
 * Removes links whose `url` was already seen. First occurrence wins, so
 * emission order decides which representation survives (upstream semantics:
 * concurrent-set dedupe, `RepoLinkGenerator.kt:66–69`).
 */
export function dedupeLinks(links: readonly PlaybackLink[]): PlaybackLink[] {
  const seen = new Set<string>();
  const kept: PlaybackLink[] = [];
  for (const link of links) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    kept.push(link);
  }
  return kept;
}

/** Dedupe key for subtitles: (language, url) pair — names may legitimately repeat. */
function subtitleKey(sub: SubtitleFile): string {
  return JSON.stringify([sub.language, sub.url]);
}

/**
 * Removes subtitles whose (language, url) pair was already seen.
 * (Upstream additionally de-HTML-ifies and dedupes subtitle *names*,
 * `RepoLinkGenerator.kt:112–134`; name normalization is a Phase 2 concern.)
 */
export function dedupeSubtitles(subtitles: readonly SubtitleFile[]): SubtitleFile[] {
  const seen = new Set<string>();
  const kept: SubtitleFile[] = [];
  for (const sub of subtitles) {
    const key = subtitleKey(sub);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(sub);
  }
  return kept;
}

/**
 * Structural discrimination between the two emit payload kinds. Every valid
 * `SubtitleFile` has `language`; `PlaybackLink` never does. This runs BEFORE
 * schema validation so a malformed item is validated against the schema it
 * most plausibly belongs to and counted as rejected otherwise (D12).
 */
export function isSubtitleItem(item: unknown): item is SubtitleFile {
  return typeof item === 'object' && item !== null && 'language' in item;
}

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
export function createLinkCollector(): LinkCollector {
  let closed = false;
  let handled = false;
  let rejectedItems = 0;
  const rawLinks: PlaybackLink[] = [];
  const rawSubtitles: SubtitleFile[] = [];

  const collector: LinkCollector = {
    emit(item) {
      if (closed) return;
      try {
        if (isSubtitleItem(item)) {
          rawSubtitles.push(SubtitleFileSchema.parse(item));
        } else {
          rawLinks.push(PlaybackLinkSchema.parse(item));
        }
      } catch {
        rejectedItems += 1;
      }
    },
    setHandled(value) {
      handled = value;
    },
    close() {
      closed = true;
    },
    result() {
      return {
        handled,
        links: sortLinksByQualityDesc(dedupeLinks(rawLinks)),
        subtitles: dedupeSubtitles(rawSubtitles),
        rejectedItems,
      };
    },
  };

  return collector;
}
