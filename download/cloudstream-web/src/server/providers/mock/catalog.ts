/**
 * Deterministic fixture catalog for the mock provider (Phase 5).
 *
 * EVERY value here is committed fixture data: titles are fictional, posters
 * are locally generated SVGs (public/posters/), and playable links point at
 * the tiny generated media fixtures (see scripts/generate-fixtures.sh, D23)
 * plus a few LAWFUL public test streams with documented provenance.
 *
 * This file contains NO real provider logic and NO network access: it exists
 * so every Phase 5 page works identically without any real content provider
 * (Phase 3 stays gated on the D20 approval process; nothing here weakens
 * that gate — this provider is a UI fixture, registered only by the app
 * runtime, never by the library).
 */

import type {
  Actor,
  Episode,
  HomePageList,
  LoadResponse,
  PlaybackLink,
  SearchResponse,
  SearchQuality,
  SubtitleFile,
  TvType,
} from '../../../core/types';

/** Stable identifier used in app routes (/title/mock-fixtures/...). */
export const MOCK_PROVIDER_ID = 'mock-fixtures';
/** Display name (upstream `apiName` equivalent; unique within the app). */
export const MOCK_PROVIDER_NAME = 'Mock Fixtures';

/** Base URL of the fixture catalog (scoping only — never fetched). */
export const MOCK_MAIN_URL = 'https://fixtures.local';

export function detailUrlFor(slug: string): string {
  return `${MOCK_MAIN_URL}/title/${slug}`;
}

export function slugFromDetailUrl(url: string): string | null {
  const prefix = `${MOCK_MAIN_URL}/title/`;
  if (!url.startsWith(prefix)) return null;
  const slug = url.slice(prefix.length);
  return /^[a-z0-9-]+$/.test(slug) && TITLE_INDEX.has(slug) ? slug : null;
}

/* -------------------------------------------------------------------------- */
/* Shared fixture links                                                       */
/* -------------------------------------------------------------------------- */

/** Tiny locally generated fixtures (D23) served from the app's /public. */
export const FIXTURE_LINKS: readonly PlaybackLink[] = [
  {
    source: 'fixture',
    name: 'MP4 fixture (H.264 + AAC, 180p test pattern)',
    url: '/fixtures/sample-mp4.mp4',
    type: 'video',
    quality: 180,
    headers: null,
    referer: null,
  },
  {
    source: 'fixture',
    name: 'WebM fixture (VP9 + Opus, 180p test pattern)',
    url: '/fixtures/sample-webm.webm',
    type: 'video',
    quality: 180,
    headers: null,
    referer: null,
  },
  {
    source: 'fixture',
    name: 'HLS fixture (MPEG-TS VOD)',
    url: '/fixtures/hls/index.m3u8',
    type: 'hls',
    quality: 180,
    headers: null,
    referer: null,
  },
];

export const FIXTURE_SUBTITLES: readonly SubtitleFile[] = [
  { url: '/fixtures/subs/sample-en.vtt', language: 'en', filename: 'sample-en.vtt' },
  { url: '/fixtures/subs/sample-en.srt', language: 'en (SRT)', filename: 'sample-en.srt' },
];

/**
 * PROVENANCE (lawful demo sources only, mirroring the player demo D23):
 *  - Big Buck Bunny: (c) Blender Foundation | peach.blender.org, CC BY 3.0 —
 *    hosted as public test streams by Mux and Akamai.
 *  - Apple BipBop: Apple's public HLS test stream.
 *  - MDN flower.mp4: CC0 documentation sample.
 * None are bundled or committed; availability is not guaranteed and failures
 * surface as typed player errors.
 */
const LIVE_LINKS: Record<string, readonly PlaybackLink[]> = {
  'harbor-lights-live': [
    {
      source: 'mux-test',
      name: 'Big Buck Bunny — HLS (Mux public test stream)',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      type: 'hls',
      quality: 720,
      headers: null,
      referer: null,
    },
  ],
  'open-airwaves': [
    {
      source: 'apple-test',
      name: 'Apple BipBop — advanced HLS example',
      url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
      type: 'hls',
      quality: 1080,
      headers: null,
      referer: null,
    },
  ],
  'testcard-one': [
    {
      source: 'akamai-test',
      name: 'Big Buck Bunny — DASH (Akamai public test vector)',
      url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
      type: 'dash',
      quality: 720,
      headers: null,
      referer: null,
    },
  ],
};

