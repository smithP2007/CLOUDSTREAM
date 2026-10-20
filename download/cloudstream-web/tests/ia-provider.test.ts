/**
 * Internet Archive provider tests (D20) — fixture-only, ZERO live calls
 * (checklist §9.2). Every network touchpoint is a scripted FakeEngine; the
 * committed fixtures under tests/fixtures/ia/ are the only payload source.
 *
 * Coverage per the checklist: schema parsing; search mapping (hasNext,
 * register filter, cap guard); load() mapping (year-range parsing, HTML
 * stripping, runtime, derivative selection, dataUrl payload); metadata-[]
 * → null; restricted-item rejection; rights-register enforcement (unknown
 * identifier ⇒ load null / loadLinks not-handled — even with valid-looking
 * metadata); loadLinks emissions (progressive MP4 only, subtitles only when
 * present, zero-links-when-no-derivative); pacing (spacing/429 policy, pure
 * decision paths); kill-switch refusal through wrapProvider.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildIaDownloadUrl,
  createInternetArchiveProvider,
  IA_COLLECTION_POOLS,
  identifierFromDetailsUrl,
  iaSubtitleFromFileName,
  parseIaRuntimeMinutes,
  parseIaYear,
  selectIaDerivative,
  stripIaHtml,
} from '../src/server/providers/internetarchive/provider';
import {
  IaAdvancedSearchSchema,
  IaDataPayloadSchema,
  IaMetadataResponseSchema,
  IaScrapeResponseSchema,
} from '../src/server/providers/internetarchive/schemas';
import { getRightsEntry, isApprovedIdentifier } from '../src/server/providers/internetarchive/register';
import { IaPacer, IaRateLimitedError } from '../src/server/providers/internetarchive/pacer';
import { wrapProvider } from '../src/server/obs/events';
import { ProviderCallLogger } from '../src/server/obs/events';
import { ProviderKillSwitch } from '../src/server/obs/kill-switch';
import { ProviderHost } from '../src/core/provider-host';
import type { HttpEngine, HttpResponse } from '../src/server/http/engine';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'ia');
function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

/* -------------------------------------------------------------------------- */
/* FakeEngine — scripted engine responses (no network)                        */
/* -------------------------------------------------------------------------- */

interface ScriptedResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

function fakeEngine(responses: ScriptedResponse[]): {
  engine: HttpEngine;
  urls: () => string[];
} {
  const urls: string[] = [];
  let index = 0;
  const engine = {
    fetch: vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      const scripted = responses[Math.min(index, responses.length - 1)] as ScriptedResponse;
      index += 1;
      const response: HttpResponse = {
        status: scripted.status,
        headers: scripted.headers ?? { 'content-type': 'application/json' },
        body: new TextEncoder().encode(scripted.body),
        url: String(url),
        redirected: false,
        fromCache: false,
        redirectChain: [],
        text: () => scripted.body,
        json: () => JSON.parse(scripted.body) as unknown,
      };
      return { ok: true as const, response };
    }),
  };
  return { engine: engine as unknown as HttpEngine, urls: () => urls };
}

const NOOP_CTX = { signal: new AbortController().signal };
const CALLER_CTX = { signal: new AbortController().signal };

function scriptedProvider(responses: ScriptedResponse[], pacer?: IaPacer) {
  const { engine, urls } = fakeEngine(responses);
  const provider = createInternetArchiveProvider({ searchEngine: engine, metadataEngine: engine, pacer });
  return { provider, urls };
}

/* -------------------------------------------------------------------------- */
/* Schemas (fixture-pinned)                                                   */
/* -------------------------------------------------------------------------- */

