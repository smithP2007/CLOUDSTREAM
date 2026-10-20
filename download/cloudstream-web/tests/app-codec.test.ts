/**
 * Route-token codec tests: canonical base64url roundtrips and strict,
 * fail-closed decoding (tampered/hand-edited segments never decode).
 */

import { describe, expect, it } from 'vitest';
import { decodeToken, encodeToken } from '../src/app/_lib/codec';

describe('encodeToken', () => {
  it('produces URL-safe base64url without padding', () => {
    const token = encodeToken('https://fixtures.local/title/aurora-drift');
    expect(token).not.toMatch(/[+/=]/);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('encodes unicode correctly (multi-byte UTF-8)', () => {
    const token = encodeToken('/fixtures:episode:northgate/s1e1 — 海');
    expect(decodeToken(token)).toBe('/fixtures:episode:northgate/s1e1 — 海');
  });
});

describe('decodeToken', () => {
  it('roundtrips encoded values exactly', () => {
    const samples = [
      'https://fixtures.local/title/gated-vault',
      'fixtures:play:aurora-drift',
      'fixtures:episode:harbor-lights/s2e3',
      'a',
      'ünïcode ✓',
    ];
    for (const sample of samples) {
      expect(decodeToken(encodeToken(sample))).toBe(sample);
    }
  });

  it('rejects malformed or tampered tokens (fail closed)', () => {
    // The empty token is deliberately invalid (a route segment cannot be empty).
    expect(decodeToken('')).toBeNull();
    expect(decodeToken('not valid!')).toBeNull();
    expect(decodeToken('a+b/c')).toBeNull(); // standard base64 alphabet rejected
    // A single non-canonical character cannot re-encode to itself.
    expect(decodeToken('a')).toBeNull();
    // Truncation breaks the canonical roundtrip (deterministic tamper).
    const good = encodeToken('fixtures:play:aurora-drift');
    expect(decodeToken(good.slice(0, -1))).toBeNull();
  });
});
