/**
 * Internet Archive provider (D20) — the first real content source, clean-room
 * TypeScript implementing the Phase 1 `Provider` contract against IA's
 * officially documented, unauthenticated, read-only APIs.
 *
 * AUTHORIZATION (D20, adopted 2026-10-21): implementation authorized by the
 * owner after the pre-flight checklist review (CONDITIONAL-GO) and the
 * Terms-of-Use gate closure (P3 dated copy + read-only-use review with a
 * favorable conclusion — see `docs/evidence/archive-org-terms-of-use--2026-10-21.md`
 * and `docs/evidence/ia-tou-review--2026-10-21.md`). Scope conditions, ALL
 * enforced here:
 *
 *  1. **Content categories:** POLICY §3.1 public-domain + §3.2 CC only,
 *     enforced by the curated collection pools (search query) PLUS the
 *     mandatory per-item rights register (`./register.ts`) — `load`/`loadLinks`
 *     refuse identifiers absent from the register, and search drops them.
 *  2. **Anonymous read-only API use only:** no credentials ever (no
 *     `Authorization: LOW`, no cookies); GETs against `archive.org` endpoints.
 *  3. **Progressive MP4 only:** links are `type: 'video'` derivative URLs.
 *     HLS is NEVER emitted (E18 UNKNOWN). Playback claims are OFF until
 *     probes P2a–P2f run (see checklist §12 addendum).
 *  4. **No media relay** (D8 untouched); the browser plays the download URL
 *     natively via `<video>`.
 *  5. **Pacing + identification:** identified UA, ≥1 req/s, ≤2 in flight,
 *     429 + Retry-After honored via `./pacer.ts` (E5 conduct policy).
 *  6. **Kill switch:** the app runtime wraps this provider with `wrapProvider`
 *     (D19) — disable is instant and typed.
 *  7. **No execution of extracted content** (D19): API payloads are data,
 *     parsed only through the Phase 2 boundary toolkit. No eval/new Function.
 *  8. **Robots + SSRF:** all server-side fetches go through the D18 engine
 *     (robots-gated, DNS-pinned, redirect-revalidated). The download URL is
 *     never fetched server-side — it is emitted to the browser.
 *
 * PROVISIONAL STATE (honest, recorded): live fixtures + P2 probe evidence are
 * pending a raw-egress session (`scripts/ia-probe.mjs`). Field mappings are
 * pinned to the documented evidence (E1–E3, E8) and the committed shape
 * specimens; live failures surface as typed host failures and health-tracker
 * degradation (fail-closed), never as crashes.
 */

import type {
  CallContext,
  HomePageResponse,
  LinkOrSubtitleEmit,
  Provider,
  SearchPage,
  SearchResponse,
  SubtitleFile,
} from '../../../core/provider';
import type { LoadResponse, MovieLoadResponse } from '../../../core/types';
import { HttpEngine } from '../../http/engine';
import { parseJsonWith } from '../../parse/json';
import { extractText, parseHtml } from '../../parse/html';
import {
  IaAdvancedSearchSchema,
  IaDataPayloadSchema,
  IaMetadataResponseSchema,
  type IaFileEntry,
  type IaSearchDoc,
} from './schemas';
import { getRightsEntry, isApprovedIdentifier } from './register';
import { IaPacer, IaRateLimitedError } from './pacer';

/* -------------------------------------------------------------------------- */
/* Identity + configuration (D20-recorded values)                             */
/* -------------------------------------------------------------------------- */

export const IA_PROVIDER_ID = 'internetarchive';
export const IA_PROVIDER_NAME = 'InternetArchive';
export const IA_MAIN_URL = 'https://archive.org';
/** Identified UA per E5 (tool + version + contact). OUR value. */
export const IA_USER_AGENT =
  'cloudstream-web/0.1.0 (+https://github.com/smithP2007/CLOUDSTREAM)';