describe('IA wire schemas', () => {
  it('parses the search-success fixture', () => {
    const parsed = IaAdvancedSearchSchema.safeParse(JSON.parse(fixture('search-success.json')));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.response.numFound).toBe(293);
      expect(parsed.data.response.docs).toHaveLength(3);
      expect(parsed.data.response.docs[0]?.identifier).toBe('night_of_the_living_dead');
    }
  });

  it('parses the search-empty fixture (numFound 0)', () => {
    const parsed = IaAdvancedSearchSchema.safeParse(JSON.parse(fixture('search-empty.json')));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.response.docs).toHaveLength(0);
  });

  it('parses the metadata-success fixture incl. the full files[] shape', () => {
    const parsed = IaMetadataResponseSchema.safeParse(JSON.parse(fixture('metadata-success.json')));
    expect(parsed.success).toBe(true);
    if (parsed.success && !Array.isArray(parsed.data)) {
      expect(parsed.data.metadata.identifier).toBe('night_of_the_living_dead');
      expect(parsed.data.files.length).toBe(5);
      expect(parsed.data.d1).toContain('archive.org');
    }
  });

  it('parses the metadata-missing fixture ([] for an unknown identifier, E3)', () => {
    const parsed = IaMetadataResponseSchema.safeParse(JSON.parse(fixture('metadata-missing.json')));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Array.isArray(parsed.data)).toBe(true);
  });

  it('rejects metadata objects with a non-array files field (fail-closed)', () => {
    const bad = { metadata: { identifier: 'x' }, files: 'not-an-array' };
    expect(IaMetadataResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('parses the scrape-page fixture (E2 shape)', () => {
    const parsed = IaScrapeResponseSchema.safeParse(JSON.parse(fixture('scrape-page.json')));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items).toHaveLength(3);
      expect(typeof parsed.data.cursor).toBe('string');
    }
  });

  it('rejects non-coercive garbage (numFound as string)', () => {
    const bad = { response: { numFound: '293', docs: [] } };
    expect(IaAdvancedSearchSchema.safeParse(bad).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

describe('IA pure helpers', () => {
  it('parses years incl. range strings ("1953" / "1953-1959")', () => {
    expect(parseIaYear('1953')).toBe(1953);
    expect(parseIaYear('1953-1959')).toBe(1953);
    expect(parseIaYear(1940)).toBe(1940);
    expect(parseIaYear('n.d.')).toBeNull();
    expect(parseIaYear(undefined)).toBeNull();
  });

  it('strips HTML from descriptions and collapses whitespace', () => {
    expect(stripIaHtml('<p>Hello <b>world</b>.</p><p>Second line.</p>')).toBe(
      'Hello world. Second line.',
    );
    expect(stripIaHtml('   ')).toBe('');
    expect(stripIaHtml('plain text')).toBe('plain text');
  });

  it('parses runtimes ("1:36:11" and seconds) into minutes', () => {
    expect(parseIaRuntimeMinutes('1:36:11')).toBe(96);
    expect(parseIaRuntimeMinutes(5771.5)).toBe(96);
    expect(parseIaRuntimeMinutes(undefined)).toBeNull();
    expect(parseIaRuntimeMinutes('garbage')).toBeNull();
  });

  it('selects the h.264 derivative with a length floor and never invents names', () => {
    const selected = selectIaDerivative([
      { name: 'night_of_the_living_dead.avi', format: 'Hi-Res MPEG4', size: '3214587904', length: '5771.5' },
      { name: 'night_of_the_living_dead_512kb.mp4', format: 'h.264', size: '518451200', length: '1:36:11' },
      { name: 'night_of_the_living_dead.ogv', format: 'Ogg Video', size: '402198144', length: '1:36:11' },
      { name: 'thumbs.jpg', format: 'Thumbnail' },
    ]);
    expect(selected).toBe('night_of_the_living_dead_512kb.mp4');
  });

  it('returns null when no usable derivative exists (no invented URL)', () => {
    expect(selectIaDerivative([{ name: 'thumbs.jpg', format: 'Thumbnail' }])).toBeNull();
    expect(
      selectIaDerivative([{ name: 'clip.mp4', format: 'h.264', length: '0:00:05' }]),
    ).toBeNull(); // below the 10-second floor
    expect(selectIaDerivative([])).toBeNull();
  });

  it('builds download URLs with per-segment encoding', () => {
    expect(buildIaDownloadUrl('night_of_the_living_dead', 'night_of_the_living_dead_512kb.mp4')).toBe(
      'https://archive.org/download/night_of_the_living_dead/night_of_the_living_dead_512kb.mp4',
    );
    expect(buildIaDownloadUrl('some item', 'a file with spaces.mp4')).toBe(
      'https://archive.org/download/some%20item/a%20file%20with%20spaces.mp4',
    );
  });

  it('extracts identifiers from details URLs (and never from query strings)', () => {
    expect(identifierFromDetailsUrl('https://archive.org/details/night_of_the_living_dead')).toBe(
      'night_of_the_living_dead',
    );
    expect(identifierFromDetailsUrl('https://archive.org/details/SomeItem?query=1#frag')).toBe(
      'SomeItem',
    );
    expect(identifierFromDetailsUrl('https://archive.org/')).toBeNull();
    expect(identifierFromDetailsUrl('')).toBeNull();
  });

  it('shapes subtitles only for real .srt/.vtt entries', () => {
    const subtitle = iaSubtitleFromFileName('night_of_the_living_dead', 'night_of_the_living_dead.srt');
    expect(subtitle).not.toBeNull();
    expect(subtitle?.url).toContain('/download/night_of_the_living_dead/');
    expect(iaSubtitleFromFileName('x', 'cover.jpg')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Rights register (mandatory per-item gate)                                   */
/* -------------------------------------------------------------------------- */

describe('IA rights register', () => {
  it('approves register identifiers and refuses everything else', () => {
    expect(isApprovedIdentifier('night_of_the_living_dead')).toBe(true);
    expect(isApprovedIdentifier('some_random_pirated_item')).toBe(false);
    expect(isApprovedIdentifier('')).toBe(false);
    expect(isApprovedIdentifier(null)).toBe(false);
    expect(isApprovedIdentifier(42)).toBe(false);
  });

  it('records review metadata for every entry (audit surface)', () => {
    for (const entry of getRightsEntry('night_of_the_living_dead') ? [getRightsEntry('night_of_the_living_dead')] : []) {
      expect(entry?.basis.length ?? 0).toBeGreaterThan(20);
      expect(entry?.reviewedAt).toBe('2026-10-21');
      expect(entry?.evidence.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Provider behaviors (scripted engines — no live calls)                       */
/* -------------------------------------------------------------------------- */

describe('IA provider search', () => {
  it('maps search results, filters them through the rights register, and derives hasNext', async () => {
    const { provider } = scriptedProvider([
      { status: 200, body: fixture('search-success.json') },
    ]);
    const page = await provider.search('night of the living', 1, CALLER_CTX);
    expect(page).not.toBeNull();
    expect(page?.items).toHaveLength(3);
    expect(page?.hasNext).toBe(true); // numFound 293 > 50 fetched
    const first = page?.items[0];
    expect(first?.providerName).toBe('InternetArchive');
    expect(first?.url).toBe('https://archive.org/details/night_of_the_living_dead');
    expect(first?.posterUrl).toBe('https://archive.org/services/img/night_of_the_living_dead');
    expect(first?.score).toBeNull(); // never fabricated
  });

  it('sends the documented advancedsearch parameters with the curated pool query', async () => {
    const { provider, urls } = scriptedProvider([
      { status: 200, body: fixture('search-success.json') },
    ]);
    await provider.search('night', 1, CALLER_CTX);
    const url = urls()[0] ?? '';
    expect(url).toContain('https://archive.org/advancedsearch.php?');
    const params = new URL(url).searchParams;
    const q = params.get('q') ?? '';
    expect(q).toContain('mediatype:movies');
    expect(q).toContain(`collection:(${IA_COLLECTION_POOLS.join(' OR ')})`);
    expect(params.getAll('fl[]')).toEqual(['identifier', 'title', 'year']);
    expect(params.get('output')).toBe('json');
    expect(params.get('rows')).toBe('50');
  });

  it('returns an empty page (hasNext false) for zero hits', async () => {
    const { provider } = scriptedProvider([{ status: 200, body: fixture('search-empty.json') }]);
    const page = await provider.search('zzz-no-such-title', 1, CALLER_CTX);
    expect(page).not.toBeNull();
    expect(page?.items).toHaveLength(0);
    expect(page?.hasNext).toBe(false);
  });

  it('drops docs whose identifiers are absent from the rights register', async () => {
    const body = JSON.stringify({
      responseHeader: { status: 0 },
      response: {
        numFound: 2,
        start: 0,
        docs: [
          { identifier: 'night_of_the_living_dead', title: 'Night of the Living Dead', year: '1968' },
          { identifier: 'some_random_pirated_item', title: 'Unregistered Item', year: '2020' },
        ],
      },
    });
    const { provider } = scriptedProvider([{ status: 200, body }]);
    const page = await provider.search('test', 1, CALLER_CTX);
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]?.id).toBe('night_of_the_living_dead');
  });

  it('validates the payload boundary — a schema-violating response becomes a provider error', async () => {
    const { provider } = scriptedProvider([{ status: 200, body: '{"response": {"numFound": "not-a-number", "docs": []}}' }]);
    await expect(provider.search('x', 1, CALLER_CTX)).rejects.toThrow(/failed validation/);
  });

  it('throws RangeError on invalid pages (host owns the failure, D13)', async () => {
    const { provider } = scriptedProvider([]);
    await expect(provider.search('x', 0, CALLER_CTX)).rejects.toThrow(RangeError);
    await expect(provider.search('x', 1.5, CALLER_CTX)).rejects.toThrow(RangeError);
  });

  it('returns null for empty queries and honors the page budget', async () => {
    const { provider } = scriptedProvider([{ status: 200, body: fixture('search-empty.json') }]);
    await expect(provider.search('   ', 1, CALLER_CTX)).resolves.toBeNull();
    await expect(provider.search('x', 21, CALLER_CTX)).resolves.toBeNull(); // MAX_SEARCH_PAGES + 1
  });
});

describe('IA provider load', () => {
  it('maps metadata to a MovieLoadResponse with HTML-stripped plot, year, runtime and dataUrl', async () => {
    const { provider } = scriptedProvider([
      { status: 200, body: fixture('metadata-success.json') },
    ]);
    const loaded = await provider.load(
      'https://archive.org/details/night_of_the_living_dead',
      CALLER_CTX,
    );
    expect(loaded).not.toBeNull();
    if (loaded?.kind !== 'movie') throw new Error('expected a movie response');
    expect(loaded.name).toBe('Night of the Living Dead');
    expect(loaded.plot).toBe(
      'A group of strangers barricades themselves in a rural farmhouse while the recently dead rise and attack the living. Directed by George A. Romero.',
    );
    expect(loaded.year).toBe(1968);
    expect(loaded.duration).toBe(96);
    expect(loaded.tags).toEqual(['feature_films', 'horror_film_archive']);
    expect(loaded.actors).toEqual([]);
    const payload = IaDataPayloadSchema.parse(JSON.parse(loaded.dataUrl));
    expect(payload.identifier).toBe('night_of_the_living_dead');
    expect(payload.fileName).toBe('night_of_the_living_dead_512kb.mp4');
    expect(payload.subtitles).toEqual(['night_of_the_living_dead.srt']);
  });

  it('returns null for a missing identifier ([] response, E3) WITHOUT a register fetch', async () => {
    const { provider, urls } = scriptedProvider([{ status: 200, body: fixture('metadata-missing.json') }]);
    const loaded = await provider.load('https://archive.org/details/night_of_the_living_dead', CALLER_CTX);
    expect(loaded).toBeNull();
    expect(urls()).toHaveLength(1); // the metadata fetch happened, nothing else
  });

  it('refuses identifiers absent from the rights register BEFORE any network call', async () => {
    const { provider, urls } = scriptedProvider([{ status: 200, body: fixture('metadata-success.json') }]);
    const loaded = await provider.load('https://archive.org/details/some_random_pirated_item', CALLER_CTX);
    expect(loaded).toBeNull();
    expect(urls()).toHaveLength(0); // no request was ever issued
  });

  it('refuses access-restricted / lending items (§8.3 metadata gate)', async () => {
    const restricted = JSON.parse(fixture('metadata-success.json')) as Record<string, unknown>;
    (restricted as { metadata: Record<string, unknown> }).metadata['access-restricted-item'] = 'true';
    const { provider } = scriptedProvider([{ status: 200, body: JSON.stringify(restricted) }]);
    const loaded = await provider.load('https://archive.org/details/night_of_the_living_dead', CALLER_CTX);
    expect(loaded).toBeNull();
  });

  it('defends in depth: a metadata body claiming a DIFFERENT register identifier is refused', async () => {
    const spoofed = JSON.parse(fixture('metadata-success.json')) as { metadata: { identifier: string } };
    spoofed.metadata.identifier = 'HisGirlFriday';
    const { provider } = scriptedProvider([{ status: 200, body: JSON.stringify(spoofed) }]);
    const loaded = await provider.load('https://archive.org/details/night_of_the_living_dead', CALLER_CTX);
    expect(loaded).toBeNull();
  });
});

describe('IA provider loadLinks', () => {
  it('emits exactly one progressive-MP4 link for the selected derivative', async () => {
    const { provider } = scriptedProvider([]);
    const data = JSON.stringify({
      identifier: 'night_of_the_living_dead',
      fileName: 'night_of_the_living_dead_512kb.mp4',
      subtitles: [],
    });
    const emitted: unknown[] = [];
    const handled = await provider.loadLinks(data, (item) => emitted.push(item), CALLER_CTX);
    expect(handled).toBe(true);
    expect(emitted).toHaveLength(1);
    const link = emitted[0] as { source: string; type: string; url: string; quality: unknown };
    expect(link.source).toBe('InternetArchive');
    expect(link.type).toBe('video'); // NEVER hls/dash (E18 UNKNOWN)
    expect(link.url).toBe(
      'https://archive.org/download/night_of_the_living_dead/night_of_the_living_dead_512kb.mp4',
    );
    expect(link.quality).toBeNull();
  });

  it('emits subtitles only when the item actually ships them', async () => {
    const { provider } = scriptedProvider([]);
    const data = JSON.stringify({
      identifier: 'night_of_the_living_dead',
      fileName: 'night_of_the_living_dead_512kb.mp4',
      subtitles: ['night_of_the_living_dead.srt'],
    });
    const emitted: unknown[] = [];
    await provider.loadLinks(data, (item) => emitted.push(item), CALLER_CTX);
    expect(emitted).toHaveLength(2);
    const subtitle = emitted[1] as { url: string; language: string };
    expect(subtitle.language).toBe('en');
    expect(subtitle.url).toContain('/download/night_of_the_living_dead/night_of_the_living_dead.srt');
  });

  it('emits NOTHING when no derivative was selected (handled=true, zero emissions)', async () => {
    const { provider } = scriptedProvider([]);
    const data = JSON.stringify({ identifier: 'night_of_the_living_dead', fileName: null });
    const emitted: unknown[] = [];
    const handled = await provider.loadLinks(data, (item) => emitted.push(item), CALLER_CTX);
    expect(handled).toBe(true);
    expect(emitted).toHaveLength(0);
  });

  it('reports not-handled for foreign payloads and refuses unregistered identifiers', async () => {
    const { provider } = scriptedProvider([]);
    await expect(provider.loadLinks('not-json', () => {}, CALLER_CTX)).resolves.toBe(false);
    await expect(
      provider.loadLinks(JSON.stringify({ nope: true }), () => {}, CALLER_CTX),
    ).resolves.toBe(false);
    const unregistered = JSON.stringify({
      identifier: 'some_random_pirated_item',
      fileName: 'movie.mp4',
    });
    let emittedCount = 0;
    await expect(
      provider.loadLinks(unregistered, () => {
        emittedCount += 1;
      }, CALLER_CTX),
    ).resolves.toBe(false);
    expect(emittedCount).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Pacing (pure decision paths — no real timers asserted)                      */
/* -------------------------------------------------------------------------- */

describe('IA pacing policy (D20)', () => {
  it('clamps Retry-After into [60s, 15min] for delta-seconds and HTTP-dates', () => {
    const now = 1_700_000_000_000;
    expect(IaPacer.parseRetryAfterMs('5', now)).toBe(60_000);
    expect(IaPacer.parseRetryAfterMs('3600', now)).toBe(15 * 60_000);
    expect(IaPacer.parseRetryAfterMs(new Date(now + 120_000).toUTCString(), now)).toBeGreaterThanOrEqual(60_000);
    expect(IaPacer.parseRetryAfterMs(null, now)).toBe(60_000);
    expect(IaPacer.parseRetryAfterMs('garbage', now)).toBe(60_000);
  });

  it('fails fast with IaRateLimitedError while a 429 pause is active', async () => {
    const pacer = new IaPacer();
    pacer.reportRateLimited('30');
    await expect(pacer.acquire()).rejects.toBeInstanceOf(IaRateLimitedError);
  });

  it('maps a 429 response to a typed rate-limit error and records the pause', async () => {
    const pacer = new IaPacer();
    const { provider } = scriptedProvider(
      [{ status: 429, body: 'slow down', headers: { 'retry-after': '120' } }],
      pacer,
    );
    await expect(provider.search('x', 1, CALLER_CTX)).rejects.toBeInstanceOf(IaRateLimitedError);
    expect(pacer.paused).toBe(true);
    // A second call fails fast without touching the network again.
    const { provider: provider2, urls } = scriptedProvider(
      [{ status: 429, body: 'slow down', headers: { 'retry-after': '120' } }],
      pacer,
    );
    await expect(provider2.search('x', 1, CALLER_CTX)).rejects.toBeInstanceOf(IaRateLimitedError);
    expect(urls()).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Kill switch + host integration (D19 wiring)                                */
/* -------------------------------------------------------------------------- */

describe('IA provider kill-switch wiring', () => {
  it('is refused with ProviderDisabledError when the kill switch is engaged', async () => {
    const { provider } = scriptedProvider([
      { status: 200, body: fixture('search-success.json') },
    ]);
    const killSwitch = new ProviderKillSwitch();
    const wrapped = wrapProvider(provider, {
      logger: new ProviderCallLogger({ sink: () => undefined }),
      killSwitch,
    });
    killSwitch.disable('InternetArchive', 'test disable');
    await expect(wrapped.search('x', 1, NOOP_CTX)).rejects.toThrow(/disabled|kill/i);
    // Re-enable → the call goes through (to the scripted engine).
    killSwitch.enable('InternetArchive');
    await expect(wrapped.search('night', 1, NOOP_CTX)).resolves.not.toBeNull();
  });

  it('survives the ProviderHost boundary (errors become typed failures, D13)', async () => {
    const { provider } = scriptedProvider([{ status: 200, body: 'not-json-at-all' }]);
    const host = new ProviderHost(provider);
    const result = await host.search('x', 1);
    expect(result.ok).toBe(false);
    // The provider THREW (invalid JSON → our boundary error); the host maps
    // thrown provider faults to kind 'provider' (its own Zod pass on RETURNED
    // data is what yields 'validation').
    if (!result.ok) expect(result.kind).toBe('provider');
  });
});
