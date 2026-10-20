/**
 * Integration tests for the HTTP engine (roadmap Phase 2 tasks 1–2).
 *
 * All real requests target a LOCAL node:http server on 127.0.0.1 (explicitly
 * approved as an engine destination) — the guard, DNS pinning, redirects,
 * cookies, caching, and cancellation pipelines run for real WITHOUT touching
 * the network. DNS is injected (mocked resolvers) for hostname-based tests,
 * including DNS-rebinding simulations — no real private or metadata service
 * is ever contacted.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CookieJar,
  GuardedDnsResolver,
  HttpEngine,
  redactHeadersForLog,
  type ApprovedDestination,
  type HttpEngineConfig,
} from '../src/server/http';
import { LOOPBACK_APPROVAL, startTestServer, type TestServer } from './http-helpers';
import { sleep } from './helpers';

const servers: TestServer[] = [];

async function makeServer(routes: Parameters<typeof startTestServer>[0]): Promise<TestServer> {
  const server = await startTestServer(routes);
  servers.push(server);
  return server;
}

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

let server!: TestServer;

beforeEach(async () => {
  server = await makeServer({
    '/ok': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello-ok');
    },
    '/echo': (req, res, _url, body) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          method: req.method,
          headers: req.headers,
          body: body.toString('utf8'),
        }),
      );
    },
    '/slow': (_req, res) => {
      const timer = setTimeout(() => {
        res.writeHead(200);
        res.end('finally');
      }, 500);
      res.on('close', () => clearTimeout(timer));
    },
    '/count': (_req, res) => {
      const hits = server.hits.get('/count') ?? 0;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ hits }));
    },
    '/big': (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.alloc(1024 * 1024, 7)); // 1 MiB
    },
    '/set-cookie': (_req, res) => {
      res.writeHead(200, { 'set-cookie': ['sid=abc123; Path=/'] });
      res.end('cookie set');
    },
    '/loop': (_req, res) => {
      res.writeHead(302, { location: '/loop' });
      res.end();
    },
    '/r1': (_req, res) => {
      res.writeHead(302, { location: '/r2' });
      res.end();
    },
    '/r2': (_req, res) => {
      res.writeHead(302, { location: '/ok' });
      res.end();
    },
    '/p307': (_req, res) => {
      res.writeHead(307, { location: '/echo' });
      res.end();
    },
    '/p303': (_req, res) => {
      res.writeHead(303, { location: '/echo' });
      res.end();
    },
    '/r-external-blocked': (_req, res) => {
      // Redirect to a prohibited IP literal (cloud metadata) — must be
      // blocked BEFORE any connection attempt.
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    },
    '/r-private-ip': (_req, res) => {
      res.writeHead(302, { location: 'http://10.0.0.5/x' });
      res.end();
    },
    '/r-ftp': (_req, res) => {
      res.writeHead(302, { location: 'ftp://127.0.0.1/x' });
      res.end();
    },
    '/r-bad-location': (_req, res) => {
      res.writeHead(302, { location: 'http://[::1' });
      res.end();
    },
    '/no-store': (_req, res) => {
      res.writeHead(200, { 'cache-control': 'no-store' });
      res.end('fresh');
    },
    '/with-max-age': (_req, res) => {
      res.writeHead(200, { 'cache-control': 'max-age=3600' });
      res.end('maxaged');
    },
    '/robots.txt': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /private\n');
    },
    '/private': (_req, res) => {
      res.writeHead(200);
      res.end('private-content');
    },
    '/public': (_req, res) => {
      res.writeHead(200);
      res.end('public-content');
    },
  });
});

function makeEngine(extra: Partial<HttpEngineConfig> = {}): HttpEngine {
  return new HttpEngine({ approvedDestinations: LOOPBACK_APPROVAL, ...extra });
}

/* -------------------------------------------------------------------------- */
/* Basics                                                                      */
/* -------------------------------------------------------------------------- */

