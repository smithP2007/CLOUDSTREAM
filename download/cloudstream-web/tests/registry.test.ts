/**
 * Registry behavior tests (roadmap Phase 1 task 3). Pins the documented
 * upstream matching semantics (`docs/provider-architecture.md` §5.2,
 * `ExtractorApi.kt:926–986`) plus the D16 divergences: consistent
 * normalization, prefix boundary check, conservative mirror fallback.
 */

import { describe, expect, it } from 'vitest';

import {
  MIRROR_MATCH_THRESHOLD,
  ProviderRegistry,
  levenshteinPartialRatio,
  levenshteinRatio,
  normalizeProviderUrl,
} from '../src/core';
import type { Provider, RegistryUrlMatch } from '../src/core';
import { makeProvider } from './helpers';

/* Fixtures: real method-less providers are fine here — the registry only
   reads identity fields (name, mainUrl) for matching; method presence is
   validated at registration, which makeProvider satisfies. */

function reg(
  registry: ProviderRegistry,
  name: string,
  mainUrl: string,
  overrides: Partial<Provider> = {},
): Provider {
  const provider = makeProvider({ name, mainUrl, ...overrides });
  expect(registry.register(provider)).toBe('added');
  return provider;
}

function urlMatch(result: RegistryUrlMatch | null): Provider {
  expect(result, 'expected a match').not.toBeNull();
  return (result as RegistryUrlMatch).provider;
}

describe('normalizeProviderUrl', () => {
  it('lowercases and strips the https scheme while keeping the path', () => {
    expect(normalizeProviderUrl('HTTPS://Example.COM/Watch?V=1')).toBe('example.com/watch?v=1');
  });

  it('treats http and https (and scheme-less and protocol-relative) identically', () => {
    const expected = 'example.com/watch';
    expect(normalizeProviderUrl('https://example.com/watch')).toBe(expected);
    expect(normalizeProviderUrl('http://example.com/watch')).toBe(expected);
    expect(normalizeProviderUrl('example.com/watch')).toBe(expected);
    expect(normalizeProviderUrl('//example.com/watch')).toBe(expected);
  });

  it('strips a bare scheme without slashes defensively', () => {
    expect(normalizeProviderUrl('https:example.com')).toBe('example.com');
  });

  it('strips one leading www. on either side of the comparison', () => {
    expect(normalizeProviderUrl('https://www.example.com/watch')).toBe('example.com/watch');
    expect(normalizeProviderUrl('www.example.com')).toBe('example.com');
    expect(normalizeProviderUrl('https://www.www.example.com')).toBe('www.example.com');
  });

  it('strips trailing slashes so declared-with-slash bases are interchangeable', () => {
    expect(normalizeProviderUrl('https://example.com/')).toBe('example.com');
    expect(normalizeProviderUrl('https://example.com/a/b//')).toBe('example.com/a/b');
  });

  it('preserves ports, queries and userinfo (documented non-goals)', () => {
    expect(normalizeProviderUrl('https://example.com:8080/watch')).toBe('example.com:8080/watch');
    expect(normalizeProviderUrl('https://user@example.com/x')).toBe('user@example.com/x');
  });

  it('trims whitespace and returns empty for non-string input', () => {
    expect(normalizeProviderUrl('  https://example.com  ')).toBe('example.com');
    expect(normalizeProviderUrl('   ')).toBe('');
    expect(normalizeProviderUrl(null)).toBe('');
    expect(normalizeProviderUrl(42)).toBe('');
  });
});

describe('levenshteinRatio (pure scoring)', () => {
  it('scores identical strings 100', () => {
    expect(levenshteinRatio('example.com', 'example.com')).toBe(100);
  });

  it('counts a substitution as 2 (indel normalization, like upstream Levenshtein.ratio)', () => {
    // "abc" vs "abd": one substitution = distance 2 → (6-2)/6
    expect(levenshteinRatio('abc', 'abd')).toBeCloseTo(66.67, 1);
    // "abc" vs "abcd": one insertion = distance 1 → (7-1)/7
    expect(levenshteinRatio('abc', 'abcd')).toBeCloseTo(85.71, 1);
  });

  it('scores 0 against an empty string and 100 for two empties', () => {
    expect(levenshteinRatio('', 'example')).toBe(0);
    expect(levenshteinRatio('example', '')).toBe(0);
    expect(levenshteinRatio('', '')).toBe(100);
  });
});

