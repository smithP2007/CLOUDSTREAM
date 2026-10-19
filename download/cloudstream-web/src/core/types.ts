/**
 * Core contract value shapes — the clean-room TypeScript encoding of the
 * CloudStream provider architecture documented in `docs/provider-architecture.md`.
 *
 * Provenance rules (see docs/decisions.md D9, D10, D11):
 *  - This file is hand-written. It mirrors *verified upstream semantics* at
 *    `recloudstream/cloudstream@eb962b4`; it contains no upstream code.
 *  - Citations like `MainAPI.kt:2552` point at the upstream source location whose
 *    BEHAVIOR the shape mirrors — they are specification references, not copied code.
 *  - Deliberate naming divergences are documented per-symbol below.
 *
 * Runtime validation of payloads crossing the provider boundary lives in
 * `./schemas.ts` (Zod) and is pinned to these types by tests.
 */

/* -------------------------------------------------------------------------- */
/* Catalog enums (D10: string literal unions, upstream member names)           */
/* -------------------------------------------------------------------------- */

/**
 * Content taxonomy. Mirrors upstream `TvType` (MainAPI.kt:1120), which declares
 * these 18 members with ordinal values 1–18. Ordinals are NOT carried (D10).
 */
export const TV_TYPES = [
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
] as const;

export type TvType = (typeof TV_TYPES)[number];

/**
 * Voice track status for anime catalogs. Mirrors upstream `DubStatus`
 * (MainAPI.kt:905); upstream anime detail responses key their episode lists
 * by this status (`provider-architecture.md` §2.2).
 */
export const DUB_STATUSES = ['Dubbed', 'Subbed'] as const;

export type DubStatus = (typeof DUB_STATUSES)[number];

/**
 * Poster/catalog quality labels shown next to search results. Mirrors upstream
 * `SearchQuality` (MainAPI.kt:1303).
 */
export const SEARCH_QUALITIES = [
  'Cam',
  'CamRip',
  'DVD',
  'SD',
  'HD',
  'FullHD',
  'QuadHD',
  'BlueRay',
  'FourK',
] as const;

export type SearchQuality = (typeof SEARCH_QUALITIES)[number];

/**
 * Delivery technology of a playable link.
 *
 * Mirrors upstream `ExtractorLinkType` (ExtractorApi.kt:417) minus `TORRENT`
 * and `MAGNET`, which upstream itself marks "No support at the moment"
 * (ExtractorApi.kt:427–431) and which have no browser playback path in v1
 * (`web-compatibility-report.md` §5). Upstream also has a DRM link variant
 * (`DrmExtractorLink`, ExtractorApi.kt:591) which is deliberately NOT ported
 * (policy D7: no DRM circumvention).
 */
export const PLAYBACK_LINK_TYPES = ['video', 'hls', 'dash'] as const;

