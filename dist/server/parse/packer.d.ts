/**
 * Deterministic, first-party unpacker for `p/a/c/k/e`-style packed JavaScript
 * (roadmap Phase 2 step 3, D19). "p.a.c.k.e" names the widely documented
 * `eval(function(p,a,c,k,e,d){...}('payload', radix, count, 'k|e|y|s', {}, ...))`
 * format produced by Dean Edwards' packer family — a word-substitution cipher
 * over an arithmetic payload.
 *
 * WHAT THIS DOES (and deliberately does NOT do):
 *  - It is a PURE STATIC STRING TRANSFORM. It decodes the payload with the
 *    documented algorithm (radix-encoded token → dictionary word) and returns
 *    the decoded STRING. It never parses JavaScript as code, never builds a
 *    function, never evaluates anything. Per the owner instruction of
 *    2026-10-20 the output of this module must not be executed anywhere in
 *    this project; general JS execution is deferred work requiring a
 *    separately isolated runtime and a security review (D19, D6-F).
 *  - It handles the canonical form: radix 2–62 (digits `0-9`, `a-z`, `A-Z`,
 *    matching the canonical `e(c)` decoder: `c.toString(radix)` for 0–35 and
 *    `String.fromCharCode(c + 29)` for 36–61), `|`-separated dictionary, and
 *    common JS string-literal escapes in the payload/keys arguments.
 *  - Radices above 62 (rare variants that embed arbitrary char codes) and
 *    self-modifying `e`/`d` argument variants are reported as typed failures,
 *    not guessed at.
 *
 * Every failure mode is a typed result; nothing here throws on hostile input.
 */
/** Default input cap: 1 MiB covers any sane packed block. */
export declare const DEFAULT_MAX_PACKED_BYTES: number;
/** Above this many substitution tokens the input is treated as malformed. */
export declare const MAX_TOKEN_COUNT = 200000;
export interface PackedUnpackOptions {
    /** Input size cap in bytes (UTF-8 length). Default {@link DEFAULT_MAX_PACKED_BYTES}. */
    maxBytes?: number;
}
export type PackedUnpackError = {
    kind: 'notPacked';
    message: string;
} | {
    kind: 'tooLarge';
    message: string;
    maxBytes: number;
} | {
    kind: 'malformed';
    message: string;
} | {
    kind: 'unsupportedRadix';
    message: string;
};
export type PackedUnpackResult = {
    ok: true;
    value: string;
} | {
    ok: false;
    error: PackedUnpackError;
};
/** Cheap check (no parsing): does the source contain the packer signature? */
export declare function looksPacked(source: string): boolean;
/**
 * Unpacks the FIRST `p/a/c/k/e` block found in `source`. Returns the decoded
 * payload string, or a typed error (`notPacked` when no signature is present).
 * Pure function: no evaluation, no I/O, no state.
 */
export declare function unpackPackedJavaScript(source: string, options?: PackedUnpackOptions): PackedUnpackResult;
//# sourceMappingURL=packer.d.ts.map