describe('levenshteinPartialRatio (pure scoring)', () => {
  it('finds the pattern verbatim inside a longer URL (score 100)', () => {
    expect(levenshteinPartialRatio('example.com', 'https://mirror-cdn.example.com/path')).toBe(100);
  });

  it('is symmetric for equal-length inputs', () => {
    const a = 'streamtape.to';
    const b = 'streamtape.co';
    expect(levenshteinPartialRatio(a, b)).toBeCloseTo(levenshteinPartialRatio(b, a), 6);
  });

  it('scores the documented mirror pair above 80 and near-mirror below', () => {
    // streamtape.to vs streamtape.com/… : best window differs by 1 char → (26-2)/26
    expect(levenshteinPartialRatio('streamtape.to', 'streamtape.com/watch?v=abc')).toBeCloseTo(
      92.31,
      1,
    );
    // example.net vs example.com: 3 substitutions → (22-6)/22 ≈ 72.7 → BELOW threshold
    expect(levenshteinPartialRatio('example.net', 'example.com')).toBeCloseTo(72.73, 1);
    expect(levenshteinPartialRatio('example.net', 'example.com')).toBeLessThan(
      MIRROR_MATCH_THRESHOLD,
    );
  });

  it('returns 0 for an empty pattern and never matches unrelated domains above 80', () => {
    expect(levenshteinPartialRatio('', 'https://example.com/x')).toBe(0);
    expect(
      levenshteinPartialRatio('example.com', 'https://totally-different-site.org/video/123'),
    ).toBeLessThan(MIRROR_MATCH_THRESHOLD);
  });
});

describe('ProviderRegistry.register', () => {
  it('adds providers in registration order and reports size', () => {
    const registry = new ProviderRegistry();
    const a = reg(registry, 'a', 'https://a.example');
    const b = reg(registry, 'b', 'https://b.example');
    expect(registry.size).toBe(2);
    expect(registry.list()).toEqual([a, b]);
  });

  it('re-registering the identical instance is a no-op', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'a', 'https://a.example');
    expect(registry.register(provider)).toBe('existing');
    expect(registry.size).toBe(1);
  });

  it('a different instance with the same name replaces the old one (newest position)', () => {
    const registry = new ProviderRegistry();
    const old = reg(registry, 'dup', 'https://old.example');
    reg(registry, 'other', 'https://other.example');
    const replacement = makeProvider({ name: 'dup', mainUrl: 'https://new.example' });

    expect(registry.register(replacement)).toBe('replaced');
    expect(registry.size).toBe(2);
    expect(registry.getByName('dup')).toBe(replacement);
    expect(registry.list()).toEqual([registry.getByName('other'), replacement]);
    expect(registry.list()).not.toContain(old);
  });

  it('rejects invalid registrations with TypeError (fail-fast, first-party contract)', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.register(null as unknown as Provider)).toThrow(TypeError);
    expect(() => reg(new ProviderRegistry(), '', 'https://a.example')).toThrow(TypeError);
    expect(() => reg(new ProviderRegistry(), 'x', '   ')).toThrow(TypeError);
    expect(() => reg(new ProviderRegistry(), 'x', 'https://')).toThrow(TypeError);
    const broken = makeProvider({ name: 'broken', mainUrl: 'https://b.example' });
    const missingLoad = { ...broken, load: undefined } as unknown as Provider;
    expect(() => new ProviderRegistry().register(missingLoad)).toThrow(TypeError);
    const badQuickSearch = { ...broken, quickSearch: 42 } as unknown as Provider;
    expect(() => new ProviderRegistry().register(badQuickSearch)).toThrow(TypeError);
  });

  it('unregister removes by name or instance; unknown names are safe no-ops', () => {
    const registry = new ProviderRegistry();
    const a = reg(registry, 'a', 'https://a.example');
    reg(registry, 'b', 'https://b.example');

    expect(registry.unregister('missing')).toBe(false);
    expect(registry.unregister(a)).toBe(true);
    expect(registry.unregister('b')).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('list() returns a copy — mutating it cannot corrupt the registry', () => {
    const registry = new ProviderRegistry();
    reg(registry, 'a', 'https://a.example');
    const snapshot = registry.list() as Provider[];
    snapshot.length = 0;
    snapshot.push(makeProvider({ name: 'injected', mainUrl: 'https://evil.example' }));
    expect(registry.size).toBe(1);
    expect(registry.getByName('injected')).toBeNull();
  });
});

