import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { Provider } from '../src/core';
import { TimeoutError } from '../src/core';
import type { ProviderCallEndEvent, ProviderCallEvent } from '../src/server/obs';
import {
  ProviderCallLogger,
  ProviderDisabledError,
  ProviderHealthTracker,
  ProviderKillSwitch,
  classifyProviderError,
  redactEventMessage,
  redactHeadersForLog,
  redactUrlForLog,
  toApiSnapshot,
  wrapProvider,
} from '../src/server/obs';

function fakeClock() {
  let now = 1_000;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function baseProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    name: 'prov',
    mainUrl: 'https://prov.example',
    lang: 'en',
    tvTypes: ['Movie'],
    getMainPage: async () => null,
    search: async () => null,
    load: async () => null,
    loadLinks: async () => true,
    ...overrides,
  };
}

function collectEvents() {
  const events: ProviderCallEvent[] = [];
  return { events, ends: () => events.filter((e): e is ProviderCallEndEvent => e.kind === 'provider-call-end') };
}

const testCtx = { signal: new AbortController().signal };

describe('redactUrlForLog', () => {
  it('keeps origin+path, drops userinfo and fragments', () => {
    const out = redactUrlForLog('https://user:pass@example.com/p/page?ok=1&x=2#frag');
    expect(out.startsWith('https://example.com/p/page?')).toBe(true);
    expect(out).not.toContain('user:pass');
    expect(out).not.toContain('frag');
    expect(out).toContain('ok=1');
    expect(out).toContain('x=2');
  });

  it('redacts sensitive query values by name (and name substrings)', () => {
    const out = redactUrlForLog('https://x.test/?access_token=TOKEN&session_id=S1&api_key=K&ok=2');
    expect(out).toContain('access_token=%5BREDACTED%5D');
    expect(out).toContain('session_id=%5BREDACTED%5D');
    expect(out).toContain('api_key=%5BREDACTED%5D');
    expect(out).toContain('ok=2');
    expect(out).not.toContain('TOKEN');
    expect(out).not.toContain('S1');
    expect(out).not.toContain('=K');
  });

  it('collapses non-absolute, non-http and broken URLs to a placeholder', () => {
    expect(redactUrlForLog('/relative/path?token=a')).toBe('[redacted-url]');
    expect(redactUrlForLog('ftp://files.test/x')).toBe('[redacted-url]');
    expect(redactUrlForLog('not a url')).toBe('[redacted-url]');
    expect(redactUrlForLog('')).toBe('[redacted-url]');
  });
});

describe('redactEventMessage and redactHeadersForLog', () => {
  it('re-redacts URLs inside free text and caps length', () => {
    const out = redactEventMessage('failed to fetch https://x.test/p?token=abc123 after retry');
    expect(out).not.toContain('abc123');
    expect(out).toContain('x.test/p');

    const long = redactEventMessage('y'.repeat(600));
    expect(long.length).toBeLessThanOrEqual(501);
    expect(long.endsWith('…')).toBe(true);
  });

  it('re-exports the engine header redactor', () => {
    const out = redactHeadersForLog({
      authorization: 'Bearer t',
      cookie: 'a=b',
      accept: 'application/json',
    });
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.cookie).toBe('[REDACTED]');
    expect(out.accept).toBe('application/json');
  });
});

describe('ProviderKillSwitch', () => {
  it('is permissive by default and supports per-provider disable with reason', () => {
    const ks = new ProviderKillSwitch();
    expect(ks.isEnabled('a')).toBe(true);
    ks.disable('a', 'legal takedown');
    expect(ks.isEnabled('a')).toBe(false);
    expect(ks.isEnabled('b')).toBe(true);
    expect(ks.reasonFor('a')).toBe('legal takedown');
    expect(ks.enable('a')).toBe(true);
    expect(ks.isEnabled('a')).toBe(true);
    expect(ks.reasonFor('a')).toBeUndefined();
  });

  it('supports the global switch and restores per-provider entries', () => {
    const ks = new ProviderKillSwitch();
    ks.disable('b', 'provider-specific');
    ks.disableAll('all off');
    expect(ks.isGloballyDisabled()).toBe(true);
    expect(ks.isEnabled('a')).toBe(false);
    expect(ks.isEnabled('b')).toBe(false);
    ks.enableAll();
    expect(ks.isEnabled('a')).toBe(true);
    expect(ks.isEnabled('b')).toBe(false); // per-provider entry survived
  });

  it('snapshots deterministically', () => {
    const ks = new ProviderKillSwitch();
    ks.disable('zeta');
    ks.disable('alpha', 'r');
    const snap = ks.snapshot();
    expect(snap.globallyDisabled).toBe(false);
    expect(snap.disabled.map((e) => e.providerName)).toEqual(['alpha', 'zeta']);
    expect(snap.disabled[1]?.reason).toBeUndefined();
  });
});

