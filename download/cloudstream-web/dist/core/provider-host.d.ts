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
import type { HomePageResponse, LinkCollection, LoadResponse, ProviderResult, SearchPage, SearchResponse } from './types';
import { type Provider, type ProviderTimeouts } from './provider';
/** Provider method names — the `method` field of a {@link ProviderFailure}. */
export type ProviderMethodName = 'getMainPage' | 'search' | 'quickSearch' | 'load' | 'loadLinks';
/**
 * Thrown (as the abort reason) when a per-method deadline elapses. Providers
 * can observe it via `ctx.signal.reason`; the host classifies such calls as
 * failure kind `timeout`.
 */
export declare class TimeoutError extends Error {
    readonly method: ProviderMethodName;
    readonly timeoutMs: number;
    constructor(method: ProviderMethodName, timeoutMs: number);
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
export declare class ProviderHost {
    readonly provider: Provider;
    private readonly timeouts;
    private readonly validate;
    constructor(provider: Provider, options?: ProviderHostOptions);
    getMainPage(page: number, req: Parameters<Provider['getMainPage']>['1'], overrides?: CallOverrides): Promise<ProviderResult<HomePageResponse | null>>;
    search(query: string, page: number, overrides?: CallOverrides): Promise<ProviderResult<SearchPage | null>>;
    quickSearch(query: string, overrides?: CallOverrides): Promise<ProviderResult<SearchResponse[]>>;
    load(url: string, overrides?: CallOverrides): Promise<ProviderResult<LoadResponse | null>>;
    /**
     * Host-mediated link resolution. Wraps the provider's streaming `emit`
     * callbacks in a collector: emitted links are validated, deduplicated by URL
     * (first wins) and sorted by quality descending (unknown last, stable);
     * subtitles are deduplicated per (language, url). Invalid emitted items are
     * counted, not fatal (D12).
     */
    loadLinks(data: string, overrides?: CallOverrides): Promise<ProviderResult<LinkCollection>>;
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
    private run;
    private failure;
}
//# sourceMappingURL=provider-host.d.ts.map