describe('ProviderRegistry.getByName', () => {
  it('resolves exact names and returns null for unknown/non-string input', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'MyProvider', 'https://a.example');
    expect(registry.getByName('MyProvider')).toBe(provider);
    expect(registry.getByName('myprovider')).toBeNull(); // exact, case-sensitive (upstream ==)
    expect(registry.getByName('unknown')).toBeNull();
    expect(registry.getByName(undefined)).toBeNull();
    expect(registry.getByName(42 as unknown as string)).toBeNull();
  });
});

describe('ProviderRegistry.getByUrl — exact and prefix matches', () => {
  it('matches a URL that equals the provider base URL', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'site', 'https://example.com');
    const result = registry.getByUrl('https://example.com');
    expect(result?.method).toBe('prefix');
    expect(urlMatch(result)).toBe(provider);
  });

  it('matches URLs under the base URL (paths, queries)', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'site', 'https://example.com');
    expect(urlMatch(registry.getByUrl('https://example.com/watch?v=1'))).toBe(provider);
    expect(urlMatch(registry.getByUrl('https://example.com/a/b/c.mp4'))).toBe(provider);
  });

  it('matches path-bearing mainUrls with the boundary rule', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'cdn', 'https://cdn.example.com/vod');
    expect(urlMatch(registry.getByUrl('https://cdn.example.com/vod/item.mp4'))).toBe(provider);
  });

  it('the boundary rule stops a newer partial-domain provider from hijacking an older one', () => {
    const registry = new ProviderRegistry();
    const company = reg(registry, 'company', 'https://example.company.net'); // older
    const apex = reg(registry, 'apex', 'https://example.com'); // newer
    // Naive startsWith (upstream style) would let the newer `apex` claim this
    // URL ('example.company.net/…'.startsWith('example.com')); the boundary
    // rule rejects it and the older, correct provider matches.
    const result = registry.getByUrl('https://example.company.net/watch');
    expect(result?.method).toBe('prefix');
    expect(urlMatch(result)).toBe(company);
    expect(urlMatch(result)).not.toBe(apex);
  });

  it('verbatim mainUrl containment beyond the boundary resolves via the mirror stage', () => {
    const registry = new ProviderRegistry();
    const cdn = reg(registry, 'cdn', 'https://cdn.example.com/vod');
    // 'vodarchive' fails the prefix boundary ('a' directly after '…/vod') but
    // contains the mainUrl verbatim, so the documented partial-ratio fallback
    // scores it 100 — inherent to partialRatio containment, and upstream's
    // overall end behavior too (see src/core/registry.ts module docs).
    const result = registry.getByUrl('https://cdn.example.com/vodarchive/x');
    expect(result?.method).toBe('mirror');
    if (result?.method === 'mirror') expect(result.score).toBe(100);
    expect(urlMatch(result)).toBe(cdn);
  });
});

