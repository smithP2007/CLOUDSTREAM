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
export declare const SENSITIVE_QUERY_PARAMS: ReadonlySet<string>;
/** Placeholder written for every redacted value. */
export declare const REDACTED_PLACEHOLDER = "[REDACTED]";
/**
 * Renders a URL safe for logs/traces/events: origin + path kept, userinfo
 * dropped, sensitive query values replaced, fragment dropped. Non-absolute
 * or unparseable inputs collapse to a placeholder — a relative string can
 * still be sensitive and is never echoed raw.
 */
export declare function redactUrlForLog(url: string): string;
/** Upper bound for message text carried by events. */
export declare const MAX_LOG_MESSAGE_LENGTH = 500;
/**
 * Redacts a free-text message for logging: every URL inside it is re-rendered
 * through {@link redactUrlForLog}, and the result is length-capped.
 */
export declare function redactEventMessage(message: string): string;
//# sourceMappingURL=redact.d.ts.map