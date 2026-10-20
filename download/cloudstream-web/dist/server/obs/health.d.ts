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
export declare const DOWN_AFTER_CONSECUTIVE_FAILURES = 3;
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
export interface ProviderHealthSnapshot {
    readonly generatedAt: number;
    readonly providers: readonly ProviderHealthRecord[];
}
export declare class ProviderHealthTracker {
    #private;
    /** Records a successful provider call (duration optional but recommended). */
    recordSuccess(providerName: string, durationMs?: number, at?: number): void;
    /** Records a failed provider call; `kind` comes from the call event stream. */
    recordFailure(providerName: string, kind: ProviderCallFailureKind, durationMs?: number, at?: number): void;
    /** Records a call refused by the kill switch (never reaches the provider). */
    recordSkipped(providerName: string): void;
    /** In-memory snapshot; deterministic provider order (sorted by name). */
    snapshot(killSwitch?: ProviderKillSwitch, at?: number): ProviderHealthSnapshot;
}
export declare const ProviderHealthApiRecordSchema: z.ZodObject<{
    name: z.ZodString;
    enabled: z.ZodBoolean;
    status: z.ZodEnum<{
        ok: "ok";
        idle: "idle";
        degraded: "degraded";
        down: "down";
        disabled: "disabled";
    }>;
    totalCalls: z.ZodNumber;
    totalSuccesses: z.ZodNumber;
    totalFailures: z.ZodNumber;
    skippedCalls: z.ZodNumber;
    consecutiveFailures: z.ZodNumber;
    lastSuccessAt: z.ZodNullable<z.ZodString>;
    lastFailureAt: z.ZodNullable<z.ZodString>;
    lastFailureKind: z.ZodNullable<z.ZodEnum<{
        timeout: "timeout";
        aborted: "aborted";
        validation: "validation";
        unsupported: "unsupported";
        provider: "provider";
        killed: "killed";
    }>>;
    lastDurationMs: z.ZodNullable<z.ZodNumber>;
    averageDurationMs: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export declare const ProviderHealthSnapshotSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    providers: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        enabled: z.ZodBoolean;
        status: z.ZodEnum<{
            ok: "ok";
            idle: "idle";
            degraded: "degraded";
            down: "down";
            disabled: "disabled";
        }>;
        totalCalls: z.ZodNumber;
        totalSuccesses: z.ZodNumber;
        totalFailures: z.ZodNumber;
        skippedCalls: z.ZodNumber;
        consecutiveFailures: z.ZodNumber;
        lastSuccessAt: z.ZodNullable<z.ZodString>;
        lastFailureAt: z.ZodNullable<z.ZodString>;
        lastFailureKind: z.ZodNullable<z.ZodEnum<{
            timeout: "timeout";
            aborted: "aborted";
            validation: "validation";
            unsupported: "unsupported";
            provider: "provider";
            killed: "killed";
        }>>;
        lastDurationMs: z.ZodNullable<z.ZodNumber>;
        averageDurationMs: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ProviderHealthApiRecord = z.infer<typeof ProviderHealthApiRecordSchema>;
export type ProviderHealthApiSnapshot = z.infer<typeof ProviderHealthSnapshotSchema>;
/**
 * Renders the tracker snapshot into the future endpoint's wire shape
 * (ISO timestamps); `validate: true` checks it against its own schema — a
 * drift between the two fails loudly in tests, not in production.
 */
export declare function toApiSnapshot(snapshot: ProviderHealthSnapshot, validate?: boolean): ProviderHealthApiSnapshot;
//# sourceMappingURL=health.d.ts.map