/**
 * Mock fixture provider — a REAL implementation of the Phase 1 `Provider`
 * contract backed entirely by committed fixture data (see ./catalog.ts).
 *
 * Purpose (Phase 5): every app page — home, search, details, watch — works
 * deterministically with no real content provider and no network access.
 * The provider follows the contract faithfully so the SAME host machinery
 * (error boundary, timeouts, boundary validation, kill switch, observability,
 * link pipeline) is exercised end to end:
 *
 *  - methods throw freely (the host owns errors, D13) — e.g. malformed page
 *    numbers below 1;
 *  - `loadLinks` streams via the `emit` callback like a real provider;
 *  - unknown data tokens return `false` ("not handled") instead of throwing;
 *  - no JS execution, no fetching, no registry side effects.
 *
 * Registration: ONLY by the app runtime (src/server/catalog/runtime.ts) and
 * tests. This module is never auto-registered by the library.
 */

import type {
  CallContext,
  LinkOrSubtitleEmit,
  Provider,
} from '../../../core/provider';
import type { HomePageResponse, SearchPage, SearchResponse } from '../../../core/types';
import {
  HOME_ROWS,
  MOCK_MAIN_URL,
  MOCK_PROVIDER_NAME,
  linkFixturesFor,
  loadFixtures,
  searchFixtures,
} from './catalog';

export function createMockProvider(): Provider {
  return {
    name: MOCK_PROVIDER_NAME,
    mainUrl: MOCK_MAIN_URL,
    lang: 'en',
    tvTypes: ['Movie', 'TvSeries', 'Anime', 'Documentary', 'Live'],

    async getMainPage(
      page: number,
      req: { name: string; data: string },
      _ctx: CallContext,
    ): Promise<HomePageResponse | null> {
      if (!Number.isInteger(page) || page < 1) {
        throw new RangeError(`mock provider: invalid page ${page}`);
      }
      if (page > 1) return null; // single page of rows, like upstream catalogs
      // The catalog layer requests the whole page with the wildcard 'all'
      // (the Phase 1 Provider contract has no row-declaration list, so a
      // caller either names ONE row or asks for everything).
      if (req.name === 'all' || req.data === 'all') {
        return { lists: HOME_ROWS.map((row) => ({ ...row })), hasNext: false };
      }
      const row = HOME_ROWS.find(
        (candidate) => candidate.name === req.name || candidate.name === req.data,
      );
      if (row === undefined) return null;
      return { lists: [row], hasNext: false };
    },

    async search(query: string, page: number, _ctx: CallContext): Promise<SearchPage | null> {
      if (!Number.isInteger(page) || page < 1) {
        throw new RangeError(`mock provider: invalid page ${page}`);
      }
      const trimmed = query.trim();
      if (trimmed.length === 0) return null; // upstream convention: null = nothing to return
      const { items, hasNext } = searchFixtures(trimmed, page);
      return { items, hasNext };
    },

    async quickSearch(query: string, _ctx: CallContext): Promise<SearchResponse[]> {
      const { items } = searchFixtures(query.trim(), 1);
      return items.slice(0, 5);
    },

    async load(url: string, _ctx: CallContext) {
      return loadFixtures(url);
    },

    async loadLinks(data: string, emit: LinkOrSubtitleEmit, _ctx: CallContext): Promise<boolean> {
      const { handled, links, subtitles } = linkFixturesFor(data);
      if (!handled) return false;
      // Stream like a real provider: links first, then subtitles.
      for (const link of links) emit(link);
      for (const subtitle of subtitles) emit(subtitle);
      return true;
    },
  };
}