/**
 * Honest-limitation demo: header-gated link. The player's decision pipeline
 * classifies this `relay-required` WITHOUT fetching (the relay is D8 scope,
 * deliberately not built) — it exists so the UI can demonstrate the typed
 * failure path end to end.
 */
const GATED_VAULT_LINKS: readonly PlaybackLink[] = [
  {
    source: 'fixture',
    name: 'Header-gated HLS (relay-required demo — never fetched)',
    url: 'https://fixtures.local/protected/vault.m3u8',
    type: 'hls',
    quality: 1080,
    headers: { 'X-Demo-Auth': 'required' },
    referer: null,
  },
];

/* -------------------------------------------------------------------------- */
/* Title records                                                              */
/* -------------------------------------------------------------------------- */

interface TitleRecord {
  readonly slug: string;
  readonly name: string;
  readonly type: TvType;
  readonly year: number;
  readonly quality: SearchQuality;
  readonly score: number | null;
  readonly tags: readonly string[];
  readonly durationMin: number | null;
  readonly plot: string;
  readonly linkSet: 'fixtures' | 'gated' | 'meadow-remote' | keyof typeof LIVE_LINKS;
  readonly kind: 'movie' | 'tvSeries' | 'anime' | 'liveStream';
  /** Season/episode layout for series/anime. */
  readonly seasons?: readonly { readonly episodes: number }[];
  readonly dubs?: readonly ('Subbed' | 'Dubbed')[];
}