describe('HttpEngine basics', () => {
  it('performs a GET and exposes status/headers/body helpers', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/ok'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.status).toBe(200);
    expect(result.response.headers['content-type']).toBe('text/plain');
    expect(result.response.text()).toBe('hello-ok');
    expect(result.response.url).toBe(server.url('/ok'));
    expect(result.response.redirected).toBe(false);
    await engine.close();
  });

  it('rejects unsupported methods and non-GET/HEAD/POST/PUT/DELETE', async () => {
    const engine = makeEngine();
    const bad = await engine.fetch(server.url('/ok'), { method: 'TRACE' as never });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.failure.kind).toBe('unsupportedMethod');
    await engine.close();
  });

  it('returns typed failures for malformed URLs without throwing', async () => {
    const engine = makeEngine();
    for (const url of ['', 'http://', 'not a url', 'ftp://x/', 'http://user:pass@127.0.0.1/x']) {
      const result = await engine.fetch(url);
      expect(result.ok, url).toBe(false);
      if (!result.ok) {
        expect(['invalidUrl', 'blockedDestination']).toContain(result.failure.kind);
      }
    }
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Blocked destinations (no approvals → no network at all)                     */
/* -------------------------------------------------------------------------- */

describe('SSRF guard enforcement', () => {
  it('blocks private, loopback, link-local and metadata destinations by default', async () => {
    const engine = new HttpEngine(); // NO approvals
    for (const url of [
      'http://127.0.0.1:1/x',
      'http://10.0.0.1/x',
      'http://172.16.0.1/x',
      'http://192.168.1.1/x',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/x',
      'http://[fd00:ec2::254]/x',
      'http://localhost/x',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://2130706433/x',
    ]) {
      const result = await engine.fetch(url);
      expect(result.ok, url).toBe(false);
      if (!result.ok) expect(result.failure.kind).toBe('blockedDestination');
    }
    await engine.close();
  });

  it('allows the explicitly approved loopback server (operator config path)', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/ok'));
    expect(result.ok).toBe(true);
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Timeout & cancellation                                                      */
/* -------------------------------------------------------------------------- */

describe('timeout and cancellation', () => {
  it('fails with kind timeout when the total deadline elapses', async () => {
    const engine = makeEngine();
    const started = Date.now();
    const result = await engine.fetch(server.url('/slow'), { timeoutMs: 120 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(450);
    await engine.close();
  });

  it('cancellation via the caller signal aborts the in-flight request', async () => {
    const engine = makeEngine();
    const controller = new AbortController();
    const pending = engine.fetch(server.url('/slow'), { signal: controller.signal, timeoutMs: 5_000 });
    await sleep(30);
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('aborted');
    await engine.close();
  });

  it('a pre-aborted signal never dispatches the request', async () => {
    const engine = makeEngine();
    const controller = new AbortController();
    controller.abort();
    const result = await engine.fetch(server.url('/ok'), { signal: controller.signal });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('aborted');
    expect(server.hits.get('/ok') ?? 0).toBe(0);
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Redirects                                                                   */
/* -------------------------------------------------------------------------- */

describe('redirect handling', () => {
  it('follows validated redirects and reports the chain + final URL', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/r1'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.status).toBe(200);
    expect(result.response.url).toBe(server.url('/ok'));
    expect(result.response.redirected).toBe(true);
    expect(result.response.redirectChain).toEqual([server.url('/r2'), server.url('/ok')]);
    await engine.close();
  });

  it('enforces the redirect limit (loop detection)', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/loop'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('tooManyRedirects');
    expect(server.hits.get('/loop')).toBe(6); // initial + 5 followed redirects
    await engine.close();
  });

  it('honors per-request maxRedirects', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/r1'), { maxRedirects: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('tooManyRedirects');
    await engine.close();
  });

  it('BLOCKS a redirect to a prohibited destination (metadata IP)', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/r-external-blocked'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('blockedDestination');
    await engine.close();
  });

  it('BLOCKS a redirect whose hostname resolves to a private address (mocked DNS)', async () => {
    const engine = makeEngine({
      dns: new GuardedDnsResolver({
        resolve4Fn: async (host) => (host === 'rebind2.test' ? ['10.0.0.9'] : []),
        resolve6Fn: async () => {
          throw new Error('no AAAA');
        },
      }),
    });
    server.routes['/r-host'] = (_req, res) => {
      res.writeHead(302, { location: 'http://rebind2.test/x' });
      res.end();
    };
    const result = await engine.fetch(server.url('/r-host'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('blockedDestination');
    await engine.close();
  });

  it('rejects redirects with non-http(s) schemes or unparseable targets', async () => {
    const engine = makeEngine();
    const ftp = await engine.fetch(server.url('/r-ftp'));
    expect(ftp.ok).toBe(false);
    if (!ftp.ok) expect(ftp.failure.kind).toBe('invalidRedirect');

    const bad = await engine.fetch(server.url('/r-bad-location'));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.failure.kind).toBe('invalidRedirect');
    await engine.close();
  });

  it('307 preserves method+body; 303 switches POST to GET', async () => {
    const engine = makeEngine();
    const r307 = await engine.fetch(server.url('/p307'), {
      method: 'POST',
      body: 'payload=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r307.ok).toBe(true);
    if (r307.ok) {
      const echo = r307.response.json() as { method: string; body: string };
      expect(echo.method).toBe('POST');
      expect(echo.body).toBe('payload=1');
    }

    const r303 = await engine.fetch(server.url('/p303'), {
      method: 'POST',
      body: 'payload=1',
    });
    expect(r303.ok).toBe(true);
    if (r303.ok) {
      const echo = r303.response.json() as { method: string; body: string };
      expect(echo.method).toBe('GET');
      expect(echo.body).toBe('');
    }
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Response size caps                                                          */
/* -------------------------------------------------------------------------- */

describe('response size cap', () => {
  it('aborts and reports responseTooLarge beyond maxBytes', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/big'), { maxBytes: 64 * 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('responseTooLarge');
    await engine.close();
  });

  it('reads responses within the cap fully', async () => {
    const engine = makeEngine();
    const result = await engine.fetch(server.url('/big'), { maxBytes: 2 * 1024 * 1024 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.body.byteLength).toBe(1024 * 1024);
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* TTL caching (bounded)                                                       */
/* -------------------------------------------------------------------------- */

describe('response caching', () => {
  it('caches GET 2xx within the TTL and reports fromCache', async () => {
    const engine = makeEngine({ cacheTtlMs: 5_000 });
    const first = await engine.fetch(server.url('/count'));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.response.fromCache).toBe(false);
    expect((first.response.json() as { hits: number }).hits).toBe(1);

    const second = await engine.fetch(server.url('/count'));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.response.fromCache).toBe(true);
    expect((second.response.json() as { hits: number }).hits).toBe(1); // server NOT hit again
    await engine.close();
  });

  it('expires entries after the TTL and refetches', async () => {
    const engine = makeEngine({ cacheTtlMs: 60 });
    await engine.fetch(server.url('/count'));
    await sleep(80);
    const again = await engine.fetch(server.url('/count'));
    if (again.ok) expect((again.response.json() as { hits: number }).hits).toBe(2);
    await engine.close();
  });

  it('does not cache POST requests, no-store responses, or set-cookie responses', async () => {
    const engine = makeEngine({ cacheTtlMs: 5_000 });
    await engine.fetch(server.url('/echo'), { method: 'POST', body: 'x' });
    const postAgain = await engine.fetch(server.url('/echo'), { method: 'POST', body: 'x' });
    if (postAgain.ok) expect(postAgain.response.fromCache).toBe(false);

    await engine.fetch(server.url('/no-store'));
    const noStoreAgain = await engine.fetch(server.url('/no-store'));
    if (noStoreAgain.ok) {
      expect(noStoreAgain.response.fromCache).toBe(false);
      expect((server.hits.get('/no-store') ?? 0)).toBe(2);
    }

    const withCookie = await makeServer({
      '/cookie-then-count': (_req, res) => {
        res.writeHead(200, { 'set-cookie': ['a=1'] });
        res.end('body');
      },
    });
    await engine.fetch(withCookie.url('/cookie-then-count'));
    const again = await engine.fetch(withCookie.url('/cookie-then-count'));
    if (again.ok) expect(again.response.fromCache).toBe(false);
    await engine.close();
  });

  it('honors Cache-Control max-age below the configured TTL and cache: no-store opt-out', async () => {
    const engine = makeEngine({ cacheTtlMs: 5_000 });
    await engine.fetch(server.url('/with-max-age'));
    const cached = await engine.fetch(server.url('/with-max-age'));
    if (cached.ok) expect(cached.response.fromCache).toBe(true);

    await engine.fetch(server.url('/count'), { cache: 'no-store' });
    const hitsBefore = server.hits.get('/count') ?? 0;
    await engine.fetch(server.url('/count'), { cache: 'no-store' });
    expect(server.hits.get('/count')).toBe(hitsBefore + 1);
    await engine.close();
  });

  it('is bounded: evicts beyond cacheMaxEntries', async () => {
    const engine = makeEngine({ cacheTtlMs: 60_000, cacheMaxEntries: 1 });
    await engine.fetch(server.url('/ok'));
    const other = await makeServer({ '/solo': (_req, res) => { res.writeHead(200); res.end('x'); } });
    await engine.fetch(other.url('/solo'));
    const okAgain = await engine.fetch(server.url('/ok'));
    if (okAgain.ok) expect(okAgain.response.fromCache).toBe(false); // evicted
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Cookies & per-provider isolation                                            */
/* -------------------------------------------------------------------------- */

describe('cookie handling and provider isolation', () => {
  it('stores cookies in the jar and sends them on subsequent requests', async () => {
    const engine = makeEngine({ cookieJar: new CookieJar() });
    await engine.fetch(server.url('/set-cookie'));
    const echo = await engine.fetch(server.url('/echo'));
    expect(echo.ok).toBe(true);
    if (echo.ok) {
      const headers = (echo.response.json() as { headers: Record<string, string> }).headers;
      expect(headers['cookie']).toBe('sid=abc123');
    }
    await engine.close();
  });

  it('an engine WITHOUT a jar sends no cookies (provider isolation by construction)', async () => {
    const withJar = makeEngine({ cookieJar: new CookieJar() });
    await withJar.fetch(server.url('/set-cookie'));

    const withoutJar = makeEngine(); // another "provider"
    const echo = await withoutJar.fetch(server.url('/echo'));
    if (echo.ok) {
      const headers = (echo.response.json() as { headers: Record<string, string> }).headers;
      expect(headers['cookie']).toBeUndefined();
    }

    // A second jar-holding engine does not see the first one's cookies either.
    const secondJar = makeEngine({ cookieJar: new CookieJar() });
    const echo2 = await secondJar.fetch(server.url('/echo'));
    if (echo2.ok) {
      const headers = (echo2.response.json() as { headers: Record<string, string> }).headers;
      expect(headers['cookie']).toBeUndefined();
    }
    await Promise.all([withJar.close(), withoutJar.close(), secondJar.close()]);
  });

  it('cross-HOST redirects drop authorization and jar cookies; same-host keeps them', async () => {
    // NOTE: cookies are host-scoped, NOT port-scoped (RFC 6265), so a true
    // cross-origin cookie test needs distinct HOSTNAMES — both resolving (via
    // injected DNS) to the loopback test servers.
    const other = await makeServer({
      '/echo': (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ headers: req.headers }));
      },
    });
    const approvals = [...LOOPBACK_APPROVAL, { host: 'a.test' }, { host: 'b.test' }];
    const resolver = new GuardedDnsResolver({
      approvedDestinations: approvals,
      resolve4Fn: async () => ['127.0.0.1'],
      resolve6Fn: async () => {
        throw new Error('no AAAA in test');
      },
    });
    const engine = makeEngine({ cookieJar: new CookieJar(), dns: resolver, approvedDestinations: approvals, cacheTtlMs: 0 });
    await engine.fetch(`http://a.test:${server.port}/set-cookie`);

    // Cross-host: a.test → b.test.
    server.routes['/cross'] = (_req, res) => {
      res.writeHead(302, { location: `http://b.test:${other.port}/echo` });
      res.end();
    };
    const cross = await engine.fetch(`http://a.test:${server.port}/cross`, {
      headers: { authorization: 'Bearer provider-secret' },
    });
    expect(cross.ok).toBe(true);
    if (cross.ok) {
      const headers = (cross.response.json() as { headers: Record<string, string> }).headers;
      expect(headers['cookie']).toBeUndefined(); // a.test's cookie must not go to b.test
      expect(headers['authorization']).toBeUndefined();
    }

    // Same-host redirect keeps credentials (a.test → a.test).
    server.routes['/same'] = (_req, res) => {
      res.writeHead(302, { location: '/echo' });
      res.end();
    };
    const same = await engine.fetch(`http://a.test:${server.port}/same`, {
      headers: { authorization: 'Bearer provider-secret' },
    });
    expect(same.ok).toBe(true);
    if (same.ok) {
      const headers = (same.response.json() as { headers: Record<string, string> }).headers;
      expect(headers['authorization']).toBe('Bearer provider-secret');
      expect(headers['cookie']).toBe('sid=abc123');
    }
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Header profiles & normalization                                             */
/* -------------------------------------------------------------------------- */

describe('header normalization and profiles', () => {
  it('strips forbidden headers from caller input and applies the profile UA', async () => {
    const engine = makeEngine({
      defaultHeaders: { 'user-agent': 'provider-A-ua', 'x-profile': 'A' },
    });
    const result = await engine.fetch(server.url('/echo'), {
      headers: {
        Connection: 'keep-alive',
        Cookie: 'forged=1',
        Host: 'evil.example',
        'Content-Length': '999',
        'X-Api-Key': 'k',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sent = (result.response.json() as { headers: Record<string, string> }).headers;
      // The stack may add its own connection: keep-alive; what matters is that
      // the CALLER's forged headers never made it through.
      expect(sent['cookie']).toBeUndefined();
      expect(sent['host']).toMatch(/^127\.0\.0\.1(:\d+)?$/); // set by the HTTP stack, not the caller
      expect(sent['content-length']).toBeUndefined();
      expect(sent['x-api-key']).toBe('k');
      expect(sent['user-agent']).toBe('provider-A-ua');
      expect(sent['x-profile']).toBe('A');
    }
    await engine.close();
  });

  it('two engines keep their header profiles isolated', async () => {
    const a = makeEngine({ defaultHeaders: { 'x-profile': 'A' } });
    const b = makeEngine({ defaultHeaders: { 'x-profile': 'B' } });
    const ra = await a.fetch(server.url('/echo'));
    const rb = await b.fetch(server.url('/echo'));
    if (ra.ok) expect((ra.response.json() as { headers: Record<string, string> }).headers['x-profile']).toBe('A');
    if (rb.ok) expect((rb.response.json() as { headers: Record<string, string> }).headers['x-profile']).toBe('B');
    await Promise.all([a.close(), b.close()]);
  });

  it('events never contain query strings (credential-leak guard)', async () => {
    const events: unknown[] = [];
    const engine = makeEngine({ onRequestEvent: (e) => events.push(e) });
    await engine.fetch(server.url('/echo?api_key=super-secret&token=x'));
    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain('super-secret');
      expect(JSON.stringify(event)).not.toContain('api_key');
    }
    await engine.close();
  });

  it('redactHeadersForLog hides credential values', () => {
    const redacted = redactHeadersForLog({
      authorization: 'Bearer x',
      cookie: 'sid=1',
      'x-safe': 'visible',
    });
    expect(redacted['authorization']).toBe('[REDACTED]');
    expect(redacted['cookie']).toBe('[REDACTED]');
    expect(redacted['x-safe']).toBe('visible');
  });
});

/* -------------------------------------------------------------------------- */
/* DNS pinning & rebinding (mocked DNS — no real resolution)                    */
/* -------------------------------------------------------------------------- */

describe('DNS validation, pinning and rebinding defense', () => {
  function dnsFor(
    sequence: string[][],
    approved: readonly ApprovedDestination[] = [],
  ): { resolver: GuardedDnsResolver; calls: () => number } {
    let call = 0;
    const resolver = new GuardedDnsResolver({
      ttlMs: 20,
      approvedDestinations: approved,
      resolve4Fn: async () => {
        const answer = sequence[Math.min(call, sequence.length - 1)] ?? ['127.0.0.1'];
        call += 1;
        return answer;
      },
      resolve6Fn: async () => {
        throw new Error('no AAAA in test');
      },
    });
    return { resolver, calls: () => call };
  }

  it('pins the connection to the validated address end-to-end', async () => {
    const approvals = [...LOOPBACK_APPROVAL, { host: 'pin.test' }];
    const { resolver, calls } = dnsFor([['127.0.0.1']], approvals);
    const engine = makeEngine({ dns: resolver, approvedDestinations: approvals, cacheTtlMs: 0 });
    // 'pin.test' has no real DNS — success proves the guarded lookup served
    // the validated 127.0.0.1 and the connection used it.
    const result = await engine.fetch(`http://pin.test:${server.port}/ok`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.text()).toBe('hello-ok');
    expect(calls()).toBe(1);
    await engine.close();
  });

  it('reuses the validated set within the TTL, then repins to the NEW address after it', async () => {
    // Sequence: first resolution → 127.0.0.1 (the test server); after the TTL
    // the "DNS" answer CHANGES to 127.0.0.2 (a different loopback address with
    // nothing listening). The host is explicitly approved, so both addresses
    // pass validation — but the connection must follow the NEW answer: the
    // third request fails to connect (networkError) and the server on .1 is
    // NOT hit again. No real network is touched (both targets are loopback).
    let call = 0;
    const approvals = [...LOOPBACK_APPROVAL, { host: 'rebind.test' }];
    const resolver = new GuardedDnsResolver({
      ttlMs: 20,
      approvedDestinations: approvals,
      /* DNS TTL 20ms below; response caching disabled so every fetch dispatches */
      resolve4Fn: async () => {
        call += 1;
        return call === 1 ? ['127.0.0.1'] : ['127.0.0.2'];
      },
      resolve6Fn: async () => {
        throw new Error('no AAAA in test');
      },
    });
    const engine = makeEngine({ dns: resolver, approvedDestinations: approvals, cacheTtlMs: 0 });

    const first = await engine.fetch(`http://rebind.test:${server.port}/ok`);
    expect(first.ok).toBe(true);
    const hitsAfterFirst = server.hits.get('/ok') ?? 0;

    // Second fetch within TTL: resolver NOT called again, still pinned to .1.
    const second = await engine.fetch(`http://rebind.test:${server.port}/ok`);
    expect(second.ok).toBe(true);
    expect(call).toBe(1);
    expect(server.hits.get('/ok')).toBe(hitsAfterFirst + 1);

    // After the TTL: the answer changed → repinned to 127.0.0.2 → connect refused.
    // NOTE: a NEW connection is needed — the pooled keep-alive socket for the
    // original origin was established to the validated 127.0.0.1 and stays
    // valid (pooling never re-resolves). A second loopback server on a
    // different port forces a fresh origin → fresh connect → 127.0.0.2.
    await sleep(30);
    const other = await makeServer({ '/ok': (_req, res) => { res.writeHead(200); res.end('x'); } });
    // respectRobots:false — the robots gate's inner fetch would otherwise hit
    // the repinned (dead) address first and fail closed as robotsDisallowed,
    // which is correct gate behavior but not what this test asserts.
    const third = await engine.fetch(`http://rebind.test:${other.port}/ok`, { respectRobots: false });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.failure.kind).toBe('networkError');
    expect(call).toBe(2);
    expect(server.hits.get('/ok')).toBe(hitsAfterFirst + 1); // never reached .1 again
    await engine.close();
  });

  it('a NON-approved hostname resolving to a private address is blocked before any connection', async () => {
    const resolver = new GuardedDnsResolver({
      resolve4Fn: async () => ['10.9.9.9'],
      resolve6Fn: async () => {
        throw new Error('no AAAA in test');
      },
    });
    const engine = makeEngine({ dns: resolver }); // 'private.test' NOT approved
    const result = await engine.fetch('http://private.test/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('blockedDestination');
    await engine.close();
  });

  it('fails closed on DNS errors and empty answers', async () => {
    const failing = new GuardedDnsResolver({
      resolve4Fn: async () => {
        throw new Error('SERVFAIL');
      },
      resolve6Fn: async () => {
        throw new Error('SERVFAIL');
      },
    });
    const engine = makeEngine({
      dns: failing,
      approvedDestinations: [...LOOPBACK_APPROVAL, { host: 'dead.test' }],
    });
    const result = await engine.fetch('http://dead.test/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('dnsFailure');
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* robots.txt gate                                                             */
/* -------------------------------------------------------------------------- */

describe('robots.txt gate', () => {
  it('disallows gated paths for GET and allows the rest', async () => {
    const engine = makeEngine({ respectRobots: true });
    const denied = await engine.fetch(server.url('/private'));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.failure.kind).toBe('robotsDisallowed');

    const allowed = await engine.fetch(server.url('/public'));
    expect(allowed.ok).toBe(true);
    await engine.close();
  });

  it('can be disabled per request; POST is exempt (robots governs crawling)', async () => {
    const engine = makeEngine({ respectRobots: true });
    const override = await engine.fetch(server.url('/private'), { respectRobots: false });
    expect(override.ok).toBe(true);

    const post = await engine.fetch(server.url('/private'), { method: 'POST', body: 'x' });
    expect(post.ok).toBe(true);
    await engine.close();
  });

  it('fails closed when robots.txt answers 5xx (short retry window)', async () => {
    const robots500 = await makeServer({
      '/robots.txt': (_req, res) => {
        res.writeHead(500);
        res.end();
      },
      '/anything': (_req, res) => {
        res.writeHead(200);
        res.end('x');
      },
    });
    const engine = makeEngine({ respectRobots: true });
    const result = await engine.fetch(robots500.url('/anything'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('robotsDisallowed');
    await engine.close();
  });

  it('treats missing robots.txt (404) as allow-all', async () => {
    const bare = await makeServer({
      '/content': (_req, res) => {
        res.writeHead(200);
        res.end('x');
      },
    });
    const engine = makeEngine({ respectRobots: true });
    const result = await engine.fetch(bare.url('/content'));
    expect(result.ok).toBe(true);
    await engine.close();
  });

  it('caches robots decisions (one robots fetch for several requests)', async () => {
    const engine = makeEngine({ respectRobots: true });
    await engine.fetch(server.url('/public'));
    await engine.fetch(server.url('/public'));
    await engine.fetch(server.url('/public'));
    expect(server.hits.get('/robots.txt')).toBe(1);
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Events & redaction                                                          */
/* -------------------------------------------------------------------------- */

describe('engine events', () => {
  it('emits request/redirect/blocked events with origin+path only', async () => {
    const events: Array<Record<string, unknown>> = [];
    const engine = makeEngine({ onRequestEvent: (e) => events.push(e as Record<string, unknown>) });
    await engine.fetch(server.url('/r1?q=secret'));
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('request');
    expect(kinds).toContain('redirect');
    const blocked = await engine.fetch('http://10.1.2.3/x');
    expect(blocked.ok).toBe(false);
    expect(events.some((e) => e.kind === 'blocked')).toBe(true);
    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain('secret');
      expect(event).not.toHaveProperty('url');
    }
    await engine.close();
  });
});

/* -------------------------------------------------------------------------- */
/* Concurrency sanity                                                          */
/* -------------------------------------------------------------------------- */

describe('concurrency', () => {
  it('handles parallel requests through one engine without cross-talk', async () => {
    const engine = makeEngine({ cookieJar: new CookieJar() });
    const results = await Promise.all([
      engine.fetch(server.url('/echo'), { headers: { 'x-tag': 'one' } }),
      engine.fetch(server.url('/ok')),
      engine.fetch(server.url('/echo'), { headers: { 'x-tag': 'two' } }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    if (results[0].ok && results[2].ok) {
      const one = (results[0].response.json() as { headers: Record<string, string> }).headers;
      const two = (results[2].response.json() as { headers: Record<string, string> }).headers;
      expect(one['x-tag']).toBe('one');
      expect(two['x-tag']).toBe('two');
    }
    await engine.close();
  });
});