/**
 * Curated public-domain collection pools (D20 — necessary, NOT sufficient;
 * the per-item register is the binding permission layer). `feature_films`
 * and `film_noir` are IA's classic-film collections whose mixes the register
 * filters item-by-item; `classic_cartoons` rounds out the animation pool.
 */
export const IA_COLLECTION_POOLS: readonly string[] = [
  'feature_films',
  'film_noir',
  'classic_cartoons',
];

/** Search page size (ours; sits far under IA's documented 10,000-row cap, E1). */
const SEARCH_ROWS = 50;
/** Hard page budget so the documented 10,000-row sorted cap can never be hit. */
const MAX_SEARCH_PAGES = 20;
/** Homepage row size (ours). */
const HOMEPAGE_ROWS = 20;

/** IA search-field vocabulary actually used (E13 — INFERRED, pinned by fixtures). */
const SEARCH_FL = ['identifier', 'title', 'year'] as const;

/* -------------------------------------------------------------------------- */
/* Pure helpers (unit-tested directly)                                        */
/* -------------------------------------------------------------------------- */

/** Parses "1953" or "1953-1959" (defensive per checklist §3) into a number. */
export function parseIaYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1000 && value <= 9999 ? Math.trunc(value) : null;
  }
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})/.exec(value.trim());
  return match ? Number.parseInt(match[1] as string, 10) : null;
}

/** Strips HTML fragments from IA descriptions (parse toolkit, server-side). */
export function stripIaHtml(fragment: string): string {
  if (typeof fragment !== 'string' || fragment.trim() === '') return '';
  // Block-level boundaries become explicit whitespace BEFORE extraction so
  // adjacent paragraphs do not fuse ("world.Second" would be wrong).
  const spaced = fragment.replace(/<br\s*\/?>|<\/p\s*>|<\/div\s*>|<\/li\s*>/gi, ' ');
  const parsed = parseHtml(spaced);
  if (!parsed.ok) return '';
  const text = extractText(parsed.root, 'body');
  return text.replace(/\s+/g, ' ').trim();
}

/** Parses "HH:MM:SS" (or a seconds number) into whole minutes for the contract. */
export function parseIaRuntimeMinutes(runtime: unknown): number | null {
  if (typeof runtime === 'number' && Number.isFinite(runtime) && runtime > 0) {
    return Math.round(runtime / 60);
  }
  if (typeof runtime !== 'string') return null;
  const parts = runtime.trim().split(':').map((p) => Number.parseInt(p, 10));
  if (parts.length === 0 || parts.some((p) => Number.isNaN(p) || p < 0)) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds > 0 ? Math.round(seconds / 60) : null;
}

const DERIVATIVE_EXTENSIONS = /\.(mp4|m4v|ogv|mkv|avi)$/i;
const DERIVATIVE_FORMATS =
  /^h\.264|^mpeg|^matroska|^divx|^ogg video/i;