describe('ProviderRegistry.getByUrl — newest-wins precedence', () => {
  it('the newest registration wins when several providers prefix-match the same base', () => {
    const registry = new ProviderRegistry();
    const old = reg(registry, 'old', 'https://example.com');
    const newer = reg(registry, 'newer', 'https://example.com');
    expect(urlMatch(registry.getByUrl('https://example.com/watch'))).toBe(newer);
    expect(urlMatch(registry.getByUrl('https://example.com/watch'))).not.toBe(old);
  });

  it('a newer deeper prefix beats an older shallower one; each wins in its own range', () => {
    const registry = new ProviderRegistry();
    const shallow = reg(registry, 'shallow', 'https://example.com');
    const deep = reg(registry, 'deep', 'https://example.com/vod');
    expect(urlMatch(registry.getByUrl('https://example.com/vod/1.mp4'))).toBe(deep);
    expect(urlMatch(registry.getByUrl('https://example.com/search?q=x'))).toBe(shallow);
  });

  it('unregistering the newest restores the older matching provider', () => {
    const registry = new ProviderRegistry();
    const old = reg(registry, 'old', 'https://example.com');
    const newer = reg(registry, 'newer', 'https://example.com');
    registry.unregister(newer);
    expect(urlMatch(registry.getByUrl('https://example.com/watch'))).toBe(old);
  });

  it('replacement by name also takes over URL matching (newest position)', () => {
    const registry = new ProviderRegistry();
    reg(registry, 'dup', 'https://old.example');
    const replacement = makeProvider({ name: 'dup', mainUrl: 'https://old.example' });
    registry.register(replacement);
    expect(urlMatch(registry.getByUrl('https://old.example/watch'))).toBe(replacement);
  });
});

describe('ProviderRegistry.getByUrl — normalization', () => {
  it('case-insensitive: uppercase URLs match lowercase providers and vice versa', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'site', 'https://example.com');
    expect(urlMatch(registry.getByUrl('HTTPS://EXAMPLE.COM/WATCH'))).toBe(provider);
  });

  it('scheme-insensitive: http URLs match https providers (and scheme-less)', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'site', 'https://example.com');
    expect(urlMatch(registry.getByUrl('http://example.com/watch'))).toBe(provider);
    expect(urlMatch(registry.getByUrl('//example.com/watch'))).toBe(provider);
    expect(urlMatch(registry.getByUrl('example.com/watch'))).toBe(provider);
  });

  it('www. equivalence on both sides', () => {
    const wwwRegistry = new ProviderRegistry();
    const wwwProvider = reg(wwwRegistry, 'www', 'https://www.example.com');
    expect(urlMatch(wwwRegistry.getByUrl('https://example.com/watch'))).toBe(wwwProvider);

    const apexRegistry = new ProviderRegistry();
    const apexProvider = reg(apexRegistry, 'apex', 'https://example.com');
    expect(urlMatch(apexRegistry.getByUrl('https://www.example.com/watch'))).toBe(apexProvider);
  });

  it('trailing-slash equivalence: a base declared with / still prefix-matches', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'site', 'https://example.com/');
    expect(urlMatch(registry.getByUrl('https://example.com/watch'))).toBe(provider);
    expect(urlMatch(registry.getByUrl('https://example.com'))).toBe(provider);
  });

  it('ports are preserved and match through the boundary rule', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'local', 'https://localhost:8096');
    expect(urlMatch(registry.getByUrl('https://localhost:8096/emby/Items'))).toBe(provider);
    // An unrelated host on the same default shape must not match.
    expect(registry.getByUrl('https://elsewhere-unrelated.org/path')).toBeNull();
  });
});

