/**
 * Phase 5 catalog/data-access layer tests: the mock fixture provider goes
 * through the REAL host machinery (ProviderHost boundary + validation +
 * kill switch + observability + LinkPipeline) — no network, deterministic.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  findProvider,
  getHome,
  getLinks,
  getProviderStatuses,
  getTitle,
  listInstalledProviders,
  search,
} from '../src/server/catalog';
import { MOCK_PROVIDER_ID, detailUrlFor, slugFromDetailUrl } from '../src/server/providers/mock';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuntime } from '../src/server/catalog/runtime';
import { ALL_SEARCH_RESULTS } from '../src/server/providers/mock';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

afterEach(() => {
  // Tests share the process-wide runtime; never leak a disabled provider.
  const runtime = getRuntime();
  runtime.killSwitch.enableAll();
  for (const meta of runtime.meta) runtime.killSwitch.enable(meta.name);
});

describe('installed providers', () => {
  it('exposes the mock fixture provider with stable metadata', () => {
    const providers = listInstalledProviders();
    // D20: the Internet Archive provider is installed alongside the mock
    // catalog; the mock stays FIRST (default catalog).
    expect(providers.map((p) => p.id)).toEqual([MOCK_PROVIDER_ID, 'internetarchive']);
    const meta = findProvider(MOCK_PROVIDER_ID);
    expect(meta?.name).toBe('Mock Fixtures');
    expect(meta?.lang).toBe('en');
    expect(meta?.tvTypes.length).toBeGreaterThan(3);
  });

  it('exposes the Internet Archive provider with D20-recorded metadata', () => {
    const meta = findProvider('internetarchive');
    expect(meta?.name).toBe('InternetArchive');
    expect(meta?.mainUrl).toBe('https://archive.org');
    expect(meta?.lang).toBe('en');
    expect(meta?.tvTypes).toEqual(['Movie', 'Documentary']);
  });

  it('derives detail URLs deterministically and validates slugs', () => {
    const url = detailUrlFor('aurora-drift');
    expect(slugFromDetailUrl(url)).toBe('aurora-drift');
    expect(slugFromDetailUrl('https://evil.example/title/aurora-drift')).toBeNull();
    expect(slugFromDetailUrl(`${url}/../etc`)).toBeNull();
  });
});

describe('getHome', () => {
  it('returns all deterministic rows through the host', async () => {
    const result = await getHome(MOCK_PROVIDER_ID, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lists.map((row) => row.name)).toEqual([
      'Featured fixtures',
      'Films & documentaries',
      'Series & anime',
      'Authorized live demo streams',
    ]);
    for (const row of result.data.lists) {
      expect(row.items.length).toBeGreaterThan(0);
      for (const item of row.items) {
        expect(item.providerName).toBe('Mock Fixtures');
        expect(item.posterUrl).toMatch(/^\/posters\/[a-z0-9-]+\.svg$/);
      }
    }
  });

  it('is deterministic across calls', async () => {
    const a = await getHome(MOCK_PROVIDER_ID, 1);
    const b = await getHome(MOCK_PROVIDER_ID, 1);
    expect(a).toEqual(b);
  });

  it('fails with not-found for an unknown provider id', async () => {
    const result = await getHome('nope', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not-found');
  });

  it('refuses calls when the kill switch disabled the provider', async () => {
    const runtime = getRuntime();
    runtime.killSwitch.disable('Mock Fixtures', 'audit test');
    const result = await getHome(MOCK_PROVIDER_ID, 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('provider-disabled');
    expect(result.error.message).toContain('disabled by the kill switch');
  });
});

describe('search', () => {
  it('pages deterministically with hasNext and stable ordering', async () => {
    const page1 = await search(MOCK_PROVIDER_ID, 'fixture', 1);
    const page2 = await search(MOCK_PROVIDER_ID, 'fixture', 2);
    const page3 = await search(MOCK_PROVIDER_ID, 'fixture', 3);
    expect(page1.ok && page2.ok && page3.ok).toBe(true);
    if (!page1.ok || !page2.ok || !page3.ok) return;
    expect(page1.data.items).toHaveLength(6);
    expect(page1.data.hasNext).toBe(true);
    expect(page2.data.items).toHaveLength(5);
    expect(page2.data.hasNext).toBe(false);
    expect(page3.data.items).toHaveLength(0);
    // No overlap between pages.
    const ids = new Set([...page1.data.items, ...page2.data.items].map((item) => item.url));
    expect(ids.size).toBe(11);
  });

  it('matches multiple tokens against names/tags/types', async () => {
    const result = await search(MOCK_PROVIDER_ID, 'anime fixture', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.map((item) => item.type)).toEqual(['Anime', 'Anime']);
  });

  it('returns an empty page for gibberish', async () => {
    const result = await search(MOCK_PROVIDER_ID, 'zzzznothing', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toEqual([]);
    expect(result.data.hasNext).toBe(false);
  });
});

describe('getTitle', () => {
  it('loads a movie with metadata, cast, and recommendations', async () => {
    const result = await getTitle(MOCK_PROVIDER_ID, detailUrlFor('aurora-drift'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      kind: 'movie',
      name: 'Aurora Drift',
      type: 'Movie',
      year: 2021,
    });
    if (result.data.kind !== 'movie') return;
    expect(result.data.dataUrl).toBe('fixtures:play:aurora-drift');
    expect(result.data.actors?.length).toBeGreaterThan(0);
    expect(result.data.recommendations?.length).toBe(3);
  });

  it('loads a series with episodes carrying opaque data tokens', async () => {
    const result = await getTitle(MOCK_PROVIDER_ID, detailUrlFor('northgate'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.data.kind !== 'tvSeries') return expect.unreachable('expected tvSeries');
    expect(result.data.episodes).toHaveLength(6);
    expect(result.data.episodes[0]).toMatchObject({ season: 1, episode: 1 });
    expect(typeof result.data.episodes[0]?.data).toBe('string');
  });

  it('loads anime with dub-keyed episode maps', async () => {
    const result = await getTitle(MOCK_PROVIDER_ID, detailUrlFor('starling-courier'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.data.kind !== 'anime') return expect.unreachable('expected anime');
    expect(Object.keys(result.data.episodes).sort()).toEqual(['Dubbed', 'Subbed']);
  });

  it('maps unknown references to not-found (never throws)', async () => {
    const result = await getTitle(MOCK_PROVIDER_ID, 'https://fixtures.local/title/missing-slug');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not-found');
  });
});

describe('getLinks (through the LinkPipeline)', () => {
  it('resolves deduplicated, quality-sorted links + subtitles for a fixture title', async () => {
    const result = await getLinks(MOCK_PROVIDER_ID, 'fixtures:play:aurora-drift');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.handled).toBe(true);
    expect(result.data.links.map((link) => link.type)).toEqual(['video', 'video', 'hls']);
    expect(result.data.subtitles).toHaveLength(2);
  });

  it('resolves live-stream links with documented provenance sources', async () => {
    const result = await getLinks(MOCK_PROVIDER_ID, 'fixtures:live:harbor-lights-live');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0]?.source).toBe('mux-test');
  });

  it('reports not-found for unhandled tokens', async () => {
    const result = await getLinks(MOCK_PROVIDER_ID, 'fixtures:play:does-not-exist');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not-found');
  });
});

describe('provider status + poster sync', () => {
  it('reports healthy counts and enabled kill-switch state after calls', async () => {
    await getHome(MOCK_PROVIDER_ID, 1);
    await search(MOCK_PROVIDER_ID, 'fixture', 1);
    const statuses = getProviderStatuses();
    expect(statuses[0]?.health.status).toBe('ok');
    expect(statuses[0]?.health.totalSuccesses).toBeGreaterThan(0);
    expect(statuses[0]?.health.totalFailures).toBe(0);
    expect(statuses[0]?.killSwitch.enabled).toBe(true);
    expect(statuses[0]?.killSwitch.globallyDisabled).toBe(false);
  });

  it('has a committed poster for every catalog title', () => {
    const postersDir = join(ROOT, 'public', 'posters');
    const home = getRuntime().hosts.get(MOCK_PROVIDER_ID);
    expect(home).toBeDefined();
    // Derive the full title set from the provider itself — every search
    // result must have a committed poster file.
    expect(ALL_SEARCH_RESULTS.length).toBeGreaterThanOrEqual(15);
    for (const item of ALL_SEARCH_RESULTS) {
      const slug = item.id as string;
      const file = join(postersDir, `${slug}.svg`);
      expect(existsSync(file), `missing poster for ${slug}`).toBe(true);
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('<svg');
    }
  });
});
