/**
 * The provider host — the owner of the error boundary, deadlines, cancellation
 * signaling, and boundary validation (D13, docs/decisions.md).
 *
 * Mirrors the verified upstream host responsibilities, clean-room:
 *  - upstream providers throw freely; `APIRepository.safeApiCall` wraps every
 *    call (`APIRepository.kt:85–220`) — here, the host catches every provider
 *    fault (sync or async) and returns a typed {@link ProviderResult}; it never
 *    throws for a provider fault, so one provider's failure cannot crash an
 *    unrelated request.
 *  - upstream enforces per-method timeouts with `withTimeout`
 *    (`APIRepository.kt:204–220`) — here, per-method timeouts are configurable
 *    on the host and the deadline signals cancellation to the provider through
 *    the `AbortSignal` in its {@link CallContext}, with a typed `TimeoutError`
 *    as the abort reason.
 *
 * Cancellation honesty rule (D13): `Promise.race` is used ONLY to bound the
 * host's wait. The abort signal is the sole cancellation mechanism handed to
 * the provider. A provider that ignores the signal may keep running detached —
 * the host stops waiting at the deadline and reports `timeout`, without
 * claiming the provider's promise itself was cancelled. Tests pin that the
 * signal actually fires and that signal-respecting providers settle promptly.
 */

import type {
  HomePageResponse,
  LinkCollection,
  LoadResponse,
  ProviderFailure,
  ProviderFailureKind,
  ProviderResult,
  SearchPage,
  SearchResponse,
} from './types';

import { z } from 'zod';

import { createLinkCollector } from './links';
import {
  DEFAULT_PROVIDER_TIMEOUTS,
  type CallContext,
  type Provider,
  type ProviderTimeouts,
} from './provider';
import {
  HandledSchema,
  HomePageResponseSchema,
  LoadResponseSchema,
  SearchPageSchema,
  SearchResponseListSchema,
} from './schemas';

/** Provider method names — the `method` field of a {@link ProviderFailure}. */
export type ProviderMethodName =
  | 'getMainPage'
  | 'search'
  | 'quickSearch'
  | 'load'
  | 'loadLinks';

/**
 * Thrown (as the abort reason) when a per-method deadline elapses. Providers
 * can observe it via `ctx.signal.reason`; the host classifies such calls as
 * failure kind `timeout`.
 */
