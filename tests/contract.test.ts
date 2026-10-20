/**
 * Contract tests: pin the vocabulary sizes (upstream enum members), the
 * LoadResponse discriminated union, and — critically — the agreement between
 * the Zod boundary schemas and the hand-written interfaces in types.ts.
 * The agreement is asserted at COMPILE TIME by assigning parsed samples to the
 * interface types: if a schema ever becomes looser/narrower than the interface
 * in the "validated data must satisfy the contract" direction, `tsc` fails.
 */

import { describe, expect, it } from 'vitest';

import {
  DUB_STATUSES,
  PLAYBACK_LINK_TYPES,
  SEARCH_QUALITIES,
  TV_TYPES,
  AnimeLoadResponseSchema,
  EpisodeSchema,
  HomePageListSchema,
  HomePageResponseSchema,
  LoadResponseSchema,
  LiveStreamLoadResponseSchema,
  MovieLoadResponseSchema,
  PlaybackLinkSchema,
  SearchPageSchema,
  SearchResponseSchema,
  SubtitleFileSchema,
  TvSeriesLoadResponseSchema,
  TvTypeSchema,
} from '../src/core';
import type {
  AnimeLoadResponse,
  Episode,
  HomeRow,
  HomePageResponse,
  LoadResponse,
  MovieLoadResponse,
  PlaybackLink,
  SearchPage,
  SearchResponse,
  SubtitleFile,
  TvSeriesLoadResponse,
} from '../src/core';

const BASE_RESPONSE = {
  name: 'Big Buck Bunny',
  url: 'https://example.com/bbb',
  providerName: 'test-provider',
  type: 'Movie',
} as const;

describe('contract vocabulary (upstream enum pinning)', () => {
  it('pins TvType to the 18 upstream members (MainAPI.kt:1120)', () => {
    expect(TV_TYPES).toEqual([
      'Movie',
      'AnimeMovie',
      'TvSeries',
      'Cartoon',
      'Anime',
      'OVA',
      'Torrent',
      'Documentary',
      'AsianDrama',
      'Live',
      'NSFW',
      'Others',
      'Music',
      'AudioBook',
      'CustomMedia',
      'Audio',
      'Podcast',
      'Video',
    ]);
  });

  it('pins DubStatus to Dubbed|Subbed (MainAPI.kt:905)', () => {
    expect(DUB_STATUSES).toEqual(['Dubbed', 'Subbed']);
  });

  it('pins SearchQuality members (MainAPI.kt:1303)', () => {
    expect(SEARCH_QUALITIES).toContain('FullHD');
    expect(SEARCH_QUALITIES).toHaveLength(9);
  });

  it('excludes torrent/magnet/DRM from v1 playback link types (D7/D11)', () => {
    expect(PLAYBACK_LINK_TYPES).toEqual(['video', 'hls', 'dash']);
  });

  it('rejects values outside the vocabulary', () => {
    expect(TvTypeSchema.safeParse('TVShow').success).toBe(false);
    expect(TvTypeSchema.safeParse('movie').success).toBe(false); // case-sensitive
  });
});

describe('schema/type agreement (compile-time pinning)', () => {
  it('parsed payloads are assignable to the hand-written interfaces', () => {
    // If any of these fail to compile, a schema drifted away from its interface.
    const episode: Episode = EpisodeSchema.parse({ data: 'opaque-payload' });
    const search: SearchResponse = SearchResponseSchema.parse({
      name: 'X',
      url: 'https://example.com/x',
      providerName: 'p',
      type: 'Movie',
    });
    const home: HomePageResponse = HomePageResponseSchema.parse({
      lists: [{ name: 'Row', items: [] }],
      hasNext: false,
    });
    const row: HomeRow = HomePageListSchema.parse({ name: 'Row', items: [] });
    const page: SearchPage = SearchPageSchema.parse({ items: [], hasNext: true });
    const link: PlaybackLink = PlaybackLinkSchema.parse({
      source: 'srv',
      name: 'Server',
      url: 'https://cdn/v.mp4',
      type: 'video',
      quality: null,
    });
    const sub: SubtitleFile = SubtitleFileSchema.parse({
      url: 'https://cdn/sub.vtt',
      language: 'en',
    });

    expect(episode.data).toBe('opaque-payload');
    expect(search.type).toBe('Movie');
    expect(home.lists).toHaveLength(1);
    expect(row.name).toBe('Row');
    expect(page.hasNext).toBe(true);
    expect(link.quality).toBeNull();
    expect(sub.language).toBe('en');
  });

  it('parsed LoadResponse variants are assignable, including the anime dub map', () => {
    const movie: MovieLoadResponse = MovieLoadResponseSchema.parse({
      ...BASE_RESPONSE,
      kind: 'movie',
      dataUrl: 'https://cdn/bbb.mp4',
    });
    const tv: TvSeriesLoadResponse = TvSeriesLoadResponseSchema.parse({
      ...BASE_RESPONSE,
      kind: 'tvSeries',
      episodes: [{ data: 'e1', season: 1, episode: 1 }],
    });
    const anime: AnimeLoadResponse = AnimeLoadResponseSchema.parse({
      ...BASE_RESPONSE,
      type: 'Anime',
      kind: 'anime',
      episodes: {
        Subbed: [{ data: 's1' }],
        Dubbed: [{ data: 'd1' }],
      },
    });
    const live: LoadResponse = LiveStreamLoadResponseSchema.parse({
      ...BASE_RESPONSE,
      type: 'Live',
      kind: 'liveStream',
      dataUrl: 'https://cdn/live.m3u8',
    });

    expect(movie.kind).toBe('movie');
    expect(tv.episodes[0]?.episode).toBe(1);
    expect(anime.episodes.Subbed).toHaveLength(1);
    expect(live.kind).toBe('liveStream');
  });
});

