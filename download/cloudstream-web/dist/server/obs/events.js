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
import { ZodError } from 'zod';
import { TimeoutError } from '../../core/provider-host';
import { redactEventMessage } from './redact';
/** Typed error raised when a call is refused by the kill switch. */
export class ProviderDisabledError extends Error {
    providerName;
    reason;
    constructor(providerName, reason) {
        super(`provider "${providerName}" is disabled by the kill switch` +
            (reason === undefined ? '' : `: ${reason}`));
        this.providerName = providerName;
        this.reason = reason;
        this.name = 'ProviderDisabledError';
    }
}
/**
 * Emits provider-call lifecycle events. `start()` returns the `end()`
 * function so duration measurement cannot be forgotten; both read the same
 * injectable clock. This class does not call providers — see
 * {@link wrapProvider} for the enforcement wrapper.
 */
export class ProviderCallLogger {
    #sink;
    #clock;
    constructor(options) {
        this.#sink = options.sink;
        this.#clock = options.clock ?? Date.now;
    }
    /** Emits a caller-built event verbatim (escape hatch for engine forwarding). */
    emit(event) {
        this.#sink(event);
    }
    /**
     * Records a call start and returns the function that records its end with
     * the measured duration. The returned function never throws.
     */
    start(providerName, method) {
        const startedAt = this.#clock();
        this.#sink({
            kind: 'provider-call-start',
            at: startedAt,
            providerName,
            method,
        });
        return (info) => {
            const endedAt = this.#clock();
            const event = {
                kind: 'provider-call-end',
                at: endedAt,
                providerName,
                method,
                durationMs: Math.max(0, endedAt - startedAt),
                outcome: info.outcome,
                ...(info.failureKind === undefined ? {} : { failureKind: info.failureKind }),
                ...(info.errorMessage === undefined
                    ? {}
                    : { errorMessage: redactEventMessage(info.errorMessage) }),
            };
            this.#sink(event);
        };
    }
    /** Returns a sink for `HttpEngineConfig.onRequestEvent` that forwards engine events. */
    engineEventSink() {
        return (event) => {
            this.#sink({ kind: 'engine', at: this.#clock(), event });
        };
    }
}
/** Categorizes a thrown error into a {@link ProviderCallFailureKind}. */
export function classifyProviderError(error) {
    if (error instanceof ProviderDisabledError)
        return 'killed';
    if (error instanceof TimeoutError || (error instanceof Error && error.name === 'TimeoutError')) {
        return 'timeout';
    }
    if (error instanceof Error && error.name === 'AbortError')
        return 'aborted';
    if (error instanceof ZodError)
        return 'validation';
    return 'provider';
}
const PROVIDER_METHODS = ['getMainPage', 'search', 'quickSearch', 'load', 'loadLinks'];
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
export function wrapProvider(provider, options) {
    const logger = options.clock === undefined
        ? options.logger
        : new ProviderCallLogger({ sink: (event) => options.logger.emit(event), clock: options.clock });
    const killSwitch = options.killSwitch;
    const wrapped = { ...provider };
    for (const method of PROVIDER_METHODS) {
        const original = wrapped[method];
        if (typeof original !== 'function')
            continue;
        wrapped[method] = (...args) => callWithObservability(provider, method, original, args, logger, killSwitch);
    }
    return wrapped;
}
async function callWithObservability(provider, method, original, args, logger, killSwitch) {
    if (killSwitch !== undefined && !killSwitch.isEnabled(provider.name)) {
        const error = new ProviderDisabledError(provider.name, killSwitch.reasonFor(provider.name));
        const end = logger.start(provider.name, method);
        end({ outcome: 'skipped', failureKind: 'killed', errorMessage: error.message });
        throw error;
    }
    const end = logger.start(provider.name, method);
    try {
        const result = await original.apply(provider, args);
        end({ outcome: 'success' });
        return result;
    }
    catch (error) {
        end({
            outcome: 'failure',
            failureKind: classifyProviderError(error),
            errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
//# sourceMappingURL=events.js.map