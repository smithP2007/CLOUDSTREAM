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
/**
 * Project-chosen defaults. NOTE: these values are OURS — the upstream default
 * timeout values were not recorded as VERIFIED in the investigation docs and
 * are deliberately not claimed here (UNKNOWN in evidence terms).
 */
export const DEFAULT_PROVIDER_TIMEOUTS = {
    getMainPageMs: 15_000,
    searchMs: 15_000,
    quickSearchMs: 10_000,
    loadMs: 20_000,
    loadLinksMs: 30_000,
};
//# sourceMappingURL=provider.js.map