function lengthSeconds(length: unknown): number {
  if (typeof length === 'number' && Number.isFinite(length) && length > 0) return length;
  if (typeof length === 'string') {
    const parts = length.trim().split(':');
    if (parts.every((p) => /^\d+$/.test(p)) && parts.length > 0) {
      let seconds = 0;
      for (const part of parts) seconds = seconds * 60 + Number.parseInt(part, 10);
      return seconds;
    }
    const numeric = Number.parseFloat(length);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

/**
 * Derivative selection (checklist §9.2): prefer the h.264 family per E8,
 * sanity-floor on length (>= 10 s of video — mirrors the documented upstream
 * behavior of ignoring micro-clips), rank real video containers, and NEVER
 * invent a file name.
 */
export function selectIaDerivative(files: readonly IaFileEntry[]): string | null {
  let best: { name: string; rank: number; size: number } | null = null;
  for (const file of files) {
    const name = file.name;
    if (name.length === 0 || !DERIVATIVE_EXTENSIONS.test(name)) continue;
    const format = file.format ?? '';
    if (!DERIVATIVE_FORMATS.test(format)) continue;
    if (lengthSeconds(file.length) < 10) continue;
    const size = typeof file.size === 'number' ? file.size : Number.parseInt(file.size ?? '', 10);
    const candidate = {
      name,
      rank: /^h\.264/i.test(format) ? 2 : 1,
      size: Number.isFinite(size) ? size : 0,
    };
    if (
      best === null ||
      candidate.rank > best.rank ||
      (candidate.rank === best.rank && candidate.size > best.size)
    ) {
      best = candidate;
    }
  }
  return best?.name ?? null;
}

/** Builds the canonical archive.org download URL for an item file. */
export function buildIaDownloadUrl(identifier: string, fileName: string): string {
  const encodedFile = fileName.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${IA_MAIN_URL}/download/${encodeURIComponent(identifier)}/${encodedFile}`;
}

/** Extracts an item identifier from a details URL (the segment after /details/). */
export function identifierFromDetailsUrl(url: string): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  const clean = url.split('?')[0]?.split('#')[0] ?? '';
  const segments = clean.split('/').filter((s) => s.length > 0);
  const detailsIndex = segments.lastIndexOf('details');
  if (detailsIndex < 0 || detailsIndex + 1 >= segments.length) return null;
  const identifier = segments[detailsIndex + 1] as string;
  if (identifier.length === 0) return null;
  try {
    return decodeURIComponent(identifier);
  } catch {
    return null;
  }
}

/** Subtitle shaping: only when the item actually ships .srt/.vtt (no fabrication). */
export function iaSubtitleFromFileName(identifier: string, fileName: string): SubtitleFile | null {
  if (!/\.(srt|vtt)$/i.test(fileName)) return null;
  return {
    url: buildIaDownloadUrl(identifier, fileName),
    language: 'en',
    filename: fileName.split('/').pop() ?? fileName,
  };
}

/* -------------------------------------------------------------------------- */
/* The provider factory                                                       */
/* -------------------------------------------------------------------------- */

export interface InternetArchiveProviderDeps {
  /** Overrides the search engine (tests inject the fixture-backed engine). */
  readonly searchEngine?: HttpEngine;
  /** Overrides the metadata engine (tests inject the fixture-backed engine). */
  readonly metadataEngine?: HttpEngine;
  /** Overrides the pacer (tests inject a deterministic pacer). */
  readonly pacer?: IaPacer;
}

/**
 * Creates the Internet Archive provider. Two engines (one per cache profile —
 * search responses 10 min, metadata 20 min, per D20's recorded caching rules)
 * share the identified UA and the D18 SSRF/robots machinery. No approved
 * private destinations: archive.org is public, the engine's public-host path
 * applies unchanged.
 */
export function createInternetArchiveProvider(deps: InternetArchiveProviderDeps = {}): Provider {
  const searchEngine =
    deps.searchEngine ??
    new HttpEngine({
      providerName: IA_PROVIDER_NAME,
      userAgent: IA_USER_AGENT,
      timeoutMs: 30_000,
      cacheTtlMs: 10 * 60_000,
    });
  const metadataEngine =
    deps.metadataEngine ??
    new HttpEngine({
      providerName: IA_PROVIDER_NAME,
      userAgent: IA_USER_AGENT,
      timeoutMs: 30_000,
      cacheTtlMs: 20 * 60_000,
    });
  const pacer = deps.pacer ?? new IaPacer();

  /** One paced, engine-fetched GET with 429 mapping. Throws typed errors. */
  async function pacedGet(
    engine: HttpEngine,
    url: string,
    ctx: CallContext,
  ): Promise<{ status: number; text: string }> {
    await pacer.acquire();
    try {
      const result = await engine.fetch(url, { signal: ctx.signal });
      if (!result.ok) {
        throw new Error(
          `Internet Archive request failed (${result.failure.kind}): ${result.failure.message}`,
        );
      }
      const response = result.response;
      if (response.status === 429) {
        const retryAfter = response.headers['retry-after'] ?? null;
        const pauseMs = pacer.reportRateLimited(retryAfter);
        throw new IaRateLimitedError(pauseMs);
      }
      return { status: response.status, text: response.text() };
    } finally {
      pacer.release();
    }
  }

  /** advancedsearch GET → validated payload (schema boundary). */
  async function advancedSearch(
    query: string,
    rows: number,
    page: number,
    sort: string | null,
    ctx: CallContext,
  ) {
    const params = new URLSearchParams();
    params.set('q', query);
    for (const field of SEARCH_FL) params.append('fl[]', field);
    params.set('rows', String(rows));
    params.set('page', String(page));
    if (sort !== null) params.append('sort[]', sort);
    params.set('output', 'json');
    const { text } = await pacedGet(
      searchEngine,
      `${IA_MAIN_URL}/advancedsearch.php?${params.toString()}`,
      ctx,
    );
    const parsed = parseJsonWith(IaAdvancedSearchSchema, text);
    if (!parsed.ok) {
      const issue =
        parsed.error.kind === 'schemaMismatch'
          ? parsed.error.issues.slice(0, 3).join('; ')
          : parsed.error.message;
      throw new Error(`Internet Archive search response failed validation: ${issue}`);
    }
    return parsed.value;
  }

  const poolQuery = `mediatype:movies AND collection:(${IA_COLLECTION_POOLS.join(' OR ')})`;

  /** Maps one search doc → SearchResponse, dropping unregistered/untitled items. */
  function docToSearchResponse(doc: IaSearchDoc): SearchResponse | null {
    // The register is the binding permission surface: unregistered items are
    // dropped from every surfaced list (search rows + homepage rows).
    if (!isApprovedIdentifier(doc.identifier)) return null;
    const title = doc.title?.trim();
    if (title === undefined || title === '') return null; // D12: missing title ⇒ skip
    return {
      name: title,
      url: `${IA_MAIN_URL}/details/${doc.identifier}`,
      providerName: IA_PROVIDER_NAME,
      type: 'Movie',
      posterUrl: `${IA_MAIN_URL}/services/img/${doc.identifier}`,
      quality: null,
      score: null, // IA supplies no normalized 0–10 score — never fabricated
      id: doc.identifier,
    };
  }

  return {
    name: IA_PROVIDER_NAME,
    mainUrl: IA_MAIN_URL,
    lang: 'en',
    tvTypes: ['Movie', 'Documentary'],

    async getMainPage(page, _req, ctx): Promise<HomePageResponse | null> {
      if (!Number.isInteger(page) || page < 1) {
        throw new RangeError(`InternetArchive provider: invalid page ${page}`);
      }
      if (page > 1) return null;
      const payload = await advancedSearch(poolQuery, HOMEPAGE_ROWS, 1, 'downloads desc', ctx);
      const items = payload.response.docs
        .map((doc) => docToSearchResponse(doc))
        .filter((item): item is SearchResponse => item !== null);
      if (items.length === 0) return null;
      return {
        lists: [
          {
            name: 'Public-domain films (Internet Archive)',
            items,
            isHorizontalImages: false,
          },
        ],
        hasNext: false,
      };
    },

    async search(query, page, ctx): Promise<SearchPage | null> {
      if (!Number.isInteger(page) || page < 1) {
        throw new RangeError(`InternetArchive provider: invalid page ${page}`);
      }
      if (page > MAX_SEARCH_PAGES) return null; // unreachable at our budget (E1 cap guard)
      const trimmed = query.trim();
      if (trimmed.length === 0) return null;
      const escaped = trimmed.replace(/"/g, '\\"');
      const searchQuery = `(title:("${escaped}") OR identifier:("${escaped}")) AND ${poolQuery}`;
      const payload = await advancedSearch(searchQuery, SEARCH_ROWS, page, null, ctx);
      const items = payload.response.docs
        .map((doc) => docToSearchResponse(doc))
        .filter((item): item is SearchResponse => item !== null);
      const fetchedThrough = page * SEARCH_ROWS;
      const hasNext = payload.response.numFound > fetchedThrough && fetchedThrough < 10_000;
      return { items, hasNext };
    },

    async quickSearch(query, ctx): Promise<SearchResponse[]> {
      const trimmed = query.trim();
      if (trimmed.length === 0) return [];
      const page = await this.search(trimmed, 1, ctx);
      return page?.items.slice(0, 5) ?? [];
    },

    async load(url, ctx): Promise<LoadResponse | null> {
      const identifier = identifierFromDetailsUrl(url);
      if (identifier === null || !isApprovedIdentifier(identifier)) return null; // register gate
      const { text } = await pacedGet(
        metadataEngine,
        `${IA_MAIN_URL}/metadata/${encodeURIComponent(identifier)}`,
        ctx,
      );
      const parsed = parseJsonWith(IaMetadataResponseSchema, text);
      if (!parsed.ok) return null; // schema drift / garbage — fail-closed "nothing to return"
      if (Array.isArray(parsed.value)) return null; // missing identifier ⇒ [] (E3)
      const item = parsed.value;
      const meta = item.metadata;
      // §8.3 item-level gate: lending / access-restricted items are NEVER
      // served — even if a register entry existed (none should).
      if (meta['access-restricted-item'] !== undefined && meta['access-restricted-item'] !== 0 && meta['access-restricted-item'] !== '0' && meta['access-restricted-item'] !== '') {
        return null;
      }
      const entry = getRightsEntry(meta.identifier);
      if (entry === null || entry.identifier !== identifier) return null; // register gate (defense in depth)

      const description = typeof meta.description === 'string' ? stripIaHtml(meta.description) : '';
      const year = parseIaYear(meta.year);
      const runtimeMinutes = parseIaRuntimeMinutes(meta.runtime);
      const collections: string[] = Array.isArray(meta.collection)
        ? meta.collection.filter((tag): tag is string => typeof tag === 'string')
        : typeof meta.collection === 'string'
          ? [meta.collection]
          : [];
      const fileName = selectIaDerivative(item.files);
      const subtitleNames = item.files
        .map((file) => file.name)
        .filter((name) => /\.(srt|vtt)$/i.test(name));
      const dataUrl = JSON.stringify({
        identifier: meta.identifier,
        fileName,
        subtitles: subtitleNames,
      });

      const response: MovieLoadResponse = {
        kind: 'movie',
        name: meta.title?.trim() || meta.identifier,
        url: `${IA_MAIN_URL}/details/${meta.identifier}`,
        providerName: IA_PROVIDER_NAME,
        type: 'Movie',
        posterUrl: `${IA_MAIN_URL}/services/img/${meta.identifier}`,
        plot: description !== '' ? description : null,
        year,
        duration: runtimeMinutes,
        tags: collections.length > 0 ? collections : null,
        actors: [], // IA supplies no cast roles — never fabricated
        dataUrl,
      };
      return response;
    },

    async loadLinks(data, emit, _ctx): Promise<boolean> {
      let raw: unknown = null;
      try {
        raw = JSON.parse(data) as unknown;
      } catch {
        return false; // not our payload — let other resolvers try
      }
      const parsed = IaDataPayloadSchema.safeParse(raw);
      if (!parsed.success) return false;
      const payload = parsed.data;
      if (!isApprovedIdentifier(payload.identifier)) return false; // register gate
      if (payload.fileName === null) return true; // handled: no usable derivative ⇒ zero links
      const fileName: string = payload.fileName;

      emit({
        source: IA_PROVIDER_NAME,
        name: 'Internet Archive',
        url: buildIaDownloadUrl(payload.identifier, fileName),
        type: 'video', // progressive MP4 only (E8); HLS never emitted (E18)
        quality: null, // height-based quality pending live fixtures (provisional, honest)
        referer: null,
        headers: null,
      });
      for (const subtitleName of payload.subtitles ?? []) {
        const subtitle = iaSubtitleFromFileName(payload.identifier, subtitleName);
        if (subtitle !== null) emit(subtitle);
      }
      return true;
    },
  };
}

/** Type-level re-exports kept local for consumer convenience. */
export type { LinkOrSubtitleEmit };