const T: readonly TitleRecord[] = [
  {
    slug: 'aurora-drift',
    name: 'Aurora Drift',
    type: 'Movie',
    year: 2021,
    quality: 'FullHD',
    score: 8.1,
    tags: ['science fiction', 'space', 'fixture'],
    durationMin: 96,
    plot:
      'A cargo pilot ferrying ice between orbital stations chases a light that should not exist. ' +
      'Served entirely from locally generated fixtures so the browse-to-play flow works offline.',
    linkSet: 'fixtures',
    kind: 'movie',
  },
  {
    slug: 'glasswing',
    name: 'Glasswing',
    type: 'Movie',
    year: 2019,
    quality: 'HD',
    score: 7.4,
    tags: ['drama', 'restoration', 'fixture'],
    durationMin: 104,
    plot:
      'A conservator restores a shattered greenhouse and the letters hidden inside its oldest pane. ' +
      'Fixture playback: MP4, WebM and a local HLS VOD.',
    linkSet: 'fixtures',
    kind: 'movie',
  },
  {
    slug: 'the-quiet-signal',
    name: 'The Quiet Signal',
    type: 'Movie',
    year: 2023,
    quality: 'SD',
    score: 6.9,
    tags: ['mystery', 'radio', 'fixture'],
    durationMin: 88,
    plot:
      'Two amateur radio operators keep a decade-long correspondence with a station that signs off ' +
      'in a language neither speaks. Fixture playback only.',
    linkSet: 'fixtures',
    kind: 'movie',
  },
  {
    slug: 'paper-lanterns',
    name: 'Paper Lanterns',
    type: 'Movie',
    year: 2018,
    quality: 'HD',
    score: 7.8,
    tags: ['family', 'festival', 'fixture'],
    durationMin: 91,
    plot:
      'Three generations of a lamp-maker family prepare for the one night a year their street goes ' +
      'dark on purpose. Fixture playback only.',
    linkSet: 'fixtures',
    kind: 'movie',
  },
  {
    slug: 'silt-and-signal',
    name: 'Silt & Signal',
    type: 'Documentary',
    year: 2022,
    quality: 'SD',
    score: 7.0,
    tags: ['documentary', 'rivers', 'fixture'],
    durationMin: 52,
    plot:
      'Hydrologists read a riverbed like a tape: every flood season leaves a track. Fixture playback only.',
    linkSet: 'fixtures',
    kind: 'movie',
  },
  {
    slug: 'the-long-static',
    name: 'The Long Static',
    type: 'Documentary',
    year: 2020,
    quality: 'HD',
    score: 7.2,
    tags: ['documentary', 'archives', 'fixture'],
    durationMin: 61,
    plot:
      'What happens to television between the channels? A tour of dead air, test cards and the people ' +
      'who keep transmitters warm. Fixture playback only.',
    linkSet: 'fixtures',
    kind: 'movie',
  },
  {
    slug: 'meadow-loop',
    name: 'Meadow Loop',
    type: 'Movie',
    year: 2015,
    quality: 'SD',
    score: 6.5,
    tags: ['nature', 'cc0', 'fixture'],
    durationMin: 1,
    plot:
      'A one-minute nature loop streamed from MDN\u2019s CC0 documentation sample (flower.mp4). ' +
      'Remote public test asset \u2014 availability is not guaranteed.',
    linkSet: 'meadow-remote',
    kind: 'movie',
  },
  {
    slug: 'northgate',
    name: 'Northgate',
    type: 'TvSeries',
    year: 2022,
    quality: 'FullHD',
    score: 8.4,
    tags: ['crime', 'series', 'fixture'],
    durationMin: 45,
    plot:
      'A harbor precinct\u2019s cold-case unit reopens the file that closed the precinct itself. ' +
      'Episodes stream from local fixtures.',
    linkSet: 'fixtures',
    kind: 'tvSeries',
    seasons: [{ episodes: 3 }, { episodes: 3 }],
  },
  {
    slug: 'harbor-lights',
    name: 'Harbor Lights',
    type: 'TvSeries',
    year: 2021,
    quality: 'HD',
    score: 7.5,
    tags: ['drama', 'series', 'fixture'],
    durationMin: 38,
    plot:
      'The night shift of a small ferry terminal, told across one tide-bound week. Episodes stream ' +
      'from local fixtures.',
    linkSet: 'fixtures',
    kind: 'tvSeries',
    seasons: [{ episodes: 4 }],
  },
  {
    slug: 'starling-courier',
    name: 'Starling Courier',
    type: 'Anime',
    year: 2023,
    quality: 'FullHD',
    score: 8.6,
    tags: ['anime', 'adventure', 'fixture'],
    durationMin: 24,
    plot:
      'A courier flock delivers letters across an archipelago where the wind keeps the addresses. ' +
      'Subbed and Dubbed episode lists exercise the anime contract shape.',
    linkSet: 'fixtures',
    kind: 'anime',
    seasons: [{ episodes: 3 }],
    dubs: ['Subbed', 'Dubbed'],
  },
  {
    slug: 'inkfall',
    name: 'Inkfall',
    type: 'Anime',
    year: 2020,
    quality: 'HD',
    score: 7.9,
    tags: ['anime', 'fantasy', 'fixture'],
    durationMin: 24,
    plot:
      'An apprentice scribe discovers her spilled ink keeps redrawing the map of a country that has ' +
      'not happened yet. Subbed episodes only.',
    linkSet: 'fixtures',
    kind: 'anime',
    seasons: [{ episodes: 3 }],
    dubs: ['Subbed'],
  },
  {
    slug: 'harbor-lights-live',
    name: 'Harbor Lights Live',
    type: 'Live',
    year: 2024,
    quality: 'HD',
    score: null,
    tags: ['live', 'hls', 'authorized demo'],
    durationMin: null,
    plot:
      'A 24/7 "harbor cam" channel simulated with the Big Buck Bunny HLS test stream hosted publicly ' +
      'by Mux (Blender Foundation, CC BY 3.0). Availability is not guaranteed.',
    linkSet: 'harbor-lights-live',
    kind: 'liveStream',
  },
  {
    slug: 'open-airwaves',
    name: 'Open Airwaves',
    type: 'Live',
    year: 2024,
    quality: 'FullHD',
    score: null,
    tags: ['live', 'hls', 'authorized demo'],
    durationMin: null,
    plot:
      'A public-broadcast test channel simulated with Apple\u2019s public BipBop HLS example stream. ' +
      'Availability is not guaranteed.',
    linkSet: 'open-airwaves',
    kind: 'liveStream',
  },
  {
    slug: 'testcard-one',
    name: 'Testcard One',
    type: 'Live',
    year: 2024,
    quality: 'HD',
    score: null,
    tags: ['live', 'dash', 'authorized demo'],
    durationMin: null,
    plot:
      'A DASH test channel streaming the Akamai-hosted Big Buck Bunny test vector (Blender Foundation, ' +
      'CC BY 3.0). Availability is not guaranteed.',
    linkSet: 'testcard-one',
    kind: 'liveStream',
  },
  {
    slug: 'gated-vault',
    name: 'Gated Vault',
    type: 'Movie',
    year: 2024,
    quality: 'FullHD',
    score: null,
    tags: ['demo', 'limitations'],
    durationMin: null,
    plot:
      'An intentionally unplayable entry: its stream requires request headers a browser cannot send. ' +
      'The player reports the typed relay-required explanation and never fetches this URL.',
    linkSet: 'gated',
    kind: 'movie',
  },
];