describe('wrapProvider + ProviderCallLogger', () => {
  it('emits start/end with measured durations and passes args through', async () => {
    const clock = fakeClock();
    const { events, ends } = collectEvents();
    const logger = new ProviderCallLogger({ sink: (e) => events.push(e), clock: clock.now });
    const seen: unknown[] = [];
    const provider = baseProvider({
      getMainPage: async () => {
        clock.advance(42);
        return null;
      },
      search: async (query: string, page: number) => {
        seen.push(query, page);
        return null;
      },
    });
    const wrapped = wrapProvider(provider, { logger, clock: clock.now });

    await wrapped.getMainPage(1, { name: 'Trending', data: '/trending' }, testCtx);
    await wrapped.search('needle', 2, testCtx);

    expect(seen).toEqual(['needle', 2]);
    const mainPageEnd = ends().find((e) => e.method === 'getMainPage');
    expect(mainPageEnd).toMatchObject({ outcome: 'success', durationMs: 42 });
    expect(events.filter((e) => e.kind === 'provider-call-start')).toHaveLength(2);
  });

  it('classifies failures, rethrows the original error, and redacts the message', async () => {
    const clock = fakeClock();
    const { events, ends } = collectEvents();
    const logger = new ProviderCallLogger({ sink: (e) => events.push(e), clock: clock.now });
    const provider = baseProvider({
      search: async () => {
        throw new Error('boom at https://api.prov.example/v1?token=SECRET');
      },
    });
    const wrapped = wrapProvider(provider, { logger, clock: clock.now });

    await expect(wrapped.search('q', 1, testCtx)).rejects.toThrow(/boom at/);
    const end = ends()[0];
    expect(end).toMatchObject({ outcome: 'failure', failureKind: 'provider' });
    expect(end?.errorMessage).toContain('https://api.prov.example/v1?token=%5BREDACTED%5D');
    expect(end?.errorMessage).not.toContain('SECRET');
  });

  it('classifies timeout errors thrown by the host contract', async () => {
    const { events, ends } = collectEvents();
    const logger = new ProviderCallLogger({ sink: (e) => events.push(e) });
    const provider = baseProvider({
      load: async () => {
        throw new TimeoutError('load', 1234);
      },
    });
    const wrapped = wrapProvider(provider, { logger });
    await expect(wrapped.load('x', testCtx)).rejects.toThrow(TimeoutError);
    expect(ends()[0]).toMatchObject({ outcome: 'failure', failureKind: 'timeout' });
  });

  it('refuses disabled providers with a typed error and never invokes them', async () => {
    const { events, ends } = collectEvents();
    const logger = new ProviderCallLogger({ sink: (e) => events.push(e) });
    const ks = new ProviderKillSwitch();
    let invoked = 0;
    const provider = baseProvider({
      load: async () => {
        invoked += 1;
        return null;
      },
    });
    const wrapped = wrapProvider(provider, { logger, killSwitch: ks });

    ks.disable('prov', 'takedown request');
    await expect(wrapped.load('data', testCtx)).rejects.toBeInstanceOf(ProviderDisabledError);
    expect(invoked).toBe(0);
    expect(ends()[0]).toMatchObject({ outcome: 'skipped', failureKind: 'killed' });
    expect(ends()[0]?.errorMessage).toContain('takedown request');

    ks.enable('prov');
    await wrapped.load('data', testCtx);
    expect(invoked).toBe(1);
  });

  it('keeps optional methods optional and preserves provider metadata', () => {
    const logger = new ProviderCallLogger({ sink: () => {} });
    const withoutQuick = wrapProvider(baseProvider(), { logger });
    expect('quickSearch' in withoutQuick).toBe(false);
    expect(withoutQuick.name).toBe('prov');
    expect(withoutQuick.mainUrl).toBe('https://prov.example');

    const withQuick = wrapProvider(
      baseProvider({ quickSearch: async () => [] }),
      { logger },
    );
    expect(typeof withQuick.quickSearch).toBe('function');
  });

  it('forwards engine events untouched', () => {
    const { events } = collectEvents();
    const logger = new ProviderCallLogger({ sink: (e) => events.push(e) });
    logger.engineEventSink()({ kind: 'request', provider: 'prov', origin: 'https://x.test', path: '/a' });
    const forwarded = events.find((e) => e.kind === 'engine');
    expect(forwarded).toMatchObject({
      kind: 'engine',
      event: { kind: 'request', origin: 'https://x.test', path: '/a' },
    });
  });
});

