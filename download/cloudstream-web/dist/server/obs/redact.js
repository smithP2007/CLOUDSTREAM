/**
 * Log-redaction helpers for observability (roadmap Phase 2 step 5, D19).
 *
 * Rules enforced across every event this project emits:
 *  - header VALUES: reused from the engine's `redactHeadersForLog`
 *    (cookie / authorization / proxy-authorization / set-cookie);
 *  - URL credentials: userinfo NEVER survives (URL.origin drops it);
 *  - URL query parameters whose NAME looks sensitive: value replaced with
 *    `[REDACTED]` — the name is kept for debugging;
 *  - URL fragments: dropped (tokens sometimes hide there);
 *  - free-text event messages: URLs inside them re-redacted, total length
 *    capped; response bodies are never attached to events at all.
 *
 * HONEST LIMITATION (D19): query/header redaction is NAME-based (a fixed
 * denylist). A non-standard credential parameter with an unlisted name could
 * still be logged if a provider put one in an event. The structural defense
 * is that provider-call events carry only provider/method/duration/outcome —
 * URLs and headers appear only in the narrow, explicitly redacted fields.
 */
import { redactHeadersForLog, SENSITIVE_LOG_HEADERS } from '../http/headers';
export { redactHeadersForLog, SENSITIVE_LOG_HEADERS };
/**
 * Query-parameter names whose values are treated as credentials.
 * Matched case-insensitively and also as substrings of longer names
 * (e.g. `session_id`, `access_token_v2`).
 */
export const SENSITIVE_QUERY_PARAMS = new Set([
    'auth',
    'authorization',
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'api_key',
    'apikey',
    'key',
    'secret',
    'password',
    'passwd',
    'pwd',
    'session',
    'sessionid',
    'sid',
    'signin',
    'sig',
    'signature',
    'oauth',
    'credential',
    'credentials',
    'jwt',
    'otp',
]);
/** Placeholder written for every redacted value. */
export const REDACTED_PLACEHOLDER = '[REDACTED]';
/** Returned for inputs that do not parse as an absolute http(s) URL. */
const UNPARSEABLE_URL_PLACEHOLDER = '[redacted-url]';
function isSensitiveQueryParam(name) {
    const lowered = name.toLowerCase();
    for (const candidate of SENSITIVE_QUERY_PARAMS) {
        if (lowered === candidate || lowered.includes(candidate))
            return true;
    }
    return false;
}
/**
 * Renders a URL safe for logs/traces/events: origin + path kept, userinfo
 * dropped, sensitive query values replaced, fragment dropped. Non-absolute
 * or unparseable inputs collapse to a placeholder — a relative string can
 * still be sensitive and is never echoed raw.
 */
export function redactUrlForLog(url) {
    if (typeof url !== 'string' || url.trim() === '')
        return UNPARSEABLE_URL_PLACEHOLDER;
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return UNPARSEABLE_URL_PLACEHOLDER;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return UNPARSEABLE_URL_PLACEHOLDER;
    }
    const searchParams = new URLSearchParams(parsed.search);
    for (const name of [...searchParams.keys()]) {
        if (isSensitiveQueryParam(name)) {
            searchParams.set(name, REDACTED_PLACEHOLDER);
        }
    }
    const query = searchParams.toString();
    return `${parsed.origin}${parsed.pathname}${query === '' ? '' : `?${query}`}`;
}
/** Upper bound for message text carried by events. */
export const MAX_LOG_MESSAGE_LENGTH = 500;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/g;
/**
 * Redacts a free-text message for logging: every URL inside it is re-rendered
 * through {@link redactUrlForLog}, and the result is length-capped.
 */
export function redactEventMessage(message) {
    if (typeof message !== 'string')
        return '';
    let out = message.replace(URL_IN_TEXT, (match) => redactUrlForLog(match));
    if (out.length > MAX_LOG_MESSAGE_LENGTH) {
        out = `${out.slice(0, MAX_LOG_MESSAGE_LENGTH)}…`;
    }
    return out;
}
//# sourceMappingURL=redact.js.map