/**
 * Catalog data-access layer (server-only) — the ONLY way Phase 5 pages and
 * API routes touch provider data. Every function:
 *
 *  - goes through the app runtime (ProviderHost + kill switch + pipeline),
 *    so the existing D12/D13/D19 semantics apply unchanged;
 *  - NEVER throws for provider faults: failures are typed `CatalogError`
 *    values (the host philosophy extended to the web layer);
 *  - exposes no admin capability (kill-switch state is display-only).
 */

import type { LinkCollection, ProviderFailureKind } from '../../core/types';
import type { HomePageResponse, LoadResponse, SearchPage } from '../../core/types';
import { getRuntime, type InstalledProviderMeta } from './runtime';

export type CatalogErrorKind =
  | 'not-found'
  | 'provider-failure'
  | 'provider-disabled'
  | 'bad-request';

export interface CatalogError {
  readonly kind: CatalogErrorKind;
  /** Human-readable, safe-to-render message (no URLs, no internals). */
  readonly message: string;
  readonly providerName?: string;
  /** Present when kind === 'provider-failure'. */
  readonly failureKind?: ProviderFailureKind;
  /** Structured validation issues when the host reported them. */
  readonly issues?: readonly string[];
}

export type CatalogResult<T> = { ok: true; data: T } | { ok: false; error: CatalogError };

function ok<T>(data: T): CatalogResult<T> {
  return { ok: true, data };
}

function fail<T>(error: CatalogError): CatalogResult<T> {
  return { ok: false, error };
}

/** Thrown INSIDE this module only, to carry a host failure through the pipeline's `load`. */
class HostFailure extends Error {
  constructor(public readonly failure: {
    kind: ProviderFailureKind;
    message: string;
    providerName: string;
    issues?: readonly string[];
  }) {
    super(failure.message);
    this.name = 'HostFailure';
  }
}

/** Thrown INSIDE this module when the provider does not recognize a token. */
class NotHandled extends Error {
  constructor() {
    super('provider did not handle this data token');
    this.name = 'NotHandled';
  }
}

function providerResultToError<T>(
  result: { ok: false; kind: ProviderFailureKind; message: string; providerName: string; issues?: string[] },
): CatalogResult<T> {
  return fail<T>({
    kind: 'provider-failure',
    failureKind: result.kind,
    message: result.message,
    providerName: result.providerName,
    ...(result.issues === undefined ? {} : { issues: result.issues }),
  });
}

/* -------------------------------------------------------------------------- */
/* Provider metadata + status                                                 */
/* -------------------------------------------------------------------------- */

export function listInstalledProviders(): readonly InstalledProviderMeta[] {
  return getRuntime().meta;
}

export function findProvider(id: string): InstalledProviderMeta | null {
  return getRuntime().meta.find((meta) => meta.id === id) ?? null;
}

/** Health + kill-switch view for one provider (UI-safe numbers only). */
export interface ProviderStatusView {
  readonly id: string;
  readonly name: string;
  readonly lang: string;
  readonly tvTypes: readonly string[];
  readonly mainUrl: string;
  readonly health: {
    readonly status: 'idle' | 'ok' | 'degraded' | 'down' | 'disabled';
    readonly totalCalls: number;
    readonly totalSuccesses: number;
    readonly totalFailures: number;
    readonly skippedCalls: number;
    readonly lastFailureKind: string | null;
    readonly averageDurationMs: number | null;
  };
  readonly killSwitch: {
    readonly enabled: boolean;
    readonly reason: string | null;
    readonly globallyDisabled: boolean;
  };
}

