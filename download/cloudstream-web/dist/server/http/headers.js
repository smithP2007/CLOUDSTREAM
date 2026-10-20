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
export const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'trailers',
    'transfer-encoding',
    'upgrade',
]);
/** Headers callers may never set directly on an engine request. */
export const REQUEST_HEADER_DENYLIST = new Set([
    ...HOP_BY_HOP_HEADERS,
    'host', // derived from the (validated) URL
    'content-length', // derived from the body
    'cookie', // owned by the engine's per-provider cookie jar
]);
const MAX_HEADER_COUNT = 50;
const MAX_HEADER_VALUE_LENGTH = 4096;
const HEADER_NAME_RE = /^[a-z0-9!#$%&'*+\-.^_`|~]+$/;
/**
 * Normalizes caller-supplied request headers: lowercases names, strips
 * denylisted headers, rejects injection attempts. Throws `TypeError` on
 * structurally invalid input (programming error, like registry.register).
 */
export function normalizeRequestHeaders(input, defaults = {}) {
    const headers = {};
    const dropped = [];
    const add = (rawName, rawValue, source) => {
        const name = String(rawName).trim().toLowerCase();
        const value = String(rawValue ?? '').trim();
        if (!HEADER_NAME_RE.test(name)) {
            throw new TypeError(`invalid ${source} header name: ${JSON.stringify(String(rawName))}`);
        }
        if (/[^\t\x20-\x7e]/.test(value)) {
            throw new TypeError(`invalid characters in ${source} header '${name}' (CR/LF/NUL forbidden)`);
        }
        if (value.length > MAX_HEADER_VALUE_LENGTH) {
            throw new TypeError(`${source} header '${name}' exceeds ${MAX_HEADER_VALUE_LENGTH} chars`);
        }
        if (REQUEST_HEADER_DENYLIST.has(name)) {
            if (!dropped.includes(name))
                dropped.push(name);
            return;
        }
        headers[name] = value;
    };
    for (const [name, value] of Object.entries(defaults))
        add(name, value, 'default');
    if (input !== undefined) {
        const entries = Object.entries(input);
        if (entries.length > MAX_HEADER_COUNT) {
            throw new TypeError(`too many request headers (${entries.length} > ${MAX_HEADER_COUNT})`);
        }
        for (const [name, value] of entries)
            add(name, value, 'request');
    }
    return { headers, dropped };
}
/** Headers whose VALUES must never reach logs, traces, or events. */
export const SENSITIVE_LOG_HEADERS = new Set([
    'cookie',
    'set-cookie',
    'authorization',
    'proxy-authorization',
]);
/**
 * Returns a copy safe for logs: sensitive header VALUES are replaced with
 * `[REDACTED]` (names remain for debugging). Unknown headers are kept — the
 * denylist governs what can be SENT; this governs what may be RECORDED.
 */
export function redactHeadersForLog(headers) {
    const out = {};
    for (const [name, value] of Object.entries(headers)) {
        out[name] = SENSITIVE_LOG_HEADERS.has(name.toLowerCase()) ? '[REDACTED]' : value;
    }
    return out;
}
//# sourceMappingURL=headers.js.map