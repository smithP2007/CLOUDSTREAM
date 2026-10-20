/**
 * Host behavior tests — pins the contract semantics verified upstream
 * (`APIRepository.safeApiCall` + `withTimeout`, `RepoLinkGenerator` pipeline):
 *
 *   1. host-owned error boundary (a provider exception must not crash an
 *      unrelated request)
 *   2. configurable per-method timeouts
 *   3. timeouts signal cancellation through AbortSignal (real signaling, not a
 *      bare race)
 *   4./5. link dedupe + quality sort (delegated to links.ts, asserted here
 *      end-to-end through the host too)
 *   6. invalid provider responses fail validation safely
 *   7. callback-based link and subtitle emission handled consistently
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_PROVIDER_TIMEOUTS } from '../src/core/provider';
import { ProviderHost, TimeoutError } from '../src/core/provider-host';
import type { LoadResponse, SearchPage } from '../src/core/types';

import {
  VALID_SEARCH_ITEM,
  abortableSleep,
  makeLink,
  makeProvider,
  makeSubtitle,
  settle,
  sleep,
} from './helpers';

describe('behavior 1: host-owned error boundary', () => {
  it('a provider exception does not crash an unrelated request', async () => {
    const throwing = makeProvider({
      name: 'throwing',
      search: async () => {
        throw new Error('boom');
      },
    });
    const healthy = makeProvider({
      name: 'healthy',
      search: async () => ({ items: [VALID_SEARCH_ITEM], hasNext: false }),
    });

    const [failing, working] = await Promise.all([
      new ProviderHost(throwing).search('q', 1),
      new ProviderHost(healthy).search('q', 1),
    ]);

    expect(failing.ok).toBe(false);
    if (!failing.ok) {
      expect(failing.kind).toBe('provider');
      expect(failing.providerName).toBe('throwing');
      expect(failing.message).toContain('boom');
      expect(failing.cause).toBeInstanceOf(Error);
    }

    expect(working.ok).toBe(true);
    if (working.ok) {
      expect(working.value?.items[0]?.name).toBe(VALID_SEARCH_ITEM.name);
    }
  });

  it('the host stays usable after a failure (sequential isolation)', async () => {
    let calls = 0;
    const flaky = makeProvider({
      search: async () => {
        calls += 1;
        if (calls === 1) throw new Error('first call fails');
        return { items: [VALID_SEARCH_ITEM], hasNext: false };
      },
    });
    const host = new ProviderHost(flaky);

    const first = await host.search('q', 1);
    expect(first.ok).toBe(false);

    const second = await host.search('q', 1);
    expect(second.ok).toBe(true);
  });

  it('catches synchronous throws from non-async providers', async () => {
    const syncThrower = makeProvider({
      load: () => {
        throw new Error('sync boom');
      },
    });
    const result = await new ProviderHost(syncThrower).load('https://example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('provider');
      expect(result.message).toContain('sync boom');
    }
  });

  it('method-level isolation: a failing method does not poison other methods', async () => {
    const movie: LoadResponse = {
      kind: 'movie',
      name: 'Big Buck Bunny',
      url: 'https://example.com/bbb',
      providerName: 'mixed',
      type: 'Movie',
      dataUrl: 'https://cdn/bbb.mp4',
    };
    const mixed = makeProvider({
      name: 'mixed',
      search: async () => {
        throw new Error('search is broken');
      },
      load: async () => movie,
    });
    const host = new ProviderHost(mixed);

    const searchResult = await host.search('q', 1);
    expect(searchResult.ok).toBe(false);

    const loadResult = await host.load('https://example.com/bbb');
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value?.kind).toBe('movie');
    }
  });
});

describe('behavior 2: configurable per-method timeouts', () => {
  it('applies the configured timeout per method while other methods complete', async () => {
    const provider = makeProvider({
      search: () => sleep(400).then(() => null), // exceeds searchMs → timeout
      load: () => sleep(80).then(() => null), // within loadMs → completes
    });
    const host = new ProviderHost(provider, { timeouts: { searchMs: 40, loadMs: 500 } });

    const searchStart = Date.now();
    const searchResult = await host.search('q', 1);
    const searchElapsed = Date.now() - searchStart;

    expect(searchResult.ok).toBe(false);
    if (!searchResult.ok) {
      expect(searchResult.kind).toBe('timeout');
      expect(searchResult.method).toBe('search');
    }
    // The host stopped waiting at the deadline (~40ms), not at the provider's
    // full sleep (400ms).
    expect(searchElapsed).toBeLessThan(300);

    const loadResult = await host.load('https://example.com/x');
    expect(loadResult.ok).toBe(true);
  });

  it('uses defaults when no overrides are given (all positive)', () => {
    new ProviderHost(makeProvider()); // constructor applies defaults without error
    // Direct pin of the default vocabulary (values are project-chosen, D13).
    for (const value of Object.values(DEFAULT_PROVIDER_TIMEOUTS)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe('behavior 3: timeouts signal cancellation via AbortSignal', () => {
  it('aborts the provider signal with a TimeoutError reason when the deadline elapses', async () => {
    let observedAborted = false;
    let observedReason: unknown;

    const provider = makeProvider({
      search: (query, page, ctx) =>
        new Promise<SearchPage | null>((resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            observedAborted = ctx.signal.aborted;
            observedReason = ctx.signal.reason;
            reject(new Error('provider unwinding due to abort'));
          });
          setTimeout(() => resolve(null), 500);
        }),
    });
    const host = new ProviderHost(provider, { timeouts: { searchMs: 40 } });

    const result = await host.search('q', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('timeout');
    // The cancellation signal REALLY fired at the provider boundary — this is
    // what distinguishes honest cancellation from racing a timer (D13).
    expect(observedAborted).toBe(true);
    expect(observedReason).toBeInstanceOf(TimeoutError);
    if (observedReason instanceof TimeoutError) {
      expect(observedReason.method).toBe('search');
      expect(observedReason.timeoutMs).toBe(40);
    }
    await settle(); // detached provider rejection must not become unhandled
  });

  it('a provider that honors the signal settles promptly; host reports timeout', async () => {
    const provider = makeProvider({
      search: (query, page, ctx) => abortableSleep(500, ctx.signal).then(() => null),
    });
    const host = new ProviderHost(provider, { timeouts: { searchMs: 40 } });

    const start = Date.now();
    const result = await host.search('q', 1);
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('timeout');
    expect(elapsed).toBeLessThan(300);
  });

  it('a provider that ignores the signal cannot fool the host: the deadline holds', async () => {
    const provider = makeProvider({
      // Never settles, never listens to the signal.
      search: () => new Promise<SearchPage | null>(() => {}),
    });
    const host = new ProviderHost(provider, { timeouts: { searchMs: 40 } });

    const result = await host.search('q', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Honest semantics: the host reports that ITS wait ended at the deadline
      // (with cancellation signaled); it does not claim the provider's promise
      // was cancelled.
      expect(result.kind).toBe('timeout');
      expect(result.message).toContain('cancellation was signaled');
    }
  });

  it('propagates caller-supplied cancellation to the provider signal (kind aborted)', async () => {
    const caller = new AbortController();
    let providerSawAbort = false;

    const provider = makeProvider({
      search: (query, page, ctx) =>
        new Promise<SearchPage | null>((resolve, reject) => {
          const timer = setTimeout(() => resolve(null), 500);
          ctx.signal.addEventListener(
            'abort',
            () => {
              providerSawAbort = true;
              clearTimeout(timer);
              reject(ctx.signal.reason);
            },
            { once: true },
          );
        }),
    });
    const host = new ProviderHost(provider, { timeouts: { searchMs: 500 } });

    const pending = host.search('q', 1, { signal: caller.signal });
    setTimeout(() => caller.abort(new Error('user navigated away')), 10);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('aborted');
      expect(result.cause).toBeInstanceOf(Error);
      expect((result.cause as Error).message).toBe('user navigated away');
    }
    expect(providerSawAbort).toBe(true);
    await settle();
  });

  it('fails fast when the caller signal is already aborted (provider never invoked)', async () => {
    const caller = new AbortController();
    caller.abort(new Error('gone before the call'));

    let invoked = false;
    const provider = makeProvider({
      search: () => {
        invoked = true;
        return sleep(1).then(() => null);
      },
    });

    const result = await new ProviderHost(provider).search('q', 1, { signal: caller.signal });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('aborted');
    expect(invoked).toBe(false);
  });
});

describe('behavior 6: invalid provider responses fail validation safely', () => {
  it('fails with kind=validation when a response object is invalid', async () => {
    const provider = makeProvider({
      // Simulated UNTRUSTED output: an item missing url/providerName/type.
      search: async () => ({ items: [{ name: 'no url' }], hasNext: true }) as unknown as SearchPage,
    });
    const result = await new ProviderHost(provider).search('q', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('validation');
      expect(result.issues?.length).toBeGreaterThan(0);
      expect(result.message).toContain('boundary validation');
    }
  });

  it('strips unknown keys but keeps valid data (forward compatibility)', async () => {
    const provider = makeProvider({
      search: async () => ({
        items: [{ ...VALID_SEARCH_ITEM, totallyUnknownField: 'junk' }],
        hasNext: false,
      }),
    });
    const result = await new ProviderHost(provider).search('q', 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const item = result.value?.items[0];
      expect(item?.name).toBe(VALID_SEARCH_ITEM.name);
      expect('totallyUnknownField' in (item ?? {})).toBe(false);
    }
  });

  it('passes through null results without validation', async () => {
    const provider = makeProvider({ load: async () => null });
    const result = await new ProviderHost(provider).load('https://example.com/x');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('rejects non-coercive type mismatches (no silent coercion)', async () => {
    const provider = makeProvider({
      // 42 is not a LoadResponse — must fail, not be "interpreted".
      load: async () => 42 as unknown as LoadResponse,
    });
    const result = await new ProviderHost(provider).load('https://example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
  });

  it('counts invalid emitted items without failing the whole loadLinks call', async () => {
    const provider = makeProvider({
      loadLinks: async (data, emit) => {
        emit({ name: 'malformed, no url' } as never); // invalid → dropped
        emit(makeLink({ url: 'https://cdn/ok.mp4', quality: 480 }));
        return true;
      },
    });
    const result = await new ProviderHost(provider).loadLinks('episode-data');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rejectedItems).toBe(1);
      expect(result.value.links).toHaveLength(1);
      expect(result.value.handled).toBe(true);
    }
  });

  it('can be disabled explicitly for trusted internal use (escape hatch)', async () => {
    const provider = makeProvider({ search: async () => ({ bogus: true }) as never });
    const result = await new ProviderHost(provider, { validate: false }).search('q', 1);
    expect(result.ok).toBe(true); // passthrough, unvalidated
  });
});

describe('behavior 7: callback-based emission handled consistently (host level)', () => {
  it('collects links and subtitles emitted across await points', async () => {
    const linkA = makeLink({ url: 'https://cdn/a.mp4', quality: 720 });
    const linkB = makeLink({ url: 'https://cdn/b.m3u8', quality: 1080, type: 'hls' });
    const subEn = makeSubtitle({ url: 'https://cdn/en.vtt', language: 'en' });
    const subDe = makeSubtitle({ url: 'https://cdn/de.vtt', language: 'de' });

    const provider = makeProvider({
      loadLinks: async (data, emit, ctx) => {
        emit(linkA);
        emit(subEn);
        await abortableSleep(10, ctx.signal); // emission across an await point
        emit(linkB);
        emit(subDe);
        await abortableSleep(10, ctx.signal);
        emit({ ...linkA }); // duplicate URL after more awaits
        return true;
      },
    });

    const result = await new ProviderHost(provider).loadLinks('episode-data');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.handled).toBe(true);
      // dedupe (first wins) + quality sort: 1080 before 720
      expect(result.value.links.map((l) => l.url)).toEqual([
        'https://cdn/b.m3u8',
        'https://cdn/a.mp4',
      ]);
      expect(result.value.subtitles).toEqual([subEn, subDe]);
      expect(result.value.rejectedItems).toBe(0);
    }
  });

  it('reports handled=false verbatim and still returns collected items', async () => {
    const provider = makeProvider({
      loadLinks: async (data, emit) => {
        emit(makeLink({ url: 'https://cdn/fallback.mp4', quality: 360 }));
        return false;
      },
    });
    const result = await new ProviderHost(provider).loadLinks('unknown-data');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.handled).toBe(false);
      expect(result.value.links).toHaveLength(1);
    }
  });

  it('drops emissions after the provider promise settles (no crash, no leak)', async () => {
    const provider = makeProvider({
      loadLinks: async (data, emit) => {
        emit(makeLink({ url: 'https://cdn/on-time.mp4' }));
        void (async () => {
          await sleep(50);
          emit(makeLink({ url: 'https://cdn/late.mp4' })); // after settle → dropped
        })();
        return true;
      },
    });

    const result = await new ProviderHost(provider).loadLinks('episode-data');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.links.map((l) => l.url)).toEqual(['https://cdn/on-time.mp4']);
    }
    await settle();
  });

  it('end-to-end: dedupe + quality sort with unknowns last through the host', async () => {
    const provider = makeProvider({
      loadLinks: async (data, emit) => {
        emit(makeLink({ url: 'https://cdn/u1.mp4', quality: null }));
        emit(makeLink({ url: 'https://cdn/720.mp4', quality: 720 }));
        emit(makeLink({ url: 'https://cdn/1080.mp4', quality: 1080 }));
        emit(makeLink({ url: 'https://cdn/u2.mp4', quality: null }));
        emit(makeLink({ url: 'https://cdn/720.mp4', quality: 999 })); // dup url → first wins
        return true;
      },
    });
    const result = await new ProviderHost(provider).loadLinks('episode-data');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.links.map((l) => [l.url, l.quality])).toEqual([
        ['https://cdn/1080.mp4', 1080],
        ['https://cdn/720.mp4', 720],
        ['https://cdn/u1.mp4', null],
        ['https://cdn/u2.mp4', null],
      ]);
    }
  });
});

describe('quickSearch capability', () => {
  it('reports kind=unsupported when the provider omits quickSearch', async () => {
    const host = new ProviderHost(makeProvider()); // no quickSearch override
    const result = await host.quickSearch('q');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unsupported');
      expect(result.method).toBe('quickSearch');
    }
  });

  it('validates implemented quickSearch results', async () => {
    const host = new ProviderHost(
      makeProvider({ quickSearch: async () => [VALID_SEARCH_ITEM] }),
    );
    const result = await host.quickSearch('big');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe(VALID_SEARCH_ITEM.name);
  });
});