export function getProviderStatuses(): readonly ProviderStatusView[] {
  const runtime = getRuntime();
  const healthByName = new Map(runtime.health.snapshot(runtime.killSwitch).providers.map((r) => [r.name, r]));
  const globallyDisabled = runtime.killSwitch.isGloballyDisabled();
  return runtime.meta.map((meta) => {
    const record = healthByName.get(meta.name);
    const enabled = runtime.killSwitch.isEnabled(meta.name);
    return {
      id: meta.id,
      name: meta.name,
      lang: meta.lang,
      tvTypes: [...meta.tvTypes],
      mainUrl: meta.mainUrl,
      health: {
        status: record?.status ?? 'idle',
        totalCalls: record?.totalCalls ?? 0,
        totalSuccesses: record?.totalSuccesses ?? 0,
        totalFailures: record?.totalFailures ?? 0,
        skippedCalls: record?.skippedCalls ?? 0,
        lastFailureKind: record?.lastFailureKind ?? null,
        averageDurationMs: record?.averageDurationMs ?? null,
      },
      killSwitch: {
        enabled,
        reason: enabled ? null : (runtime.killSwitch.reasonFor(meta.name) ?? 'disabled'),
        globallyDisabled,
      },
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Shared guard                                                               */
/* -------------------------------------------------------------------------- */

function resolveProvider(
  providerId: string,
): { ok: true; providerName: string } | { ok: false; error: CatalogError } {
  const runtime = getRuntime();
  const meta = runtime.meta.find((entry) => entry.id === providerId);
  if (meta === undefined) {
    return {
      ok: false,
      error: { kind: 'not-found', message: `No installed provider is identified by "${providerId}".` },
    };
  }
  if (!runtime.killSwitch.isEnabled(meta.name)) {
    return {
      ok: false,
      error: {
        kind: 'provider-disabled',
        message: `Provider "${meta.name}" is currently disabled by the kill switch.`,
        providerName: meta.name,
      },
    };
  }
  return { ok: true, providerName: meta.name };
}

/* -------------------------------------------------------------------------- */
/* Catalog operations                                                         */
/* -------------------------------------------------------------------------- */

export function getHome(
  providerId: string,
  page: number,
): Promise<CatalogResult<HomePageResponse>> {
  return (async () => {
    const guard = resolveProvider(providerId);
    if (!guard.ok) return guard;
    const host = getRuntime().hosts.get(providerId);
    if (host === undefined) {
      return fail<HomePageResponse>({ kind: 'not-found', message: 'Provider host is unavailable.' });
    }
    const result = await host.getMainPage(page, { name: 'all', data: 'all' });
    if (!result.ok) return providerResultToError<HomePageResponse>(result);
    if (result.value === null) {
      return fail<HomePageResponse>({ kind: 'not-found', message: 'The provider returned no home rows for this page.' });
    }
    return ok(result.value);
  })();
}

export function search(
  providerId: string,
  query: string,
  page: number,
): Promise<CatalogResult<SearchPage>> {
  return (async () => {
    const guard = resolveProvider(providerId);
    if (!guard.ok) return guard;
    if (!Number.isInteger(page) || page < 1 || page > 1000) {
      return fail<SearchPage>({ kind: 'bad-request', message: 'Page must be an integer between 1 and 1000.' });
    }
    const host = getRuntime().hosts.get(providerId);
    if (host === undefined) {
      return fail<SearchPage>({ kind: 'not-found', message: 'Provider host is unavailable.' });
    }
    const result = await host.search(query, page);
    if (!result.ok) return providerResultToError<SearchPage>(result);
    return ok(
      result.value ?? {
        items: [],
        hasNext: false,
      },
    );
  })();
}

export function getTitle(providerId: string, detailUrl: string): Promise<CatalogResult<LoadResponse>> {
  return (async () => {
    const guard = resolveProvider(providerId);
    if (!guard.ok) return guard;
    const host = getRuntime().hosts.get(providerId);
    if (host === undefined) {
      return fail<LoadResponse>({ kind: 'not-found', message: 'Provider host is unavailable.' });
    }
    const result = await host.load(detailUrl);
    if (!result.ok) return providerResultToError<LoadResponse>(result);
    if (result.value === null) {
      return fail<LoadResponse>({ kind: 'not-found', message: 'No title matches this reference.' });
    }
    return ok(result.value);
  })();
}

/**
 * Resolves playback links + subtitles for an opaque episode token through the
 * LinkPipeline (dedupe, quality sort, single-flight TTL cache — credential-
 * bearing collections are never cached under the shared scope).
 */
export function getLinks(providerId: string, data: string): Promise<CatalogResult<LinkCollection>> {
  return (async () => {
    const guard = resolveProvider(providerId);
    if (!guard.ok) return guard;
    const runtime = getRuntime();
    const host = runtime.hosts.get(providerId);
    const provider = runtime.providers.get(providerId);
    if (host === undefined || provider === undefined) {
      return fail<LinkCollection>({ kind: 'not-found', message: 'Provider host is unavailable.' });
    }
    try {
      const { collection } = await runtime.pipeline.resolve({
        providerName: provider.name,
        episodeId: data,
        load: async () => {
          const result = await host.loadLinks(data);
          if (!result.ok) {
            throw new HostFailure({
              kind: result.kind,
              message: result.message,
              providerName: result.providerName,
              ...(result.issues === undefined ? {} : { issues: result.issues }),
            });
          }
          if (!result.value.handled) throw new NotHandled();
          return result.value;
        },
      });
      return ok(collection);
    } catch (caught) {
      if (caught instanceof NotHandled) {
        return fail<LinkCollection>({
          kind: 'not-found',
          message: 'The provider does not recognize this episode reference.',
          providerName: provider.name,
        });
      }
      if (caught instanceof HostFailure) {
        return fail<LinkCollection>({
          kind: 'provider-failure',
          failureKind: caught.failure.kind,
          message: caught.failure.message,
          providerName: caught.failure.providerName,
          ...(caught.failure.issues === undefined ? {} : { issues: caught.failure.issues }),
        });
      }
      throw caught; // genuine infrastructure error — Next error boundary handles it
    }
  })();
}