export type PlaybackLinkType = (typeof PLAYBACK_LINK_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Search / homepage                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One search result. Mirrors upstream `SearchResponse` (MainAPI.kt:1406) and
 * its concrete variants (Movie/TvSeries/Anime/Live/Torrent search responses,
 * MainAPI.kt:1555–1727), collapsed into a single shape (D11): the `type`
 * discriminator carries the variant information the UI needs in v1.
 *
 * Divergences from upstream fields (v1 simplifications, recorded for review):
 *  - `posterHeaders` omitted (per-provider request headers for posters arrive
 *    with the Phase 2 HTTP layer).
 *  - upstream `score: Score?` (value + scale pair, MainAPI.kt:919) is flattened
 *    to `score` normalized to a 0–10 range by the provider.
 */
export interface SearchResponse {
  /** Display name. */
  name: string;
  /**
   * Provider-scoped detail URL. Opaque to the host: passed verbatim to
   * {@link Provider.load}. Mirrors upstream `url` usage (MainAPI.kt:665).
   */
  url: string;
  /**
   * Name of the provider that produced this response. Mirrors upstream
   * `apiName` (MainAPI.kt:1406); renamed for clarity (D11).
   */
  providerName: string;
  /** Catalog type; upstream `type` (MainAPI.kt:1406). */
  type: TvType;
  /** Poster image URL, if any. */
  posterUrl?: string | null;
  /** Catalog quality label (upstream `quality`, MainAPI.kt:1303). */
  quality?: SearchQuality | null;
  /** Rating normalized to 0–10 by the provider, when known. */
  score?: number | null;
  /** Provider-scoped stable identifier (e.g. tracker id), if any. */
  id?: string | null;
}

/**
 * A declarative homepage row descriptor a provider advertises. Mirrors
 * upstream `MainPageData` (MainAPI.kt:410).
 */
export interface MainPageData {
  /** Row display name. */
  name: string;
  /** Opaque row payload the provider interprets on `getMainPage`. */
  data: string;
  /** Whether the row renders horizontal (landscape) cards. */
  horizontalImages?: boolean | null;
}

/**
 * Request describing which homepage row to render. Mirrors upstream
 * `MainPageRequest` (MainAPI.kt:416).
 */
export interface MainPageRequest {
  name: string;
  data: string;
  horizontalImages?: boolean | null;
}

/**
 * A named list of results on the homepage. Mirrors upstream `HomePageList`
 * (MainAPI.kt:1282); `HomeRow` is an exported alias (D11).
 */
export interface HomePageList {
  name: string;
  items: SearchResponse[];
  isHorizontalImages?: boolean | null;
}

export type HomeRow = HomePageList;

/**
 * Homepage payload. Mirrors upstream `HomePageResponse` (MainAPI.kt:1270):
 * a set of named rows plus a pagination flag the host uses for infinite scroll
 * (verified paging behavior in `HomeViewModel.kt:247`).
 */
export interface HomePageResponse {
  lists: HomePageList[];
  hasNext: boolean;
}

/**
 * One page of search results. Mirrors upstream `SearchResponseList` (the
 * paginated `search` return type, MainAPI.kt:641).
 */
export interface SearchPage {
  items: SearchResponse[];
  /**
   * True when the provider advertises more pages for this query. The host
   * pages with `search(query, page + 1)` (upstream `SearchViewModel.kt:137`).
   */
  hasNext: boolean;
  /**
   * Cursor-style continuation token for providers that page by key instead of
   * page number (upstream `key` on `SearchResponseList`). Null when unused.
   */
  nextKey?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Detail / episodes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One playable episode entry. Mirrors upstream `Episode` (MainAPI.kt:2552):
 * `data, name, season, episode, posterUrl, score, description, date, runTime`.
 *
 * The `data` field is **opaque**: an URL or an arbitrary string/JSON blob the
 * provider itself interprets during `loadLinks` (verified upstream semantics:
 * `newEpisode(data: T)` serializes any payload to JSON, MainAPI.kt:2629–2637).
 * The host MUST treat it as an opaque token.
 */
export interface Episode {
  /** Opaque provider payload handed back to {@link Provider.loadLinks}. */
  data: string;
  /** Display name, if the provider supplies one. */
  name?: string | null;
  /** 1-based season number, if applicable. */
  season?: number | null;
  /** 1-based episode number within its season, if applicable. */
  episode?: number | null;
  /** Episode thumbnail, if any. */
  posterUrl?: string | null;
  /** Rating normalized to 0–10, when known. */
  score?: number | null;
  /** Episode synopsis / description. */
  description?: string | null;
  /** Air date as epoch milliseconds (upstream `date: Long?` epoch ms). */
  date?: number | null;
  /** Runtime in minutes (upstream `runTime`). */
  runTime?: number | null;
}

/** Minimal cast entry (upstream `Actor`/`ActorData`, MainAPI.kt:1524–1553). */
export interface Actor {
  name: string;
  role?: string | null;
  image?: string | null;
}

/** Minimal trailer descriptor (upstream `TrailerData`, MainAPI.kt:1779). */
export interface TrailerData {
  url: string;
  referer?: string | null;
}

/**
 * Fields shared by every {@link LoadResponse} variant. Mirrors the common
 * fields of upstream `LoadResponse` (MainAPI.kt:1814). Upstream fields deferred
 * beyond v1 (documented, D9): `posterHeaders`, `backgroundPosterUrl`,
 * `logoUrl`, `contentRating`, `uniqueUrl`, `seasonNames`, `showStatus`.
 */
export interface LoadResponseBase {
  /** Display title. */
  name: string;
  /** Provider-scoped detail URL this response was loaded from. */
  url: string;
  /** Producing provider's name (upstream `apiName`). */
  providerName: string;
  /** Catalog type (upstream `type`). */
  type: TvType;
  /** Poster image URL, if any. */
  posterUrl?: string | null;
  /** Release year. */
  year?: number | null;
  /** Plot / synopsis. */
  plot?: string | null;
  /** Free-form genre/tags (upstream `tags`). */
  tags?: string[] | null;
  /** Duration in minutes (upstream `duration`). */
  duration?: number | null;
  /** Trailer links (upstream `trailers`). */
  trailers?: TrailerData[] | null;
  /** Recommended titles (upstream `recommendations`). */
  recommendations?: SearchResponse[] | null;
  /** Cast list (upstream `actors`). */
  actors?: Actor[] | null;
  /** True when the title has not released yet (upstream `comingSoon`). */
  comingSoon?: boolean | null;
  /**
   * Tracker sync IDs keyed by tracker name (e.g. `imdb`, `mal`, `anilist`).
   * Mirrors upstream `syncData: Map<SyncIdName, String>` (MainAPI.kt:1814);
   * keys are free-form strings in v1 instead of the upstream enum.
   */
  syncData?: Record<string, string> | null;
}

/**
 * Title details for a single-file work (film / OVA movie). Mirrors upstream
 * `MovieLoadResponse` (MainAPI.kt:2463): the single `dataUrl` is the opaque
 * playback payload for `loadLinks`.
 */
export interface MovieLoadResponse extends LoadResponseBase {
  kind: 'movie';
  /** Opaque playback payload for {@link Provider.loadLinks}. */
  dataUrl: string;
}

/**
 * Title details for episodic TV content. Mirrors upstream
 * `TvSeriesLoadResponse` (MainAPI.kt:2675). Upstream extras (`seasonNames`,
 * `showStatus`, `nextAiringEpisode`) are deferred beyond v1 (D9).
 */
export interface TvSeriesLoadResponse extends LoadResponseBase {
  kind: 'tvSeries';
  /** All episodes, in provider order. */
  episodes: Episode[];
}

/**
 * Title details for anime. Mirrors upstream `AnimeLoadResponse`
 * (MainAPI.kt:2320): episodes keyed per dub status.
 */
export interface AnimeLoadResponse extends LoadResponseBase {
  kind: 'anime';
  /** Alternate / original-language title (upstream `otherName`). */
  otherName?: string | null;
  /** Episode lists per available voice track (upstream `Map<DubStatus, …>`). */
  episodes: Partial<Record<DubStatus, Episode[]>>;
}

/**
 * Title details for a live stream. Mirrors upstream `LiveStreamLoadResponse`
 * (MainAPI.kt:2414).
 */
export interface LiveStreamLoadResponse extends LoadResponseBase {
  kind: 'liveStream';
  /** Opaque playback payload for {@link Provider.loadLinks}. */
  dataUrl: string;
}

/**
 * Title details, discriminated by `kind`.
 *
 * Mirrors the four upstream variants used by this project's scope:
 * `MovieLoadResponse`, `TvSeriesLoadResponse`, `AnimeLoadResponse`,
 * `LiveStreamLoadResponse` (cited above). Upstream `TorrentLoadResponse`
 * (MainAPI.kt:2268) is excluded from v1 (D8/D11); upstream's DRM link variant
 * is excluded by policy D7.
 */
export type LoadResponse =
  | MovieLoadResponse
  | TvSeriesLoadResponse
  | AnimeLoadResponse
  | LiveStreamLoadResponse;

/* -------------------------------------------------------------------------- */
/* Playback                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A resolved, playable link. Mirrors upstream `ExtractorLink`
 * (ExtractorApi.kt:703) fields `source, name, url, referer, quality, headers,
 * type`, with the naming and typing divergences of D11:
 *
 *  - `type` is `PlaybackLinkType` (no torrent/magnet/DRM in v1).
 *  - `quality` is `number | null` — **required**. Upstream uses a plain `Int`
 *    where 0 de-facto means "unknown"; explicit `null` is cleaner and makes
 *    "unknown sorts last" a testable contract (D12).
 *
 * Upstream fields deferred beyond v1: `extractorData` (opaque extractor state),
 * `audioTracks`.
 */
export interface PlaybackLink {
  /**
   * Short identifier of the extractor/source that resolved the link (upstream
   * `source`, ExtractorApi.kt:703). Used for dedupe grouping and UI badges.
   */
  source: string;
  /** Human-readable display name (upstream `name`). */
  name: string;
  /** Playable URL (manifest or progressive media). */
  url: string;
  /** Delivery technology — drives the Phase 4 player strategy. */
  type: PlaybackLinkType;
  /**
   * Numeric quality (conventionally the vertical resolution, e.g. 1080).
   * `null` = unknown. Unknown always sorts LAST; equal values keep emission
   * order (stable sort).
   */
  quality: number | null;
  /** Referer to send when fetching the media (upstream `referer`). */
  referer?: string | null;
  /** Extra request headers required to fetch the media (upstream `headers`). */
  headers?: Record<string, string> | null;
}

/**
 * A subtitle track. Mirrors upstream `SubtitleFile` (MainAPI.kt:1205):
 * `url, language, filename…`.
 */
export interface SubtitleFile {
  /** Subtitle resource URL (e.g. VTT/SRT). */
  url: string;
  /** Language label (BCP-47 tag or human-readable name, as the provider supplies it). */
  language: string;
  /** Optional display filename (upstream `filename`). */
  filename?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Host results                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Classification of a failed provider call, produced by the host
 * (`provider-host.ts`) — never by providers themselves (D13).
 *
 * - `timeout`    — the per-method deadline elapsed; the provider's
 *                  `AbortSignal` was aborted with a `TimeoutError` reason.
 * - `aborted`    — the caller-supplied signal (or an already-aborted call)
 *                  cancelled the request.
 * - `validation` — the provider returned data that failed boundary
 *                  validation (D12).
 * - `unsupported`— the provider does not implement the optional method.
 * - `provider`   — the provider threw any other error, sync or async.
 */
export type ProviderFailureKind = 'timeout' | 'aborted' | 'validation' | 'unsupported' | 'provider';

/**
 * Successful provider call outcome.
 */
export interface ProviderSuccess<T> {
  ok: true;
  value: T;
}

/**
 * Failed provider call outcome. The host NEVER throws for provider faults
 * (D13): every failure is a typed value so one provider's error cannot crash
 * an unrelated request.
 */
export interface ProviderFailure {
  ok: false;
  kind: ProviderFailureKind;
  /** Human-readable summary safe to log/show (no stack). */
  message: string;
  /** Name of the provider that failed. */
  providerName: string;
  /** Provider method that failed (`getMainPage` | `search` | `quickSearch` | `load` | `loadLinks`). */
  method: string;
  /** Structured validation issues when `kind === 'validation'`, else absent. */
  issues?: string[];
  /** Original error/cause when one exists (for logging, not for display). */
  cause?: unknown;
}

/** Result of a host-mediated provider call. */
export type ProviderResult<T> = ProviderSuccess<T> | ProviderFailure;

/**
 * Aggregate output of a host-mediated `loadLinks` call. Links are deduplicated
 * and quality-sorted by the host (verified upstream `RepoLinkGenerator.kt`
 * dedupe + `sortUrls` semantics, MainAPI.kt:769–771); subtitles are
 * deduplicated per (language, url).
 */
export interface LinkCollection {
  /** The provider's own `loadLinks` return value ("did I handle this data?"). */
  handled: boolean;
  /** Deduplicated (first occurrence wins), sorted by quality descending, unknown last, stable. */
  links: PlaybackLink[];
  /** Deduplicated per (language, url), first occurrence wins. */
  subtitles: SubtitleFile[];
  /** Emitted items that failed validation and were dropped (D12). */
  rejectedItems: number;
}
