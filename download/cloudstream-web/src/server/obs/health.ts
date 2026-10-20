/**
 * Provider health tracking (roadmap Phase 2 step 5, D19) — the internal
 * primitive behind the future `GET /api/providers/health` endpoint.
 *
 * The tracker keeps NUMBERS and TIMESTAMPS per provider (counts, streaks,
 * durations) — never payloads, never error text, never credentials — so the
 * health view is safe to expose later. State is in-memory: it resets on
 * restart (D19 limitations).
 *
 * Wire contract: the Zod schemas at the bottom of this file ARE the future
 * endpoint's response contract (documented in D19). This phase implements no
 * HTTP surface — an admin/health endpoint requires the authenticated surface
 * gate from POLICY.md §2 and is recorded as future work.
 */

import { z } from 'zod';
import type { ProviderCallFailureKind } from './events';
import type { ProviderKillSwitch } from './kill-switch';

/**
 * Consecutive failures at which a provider is considered `down`.
 * One or two consecutive failures leave it `degraded` (transient blips).
 */
export const DOWN_AFTER_CONSECUTIVE_FAILURES = 3;

export type ProviderHealthStatus = 'idle' | 'ok' | 'degraded' | 'down' | 'disabled';

export interface ProviderHealthRecord {
  readonly name: string;
  readonly enabled: boolean;
  readonly status: ProviderHealthStatus;
  /** Calls that actually reached the provider (skipped calls excluded). */
  readonly totalCalls: number;
  readonly totalSuccesses: number;
  readonly totalFailures: number;
  /** Calls refused by the kill switch (provider never invoked). */
  readonly skippedCalls: number;
  readonly consecutiveFailures: number;
  readonly lastSuccessAt: number | null;
  readonly lastFailureAt: number | null;
  readonly lastFailureKind: ProviderCallFailureKind | null;
  readonly lastDurationMs: number | null;
  readonly averageDurationMs: number | null;
}

interface MutableRecord {
  totalCalls: number;
  totalSuccesses: number;
  totalFailures: number;
  skippedCalls: number;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureKind: ProviderCallFailureKind | null;
  lastDurationMs: number | null;
  durationSumMs: number;
}

export interface ProviderHealthSnapshot {
  readonly generatedAt: number;
  readonly providers: readonly ProviderHealthRecord[];
}

export class ProviderHealthTracker {
  readonly #records = new Map<string, MutableRecord>();

  /** Records a successful provider call (duration optional but recommended). */
  recordSuccess(providerName: string, durationMs?: number, at: number = Date.now()): void {
    const record = this.#recordFor(providerName);
    record.totalCalls += 1;
    record.totalSuccesses += 1;
    record.consecutiveFailures = 0;
    record.lastSuccessAt = at;
    if (durationMs !== undefined) {
      record.lastDurationMs = durationMs;
      record.durationSumMs += durationMs;
    }
  }

  /** Records a failed provider call; `kind` comes from the call event stream. */
  recordFailure(
    providerName: string,
    kind: ProviderCallFailureKind,
    durationMs?: number,
    at: number = Date.now(),
  ): void {
    const record = this.#recordFor(providerName);
    record.totalCalls += 1;
    record.totalFailures += 1;
    record.consecutiveFailures += 1;
    record.lastFailureAt = at;
    record.lastFailureKind = kind;
    if (durationMs !== undefined) {
      record.lastDurationMs = durationMs;
      record.durationSumMs += durationMs;
    }
  }

  /** Records a call refused by the kill switch (never reaches the provider). */
  recordSkipped(providerName: string): void {
    const record = this.#recordFor(providerName);
    record.skippedCalls += 1;
  }

  /** In-memory snapshot; deterministic provider order (sorted by name). */
  snapshot(killSwitch?: ProviderKillSwitch, at: number = Date.now()): ProviderHealthSnapshot {
    const names = [...this.#records.keys()].sort((a, b) => a.localeCompare(b));
    const providers = names.map((name) =>
      this.#render(name, this.#records.get(name) as MutableRecord, killSwitch),
    );
    return { generatedAt: at, providers };
  }

  #recordFor(providerName: string): MutableRecord {
    const existing = this.#records.get(providerName);
    if (existing !== undefined) return existing;
    const fresh: MutableRecord = {
      totalCalls: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      skippedCalls: 0,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureKind: null,
      lastDurationMs: null,
      durationSumMs: 0,
    };
    this.#records.set(providerName, fresh);
    return fresh;
  }

