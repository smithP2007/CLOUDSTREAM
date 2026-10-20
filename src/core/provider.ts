/**
 * The provider adapter interface — the clean-room TypeScript encoding of the
 * verified CloudStream `MainAPI` lifecycle (see `docs/provider-architecture.md`
 * §1, `MainAPI.kt:494–712` at `recloudstream/cloudstream@eb962b4`).
 *
 * Contract semantics providers can rely on, and the host relies on in turn:
 *
 *  1. **Providers throw freely; the host owns the error boundary.** Upstream
 *     documents this explicitly ("every provider will not have try catch built
 *     in", comment above `MainAPI.kt:494`) and enforces it in `APIRepository`
 *     (`safeApiCall`). No provider method in this codebase catches its own
 *     faults; `provider-host.ts` converts every failure — sync or async — into
 *     a typed {@link ProviderResult} (D13).
 *  2. **Cancellation is cooperative via `CallContext.signal`.** The host wires
 *     the per-method timeout (and any caller-supplied signal) into the signal
 *     it passes here. Providers SHOULD thread it into their I/O
 *     (e.g. `fetch(url, { signal: ctx.signal })`) and SHOULD stop work when it
 *     fires. The host never claims a call was cancelled just because it stopped
 *     waiting — the abort is the only cancellation signal (D13).
 *  3. **`null` means "nothing to return"** for nullable methods, mirroring
 *     upstream's nullable return types (MainAPI.kt:633–665).
 *  4. **Opaque strings stay opaque.** `Episode.data` / `dataUrl` / homepage row
 *     `data` are provider-internal tokens; the host never inspects them.
 *
 * This file intentionally contains no runtime logic. The behaviors that could
 * not live in type declarations (error boundary, timeouts, dedupe, sort) live
 * in `provider-host.ts` and `links.ts`.
 */

import type {
  HomePageResponse,
  LoadResponse,
  MainPageRequest,
  PlaybackLink,
  SearchPage,
  SearchResponse,
  SubtitleFile,
  TvType,
} from './types';

/* -------------------------------------------------------------------------- */
/* Call plumbing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Per-call context handed to every provider method by the host.
 *
 * `signal` aborts when (a) the per-method timeout elapses — the abort reason is
 * a `TimeoutError` (see `provider-host.ts`), or (b) the caller of the host
 * aborted its own signal — the abort reason is then the caller's reason.
 * Aborting is a request to stop, not a guarantee the provider will observe it
 * instantly; providers that ignore it simply outlive the host's wait (D13).
 */
export interface CallContext {
  readonly signal: AbortSignal;
}

/**
 * Streaming emit callback for `loadLinks`. Mirrors the verified upstream
 * callback-streaming style (`loadLinks(data, isCasting, subtitleCallback,
 * callback)`, MainAPI.kt:692–699): providers push links and subtitles as they
 * resolve them instead of returning one array.
 *
 * Providers may call `emit` any number of times, synchronously or across
 * `await` points, until their returned promise settles. Emissions after the
 * promise settles are dropped by the host. `emit` never throws into the
 * provider: invalid items are counted and dropped by the host (D12).
 */
export type LinkOrSubtitleEmit = (item: PlaybackLink | SubtitleFile) => void;

/* -------------------------------------------------------------------------- */
/* The provider contract                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A content source adapter. One instance = one installed provider, analogous
 * to one upstream `MainAPI` subclass instance.
 */
export interface Provider {
  /** Display name, unique within the installed set (upstream `name`, MainAPI.kt:515). */
  readonly name: string;

  /** Provider base URL (upstream `mainUrl`, MainAPI.kt:516). */
  readonly mainUrl: string;

  /** Content language, IETF BCP-47 tag (upstream `lang`, MainAPI.kt:546). */
  readonly lang: string;

  /** Catalog types this provider serves (upstream `supportedTypes`, MainAPI.kt:618–624). */
  readonly tvTypes: readonly TvType[];

  /**
   * One homepage row. Mirrors upstream `getMainPage(page, request)`
   * (MainAPI.kt:633). Return `null` when the row is unsupported/empty.
   */
  getMainPage(
    page: number,
    req: MainPageRequest,
    ctx: CallContext,
  ): Promise<HomePageResponse | null>;

  /**
   * Paginated search. Mirrors upstream `search(query, page)` (MainAPI.kt:641)
   * with the host paging via `page + 1` while `hasNext` (verified in
   * `SearchViewModel.kt:137`). Return `null` for no results.
   */
  search(query: string, page: number, ctx: CallContext): Promise<SearchPage | null>;

  /**
   * Fast, lightweight search for live/as-you-type UI. Mirrors upstream
   * `quickSearch` (MainAPI.kt:656). OPTIONAL: absent means the provider does
   * not support it — the host reports kind `unsupported` (upstream declares
   * capability via `hasQuickSearch`, MainAPI.kt:564).
   */
  quickSearch?(query: string, ctx: CallContext): Promise<SearchResponse[]>;

  /**
   * Load title details for a {@link SearchResponse.url} value. Mirrors upstream
   * `load(url)` (MainAPI.kt:665). The returned `LoadResponse` discriminated
   * union carries the episode list (or the single `dataUrl` payload).
   * Return `null` when the URL cannot be resolved.
   */
  load(url: string, ctx: CallContext): Promise<LoadResponse | null>;

  /**
   * Resolve playable links and subtitles for one opaque episode/`dataUrl`
   * payload. Mirrors the upstream callback-streaming contract (MainAPI.kt:692–
   * 699): emit {@link PlaybackLink}s and {@link SubtitleFile}s via `emit` as
   * they are resolved, then return whether THIS provider handled `data`
   * (upstream convention: `true` = handled; the host falls back to other
   * resolvers only when it is `false`).
   */
  loadLinks(data: string, emit: LinkOrSubtitleEmit, ctx: CallContext): Promise<boolean>;
}

// Re-exported for convenience so consumers only import one module for the
// contract surface (`provider.ts` re-exports the data vocabulary it uses).
export type {
  Episode,
  HomePageResponse,
  LoadResponse,
  MainPageRequest,
  PlaybackLink,
  SearchPage,
  SearchResponse,
  SubtitleFile,
  TvType,
} from './types';

/* -------------------------------------------------------------------------- */
/* Timeout vocabulary                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Per-method timeout configuration, in milliseconds. Mirrors the upstream
 * per-method timeout hints on `MainAPI` (`loadLinksTimeoutMs`,
 * `getMainPageTimeoutMs`, `searchTimeoutMs`, `quickSearchTimeoutMs`,
 * `loadTimeoutMs`, MainAPI.kt:573–601) — but configured on the HOST, not
 * declared by the provider (v1 simplification: all providers share the host
 * configuration; per-provider overrides can layer on top in Phase 2).
 */
export interface ProviderTimeouts {
  getMainPageMs: number;
  searchMs: number;
  quickSearchMs: number;
  loadMs: number;
  loadLinksMs: number;
}

/**
 * Project-chosen defaults. NOTE: these values are OURS — the upstream default
 * timeout values were not recorded as VERIFIED in the investigation docs and
 * are deliberately not claimed here (UNKNOWN in evidence terms).
 */
export const DEFAULT_PROVIDER_TIMEOUTS: ProviderTimeouts = {
  getMainPageMs: 15_000,
  searchMs: 15_000,
  quickSearchMs: 10_000,
  loadMs: 20_000,
  loadLinksMs: 30_000,
};
