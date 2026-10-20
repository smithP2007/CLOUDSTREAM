/**
 * Server-only JSON toolkit (roadmap Phase 2 step 3, D19).
 *
 * JSON.parse + Zod validation at provider boundaries:
 *  - {@link parseJsonSafe} — `JSON.parse` with input caps, returning a typed
 *    result instead of throwing;
 *  - {@link parseJsonWith} — parse + schema-validate in one step, with the
 *    validation issues formatted the same way the Phase 1 host formats them.
 *
 * Deliberately minimal: the project already owns Zod schemas for every
 * boundary payload (D12); this module only adds the "untrusted TEXT in,
 * typed value or typed error out" wrapper so provider code never writes a
 * bare try/catch around JSON.parse.
 */
/** Default input cap: 1 MiB of JSON is far above typical API responses. */
export const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;
/**
 * Parses JSON text with a size cap. Never throws; malformed input yields a
 * typed `invalid` error. The parsed value stays `unknown` — it must cross a
 * Zod schema before the application trusts it (D12).
 */
export function parseJsonSafe(text, options = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_JSON_BYTES;
    if (typeof text !== 'string') {
        return { ok: false, error: { kind: 'empty', message: 'JSON input must be a string' } };
    }
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        return {
            ok: false,
            error: {
                kind: 'tooLarge',
                message: `JSON input exceeds the ${maxBytes}-byte limit`,
                maxBytes,
            },
        };
    }
    if (text.trim() === '') {
        return { ok: false, error: { kind: 'empty', message: 'JSON input is empty' } };
    }
    try {
        return { ok: true, value: JSON.parse(text) };
    }
    catch (cause) {
        return {
            ok: false,
            error: { kind: 'invalid', message: `malformed JSON: ${describe(cause)}` },
        };
    }
}
/**
 * One-shot "untrusted text → parsed → schema-validated" boundary. `schema` is
 * any Zod schema; validation is non-coercive and stripping per D12 (the
 * schemas themselves carry that policy).
 */
export function parseJsonWith(schema, text, options = {}) {
    const parsed = parseJsonSafe(text, options);
    if (!parsed.ok) {
        const error = parsed.error;
        if (error.kind === 'invalid') {
            return { ok: false, error: { kind: 'invalidJson', message: error.message } };
        }
        return { ok: false, error };
    }
    const checked = schema.safeParse(parsed.value);
    if (checked.success) {
        return { ok: true, value: checked.data };
    }
    return {
        ok: false,
        error: {
            kind: 'schemaMismatch',
            message: 'value does not match the expected schema',
            issues: formatZodIssues(checked.error),
        },
    };
}
/**
 * Formats a ZodError as `path: message` strings — same shape the Phase 1
 * provider host attaches to `validation` failures, kept consistent here.
 */
export function formatZodIssues(error) {
    return error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return path === '' ? issue.message : `${path}: ${issue.message}`;
    });
}
function describe(cause) {
    return cause instanceof Error ? cause.message : String(cause);
}
//# sourceMappingURL=json.js.map