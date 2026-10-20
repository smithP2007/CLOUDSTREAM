/**
 * Zod schemas for data crossing the provider trust boundary (D12).
 *
 * Every value a {@link Provider} method *returns* is untrusted input: the host
 * validates it with these schemas before it reaches any caller
 * (`provider-host.ts`). Provider *instances* are first-party TypeScript
 * objects (not wire data) and are therefore NOT described by a schema — the
 * `Provider` interface in `./provider.ts` is the compile-time contract for them.
 *
 * Validation posture (D12):
 *  - non-coercive: no `z.coerce`; wrong primitive types fail;
 *  - unknown keys are stripped (forward compatibility with provider churn);
 *  - optional-and-nullable is modeled explicitly with `.nullish()`;
 *  - opaque fields (`Episode.data`, `dataUrl`, row `data`) accept any string —
 *    their *interpretation* is provider-internal by contract.
 *
 * Type agreement: the schemas below are maintained in lockstep with the
 * hand-written interfaces in `./types.ts`; tests pin the agreement by assigning
 * parsed samples to the interface types at compile time.
 */
import { z } from 'zod';
import { DUB_STATUSES, PLAYBACK_LINK_TYPES, SEARCH_QUALITIES, TV_TYPES, } from './types';
/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */
export const TvTypeSchema = z.enum(TV_TYPES);
export const DubStatusSchema = z.enum(DUB_STATUSES);
export const SearchQualitySchema = z.enum(SEARCH_QUALITIES);
export const PlaybackLinkTypeSchema = z.enum(PLAYBACK_LINK_TYPES);
/* -------------------------------------------------------------------------- */
/* Search / homepage                                                          */
/* -------------------------------------------------------------------------- */
export const SearchResponseSchema = z.object({
    name: z.string().min(1),
    url: z.string().min(1),
    providerName: z.string().min(1),
    type: TvTypeSchema,
    posterUrl: z.string().nullish(),
    quality: SearchQualitySchema.nullish(),
    score: z.number().min(0).max(10).nullish(),
    id: z.string().nullish(),
});
export const MainPageDataSchema = z.object({
    name: z.string().min(1),
    data: z.string(),
    horizontalImages: z.boolean().nullish(),
});
/**
 * Host→provider direction (trusted today), but defined here because Phase 2's
 * HTTP API will receive homepage-row parameters from the browser and must
 * validate them with the same shape.
 */
export const MainPageRequestSchema = z.object({
    name: z.string().min(1),
    data: z.string(),
    horizontalImages: z.boolean().nullish(),
});
export const HomePageListSchema = z.object({
    name: z.string().min(1),
    items: z.array(SearchResponseSchema),
    isHorizontalImages: z.boolean().nullish(),
});
export const HomePageResponseSchema = z.object({
    lists: z.array(HomePageListSchema),
    hasNext: z.boolean(),
});
export const SearchPageSchema = z.object({
    items: z.array(SearchResponseSchema),
    hasNext: z.boolean(),
    nextKey: z.string().nullish(),
});
export const SearchResponseListSchema = z.array(SearchResponseSchema);
/* -------------------------------------------------------------------------- */
/* Detail / episodes                                                          */
/* -------------------------------------------------------------------------- */
export const EpisodeSchema = z.object({
    data: z.string(),
    name: z.string().nullish(),
    season: z.number().int().min(0).nullish(),
    episode: z.number().int().min(0).nullish(),
    posterUrl: z.string().nullish(),
    score: z.number().min(0).max(10).nullish(),
    description: z.string().nullish(),
    date: z.number().int().nullish(),
    runTime: z.number().min(0).nullish(),
});
export const ActorSchema = z.object({
    name: z.string().min(1),
    role: z.string().nullish(),
    image: z.string().nullish(),
});
export const TrailerDataSchema = z.object({
    url: z.string().min(1),
    referer: z.string().nullish(),
});
const LoadResponseBaseSchema = z.object({
    name: z.string().min(1),
    url: z.string().min(1),
    providerName: z.string().min(1),
    type: TvTypeSchema,
    posterUrl: z.string().nullish(),
    year: z.number().int().nullish(),
    plot: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    duration: z.number().min(0).nullish(),
    trailers: z.array(TrailerDataSchema).nullish(),
    recommendations: z.array(SearchResponseSchema).nullish(),
    actors: z.array(ActorSchema).nullish(),
    comingSoon: z.boolean().nullish(),
    syncData: z.record(z.string(), z.string()).nullish(),
});
export const MovieLoadResponseSchema = LoadResponseBaseSchema.extend({
    kind: z.literal('movie'),
    dataUrl: z.string(),
});
export const TvSeriesLoadResponseSchema = LoadResponseBaseSchema.extend({
    kind: z.literal('tvSeries'),
    episodes: z.array(EpisodeSchema),
});
export const AnimeLoadResponseSchema = LoadResponseBaseSchema.extend({
    kind: z.literal('anime'),
    otherName: z.string().nullish(),
    episodes: z.object({
        Dubbed: z.array(EpisodeSchema).optional(),
        Subbed: z.array(EpisodeSchema).optional(),
    }),
});
export const LiveStreamLoadResponseSchema = LoadResponseBaseSchema.extend({
    kind: z.literal('liveStream'),
    dataUrl: z.string(),
});
export const LoadResponseSchema = z.discriminatedUnion('kind', [
    MovieLoadResponseSchema,
    TvSeriesLoadResponseSchema,
    AnimeLoadResponseSchema,
    LiveStreamLoadResponseSchema,
]);
/* -------------------------------------------------------------------------- */
/* Playback                                                                   */
/* -------------------------------------------------------------------------- */
export const PlaybackLinkSchema = z.object({
    source: z.string().min(1),
    name: z.string().min(1),
    url: z.string().min(1),
    type: PlaybackLinkTypeSchema,
    quality: z.number().int().min(0).nullable(),
    referer: z.string().nullish(),
    headers: z.record(z.string(), z.string()).nullish(),
});
export const SubtitleFileSchema = z.object({
    url: z.string().min(1),
    language: z.string().min(1),
    filename: z.string().nullish(),
});
/* -------------------------------------------------------------------------- */
/* Host-side aggregates                                                       */
/* -------------------------------------------------------------------------- */
/** The `loadLinks` boolean return ("did I handle this data?"). */
export const HandledSchema = z.boolean();
//# sourceMappingURL=schemas.js.map