describe('LoadResponse discriminated union', () => {
  it('discriminates by kind at runtime', () => {
    const movie = LoadResponseSchema.parse({ ...BASE_RESPONSE, kind: 'movie', dataUrl: 'x' });
    const tv = LoadResponseSchema.parse({
      ...BASE_RESPONSE,
      kind: 'tvSeries',
      episodes: [],
    });
    if (movie.kind === 'movie') {
      expect(movie.dataUrl).toBe('x'); // narrowed access compiles AND runs
    } else {
      throw new Error('discriminant narrowing failed');
    }
    expect(tv.kind).toBe('tvSeries');
  });

  it('rejects unknown kinds (torrent excluded in v1) and missing variant fields', () => {
    expect(LoadResponseSchema.safeParse({ ...BASE_RESPONSE, kind: 'torrent' }).success).toBe(false);
    expect(
      LoadResponseSchema.safeParse({ ...BASE_RESPONSE, kind: 'movie' }).success,
    ).toBe(false); // dataUrl missing
    expect(
      LoadResponseSchema.safeParse({ ...BASE_RESPONSE, kind: 'tvSeries' }).success,
    ).toBe(false); // episodes missing
  });
});

describe('validation posture (D12)', () => {
  it('is non-coercive: wrong primitive types fail', () => {
    expect(
      EpisodeSchema.safeParse({ data: 'x', season: '1' }).success,
    ).toBe(false); // string season must not be coerced
    expect(
      PlaybackLinkSchema.safeParse({
        source: 's',
        name: 'n',
        url: 'u',
        type: 'video',
        quality: '1080',
      }).success,
    ).toBe(false); // numeric quality as string must fail
  });

  it('requires explicit quality on links (null = unknown, not missing)', () => {
    expect(
      PlaybackLinkSchema.safeParse({
        source: 's',
        name: 'n',
        url: 'u',
        type: 'video',
        // quality omitted
      }).success,
    ).toBe(false);
    expect(
      PlaybackLinkSchema.safeParse({
        source: 's',
        name: 'n',
        url: 'u',
        type: 'video',
        quality: null,
      }).success,
    ).toBe(true);
  });

  it('keeps opaque fields opaque (any string allowed)', () => {
    expect(EpisodeSchema.safeParse({ data: '{"any":"json blob"}' }).success).toBe(true);
    expect(EpisodeSchema.safeParse({ data: '' }).success).toBe(true); // e.g. unreleased episode
  });

  it('rejects empty required urls', () => {
    expect(
      SearchResponseSchema.safeParse({ name: 'x', url: '', providerName: 'p', type: 'Movie' })
        .success,
    ).toBe(false);
  });

  it('bounds score to the 0-10 normalized range', () => {
    const base = { name: 'x', url: 'u', providerName: 'p', type: 'Movie' };
    expect(SearchResponseSchema.safeParse({ ...base, score: 11 }).success).toBe(false);
    expect(SearchResponseSchema.safeParse({ ...base, score: -1 }).success).toBe(false);
    expect(SearchResponseSchema.safeParse({ ...base, score: 8.5 }).success).toBe(true);
  });
});