export const TITLE_INDEX: ReadonlyMap<string, TitleRecord> = new Map(T.map((t) => [t.slug, t]));

const LIVE_LINK_MEADOW: readonly PlaybackLink[] = [
  {
    source: 'mdn',
    name: 'MDN flower — progressive MP4 (CC0)',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    type: 'video',
    quality: 394,
    headers: null,
    referer: null,
  },
];

/* -------------------------------------------------------------------------- */
/* Derived views                                                              */
/* -------------------------------------------------------------------------- */

export function posterUrlFor(slug: string): string {
  return `/posters/${slug}.svg`;
}

function toSearchResponse(record: TitleRecord): SearchResponse {
  return {
    name: record.name,
    url: detailUrlFor(record.slug),
    providerName: MOCK_PROVIDER_NAME,
    type: record.type,
    posterUrl: posterUrlFor(record.slug),
    quality: record.quality,
    score: record.score,
    id: record.slug,
  };
}

export const ALL_SEARCH_RESULTS: readonly SearchResponse[] = T.map(toSearchResponse);

/** Deterministic homepage rows (page 1). */
export const HOME_ROWS: readonly HomePageList[] = [
  {
    name: 'Featured fixtures',
    items: ['aurora-drift', 'northgate', 'starling-courier', 'glasswing', 'inkfall', 'harbor-lights'].map(
      (slug) => toSearchResponse(TITLE_INDEX.get(slug) as TitleRecord),
    ),
    isHorizontalImages: false,
  },
  {
    name: 'Films & documentaries',
    items: [
      'paper-lanterns',
      'the-quiet-signal',
      'silt-and-signal',
      'the-long-static',
      'meadow-loop',
      'glasswing',
    ].map((slug) => toSearchResponse(TITLE_INDEX.get(slug) as TitleRecord)),
    isHorizontalImages: false,
  },
  {
    name: 'Series & anime',
    items: ['northgate', 'harbor-lights', 'starling-courier', 'inkfall'].map((slug) =>
      toSearchResponse(TITLE_INDEX.get(slug) as TitleRecord),
    ),
    isHorizontalImages: false,
  },
  {
    name: 'Authorized live demo streams',
    items: ['harbor-lights-live', 'open-airwaves', 'testcard-one', 'gated-vault'].map((slug) =>
      toSearchResponse(TITLE_INDEX.get(slug) as TitleRecord),
    ),
    isHorizontalImages: false,
  },
];

/** Stable page size for paginated search. */
export const SEARCH_PAGE_SIZE = 6;

