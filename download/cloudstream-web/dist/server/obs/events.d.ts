/**
 * Structured provider-call events (roadmap Phase 2 step 5, D19).
 *
 * One event stream for the two layers the future server composes:
 *  - provider-call lifecycle (start / end with duration, outcome and a
 *    failure category aligned with `ProviderFailureKind` plus `killed`);
 *  - pass-through of the HTTP engine's already-redacted events
 *    (`HttpEngineEvent` carries origin+path only, never queries).
 *
 * REDACTION RULES (owner instruction, 2026-10-20): no response bodies, no
 * header values, no raw secrets. Error messages pass through
 * `redactEventMessage` (URLs re-redacted, length capped). Argument VALUES
 * (search queries, URLs, episode payloads) are deliberately absent from the
 * event shapes — only the METHOD name is recorded.
 *
 * `wrapProvider` is the enforcement point for the kill switch: a disabled
 * provider is never invoked; callers receive the typed
 * {@link ProviderDisabledError} and the stream records outcome `skipped`
 * with failure kind `killed`.
 */
import { type ProviderMethodName } from '../../core/provider-host';
import type { Provider } from '../../core/provider';
import type { ProviderFailureKind } from '../../core/types';
import type { HttpEngineEvent } from '../http/engine';
import type { ProviderKillSwitch } from './kill-switch';
/** Failure categories for provider-call events: the host kinds + `killed`. */
export type ProviderCallFailureKind = ProviderFailureKind | 'killed';
/** `skipped` = the provider was NOT invoked (kill switch). */
export type ProviderCallOutcome = 'success' | 'failure' | 'skipped';
export interface ProviderCallStartEvent {
    readonly kind: 'provider-call-start';
    readonly at: number;
    readonly providerName: string;
    readonly method: ProviderMethodName;
}
export interface ProviderCallEndEvent {
    readonly kind: 'provider-call-end';
    readonly at: number;
    readonly providerName: string;
    readonly method: ProviderMethodName;
    readonly durationMs: number;
    readonly outcome: ProviderCallOutcome;
    /** Present when `outcome !== 'success'`. */
    readonly failureKind?: ProviderCallFailureKind;
    /** Redacted, length-capped error text; never a stack trace. */
    readonly errorMessage?: string;
}
/** Engine event forwarded verbatim (already origin+path only — D18 §8). */
export interface ProviderEngineEvent {
    readonly kind: 'engine';
    readonly at: number;
    readonly event: HttpEngineEvent;
}
export type ProviderCallEvent = ProviderCallStartEvent | ProviderCallEndEvent | ProviderEngineEvent;
/** Typed error raised when a call is refused by the kill switch. */
export declare class ProviderDisabledError extends Error {
    readonly providerName: string;
    readonly reason?: string | undefined;
    constructor(providerName: string, reason?: string | undefined);
}
/** Information the caller reports when a started call settles. */
export interface ProviderCallEndInfo {
    outcome: ProviderCallOutcome;
    failureKind?: ProviderCallFailureKind;
    errorMessage?: string;
}
export interface ProviderCallLoggerOptions {
    /** The only output channel; receives every event. */
    sink: (event: ProviderCallEvent) => void;
    /** Injectable monotonic-ish clock (tests). Default `Date.now`. */
    clock?: () => number;
}
/**
 * Emits provider-call lifecycle events. `start()` returns the `end()`
 * function so duration measurement cannot be forgotten; both read the same
 * injectable clock. This class does not call providers — see
 * {@link wrapProvider} for the enforcement wrapper.
 */
export declare class ProviderCallLogger {
    #private;
    constructor(options: ProviderCallLoggerOptions);
    /** Emits a caller-built event verbatim (escape hatch for engine forwarding). */
    emit(event: ProviderCallEvent): void;
    /**
     * Records a call start and returns the function that records its end with
     * the measured duration. The returned function never throws.
     */
    start(providerName: string, method: ProviderMethodName): (info: ProviderCallEndInfo) => void;
    /** Returns a sink for `HttpEngineConfig.onRequestEvent` that forwards engine events. */
    engineEventSink(): (event: HttpEngineEvent) => void;
}
/** Categorizes a thrown error into a {@link ProviderCallFailureKind}. */
export declare function classifyProviderError(error: unknown): ProviderCallFailureKind;
export interface WrapProviderOptions {
    logger: ProviderCallLogger;
    /** When present, refusal is checked before EVERY method call. */
    killSwitch?: ProviderKillSwitch;
    clock?: () => number;
}
/**
 * Wraps a first-party provider so every method call:
 *  1. is refused with {@link ProviderDisabledError} when the kill switch has
 *     it disabled (event: outcome `skipped`, kind `killed`, provider NOT invoked);
 *  2. emits start/end events with duration and outcome;
 *  3. rethrows the ORIGINAL error unchanged after classification.
 *
 * The returned object implements the same `Provider` interface; absent
 * optional methods (e.g. `quickSearch`) stay absent.
 */
export declare function wrapProvider<T extends Provider>(provider: T, options: WrapProviderOptions): T;
//# sourceMappingURL=events.d.ts.map