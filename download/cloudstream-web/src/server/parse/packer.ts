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
export const DEFAULT_MAX_PACKED_BYTES = 1024 * 1024;

/** Above this many substitution tokens the input is treated as malformed. */
export const MAX_TOKEN_COUNT = 200_000;

export interface PackedUnpackOptions {
  /** Input size cap in bytes (UTF-8 length). Default {@link DEFAULT_MAX_PACKED_BYTES}. */
  maxBytes?: number;
}

export type PackedUnpackError =
  | { kind: 'notPacked'; message: string }
  | { kind: 'tooLarge'; message: string; maxBytes: number }
  | { kind: 'malformed'; message: string }
  | { kind: 'unsupportedRadix'; message: string };

export type PackedUnpackResult =
  | { ok: true; value: string }
  | { ok: false; error: PackedUnpackError };

/** Signature of the canonical packer wrapper function. */
const SIGNATURE =
  /function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)/;

/** Digits for radix ≤ 62 — matches the canonical `e(c)` mapping. */
const BASE_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Cheap check (no parsing): does the source contain the packer signature? */
export function looksPacked(source: string): boolean {
  return typeof source === 'string' && SIGNATURE.test(source);
}

/**
 * Unpacks the FIRST `p/a/c/k/e` block found in `source`. Returns the decoded
 * payload string, or a typed error (`notPacked` when no signature is present).
 * Pure function: no evaluation, no I/O, no state.
 */