describe('ProviderRegistry.getByUrl — mirror-domain fallback', () => {
  it('falls back to a mirror domain only when no prefix matched', () => {
    const registry = new ProviderRegistry();
    const provider = reg(registry, 'streamtape', 'https://streamtape.to');
    const result = registry.getByUrl('https://streamtape.com/watch?v=abc');
    expect(result?.method).toBe('mirror');
    expect(urlMatch(result)).toBe(provider);
    if (result?.method === 'mirror') {
      expect(result.score).toBeGreaterThan(MIRROR_MATCH_THRESHOLD);
      expect(result.score).toBeCloseTo(92.31, 1);
    }
  });

  it('a URL on a registered domain resolves as prefix even when it could mirror-match', () => {
    const registry = new ProviderRegistry();
    reg(registry, 'other', 'https://unrelated.example.org'); // occupies registry, no match
    const real = reg(registry, 'streamtape-com', 'https://streamtape.com');
    const result = registry.getByUrl('https://streamtape.com/watch?v=abc');
    expect(result?.method).toBe('prefix');
    expect(urlMatch(result)).toBe(real);
  });

  it('near-mirror domains below the strict > 80 threshold never match', () => {
    const registry = new ProviderRegistry();
    reg(registry, 'site', 'https://example.com');
    // .net vs .com differs by 3 chars → ≈72.7 < 80
    expect(registry.getByUrl('https://example.net/watch')).toBeNull();
  });

  it('ambiguous mirrors: newest-first scan wins even with a lower score (deterministic)', () => {
    const registry = new ProviderRegistry();
    // "streamtape.to" scores ≈92.3 against the URL; "streamtape.mu" ≈84.6.
    reg(registry, 'old-high-score', 'https://streamtape.to');
    const newest = reg(registry, 'new-low-score', 'https://streamtape.mu');

    const first = registry.getByUrl('https://streamtape.com/watch?v=abc');
    expect(first?.method).toBe('mirror');
    expect(urlMatch(first)).toBe(newest);
    if (first?.method === 'mirror') expect(first.score).toBeCloseTo(84.62, 1);

    // Determinism: identical inputs give the identical winner every time.
    for (let i = 0; i < 10; i++) {
      const again = registry.getByUrl('https://streamtape.com/watch?v=abc');
      expect(again?.method).toBe('mirror');
      expect(urlMatch(again)).toBe(newest);
      if (again?.method === 'mirror') expect(again.score).toBeCloseTo(84.62, 1);
    }

    // Removing the newest hands the match to the older provider.
    registry.unregister(newest);
    expect(urlMatch(registry.getByUrl('https://streamtape.com/watch?v=abc'))).toBe(
      registry.getByName('old-high-score'),
    );
  });

  it('scores the mirror stage on NORMALIZED strings (no scheme-prefix inflation)', () => {
    // Raw-string comparison (upstream style) would include "https://" in both
    // operands and inflate scores; normalized comparison is stricter.
    const raw = levenshteinPartialRatio('https://example.com', 'https://example.net/watch');
    const normalized = levenshteinPartialRatio(
      normalizeProviderUrl('https://example.com'),
      normalizeProviderUrl('https://example.net/watch'),
    );
    expect(normalized).toBeLessThanOrEqual(raw);
    expect(normalized).toBeLessThan(MIRROR_MATCH_THRESHOLD);
  });
});

describe('ProviderRegistry.getByUrl — malformed and unknown URLs', () => {
  const registry = new ProviderRegistry();
  reg(registry, 'site', 'https://example.com');

  it('returns null for empty, whitespace, scheme-only and garbage inputs', () => {
    expect(registry.getByUrl('')).toBeNull();
    expect(registry.getByUrl('   ')).toBeNull();
    expect(registry.getByUrl('https://')).toBeNull();
    expect(registry.getByUrl('::::')).toBeNull();
    expect(registry.getByUrl('???')).toBeNull();
  });

  it('returns null for unknown domains instead of guessing', () => {
    expect(registry.getByUrl('https://unregistered-site.org/watch')).toBeNull();
    // Genuinely distant domain: no window scores above the threshold against
    // 'example.com'. (NOTE: a URL containing '.example.org' WOULD mirror-match
    // at ≈81.8 — partial-ratio containment is the documented behavior.)
    expect(registry.getByUrl('https://blorptastic-quux.tv/a')).toBeNull();
  });

  it('never throws on non-string runtime input', () => {
    expect(registry.getByUrl(null)).toBeNull();
    expect(registry.getByUrl(undefined)).toBeNull();
    expect(registry.getByUrl(42 as unknown as string)).toBeNull();
    expect(registry.getByUrl({} as unknown as string)).toBeNull();
  });

  it('still matches a whitespace-padded but valid URL', () => {
    expect(registry.getByUrl('  https://example.com/watch  ')?.method).toBe('prefix');
  });
});
