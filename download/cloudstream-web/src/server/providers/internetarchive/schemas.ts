/**
 * Wire schemas for the Internet Archive provider (D20) — the IA-specific
 * trust boundary in front of the Phase 1 contract boundary (`src/core/schemas.ts`,
 * D12). Every IA API payload is untrusted input parsed here before any mapping.
 *
 * Shapes are pinned to the evidence base of `docs/phase3-preflight-checklist.md`:
 *
 *  - advancedsearch: `responseHeader` + `response{numFound, start, docs[]}`
 *    (E14 — INFERRED, pinned by fixtures; parameters per E1 VERIFIED);
 *  - metadata: top-level object with `files[]` etc. (E3 VERIFIED), as a UNION
 *    with the empty array `[]` that IA returns for a MISSING identifier (E3:
 *    "returns an empty array, not 404");
 *  - scrape: `{items[], total, count, cursor}` (E2 VERIFIED, official example).
 *
 * PROVENANCE CAVEAT (recorded honestly): the committed fixtures under
 * `tests/fixtures/ia/` are shape specimens pinned to the documented evidence
 * above, NOT byte-faithful live captures — this session had no raw-HTTP egress.
 * `scripts/ia-probe.mjs` re-captures real payloads; schema drift found by that
 * run is fixed here before Phase 3 exit. See checklist addendum §12.
 *
 * Validation posture mirrors D12: non-coercive, unknown keys stripped,
 * explicit nullish modeling. IA fields are notoriously heterogeneous
 * (string-or-array, absent-or-present), so unions are used where the evidence
 * documents them.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

/** IA reports many numeric-ish fields as strings OR numbers depending on item age. */
const IaStringOrNumber = z.union([z.string(), z.number()]);

/** IA `collection` values are a single string OR an array of strings. */
const IaStringOrStringArray = z.union([z.string(), z.array(z.string())]);

/* -------------------------------------------------------------------------- */
/* advancedsearch.php (E1/E14)                                                */
/* -------------------------------------------------------------------------- */

export const IaSearchDocSchema = z.object({
  identifier: z.string().min(1),
  title: z.string().nullish(),
  year: IaStringOrNumber.nullish(),
  description: z.string().nullish(),
});

export const IaAdvancedSearchSchema = z.object({
  responseHeader: z.object({}).loose().nullish(),
  response: z.object({
    numFound: z.number().int().min(0),
    start: z.number().int().min(0).nullish(),
    docs: z.array(IaSearchDocSchema),
  }),
});

export type IaSearchDoc = z.infer<typeof IaSearchDocSchema>;
export type IaAdvancedSearch = z.infer<typeof IaAdvancedSearchSchema>;

/* -------------------------------------------------------------------------- */
/* /metadata/{identifier} (E3) — object OR `[]` for a missing item            */
/* -------------------------------------------------------------------------- */

/**
 * One `files[]` entry. Core fields per E3 (`name, source, format, mtime, size,
 * md5, crc32, sha1`); video fields `length`/`height`/`width` are INFERRED
 * (fixture-pinned shapes) and modeled nullish. `length` is "HH:MM:SS" or a
 * seconds number depending on item — union with refinement left to the mapper.
 */
export const IaFileEntrySchema = z
  .object({
    name: z.string().min(1),
    source: z.string().nullish(),
    format: z.string().nullish(),
    size: IaStringOrNumber.nullish(),
    length: IaStringOrNumber.nullish(),
    height: IaStringOrNumber.nullish(),
    width: IaStringOrNumber.nullish(),
    md5: z.string().nullish(),
    crc32: z.string().nullish(),
    sha1: z.string().nullish(),
    mtime: IaStringOrNumber.nullish(),
  })
  .loose();

export const IaItemMetadataSchema = z.object({
  identifier: z.string().min(1),
  title: z.string().nullish(),
  year: IaStringOrNumber.nullish(),
  mediatype: z.string().nullish(),
  description: z.string().nullish(),
  /** String-or-array per IA metadata heterogeneity. */
  collection: IaStringOrStringArray.nullish(),
  /** "HH:MM:SS" when present (checklist §3). */
  runtime: z.string().nullish(),
  /** CC license pointer — rights-register INPUT (evidence to review), never surfaced. */
  licenseurl: z.string().nullish(),
  /**
   * Lending / access-restriction marker (E22): present on lending items.
   * The provider hard-refuses such items regardless of any other signal
   * (checklist §8.3 — never fetched).
   */
  'access-restricted-item': IaStringOrNumber.nullish(),
});

export const IaMetadataSuccessSchema = z
  .object({
    created: z.number().nullish(),
    d1: z.string().nullish(),
    d2: z.string().nullish(),
    dir: z.string().nullish(),
    files: z.array(IaFileEntrySchema),
    files_count: z.number().int().min(0).nullish(),
    item_last_updated: z.number().nullish(),
    item_size: z.number().nullish(),
    metadata: IaItemMetadataSchema,
    server: z.string().nullish(),
    uniq: z.number().nullish(),
    workable_servers: z.array(z.string()).nullish(),
  })
  .loose();

/**
 * The documented union (E3): a full metadata object for a known identifier,
 * or the empty array `[]` for a MISSING identifier (not a 404).
 */
export const IaMetadataResponseSchema = z.union([
  IaMetadataSuccessSchema,
  z.array(z.never()),
]);

export type IaFileEntry = z.infer<typeof IaFileEntrySchema>;
export type IaItemMetadata = z.infer<typeof IaItemMetadataSchema>;
export type IaMetadataSuccess = z.infer<typeof IaMetadataSuccessSchema>;

/* -------------------------------------------------------------------------- */
/* /services/search/v1/scrape (E2 — official example shape)                   */
/* -------------------------------------------------------------------------- */

export const IaScrapeResponseSchema = z.object({
  items: z.array(z.object({ identifier: z.string().min(1), title: z.string().nullish() }).loose()),
  total: z.number().nullish(),
  count: z.number().nullish(),
  cursor: z.string().nullish(),
});

export type IaScrapeResponse = z.infer<typeof IaScrapeResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Provider-internal dataUrl payload (opaque to the host per contract)        */
/* -------------------------------------------------------------------------- */

/**
 * The JSON blob the provider stores in `MovieLoadResponse.dataUrl` /
 * `Episode.data`. The host never inspects it (contract: opaque strings);
 * only this provider decodes it — with Zod, fail-closed.
 */
export const IaDataPayloadSchema = z.object({
  identifier: z.string().min(1),
  /** Selected derivative file name; `null` = no usable derivative (no links). */
  fileName: z.string().min(1).nullable(),
  /** Subtitle file names present in the item (.srt/.vtt only; empty when none). */
  subtitles: z.array(z.string().min(1)).default([]),
});

export type IaDataPayload = z.infer<typeof IaDataPayloadSchema>;
