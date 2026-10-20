// @vitest-environment jsdom
/**
 * Local library store tests (jsdom: real localStorage). The store must be
 * capped, deduped, persistence-tolerant, and subscribe-notify correct.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addRecent,
  EMPTY_LIBRARY,
  getLibrarySnapshot,
  hydrateLibrary,
  isFavorite,
  LIBRARY_STORAGE_KEY,
  removeFavorite,
  removeRecent,
  setLibraryForTests,
  subscribeLibrary,
  toggleFavorite,
} from '../src/app/_lib/library';

const REF = {
  providerId: 'mock-fixtures',
  url: 'https://fixtures.local/title/aurora-drift',
  name: 'Aurora Drift',
  posterUrl: '/posters/aurora-drift.svg',
  type: 'Movie',
};

beforeEach(() => {
  window.localStorage.clear();
  setLibraryForTests(EMPTY_LIBRARY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('favorites', () => {
  it('toggles favorites and exposes membership', () => {
    expect(isFavorite(REF.providerId, REF.url)).toBe(false);
    toggleFavorite(REF);
    expect(isFavorite(REF.providerId, REF.url)).toBe(true);
    expect(getLibrarySnapshot().favorites).toHaveLength(1);
    toggleFavorite(REF);
    expect(isFavorite(REF.providerId, REF.url)).toBe(false);
  });

  it('persists to localStorage and survives re-hydration', () => {
    toggleFavorite(REF);
    expect(JSON.parse(window.localStorage.getItem(LIBRARY_STORAGE_KEY) ?? '{}').favorites).toHaveLength(1);
    setLibraryForTests(EMPTY_LIBRARY);
    hydrateLibrary();
    expect(isFavorite(REF.providerId, REF.url)).toBe(true);
  });

  it('removes by provider+url', () => {
    toggleFavorite(REF);
    removeFavorite(REF.providerId, REF.url);
    expect(getLibrarySnapshot().favorites).toHaveLength(0);
  });

  it('notifies subscribers on change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLibrary(listener);
    toggleFavorite(REF);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('recents', () => {
  it('dedupes per title and keeps the most recent first', () => {
    addRecent(REF, { dataToken: 'fixtures:play:aurora-drift', label: 'S1·E1', watchedAt: 100 });
    addRecent(REF, { dataToken: 'fixtures:play:aurora-drift', label: 'S1·E2', watchedAt: 200 });
    const recents = getLibrarySnapshot().recents;
    expect(recents).toHaveLength(1);
    expect(recents[0]?.label).toBe('S1·E2');
    expect(recents[0]?.watchedAt).toBe(200);
  });

  it('caps recents at 50 entries', () => {
    for (let i = 0; i < 60; i += 1) {
      addRecent(
        { ...REF, url: `https://fixtures.local/title/title-${i}`, name: `T${i}` },
        { watchedAt: i },
      );
    }
    expect(getLibrarySnapshot().recents).toHaveLength(50);
    expect(getLibrarySnapshot().recents[0]?.name).toBe('T59');
  });

  it('removes by provider+url', () => {
    addRecent(REF, {});
    removeRecent(REF.providerId, REF.url);
    expect(getLibrarySnapshot().recents).toHaveLength(0);
  });
});

describe('persistence robustness', () => {
  it('discards unreadable or malformed stored state', () => {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, '{not json');
    hydrateLibrary();
    expect(getLibrarySnapshot()).toEqual(EMPTY_LIBRARY);

    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ favorites: [{ broken: true }], recents: 'nope' }));
    hydrateLibrary();
    expect(getLibrarySnapshot().favorites).toHaveLength(0);
    expect(getLibrarySnapshot().recents).toHaveLength(0);
  });

  it('keeps valid entries with missing optional fields', () => {
    window.localStorage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({
        favorites: [{ ...REF, addedAt: 5 }],
        recents: [{ ...REF, watchedAt: 6 }],
      }),
    );
    hydrateLibrary();
    expect(getLibrarySnapshot().favorites[0]?.addedAt).toBe(5);
    expect(getLibrarySnapshot().recents[0]?.dataToken).toBeNull();
  });
});
