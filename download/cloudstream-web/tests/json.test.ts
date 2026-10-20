import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { formatZodIssues, parseJsonSafe, parseJsonWith } from '../src/server/parse';

describe('parseJsonSafe', () => {
  it('parses valid JSON into an unknown value', () => {
    const parsed = parseJsonSafe('{"a":1,"b":[true,null]}');
    expect(parsed).toEqual({ ok: true, value: { a: 1, b: [true, null] } });
  });

  it('rejects empty, whitespace and non-string input', () => {
    expect(parseJsonSafe('')).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(parseJsonSafe('  \n ')).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(parseJsonSafe(42 as unknown as string)).toMatchObject({
      ok: false,
      error: { kind: 'empty' },
    });
  });

  it('reports malformed JSON as a typed error (never throws)', () => {
    const parsed = parseJsonSafe('{"a":');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.kind).toBe('invalid');
      expect(parsed.error.message).toContain('malformed JSON');
    }
  });

  it('enforces the input size cap', () => {
    const big = JSON.stringify({ padding: 'x'.repeat(100) });
    const parsed = parseJsonSafe(big, { maxBytes: 10 });
    expect(parsed).toMatchObject({ ok: false, error: { kind: 'tooLarge', maxBytes: 10 } });
  });
});

describe('parseJsonWith', () => {
  const schema = z.object({ name: z.string(), count: z.number().int() });

  it('returns schema-validated data on success', () => {
    const parsed = parseJsonWith(schema, '{"name":"x","count":2,"extra":"stripped"}');
    expect(parsed).toEqual({ ok: true, value: { name: 'x', count: 2 } });
  });

  it('maps JSON failures to invalidJson', () => {
    expect(parseJsonWith(schema, '{oops')).toMatchObject({
      ok: false,
      error: { kind: 'invalidJson' },
    });
  });

  it('keeps size-cap failures distinct', () => {
    expect(parseJsonWith(schema, '{"name":"x","count":1}', { maxBytes: 2 })).toMatchObject({
      ok: false,
      error: { kind: 'tooLarge' },
    });
  });

  it('reports schema mismatches with formatted issues', () => {
    const parsed = parseJsonWith(schema, '{"name":"x","count":"two"}');
    expect(parsed.ok).toBe(false);
    if (parsed.ok || parsed.error.kind !== 'schemaMismatch') {
      throw new Error('expected a schemaMismatch failure');
    }
    expect(parsed.error.issues.length).toBeGreaterThan(0);
    expect(parsed.error.issues[0]).toContain('count');
  });
});

describe('formatZodIssues', () => {
  it('formats paths as dotted strings', () => {
    const schema = z.object({ a: z.object({ b: z.string() }) });
    const result = schema.safeParse({ a: { b: 7 } });
    if (result.success) throw new Error('fixture should fail');
    const issues = formatZodIssues(result.error);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/^a\.b: /);
  });

  it('formats root-level issues without a path prefix', () => {
    const result = z.string().safeParse(7);
    if (result.success) throw new Error('fixture should fail');
    expect(formatZodIssues(result.error)[0]).toBe(result.error.issues[0]?.message);
  });
});