export function unpackPackedJavaScript(
  source: string,
  options: PackedUnpackOptions = {},
): PackedUnpackResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_PACKED_BYTES;
  if (typeof source !== 'string' || !SIGNATURE.test(source)) {
    return {
      ok: false,
      error: { kind: 'notPacked', message: 'no p/a/c/k/e signature found in the input' },
    };
  }
  if (Buffer.byteLength(source, 'utf8') > maxBytes) {
    return {
      ok: false,
      error: { kind: 'tooLarge', message: `packed input exceeds the ${maxBytes}-byte limit`, maxBytes },
    };
  }

  // Locate the end of the wrapper function body: the first `}` AFTER the
  // signature that is directly followed by the call's `(` (canonical form:
  // `...return p}('...')`).
  const signatureMatch = SIGNATURE.exec(source);
  if (signatureMatch === null) {
    return {
      ok: false,
      error: { kind: 'notPacked', message: 'no p/a/c/k/e signature found in the input' },
    };
  }
  const afterSignature = signatureMatch.index + signatureMatch[0].length;
  const bodyEnd = /\}\s*\(/.exec(source.slice(afterSignature));
  if (bodyEnd === null) {
    return { ok: false, error: { kind: 'malformed', message: 'packer function body end not found' } };
  }
  const callOpenIndex =
    afterSignature + bodyEnd.index + bodyEnd[0].length - 1; // index of '('

  const args = splitCallArguments(source, callOpenIndex + 1);
  if (!args.ok) {
    return {
      ok: false,
      error: { kind: 'malformed', message: args.message ?? 'packer call arguments are unusable' },
    };
  }
  if (args.values.length < 4) {
    return {
      ok: false,
      error: { kind: 'malformed', message: `expected ≥4 packer arguments, found ${args.values.length}` },
    };
  }

  const payloadArg = args.values[0];
  const radixArg = args.values[1];
  const countArg = args.values[2];
  const keysArg = args.values[3];
  if (
    payloadArg === undefined ||
    radixArg === undefined ||
    countArg === undefined ||
    keysArg === undefined
  ) {
    return { ok: false, error: { kind: 'malformed', message: 'packer arguments are incomplete' } };
  }

  const payload = unescapeJsString(payloadArg);
  if (payload === null) {
    return { ok: false, error: { kind: 'malformed', message: 'payload argument is not a usable string literal' } };
  }
  const keysLiteral = parseKeysArgument(keysArg);
  if (keysLiteral === null) {
    return { ok: false, error: { kind: 'malformed', message: 'keys argument is not a usable string literal' } };
  }

  const radix = parseIntegerArg(radixArg);
  if (radix === null) {
    return { ok: false, error: { kind: 'malformed', message: 'radix argument is not an integer literal' } };
  }
  if (radix < 2 || radix > 62) {
    return {
      ok: false,
      error: { kind: 'unsupportedRadix', message: `radix ${radix} is outside the supported 2–62 range` },
    };
  }

  const count = parseIntegerArg(countArg);
  if (count === null) {
    return { ok: false, error: { kind: 'malformed', message: 'count argument is not an integer literal' } };
  }
  if (count < 0 || count > MAX_TOKEN_COUNT) {
    return {
      ok: false,
      error: { kind: 'malformed', message: `token count ${count} is outside the supported 0–${MAX_TOKEN_COUNT} range` },
    };
  }

  const keys = keysLiteral.split('|');

  // Canonical substitution order: highest token index first. Replacer is a
  // FUNCTION on purpose — string replacements interpret `$&`-style patterns,
  // which would corrupt URLs containing `$`.
  let decoded = payload;
  for (let i = count - 1; i >= 0; i -= 1) {
    const key = keys[i];
    if (key === undefined || key === '') continue;
    const token = encodeInBase(i, radix);
    const pattern = new RegExp(`\\b${token}\\b`, 'g');
    decoded = decoded.replace(pattern, () => key);
  }

  return { ok: true, value: decoded };
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                    */
/* -------------------------------------------------------------------------- */

interface SplitArgsResult {
  ok: boolean;
  values: string[];
  message?: string;
}

/**
 * Splits the argument list of a call whose `(` sits at `openParenIndex`.
 * Tracks string literals (', ", `) with backslash escapes and nesting depth
 * of ( [ { so commas inside strings or objects do not split. Returns raw
 * (still-escaped) argument texts and stops at the matching `)`.
 */
function splitCallArguments(source: string, openParenIndex: number): SplitArgsResult {
  const values: string[] = [];
  let current = '';
  let depth = 0;
  let inString: string | null = null;

  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === undefined) break;

    if (inString !== null) {
      current += ch;
      if (ch === '\\') {
        const next = source[i + 1];
        if (next !== undefined) {
          current += next;
          i += 1;
        }
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ')' && depth === 0) {
      values.push(current);
      return { ok: true, values };
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  return { ok: false, values: [], message: 'unterminated packer call (no closing parenthesis)' };
}

/**
 * Unescapes a JS string literal ('…' or "…") with deterministic, common
 * semantics: standard single-char escapes, `\xHH`, `\uHHHH`, `\u{…}` and the
 * JS identity rule for unknown escapes (`\q` → `q`). Returns null when the
 * input is not a quoted literal (e.g. a number or object argument).
 */
function unescapeJsString(raw: string): string | null {
  const text = raw.trim();
  if (text.length < 2) return null;
  const quote = text[0];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  if (text[text.length - 1] !== quote) return null;
  const inner = text.slice(1, -1);

  let out = '';
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) {
      out += '\\';
      continue;
    }
    i += 1;
    switch (next) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '0': out += '\0'; break;
      case 'x': {
        const hex = inner.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 2;
        } else {
          out += 'x';
        }
        break;
      }
      case 'u': {
        if (inner[i + 1] === '{') {
          const close = inner.indexOf('}', i + 2);
          const hex = close === -1 ? '' : inner.slice(i + 2, close);
          if (/^[0-9a-fA-F]{1,6}$/.test(hex) && close !== -1) {
            const code = Number.parseInt(hex, 16);
            if (code <= 0x10ffff) {
              out += String.fromCodePoint(code);
              i = close;
              break;
            }
          }
          out += 'u';
        } else {
          const hex = inner.slice(i + 1, i + 5);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(Number.parseInt(hex, 16));
            i += 4;
          } else {
            out += 'u';
          }
        }
        break;
      }
      default:
        // JS identity escape: unknown `\q` yields `q`.
        out += next;
    }
  }
  return out;
}

/** Parses a non-negative integer literal (`42`, `1e2`-free, no sign). */
function parseIntegerArg(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number.parseInt(text, 10);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * The canonical packer emits the dictionary as `'<k0|k1|…>'.split('|')` — an
 * EXPRESSION, not a bare literal. Accepts both forms: strips a trailing
 * `.split('|')` / `.split("|")` call, then unescapes the remaining literal.
 */
function parseKeysArgument(raw: string): string | null {
  let text = raw.trim();
  const splitSuffix = /\.split\(\s*'\|'\s*\)\s*$|\.split\(\s*"\|"\s*\)\s*$/.exec(text);
  if (splitSuffix !== null) {
    text = text.slice(0, splitSuffix.index).trim();
  }
  return unescapeJsString(text);
}

/** Encodes `value` in `radix` (2–62) using `0-9a-zA-Z` digits (canonical `e(c)`). */
function encodeInBase(value: number, radix: number): string {
  let out = '';
  let v = value;
  do {
    out = BASE_DIGITS.charAt(v % radix) + out;
    v = Math.floor(v / radix);
  } while (v > 0);
  return out;
}