describe('classifyProviderError', () => {
  it('maps error shapes to failure kinds', () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const schemaResult = z.string().safeParse(1);
    const zodError = schemaResult.success ? null : schemaResult.error;

    expect(classifyProviderError(new TimeoutError('load', 1))).toBe('timeout');
    expect(classifyProviderError(abortError)).toBe('aborted');
    expect(classifyProviderError(zodError)).toBe('validation');
    expect(classifyProviderError(new ProviderDisabledError('p'))).toBe('killed');
    expect(classifyProviderError(new Error('mystery'))).toBe('provider');
    expect(classifyProviderError('raw string')).toBe('provider');
  });
});

describe('ProviderHealthTracker', () => {
  it('walks the idle → ok → degraded → down → ok state machine', () => {
    const tracker = new ProviderHealthTracker();
    tracker.recordSkipped('p');
    expect(tracker.snapshot().providers[0]).toMatchObject({ name: 'p', status: 'idle', skippedCalls: 1, totalCalls: 0 });

    tracker.recordSuccess('p', 100, 1_000);
    expect(tracker.snapshot().providers[0]).toMatchObject({ status: 'ok', totalSuccesses: 1 });

    tracker.recordFailure('p', 'provider', 200, 2_000);
    expect(tracker.snapshot().providers[0]).toMatchObject({ status: 'degraded', consecutiveFailures: 1, lastFailureKind: 'provider' });

    tracker.recordFailure('p', 'timeout', 300, 3_000);
    tracker.recordFailure('p', 'networkError' as never, 400, 4_000);
    expect(tracker.snapshot().providers[0]).toMatchObject({
      status: 'down',
      consecutiveFailures: 3,
      totalFailures: 3,
      lastFailureAt: 4_000,
    });

    tracker.recordSuccess('p', 50, 5_000);
    expect(tracker.snapshot().providers[0]).toMatchObject({ status: 'ok', consecutiveFailures: 0 });
  });

  it('reports disabled providers via the kill switch and computes averages', () => {
    const ks = new ProviderKillSwitch();
    const tracker = new ProviderHealthTracker();
    tracker.recordSuccess('p', 100, 1);
    tracker.recordFailure('p', 'provider', 300, 2);

    const snapshot = tracker.snapshot(ks, 10);
    expect(snapshot.providers[0]).toMatchObject({ enabled: true, averageDurationMs: 200, lastDurationMs: 300 });

    ks.disable('p');
    expect(tracker.snapshot(ks, 10).providers[0]).toMatchObject({ enabled: false, status: 'disabled' });
  });

  it('snapshots deterministically and validates its own API contract', () => {
    const tracker = new ProviderHealthTracker();
    tracker.recordSuccess('zeta', 10, 1);
    tracker.recordSuccess('alpha', 20, 1);

    const snapshot = tracker.snapshot(undefined, 50);
    expect(snapshot.providers.map((p) => p.name)).toEqual(['alpha', 'zeta']);
    expect(snapshot.generatedAt).toBe(50);

    const api = toApiSnapshot(snapshot, true); // drift between record + schema fails here
    expect(api.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(api.providers[0]?.lastSuccessAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(api.providers[0]?.status).toBe('ok');
  });
});