  #render(
    name: string,
    record: MutableRecord,
    killSwitch: ProviderKillSwitch | undefined,
  ): ProviderHealthRecord {
    const enabled = killSwitch === undefined ? true : killSwitch.isEnabled(name);
    const status = deriveStatus(record, enabled);
    const average =
      record.totalCalls > 0 && record.durationSumMs > 0
        ? Math.round(record.durationSumMs / record.totalCalls)
        : null;
    return {
      name,
      enabled,
      status,
      totalCalls: record.totalCalls,
      totalSuccesses: record.totalSuccesses,
      totalFailures: record.totalFailures,
      skippedCalls: record.skippedCalls,
      consecutiveFailures: record.consecutiveFailures,
      lastSuccessAt: record.lastSuccessAt,
      lastFailureAt: record.lastFailureAt,
      lastFailureKind: record.lastFailureKind,
      lastDurationMs: record.lastDurationMs,
      averageDurationMs: average,
    };
  }
}

function deriveStatus(record: MutableRecord, enabled: boolean): ProviderHealthStatus {
  if (!enabled) return 'disabled';
  if (record.totalCalls === 0) return 'idle';
  if (record.consecutiveFailures >= DOWN_AFTER_CONSECUTIVE_FAILURES) return 'down';
  if (record.consecutiveFailures >= 1) return 'degraded';
  return 'ok';
}

/* -------------------------------------------------------------------------- */
/* Future API contract (Zod) — NOT served anywhere in this phase (D19)         */
/* -------------------------------------------------------------------------- */

const FAILURE_KINDS = ['timeout', 'aborted', 'validation', 'unsupported', 'provider', 'killed'] as const;

export const ProviderHealthApiRecordSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  status: z.enum(['idle', 'ok', 'degraded', 'down', 'disabled']),
  totalCalls: z.number().int().nonnegative(),
  totalSuccesses: z.number().int().nonnegative(),
  totalFailures: z.number().int().nonnegative(),
  skippedCalls: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
  /** ISO-8601 timestamps, null when never observed. */
  lastSuccessAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  lastFailureKind: z.enum(FAILURE_KINDS).nullable(),
  lastDurationMs: z.number().nullable(),
  averageDurationMs: z.number().nullable(),
});

export const ProviderHealthSnapshotSchema = z.object({
  generatedAt: z.string(),
  providers: z.array(ProviderHealthApiRecordSchema),
});

export type ProviderHealthApiRecord = z.infer<typeof ProviderHealthApiRecordSchema>;
export type ProviderHealthApiSnapshot = z.infer<typeof ProviderHealthSnapshotSchema>;

/**
 * Renders the tracker snapshot into the future endpoint's wire shape
 * (ISO timestamps); `validate: true` checks it against its own schema — a
 * drift between the two fails loudly in tests, not in production.
 */
export function toApiSnapshot(
  snapshot: ProviderHealthSnapshot,
  validate?: boolean,
): ProviderHealthApiSnapshot {
  const api: ProviderHealthApiSnapshot = {
    generatedAt: new Date(snapshot.generatedAt).toISOString(),
    providers: snapshot.providers.map((record) => ({
      name: record.name,
      enabled: record.enabled,
      status: record.status,
      totalCalls: record.totalCalls,
      totalSuccesses: record.totalSuccesses,
      totalFailures: record.totalFailures,
      skippedCalls: record.skippedCalls,
      consecutiveFailures: record.consecutiveFailures,
      lastSuccessAt:
        record.lastSuccessAt === null ? null : new Date(record.lastSuccessAt).toISOString(),
      lastFailureAt:
        record.lastFailureAt === null ? null : new Date(record.lastFailureAt).toISOString(),
      lastFailureKind: record.lastFailureKind,
      lastDurationMs: record.lastDurationMs,
      averageDurationMs: record.averageDurationMs,
    })),
  };
  if (validate === true) {
    const checked = ProviderHealthSnapshotSchema.safeParse(api);
    if (!checked.success) {
      throw new TypeError(`health API snapshot violates its own contract: ${checked.error.message}`);
    }
  }
  return api;
}
