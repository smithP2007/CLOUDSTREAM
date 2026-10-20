import { describe, expect, it } from 'vitest';

import type { LinkCollection, PlaybackLink, SubtitleFile } from '../src/core';
import {
  DEFAULT_LINK_TTL_MS,
  LinkPipeline,
  linksHaveCredentials,
  normalizeLinkCollection,
} from '../src/server/links';

function link(overrides: Partial<PlaybackLink> & { url: string }): PlaybackLink {
  return {
    source: 'test-source',
    name: 'Test source',
    type: 'video',
    quality: 720,
    ...overrides,
  };
}

function subtitle(language: string, url: string): SubtitleFile {
  return { language, url };
}

function collection(
  links: PlaybackLink[] = [],
  subtitles: SubtitleFile[] = [],
  rejectedItems = 0,
  handled = true,
): LinkCollection {
  return { handled, links, subtitles, rejectedItems };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('linksHaveCredentials', () => {
  it('flags credential-bearing header names case-insensitively', () => {
    expect(linksHaveCredentials([link({ url: 'u', headers: { Authorization: 'Bearer x' } })])).toBe(true);
    expect(linksHaveCredentials([link({ url: 'u', headers: { COOKIE: 'a=b' } })])).toBe(true);
    expect(linksHaveCredentials([link({ url: 'u', headers: { 'x-api-key': 'k' } })])).toBe(true);
  });

  it('does not flag ordinary headers, referer or missing headers', () => {
    expect(linksHaveCredentials([link({ url: 'u', headers: { referer: 'https://x.test', 'user-agent': 'ua' } })])).toBe(false);
    expect(linksHaveCredentials([link({ url: 'u', headers: null })])).toBe(false);
    expect(linksHaveCredentials([link({ url: 'u' })])).toBe(false);
  });
});

describe('normalizeLinkCollection', () => {
  it('drops invalid links and subtitles, counting them', () => {
    const raw = collection(
      [
        link({ url: 'good' }),
        { source: 's', name: 'n', url: 'bad', type: 'torrent' as never, quality: null }, // banned type
        link({ url: 'no-quality', quality: undefined as never }),
      ],
      [subtitle('en', 'ok'), { language: 'en', url: 42 } as never],
    );
    const normalized = normalizeLinkCollection(raw);
    expect(normalized.collection.links.map((l) => l.url)).toEqual(['good']);
    expect(normalized.collection.subtitles.map((s) => s.url)).toEqual(['ok']);
    expect(normalized.dropped).toBe(3); // 2 invalid links + 1 invalid subtitle
    expect(normalized.collection.rejectedItems).toBe(3); // 0 incoming + 3 dropped
  });

  it('dedupes links first-wins (even when the later duplicate is better)', () => {
    const normalized = normalizeLinkCollection(
      collection([
        link({ url: 'same', quality: 360 }),
        link({ url: 'same', quality: 1080 }),
      ]),
    );
    expect(normalized.collection.links).toHaveLength(1);
    expect(normalized.collection.links[0]?.quality).toBe(360);
  });

  it('sorts by quality descending with unknown last and stable ties', () => {
    const normalized = normalizeLinkCollection(
      collection([
        link({ url: 'a', quality: 720 }),
        link({ url: 'b', quality: 1080 }),
        link({ url: 'c', quality: 720 }),
        link({ url: 'd', quality: null }),
        link({ url: 'e', quality: 1080 }),
      ]),
    );
    expect(normalized.collection.links.map((l) => l.url)).toEqual(['b', 'e', 'a', 'c', 'd']);
  });

  it('dedupes subtitles by normalized (language, url)', () => {
    const normalized = normalizeLinkCollection(
      collection([], [
        subtitle('EN', 'sub1'),
        subtitle('en ', 'sub1'), // case + whitespace variant of the same pair
        subtitle('en', 'sub2'),
        subtitle(' pt-BR', 'sub3'),
        subtitle('pt-br', 'sub3'),
      ]),
    );
    expect(normalized.collection.subtitles.map((s) => s.url)).toEqual(['sub1', 'sub2', 'sub3']);
    expect(normalized.collection.subtitles[2]?.language).toBe(' pt-BR'); // first occurrence kept verbatim
  });

  it('preserves handled=false and existing rejected counts', () => {
    const normalized = normalizeLinkCollection(collection([], [], 3, false));
    expect(normalized.collection.handled).toBe(false);
    expect(normalized.collection.rejectedItems).toBe(3);
  });
});

describe('LinkPipeline', () => {
  it('resolves fresh, caches for the TTL window, and invalidates', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 10_000 });
    let loads = 0;
    const first = await pipeline.resolve({
      providerName: 'p1',
      episodeId: 'e1',
      load: async () => {
        loads += 1;
        return collection([link({ url: 'u1' })]);
      },
    });
    expect(first.source).toBe('miss');
    expect(loads).toBe(1);

    const second = await pipeline.resolve({
      providerName: 'p1',
      episodeId: 'e1',
      load: async () => {
        loads += 1;
        return collection();
      },
    });
    expect(second.source).toBe('hit');
    expect(second.collection.links[0]?.url).toBe('u1');
    expect(loads).toBe(1); // loader never re-ran

    expect(pipeline.invalidate('p1', 'e1')).toBe(true);
    const third = await pipeline.resolve({
      providerName: 'p1',
      episodeId: 'e1',
      load: async () => {
        loads += 1;
        return collection([link({ url: 'u2' })]);
      },
    });
    expect(third.source).toBe('miss');
    expect(loads).toBe(2);
  });

  it('defaults the TTL to the verified upstream 20-minute window', () => {
    expect(DEFAULT_LINK_TTL_MS).toBe(20 * 60 * 1000);
  });

  it('shares one in-flight load across concurrent callers (single-flight)', async () => {
    const pipeline = new LinkPipeline();
    let loads = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const makeCall = () =>
      pipeline.resolve({
        providerName: 'p1',
        episodeId: 'e1',
        load: async () => {
          loads += 1;
          await gate;
          return collection([link({ url: 'shared' })]);
        },
      });

    const promiseA = makeCall();
    const promiseB = makeCall();
    const promiseC = makeCall();
    release?.(); // all three registered before the gate opens (single-flight)

    const [a, b, c] = await Promise.all([promiseA, promiseB, promiseC]);

    expect(loads).toBe(1);
    expect(a.collection.links[0]?.url).toBe('shared');
    expect(b.collection.links[0]?.url).toBe('shared');
    expect(c.collection.links[0]?.url).toBe('shared');
    expect([a.source, b.source, c.source].sort()).toEqual(['inflight', 'inflight', 'miss']);
    expect(pipeline.stats().inflight).toBe(0); // cleaned up after settle
  });

  it('never caches failures and cleans up the in-flight map', async () => {
    const pipeline = new LinkPipeline();
    let loads = 0;
    const attempt = () =>
      pipeline.resolve({
        providerName: 'p1',
        episodeId: 'e1',
        load: async () => {
          loads += 1;
          if (loads === 1) throw new Error('boom');
          return collection([link({ url: 'recovered' })]);
        },
      });

    await expect(attempt()).rejects.toThrow('boom');
    expect(pipeline.stats().inflight).toBe(0);

    const second = await attempt();
    expect(second.source).toBe('miss');
    expect(second.collection.links[0]?.url).toBe('recovered');
    expect(loads).toBe(2);
  });

  it('expires stale entries and refreshes them', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 10 });
    let loads = 0;
    const call = () =>
      pipeline.resolve({
        providerName: 'p1',
        episodeId: 'e1',
        load: async () => {
          loads += 1;
          return collection([link({ url: `v${loads}` })]);
        },
      });

    await call();
    await sleep(30);
    const refreshed = await call();
    expect(refreshed.source).toBe('miss');
    expect(refreshed.collection.links[0]?.url).toBe('v2');
  });

  it('evicts least-recently-used entries beyond maxEntries', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 60_000, maxEntries: 2 });
    const call = (episode: string) =>
      pipeline.resolve({
        providerName: 'p1',
        episodeId: episode,
        load: async () => collection([link({ url: episode })]),
      });

    await call('e1');
    await call('e2');
    await call('e3'); // evicts e1 (LRU)

    expect(pipeline.stats().entries).toBe(2);
    expect(pipeline.invalidate('p1', 'e1')).toBe(false); // already evicted
    expect(pipeline.invalidate('p1', 'e3')).toBe(true);
  });

  it('refuses to cache oversized collections under a byte budget', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 60_000, maxBytes: 16 });
    let loads = 0;
    const call = () =>
      pipeline.resolve({
        providerName: 'p1',
        episodeId: 'e1',
        load: async () => {
          loads += 1;
          return collection([link({ url: 'a-url-longer-than-sixteen-bytes' })]);
        },
      });

    await call();
    const second = await call();
    expect(second.source).toBe('miss');
    expect(loads).toBe(2);
    expect(pipeline.stats().entries).toBe(0);
  });

  it('never caches credential-bearing links under the shared scope', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 60_000 });
    let loads = 0;
    const call = () =>
      pipeline.resolve({
        providerName: 'p1',
        episodeId: 'e1',
        load: async () => {
          loads += 1;
          return collection([link({ url: 'u', headers: { authorization: 'Bearer t' } })]);
        },
      });

    const first = await call();
    const second = await call();
    expect(first.source).toBe('miss');
    expect(second.source).toBe('miss');
    expect(loads).toBe(2); // fetched fresh every time — never shared
  });

  it('caches credential-bearing links only inside their explicit scope', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 60_000 });
    const load = async () =>
      collection([link({ url: 'u', headers: { 'X-Auth-Token': 'secret' } })]);

    const user1a = await pipeline.resolve({
      providerName: 'p1',
      episodeId: 'e1',
      scope: 'user-1',
      load,
    });
    const user1b = await pipeline.resolve({
      providerName: 'p1',
      episodeId: 'e1',
      scope: 'user-1',
      load,
    });
    expect(user1a.source).toBe('miss');
    expect(user1b.source).toBe('hit'); // same user: cached

    const user2 = await pipeline.resolve({
      providerName: 'p1',
      episodeId: 'e1',
      scope: 'user-2',
      load,
    });
    expect(user2.source).toBe('miss'); // never crosses users
  });

  it('invalidateProvider removes only that provider across scopes', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 60_000 });
    const load = async () => collection([link({ url: 'u' })]);

    await pipeline.resolve({ providerName: 'p1', episodeId: 'e1', load });
    await pipeline.resolve({ providerName: 'p1', episodeId: 'e1', scope: 'user-1', load });
    await pipeline.resolve({ providerName: 'p2', episodeId: 'e9', load });

    expect(pipeline.invalidateProvider('p1')).toBe(2);
    expect(pipeline.stats().entries).toBe(1);
    expect(pipeline.invalidateProvider('missing')).toBe(0);
  });

  it('clear() drops everything and stats() reports memory honestly', async () => {
    const pipeline = new LinkPipeline({ ttlMs: 60_000 });
    const load = async () => collection([link({ url: 'u' })]);
    await pipeline.resolve({ providerName: 'p1', episodeId: 'e1', load });
    await pipeline.resolve({ providerName: 'p1', episodeId: 'e2', load });

    const stats = pipeline.stats();
    expect(stats.entries).toBe(2);
    expect(stats.bytes).toBeGreaterThan(0);

    pipeline.clear();
    expect(pipeline.stats()).toEqual({ entries: 0, bytes: 0, inflight: 0 });
  });
});
