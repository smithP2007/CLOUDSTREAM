import { describe, expect, it } from 'vitest';

import { MAX_TOKEN_COUNT, looksPacked, unpackPackedJavaScript } from '../src/server/parse';

/**
 * Test-only inverse used to BUILD fixtures. It emits the canonical
 * `eval(function(p,a,c,k,e,d){...}('payload',a,c,'keys',0,{}))` shape with a
 * minimal body — it is never imported by, or shipped with, the unpacker.
 * Hand-written literal vectors below pin the format independently of it.
 */
function pack(
  payload: string,
  radix: number,
  count: number,
  keys: string[],
  opts: { splitKeys?: boolean; doubleQuoted?: boolean } = {},
): string {
  // Runtime source bytes: new RegExp('\\b'+...) — i.e. TWO backslash bytes.
  const body =
    "while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p";
  const payloadArg = opts.doubleQuoted
    ? JSON.stringify(payload)
    : `'${singleQuoteEscape(payload)}'`;
  const keysJoined = singleQuoteEscape(keys.join('|'));
  const keysArg = opts.splitKeys ? `'${keysJoined}'.split('|')` : `'${keysJoined}'`;
  return `eval(function(p,a,c,k,e,d){${body}}(${payloadArg},${radix},${count},${keysArg},0,{}))`;
}

function singleQuoteEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/** Minimal hand-written vector (radix 10) — format pinned without the helper. */
const HAND_RADIX10 = String.raw`eval(function(p,a,c,k,e,d){while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c])}}return p}('0 1 2',10,3,'alpha|beta|gamma',0,{}))`;

describe('looksPacked', () => {
  it('detects the signature without parsing', () => {
    expect(looksPacked(HAND_RADIX10)).toBe(true);
    expect(looksPacked('console.log("hello");')).toBe(false);
    expect(looksPacked('')).toBe(false);
  });
});

describe('unpackPackedJavaScript — canonical forms', () => {
  it('unpacks the hand-written radix-10 vector', () => {
    const result = unpackPackedJavaScript(HAND_RADIX10);
    expect(result).toEqual({ ok: true, value: 'alpha beta gamma' });
  });

  it('accepts the canonical .split("|") keys argument', () => {
    const packed = String.raw`eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}('0+1',10,2,'a|b'.split('|'),0,{}))`;
    expect(unpackPackedJavaScript(packed)).toEqual({ ok: true, value: 'a+b' });
  });

  it('accepts double-quoted split arguments', () => {
    const packed = String.raw`eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}('0',10,1,"k".split("|"),0,{}))`;
    expect(unpackPackedJavaScript(packed)).toEqual({ ok: true, value: 'k' });
  });

  it('tolerates whitespace inside the signature', () => {
    const packed = String.raw`eval(function ( p , a , c , k , e , d ){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}('0',10,1,'K',0,{}))`;
    expect(unpackPackedJavaScript(packed)).toEqual({ ok: true, value: 'K' });
  });

  it('leaves tokens without a dictionary entry untouched', () => {
    const keys = Array.from({ length: 36 }, (_v, i) =>
      i === 10 ? 'ten' : i === 35 ? 'thirty-five' : '',
    );
    expect(unpackPackedJavaScript(pack('a z 5', 36, 36, keys))).toEqual({
      ok: true,
      value: 'ten thirty-five 5',
    });
  });

  it('supports radix 62 (0-9, a-z, A-Z digits)', () => {
    const keys = Array.from({ length: 63 }, (_v, i) =>
      i === 36 ? 'SIXTYTWO' : i === 62 ? 'SIXTYTWO2' : '',
    );
    expect(unpackPackedJavaScript(pack('A 10', 62, 63, keys))).toEqual({
      ok: true,
      value: 'SIXTYTWO SIXTYTWO2',
    });
  });

  it('respects word boundaries (no partial-token replacement)', () => {
    expect(unpackPackedJavaScript(pack('x 0 10', 10, 1, ['ZERO']))).toEqual({
      ok: true,
      value: 'x ZERO 10',
    });
  });

  it('treats dictionary values literally ($ patterns are not expansions)', () => {
    expect(unpackPackedJavaScript(pack('0', 10, 1, ['$&$1']))).toEqual({
      ok: true,
      value: '$&$1',
    });
  });

  it('unescapes standard string escapes in the payload', () => {
    const packed = String.raw`eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}('a\'b\nc\x41\u0043',10,1,'K',0,{}))`;
    const result = unpackPackedJavaScript(packed);
    expect(result).toEqual({ ok: true, value: "a'b\ncAC" });
  });

  it('round-trips a hostile payload (quotes, commas, parens, braces, backslashes)', () => {
    const messy = "it's url('https://x/y?a=1,b=2') + {a:1} + (nested) C:\\path\\n tail";
    expect(unpackPackedJavaScript(pack(messy, 10, 1, ['K']))).toEqual({
      ok: true,
      value: messy,
    });
  });

  it('round-trips through the double-quoted payload form', () => {
    const messy = 'says "hi" and \'bye\'';
    expect(unpackPackedJavaScript(pack(messy, 10, 1, ['K'], { doubleQuoted: true }))).toEqual({
      ok: true,
      value: messy,
    });
  });
});

describe('unpackPackedJavaScript — typed failures (never throws)', () => {
  it('reports non-packed input as notPacked', () => {
    expect(unpackPackedJavaScript('function real(){return 1}')).toMatchObject({
      ok: false,
      error: { kind: 'notPacked' },
    });
  });

  it('reports a missing call body as malformed', () => {
    const broken = String.raw`eval(function(p,a,c,k,e,d){return p;`;
    expect(unpackPackedJavaScript(broken)).toMatchObject({
      ok: false,
      error: { kind: 'malformed' },
    });
  });

  it('reports an unterminated call as malformed', () => {
    const broken = String.raw`eval(function(p,a,c,k,e,d){return p}('abc'`;
    expect(unpackPackedJavaScript(broken)).toMatchObject({
      ok: false,
      error: { kind: 'malformed' },
    });
  });

  it('reports too-few arguments as malformed', () => {
    const broken = String.raw`eval(function(p,a,c,k,e,d){return p}('abc',10))`;
    expect(unpackPackedJavaScript(broken)).toMatchObject({
      ok: false,
      error: { kind: 'malformed' },
    });
  });

  it('rejects radix values outside 2-62 as unsupportedRadix', () => {
    expect(unpackPackedJavaScript(pack('0', 64, 1, ['K']))).toMatchObject({
      ok: false,
      error: { kind: 'unsupportedRadix' },
    });
    expect(unpackPackedJavaScript(pack('0', 1, 1, ['K']))).toMatchObject({
      ok: false,
      error: { kind: 'unsupportedRadix' },
    });
  });

  it('rejects non-integer or oversized token counts as malformed', () => {
    const negative = String.raw`eval(function(p,a,c,k,e,d){return p}('abc',10,-1,'K',0,{}))`;
    expect(unpackPackedJavaScript(negative)).toMatchObject({
      ok: false,
      error: { kind: 'malformed' },
    });
    const huge = pack('abc', 10, MAX_TOKEN_COUNT + 1, ['K']);
    expect(unpackPackedJavaScript(huge)).toMatchObject({
      ok: false,
      error: { kind: 'malformed' },
    });
  });

  it('enforces the input size cap', () => {
    expect(unpackPackedJavaScript(HAND_RADIX10, { maxBytes: 5 })).toMatchObject({
      ok: false,
      error: { kind: 'tooLarge', maxBytes: 5 },
    });
  });
});
