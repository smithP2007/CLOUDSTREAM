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
import type { ZodError, ZodType } from 'zod';
/** Default input cap: 1 MiB of JSON is far above typical API responses. */
export declare const DEFAULT_MAX_JSON_BYTES: number;
export interface JsonParseOptions {
    /** Input size cap in bytes (UTF-8 length). Default {@link DEFAULT_MAX_JSON_BYTES}. */
    maxBytes?: number;
}
export type JsonParseError = {
    kind: 'empty';
    message: string;
} | {
    kind: 'tooLarge';
    message: string;
    maxBytes: number;
} | {
    kind: 'invalid';
    message: string;
};
export type JsonParseResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: JsonParseError;
};
/**
 * Parses JSON text with a size cap. Never throws; malformed input yields a
 * typed `invalid` error. The parsed value stays `unknown` — it must cross a
 * Zod schema before the application trusts it (D12).
 */
export declare function parseJsonSafe(text: string, options?: JsonParseOptions): JsonParseResult;
/** Error variants for {@link parseJsonWith}. */
export type JsonSchemaError = {
    kind: 'empty';
    message: string;
} | {
    kind: 'tooLarge';
    message: string;
    maxBytes: number;
} | {
    kind: 'invalidJson';
    message: string;
} | {
    kind: 'schemaMismatch';
    message: string;
    issues: string[];
};
export type JsonSchemaResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: JsonSchemaError;
};
/**
 * One-shot "untrusted text → parsed → schema-validated" boundary. `schema` is
 * any Zod schema; validation is non-coercive and stripping per D12 (the
 * schemas themselves carry that policy).
 */
export declare function parseJsonWith<T>(schema: ZodType<T>, text: string, options?: JsonParseOptions): JsonSchemaResult<T>;
/**
 * Formats a ZodError as `path: message` strings — same shape the Phase 1
 * provider host attaches to `validation` failures, kept consistent here.
 */
export declare function formatZodIssues(error: ZodError): string[];
//# sourceMappingURL=json.d.ts.map