export class TimeoutError extends Error {
  constructor(
    public readonly method: ProviderMethodName,
    public readonly timeoutMs: number,
  ) {
    super(`Provider method "${method}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export interface ProviderHostOptions {
  /**
   * Per-method timeout overrides (milliseconds), merged over
   * {@link DEFAULT_PROVIDER_TIMEOUTS}.
   */
  timeouts?: Partial<ProviderTimeouts>;
  /**
   * Validate provider return values against the boundary schemas (D12).
   * Default `true`. Disabling is an escape hatch for trusted internal tests —
   * production hosts must keep validation on.
   */
  validate?: boolean;
}

export interface CallOverrides {
  /**
   * Caller-supplied cancellation. Aborting it (before or during the call)
   * fails the call with kind `aborted` and propagates the abort to the
   * provider's signal. If the provider completes BEFORE the abort is observed,
   * the completion wins (same temporal semantics as upstream's cooperative
   * cancellation).
   */
  signal?: AbortSignal;
}

const TIMEOUT_KEY_BY_METHOD: Record<ProviderMethodName, keyof ProviderTimeouts> = {
  getMainPage: 'getMainPageMs',
  search: 'searchMs',
  quickSearch: 'quickSearchMs',
  load: 'loadMs',
  loadLinks: 'loadLinksMs',
};

const MAX_REPORTED_ISSUES = 10;

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path.map(String).join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

function describeReason(reason: unknown): string {
  if (reason instanceof Error && reason.message.length > 0) return reason.message;
  if (typeof reason === 'string' && reason.length > 0) return reason;
  return 'aborted';
}

export class ProviderHost {
  readonly provider: Provider;

  private readonly timeouts: ProviderTimeouts;
  private readonly validate: boolean;

  constructor(provider: Provider, options: ProviderHostOptions = {}) {
    this.provider = provider;
    this.timeouts = { ...DEFAULT_PROVIDER_TIMEOUTS, ...options.timeouts };
    this.validate = options.validate ?? true;
  }

  /* ---------------------------------------------------------------------- */
  /* Public host API                                                        */
  /* ---------------------------------------------------------------------- */

  async getMainPage(
    page: number,
    req: Parameters<Provider['getMainPage']>['1'],
    overrides?: CallOverrides,
  ): Promise<ProviderResult<HomePageResponse | null>> {
    return this.run(
      'getMainPage',
      (ctx) => this.provider.getMainPage(page, req, ctx),
      (raw) => (raw === null ? null : HomePageResponseSchema.parse(raw)),
      overrides,
    );
  }

  async search(
    query: string,
    page: number,
    overrides?: CallOverrides,
  ): Promise<ProviderResult<SearchPage | null>> {
    return this.run(
      'search',
      (ctx) => this.provider.search(query, page, ctx),
      (raw) => (raw === null ? null : SearchPageSchema.parse(raw)),
      overrides,
    );
  }

  async quickSearch(
    query: string,
    overrides?: CallOverrides,
  ): Promise<ProviderResult<SearchResponse[]>> {
    const quickSearch = this.provider.quickSearch;
    if (!quickSearch) {
      return this.failure('unsupported', 'quickSearch', 'Provider does not implement quickSearch');
    }
    return this.run(
      'quickSearch',
      (ctx) => quickSearch.call(this.provider, query, ctx),
      (raw) => SearchResponseListSchema.parse(raw),
      overrides,
    );
  }

  async load(
    url: string,
    overrides?: CallOverrides,
  ): Promise<ProviderResult<LoadResponse | null>> {
    return this.run(
      'load',
      (ctx) => this.provider.load(url, ctx),
      (raw) => (raw === null ? null : LoadResponseSchema.parse(raw)),
      overrides,
    );
  }

  /**
   * Host-mediated link resolution. Wraps the provider's streaming `emit`
   * callbacks in a collector: emitted links are validated, deduplicated by URL
   * (first wins) and sorted by quality descending (unknown last, stable);
   * subtitles are deduplicated per (language, url). Invalid emitted items are
   * counted, not fatal (D12).
   */
  async loadLinks(
    data: string,
    overrides?: CallOverrides,
  ): Promise<ProviderResult<LinkCollection>> {
    const collector = createLinkCollector();
    try {
      const result = await this.run(
        'loadLinks',
        (ctx) => this.provider.loadLinks(data, collector.emit, ctx),
        (raw) => HandledSchema.parse(raw),
        overrides,
      );
      if (!result.ok) return result;
      collector.setHandled(result.value);
      return { ok: true, value: collector.result() };
    } finally {
      collector.close();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Internal machinery                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Runs one provider call inside the host boundary: deadline + abort + error
   * capture, then (optional) boundary validation.
   *
   * Ordering of failure classification, after the wait settles:
   *  1. `timeout`    — the deadline timer fired (cancellation was signaled to
   *                    the provider with a `TimeoutError` reason before this).
   *  2. `aborted`    — the controller aborted for another reason (the
   *                    caller-supplied signal).
   *  3. `provider`   — the provider promise itself rejected (or threw sync).
   */
  private async run<T>(
    method: ProviderMethodName,
    invoke: (ctx: CallContext) => Promise<T> | T,
    parse: (raw: unknown) => T,
    overrides?: CallOverrides,
  ): Promise<ProviderResult<T>> {
    const external = overrides?.signal ?? null;
    if (external?.aborted) {
      return this.failure(
        'aborted',
        method,
        `Call aborted before the provider was invoked (${describeReason(external.reason)})`,
        { cause: external.reason },
      );
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(external?.reason);
    if (external) external.addEventListener('abort', onExternalAbort, { once: true });

    const timeoutMs = this.timeouts[TIMEOUT_KEY_BY_METHOD[method]];
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        const timeoutError = new TimeoutError(method, timeoutMs);
        // Signal cancellation to the provider FIRST — the abort event fires
        // synchronously to listeners, so signal-respecting providers start
        // unwinding in the same tick the host stops waiting.
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });
    // The deadline promise must never become an unhandled rejection when the
    // provider's work wins the race.
    deadline.catch(() => {});

    let raw: T;
    try {
      raw = await Promise.race([
        // `Promise.resolve().then(...)` so a SYNCHRONOUS throw from a
        // misbehaving provider becomes a rejection the boundary catches.
        Promise.resolve().then(() => invoke({ signal: controller.signal })),
        deadline,
      ]);
    } catch (err) {
      if (timedOut) {
        return this.failure(
          'timeout',
          method,
          `Provider method "${method}" timed out after ${timeoutMs}ms; cancellation was signaled via AbortSignal`,
          { cause: err },
        );
      }
      if (controller.signal.aborted) {
        return this.failure(
          'aborted',
          method,
          `Call aborted (${describeReason(controller.signal.reason)})`,
          { cause: controller.signal.reason },
        );
      }
      return this.failure('provider', method, describeCause(method, err), { cause: err });
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    }

    if (!this.validate) return { ok: true, value: raw };

    try {
      return { ok: true, value: parse(raw) };
    } catch (err) {
      const issues = err instanceof z.ZodError ? formatZodIssues(err) : [describeReason(err)];
      return this.failure(
        'validation',
        method,
        `Provider method "${method}" returned data that failed boundary validation (${issues.length} issue${issues.length === 1 ? '' : 's'} shown)`,
        { issues, cause: err },
      );
    }
  }

  private failure(
    kind: ProviderFailureKind,
    method: ProviderMethodName,
    message: string,
    extra?: Pick<ProviderFailure, 'issues' | 'cause'>,
  ): ProviderFailure {
    return {
      ok: false,
      kind,
      message,
      providerName: this.provider.name,
      method,
      ...extra,
    };
  }
}

function describeCause(method: ProviderMethodName, err: unknown): string {
  if (err instanceof Error && err.message.length > 0) {
    return `Provider method "${method}" threw: ${err.message}`;
  }
  return `Provider method "${method}" threw a non-error value: ${String(err)}`;
}
