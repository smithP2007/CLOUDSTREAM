/**
 * Shared test helpers: cancellation-aware sleep, a provider factory with
 * no-op defaults, and small valid fixtures. No production logic lives here.
 */

import type { Provider } from '../src/core';
import type { HomePageResponse, PlaybackLink, SearchPage, SearchResponse, SubtitleFile } from '../src/core';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A promise that settles ONLY via the signal — the pattern signal-respecting
 * providers are expected to use (fetch(url, { signal }) behaves like this).
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Flushes microtasks + one macrotask so detached rejections are observed. */
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export type ProviderOverrides = Partial<Omit<Provider, 'name' | 'mainUrl' | 'lang' | 'tvTypes'>> &
  Partial<Pick<Provider, 'name' | 'mainUrl' | 'lang' | 'tvTypes'>>;

/** Provider factory: every method defaults to a harmless no-op. */
export function makeProvider(overrides: ProviderOverrides = {}): Provider {
  return {
    name: 'test-provider',
    mainUrl: 'https://example.com',
    lang: 'en',
    tvTypes: ['Movie', 'TvSeries', 'Anime'],
    getMainPage: async () => null,
    search: async () => null,
    load: async () => null,
    loadLinks: async () => false,
    ...overrides,
  };
}

export const VALID_SEARCH_ITEM: SearchResponse = {
  name: 'Big Buck Bunny',
  url: 'https://example.com/watch/big-buck-bunny',
  providerName: 'test-provider',
  type: 'Movie',
  posterUrl: 'https://example.com/bbb.jpg',
  quality: 'HD',
  score: 8.1,
};

export const VALID_SEARCH_PAGE: SearchPage = {
  items: [VALID_SEARCH_ITEM],
  hasNext: false,
};

export const VALID_HOME_PAGE: HomePageResponse = {
  lists: [{ name: 'Trending', items: [VALID_SEARCH_ITEM], isHorizontalImages: false }],
  hasNext: false,
};

export function makeLink(overrides: Partial<PlaybackLink> & { url: string }): PlaybackLink {
  return { source: 'srv', name: 'Server', type: 'video', quality: null, ...overrides };
}

export function makeSubtitle(overrides: Partial<SubtitleFile> & { url: string }): SubtitleFile {
  return { language: 'en', ...overrides };
}
