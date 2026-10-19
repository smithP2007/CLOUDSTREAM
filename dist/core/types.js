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
];
/**
 * Voice track status for anime catalogs. Mirrors upstream `DubStatus`
 * (MainAPI.kt:905); upstream anime detail responses key their episode lists
 * by this status (`provider-architecture.md` §2.2).
 */
export const DUB_STATUSES = ['Dubbed', 'Subbed'];
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
];
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
export const PLAYBACK_LINK_TYPES = ['video', 'hls', 'dash'];
//# sourceMappingURL=types.js.map