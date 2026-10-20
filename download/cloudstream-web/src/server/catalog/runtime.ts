/**
 * App runtime (server-only) — the composition root that wires the Phase 5
 * app to the EXISTING machinery instead of inventing a second provider
 * system:
 *
 *  - the Phase 1 `ProviderHost` (error boundary, timeouts, D12 validation),
 *  - the Phase 2 `LinkPipeline` (dedupe/quality-sort + single-flight TTL
 *    cache, 20-minute default mirroring upstream),
 *  - the D19 observability layer: structured call events, the kill switch
 *    (enforced via `wrapProvider` BEFORE any provider method runs) and the
 *    health tracker (fed from the same event stream).
 *
 * The runtime is cached on `globalThis` (Symbol.for) so Next.js dev-mode
 * module reloading cannot silently fork kill-switch/health state across
 * route modules. There is deliberately NO admin mutation surface here: the
 * remote kill-switch admin API is future work gated on the authenticated
 * surface decision (D19; POLICY.md §2) — the Phase 5 UI only DISPLAYS
 * kill-switch state.
 */

import { ProviderHost } from '../../core/provider-host';
import type { Provider } from '../../core/provider';
import type { TvType } from '../../core/types';
import { LinkPipeline } from '../links/pipeline';
import { ProviderCallLogger, wrapProvider } from '../obs/events';
import { ProviderHealthTracker } from '../obs/health';
import { ProviderKillSwitch } from '../obs/kill-switch';
import { createMockProvider, MOCK_MAIN_URL, MOCK_PROVIDER_ID, MOCK_PROVIDER_NAME } from '../providers/mock';

/** UI-facing description of one installed provider. */
export interface InstalledProviderMeta {
  readonly id: string;
  readonly name: string;
  readonly mainUrl: string;
  readonly lang: string;
  readonly tvTypes: readonly TvType[];
}

export interface AppRuntime {
  readonly killSwitch: ProviderKillSwitch;
  readonly health: ProviderHealthTracker;
  readonly logger: ProviderCallLogger;
  readonly pipeline: LinkPipeline;
  /** provider id → kill-switch-aware, observability-wrapped provider. */
  readonly providers: ReadonlyMap<string, Provider>;
  /** provider id → host (boundary + validation + timeouts). */
  readonly hosts: ReadonlyMap<string, ProviderHost>;
  readonly meta: readonly InstalledProviderMeta[];
}

const RUNTIME_KEY = Symbol.for('cloudstream-web.app-runtime');

function buildRuntime(): AppRuntime {
  const killSwitch = new ProviderKillSwitch();
  const health = new ProviderHealthTracker();
  const logger = new ProviderCallLogger({
    sink: (event) => {
      // Health tracking derives from the SAME event stream (single source of
      // truth): successful calls, failures (with kind), and kill-switch skips.
      if (event.kind === 'provider-call-end') {
        if (event.outcome === 'success') {
          health.recordSuccess(event.providerName, event.durationMs, event.at);
        } else if (event.outcome === 'failure') {
          health.recordFailure(
            event.providerName,
            event.failureKind ?? 'provider',
            event.durationMs,
            event.at,
          );
        } else {
          health.recordSkipped(event.providerName);
        }
      }
      // Structured, already-redacted log line (D19: no bodies, no header
      // values, no raw query strings — the event shapes carry none).
      if (event.kind === 'provider-call-end') {
        console.info(
          `[provider-call] ${event.providerName} ${event.method} ${event.outcome}` +
            `${event.failureKind ? ` (${event.failureKind})` : ''} ${event.durationMs}ms`,
        );
      }
    },
  });

  const providers = new Map<string, Provider>();
  const hosts = new Map<string, ProviderHost>();
  const meta: InstalledProviderMeta[] = [];

  const mock = wrapProvider(createMockProvider(), { logger, killSwitch });
  providers.set(MOCK_PROVIDER_ID, mock);
  hosts.set(MOCK_PROVIDER_ID, new ProviderHost(mock));
  meta.push({
    id: MOCK_PROVIDER_ID,
    name: MOCK_PROVIDER_NAME,
    mainUrl: MOCK_MAIN_URL,
    lang: 'en',
    tvTypes: ['Movie', 'TvSeries', 'Anime', 'Documentary', 'Live'],
  });

  return { killSwitch, health, logger, pipeline: new LinkPipeline(), providers, hosts, meta };
}

/** Returns the process-wide app runtime, creating it on first use. */
export function getRuntime(): AppRuntime {
  const holder = globalThis as unknown as Record<symbol, AppRuntime | undefined>;
  const existing = holder[RUNTIME_KEY];
  if (existing !== undefined) return existing;
  const created = buildRuntime();
  holder[RUNTIME_KEY] = created;
  return created;
}