export function searchFixtures(
  query: string,
  page: number,
): { items: SearchResponse[]; hasNext: boolean } {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const matches = ALL_SEARCH_RESULTS.filter((item) => {
    if (tokens.length === 0) return true;
    const record = typeof item.id === 'string' ? TITLE_INDEX.get(item.id) : undefined;
    const haystack = `${item.name} ${item.type} ${(record?.tags ?? []).join(' ')}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
  const start = (page - 1) * SEARCH_PAGE_SIZE;
  const items = matches.slice(start, start + SEARCH_PAGE_SIZE);
  return { items, hasNext: start + items.length < matches.length };
}

/* -------------------------------------------------------------------------- */
/* Episodes + load responses                                                  */
/* -------------------------------------------------------------------------- */

/** Fixed air dates (epoch ms) — never Date.now(), tests stay deterministic. */
const AIR_DATE_2022 = Date.UTC(2022, 2, 6, 20, 0, 0);
const AIR_DATE_2023 = Date.UTC(2023, 2, 5, 20, 0, 0);

function buildEpisodes(
  slug: string,
  seasons: readonly { episodes: number }[],
  year: number,
): Episode[] {
  const episodes: Episode[] = [];
  const baseDate = year >= 2023 ? AIR_DATE_2023 : AIR_DATE_2022;
  const week = 7 * 24 * 60 * 60 * 1000;
  for (let season = 1; season <= seasons.length; season += 1) {
    const count = seasons[season - 1]?.episodes ?? 0;
    for (let ep = 1; ep <= count; ep += 1) {
      episodes.push({
        data: `fixtures:episode:${slug}/s${season}e${ep}`,
        name: `Episode ${ep}`,
        season,
        episode: ep,
        posterUrl: posterUrlFor(slug),
        score: null,
        description: `${slug} season ${season} episode ${ep} — fixture stream (MP4/WebM/HLS from the local generated set).`,
        date: baseDate + (season - 1) * 100 * week + (ep - 1) * week,
        runTime: 24 + ((season * ep) % 12),
      });
    }
  }
  return episodes;
}

const CAST_BY_SLUG: Record<string, Actor[]> = {
  'aurora-drift': [
    { name: 'Ingrid Halvorsen', role: 'Pilot Voss', image: null },
    { name: 'Tomas Reyes', role: 'Stationmaster Okafor', image: null },
    { name: 'Ade Okonkwo', role: 'Ice-control chief', image: null },
  ],
  northgate: [
    { name: 'Maren Kold', role: 'Det. Insp. Sandoval', image: null },
    { name: 'Peter Sun', role: 'Sgt. Ferreira', image: null },
  ],
  'starling-courier': [{ name: 'Yuki Amano', role: 'Courier Nell (voice)', image: null }],
};

export function loadFixtures(url: string): LoadResponse | null {
  const slug = slugFromDetailUrl(url);
  if (slug === null) return null;
  const record = TITLE_INDEX.get(slug) as TitleRecord;
  const base = {
    name: record.name,
    url: detailUrlFor(slug),
    providerName: MOCK_PROVIDER_NAME,
    type: record.type,
    posterUrl: posterUrlFor(slug),
    year: record.year,
    plot: record.plot,
    tags: [...record.tags],
    duration: record.durationMin,
    trailers: null,
    recommendations: ALL_SEARCH_RESULTS.filter((item) => item.id !== slug).slice(0, 3),
    actors: CAST_BY_SLUG[slug] !== undefined ? [...CAST_BY_SLUG[slug]] : null,
    comingSoon: false,
    syncData: slug === 'aurora-drift' ? { 'demo-db': `${slug}-001` } : null,
  };
  switch (record.kind) {
    case 'movie':
      return { ...base, kind: 'movie', dataUrl: `fixtures:play:${slug}` };
    case 'liveStream':
      return { ...base, kind: 'liveStream', dataUrl: `fixtures:live:${slug}` };
    case 'tvSeries':
      return {
        ...base,
        kind: 'tvSeries',
        episodes: buildEpisodes(slug, record.seasons ?? [], record.year),
      };
    case 'anime': {
      const episodes = buildEpisodes(slug, record.seasons ?? [], record.year);
      const map: Partial<Record<'Subbed' | 'Dubbed', Episode[]>> = {};
      for (const dub of record.dubs ?? ['Subbed']) map[dub] = episodes;
      return { ...base, kind: 'anime', otherName: null, episodes: map };
    }
  }
}

/** Resolves a data token to (links, subtitles, handled). */
export function linkFixturesFor(data: string): {
  handled: boolean;
  links: readonly PlaybackLink[];
  subtitles: readonly SubtitleFile[];
} {
  // Token shapes: fixtures:play:<slug>, fixtures:live:<slug>,
  // fixtures:episode:<slug>/s<ss>e<ee>. The token is opaque to callers; the
  // provider alone interprets it (mirrors the upstream Episode.data contract).
  const match = /^fixtures:(?:play|live|episode):([^/]+)/.exec(data);
  const slug = match?.[1] ?? null;
  const record = slug === null ? undefined : TITLE_INDEX.get(slug);
  if (record === undefined || slug === null) return { handled: false, links: [], subtitles: [] };
  if (record.linkSet === 'fixtures') {
    return { handled: true, links: FIXTURE_LINKS, subtitles: FIXTURE_SUBTITLES };
  }
  if (record.linkSet === 'gated') {
    return { handled: true, links: GATED_VAULT_LINKS, subtitles: [] };
  }
  if (record.linkSet === 'meadow-remote') {
    return { handled: true, links: LIVE_LINK_MEADOW, subtitles: [] };
  }
  const live = LIVE_LINKS[record.linkSet];
  if (live !== undefined) return { handled: true, links: live, subtitles: [] };
  return { handled: false, links: [], subtitles: [] };
}
