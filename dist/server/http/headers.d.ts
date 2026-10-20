/**
 * Request-header normalization for the HTTP engine (roadmap Phase 2 task 2:
 * "header normalization for anything we replay upstream").
 *
 * Policy (D18):
 *  - Caller-supplied headers pass a DENYLIST, not an allowlist: everything
 *    hop-by-hop, plus `host` (set from the URL), `content-length` (set by the
 *    client library) and `cookie` (owned exclusively by the engine's cookie
 *    jar) is stripped. Provider API keys ride `authorization` or `x-*` names
 *    and are the operator's explicit first-party configuration.
 *  - Header names/values are validated (token charset; no CR/LF/NUL — header
 *    injection); counts and value lengths are capped.
 *  - Credential-bearing headers are REDACTED by {@link redactHeadersForLog}
 *    before anything reaches logs or events. The engine itself never logs.
 */
/** RFC 9110 §7.6.1 hop-by-hop headers — never stored or forwarded. */
export declare const HOP_BY_HOP_HEADERS: ReadonlySet<string>;
/** Headers callers may never set directly on an engine request. */
export declare const REQUEST_HEADER_DENYLIST: ReadonlySet<string>;
export interface NormalizedHeaders {
    headers: Record<string, string>;
    /** Names that were dropped (for audit events — names only, never values). */
    dropped: string[];
}
/**
 * Normalizes caller-supplied request headers: lowercases names, strips
 * denylisted headers, rejects injection attempts. Throws `TypeError` on
 * structurally invalid input (programming error, like registry.register).
 */
export declare function normalizeRequestHeaders(input: Record<string, string> | undefined, defaults?: Record<string, string>): NormalizedHeaders;
/** Headers whose VALUES must never reach logs, traces, or events. */
export declare const SENSITIVE_LOG_HEADERS: ReadonlySet<string>;
/**
 * Returns a copy safe for logs: sensitive header VALUES are replaced with
 * `[REDACTED]` (names remain for debugging). Unknown headers are kept — the
 * denylist governs what can be SENT; this governs what may be RECORDED.
 */
export declare function redactHeadersForLog(headers: Record<string, string | string[]>): Record<string, string | string[]>;
//# sourceMappingURL=headers.d.ts.map