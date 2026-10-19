/**
 * Unit tests for the SSRF guard, guarded DNS resolver, header normalization,
 * cookie jar, TTL cache, and robots gate. All DNS is mocked; NO network I/O
 * happens in this file.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  CookieJar,
  GuardedDnsResolver,
  DnsValidationError,
  TtlCache,
  isApprovedDestination,
  parseIpv4,
  parseIpv6,
  ipv4FromMappedIpv6,
  redactHeadersForLog,
  normalizeRequestHeaders,
  parseRobotsTxt,
  robotsAllows,
  validateDestinationUrl,
  type ApprovedDestination,
} from '../src/server/http';

const NO_APPROVALS: ApprovedDestination[] = [];
const LOOPBACK: ApprovedDestination[] = [{ host: '127.0.0.1' }];

/* -------------------------------------------------------------------------- */
/* URL guard                                                                   */
/* -------------------------------------------------------------------------- */

describe('validateDestinationUrl — schemes and shapes', () => {
  const guard = (url: string, approved: ApprovedDestination[] = NO_APPROVALS) =>
    validateDestinationUrl(url, { approvedDestinations: approved });

  it('allows http/https', () => {
    expect(guard('http://example.com/').allowed).toBe(true);
    expect(guard('https://example.com/').allowed).toBe(true);
  });

  it('rejects non-http(s) schemes without any network activity', () => {
    for (const url of ['ftp://example.com/', 'file:///etc/passwd', 'data:text/plain,x', 'javascript:alert(1)']) {
      const verdict = guard(url);
      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) expect(verdict.reason).toBe('scheme');
    }
  });

  it('rejects unparseable and empty URLs', () => {
    expect(guard('').allowed).toBe(false);
    expect(guard('http://').allowed).toBe(false);
    expect(guard('not a url').allowed).toBe(false);
    expect(guard('http://[::1').allowed).toBe(false);
  });

  it('rejects embedded credentials', () => {
    const verdict = guard('http://user:pass@example.com/');
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe('credentials');
  });
});

describe('validateDestinationUrl — hostname blocklist (no DNS involved)', () => {
  const guard = (url: string, approved: ApprovedDestination[] = NO_APPROVALS) =>
    validateDestinationUrl(url, { approvedDestinations: approved });

  it('blocks localhost and local/metadata hostnames', () => {
    for (const url of [
      'http://localhost/x',
      'http://sub.localhost/x',
      'http://printer.local/x',
      'http://db.internal/x',
      'http://svc.home.arpa/x',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://metadata.goog/x',
      'http://metadata/latest/meta-data/',
      'http://instance-data/latest/',
    ]) {
      const verdict = guard(url);
      expect(verdict.allowed, url).toBe(false);
      if (!verdict.allowed) expect(verdict.reason).toBe('hostname');
    }
  });

  it('blocks malformed hostnames (underscores, double dots, over-long)', () => {
    expect(guard('http://exa_mple.com/').allowed).toBe(false);
    expect(guard('http://a..b.com/').allowed).toBe(false);
    expect(guard(`http://${'a'.repeat(64)}.com/`).allowed).toBe(false);
  });

  it('approvals override hostname blocks (explicit operator config)', () => {
    const approved: ApprovedDestination[] = [{ host: 'myhost.internal' }];
    expect(guard('http://myhost.internal/x', approved).allowed).toBe(true);
    expect(guard('http://other.internal/x', approved).allowed).toBe(false);
  });
});

describe('validateDestinationUrl — IPv4 rules and encoded forms', () => {
  const guard = (url: string, approved: ApprovedDestination[] = NO_APPROVALS) =>
    validateDestinationUrl(url, { approvedDestinations: approved });

  it('blocks every non-public IPv4 range', () => {
    for (const host of [
      '0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255', '100.64.0.1', '100.127.255.255',
      '127.0.0.1', '127.8.8.8', '169.254.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
      '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.19.255.255',
      '198.51.100.1', '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    ]) {
      const verdict = guard(`http://${host}/x`);
      expect(verdict.allowed, host).toBe(false);
      if (!verdict.allowed) expect(verdict.reason).toBe('ip-blocked');
    }
  });

  it('allows public IPv4 literals', () => {
    for (const host of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '203.0.114.1']) {
      expect(guard(`http://${host}/x`).allowed, host).toBe(true);
    }
  });

  it('catches WHATWG-normalized encoded loopback forms', () => {
    // new URL() normalizes decimal/hex/octal/short IPv4 BEFORE the guard sees it.
    expect(new URL('http://2130706433/').hostname).toBe('127.0.0.1');
    expect(new URL('http://0x7f000001/').hostname).toBe('127.0.0.1');
    expect(new URL('http://0177.0.0.1/').hostname).toBe('127.0.0.1');
    expect(new URL('http://127.1/').hostname).toBe('127.0.0.1');
    for (const raw of ['http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://127.1/']) {
      const verdict = guard(raw);
      expect(verdict.allowed, raw).toBe(false);
      if (!verdict.allowed) expect(verdict.reason).toBe('ip-blocked');
    }
  });

  it('approvals override IPv4 range blocks (operator LAN hosts)', () => {
    expect(guard('http://127.0.0.1:8080/x', LOOPBACK).allowed).toBe(true);
    expect(guard('http://192.168.1.50/x', [{ host: '192.168.1.50' }]).allowed).toBe(true);
    // Port restrictions are honored.
    expect(guard('http://127.0.0.1:80/x', [{ host: '127.0.0.1', ports: [8443] }]).allowed).toBe(false);
    expect(guard('http://127.0.0.1:8443/x', [{ host: '127.0.0.1', ports: [8443] }]).allowed).toBe(true);
    // Other private hosts stay blocked.
    expect(guard('http://10.0.0.1/x', LOOPBACK).allowed).toBe(false);
  });
});

describe('validateDestinationUrl — IPv6 rules', () => {
  const guard = (url: string, approved: ApprovedDestination[] = NO_APPROVALS) =>
    validateDestinationUrl(url, { approvedDestinations: approved });

  it('blocks non-public IPv6 destinations', () => {
    for (const host of [
      '::', '::1', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'fd12:3456::1', 'ff02::1',
      '2001:db8::1', '2001::1234:5678', '2002:7f00:1::', '64:ff9b::7f00:1', '100::1',
      '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254',
    ]) {
      const verdict = guard(`http://[${host}]/x`);
      expect(verdict.allowed, host).toBe(false);
      if (!verdict.allowed) expect(verdict.reason).toBe('ip-blocked');
    }
  });

  it('allows public IPv6 and public IPv4-mapped forms', () => {
    expect(guard('http://[2606:4700::1111]/x').allowed).toBe(true);
    expect(guard('http://[::ffff:8.8.8.8]/x').allowed).toBe(true);
  });

  it('rejects IPv6 zone IDs (fail closed)', () => {
    const verdict = guard('http://[fe80::1%25eth0]/x');
    expect(verdict.allowed).toBe(false);
  });

  it('approvals override IPv6 blocks', () => {
    expect(guard('http://[::1]/x', [{ host: '::1' }]).allowed).toBe(true);
  });
});

describe('approval matching semantics', () => {
  it('supports exact hosts, wildcard suffixes and IP literals', () => {
    const approved: ApprovedDestination[] = [
      { host: 'example.com' },
      { host: '*.cdn.example.net' },
      { host: '192.168.1.7' },
    ];
    expect(isApprovedDestination('example.com', 80, approved)).toBe(true);
    expect(isApprovedDestination('EXAMPLE.COM.', 80, approved)).toBe(true);
    expect(isApprovedDestination('notexample.com', 80, approved)).toBe(false);
    expect(isApprovedDestination('a.cdn.example.net', 443, approved)).toBe(true);
    expect(isApprovedDestination('cdn.example.net', 443, approved)).toBe(true); // apex included by wildcard (documented)
    expect(isApprovedDestination('b.cdn.example.net.evil.com', 443, approved)).toBe(false);
    expect(isApprovedDestination('192.168.1.7', 80, approved)).toBe(true);
    expect(isApprovedDestination('192.168.1.8', 80, approved)).toBe(false);
  });
});

describe('IP parsing primitives', () => {
  it('parses strict dotted-quad IPv4 and rejects malformed forms', () => {
    expect(parseIpv4('127.0.0.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('256.1.1.1')).toBeNull();
    expect(parseIpv4('1.2.3')).toBeNull();
    expect(parseIpv4('1.2.3.4.5')).toBeNull();
    expect(parseIpv4('a.b.c.d')).toBeNull();
  });

  it('parses IPv6 including :: expansion and embedded IPv4', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('2001:db8::1')).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIpv6('64:ff9b::7f00:1')).toEqual([0x64, 0xff9b, 0, 0, 0, 0, 0x7f00, 1]);
    expect(parseIpv6('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseIpv6('1:2:3:4:5:6:7::8')).toBeNull();
    expect(parseIpv6('fe80::1%eth0')).toBeNull();
    expect(parseIpv6('gggg::1')).toBeNull();
  });

  it('unwraps IPv4-mapped addresses for classification', () => {
    const mapped = parseIpv6('::ffff:10.1.2.3');
    expect(mapped).not.toBeNull();
    expect(ipv4FromMappedIpv6(mapped as [number, number, number, number, number, number, number, number]))
      .toEqual([10, 1, 2, 3]);
    expect(ipv4FromMappedIpv6(parseIpv6('2606:4700::1111') as [number, number, number, number, number, number, number, number]))
      .toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Guarded DNS resolver (mocked resolvers — no network)                        */
/* -------------------------------------------------------------------------- */

function makeResolver(
  resolve4: (host: string) => Promise<string[]>,
  resolve6: (host: string) => Promise<string[]>,
  approved: ApprovedDestination[] = [],
): GuardedDnsResolver {
  return new GuardedDnsResolver({ resolve4Fn: resolve4, resolve6Fn: resolve6, approvedDestinations: approved, ttlMs: 30 });
}

describe('GuardedDnsResolver', () => {
  it('validates public records and caches them', async () => {
    const resolve4 = vi.fn(async () => ['93.184.216.34']);
    const resolve6 = vi.fn(async () => ['2606:4700::1111']);
    const resolver = makeResolver(resolve4, resolve6);
    const addresses = await resolver.validateAndCache('example.com');
    expect(addresses.map((a) => a.address).sort()).toEqual(['2606:4700::1111', '93.184.216.34']);
    const again = await resolver.validateAndCache('example.com');
    expect(again.length).toBe(2);
    expect(resolve4).toHaveBeenCalledTimes(1); // cached
  });

  it('fails closed on resolution errors and empty results', async () => {
    const failing = makeResolver(
      async () => {
        throw new Error('SERVFAIL');
      },
      async () => {
        throw new Error('SERVFAIL');
      },
    );
    await expect(failing.validateAndCache('dead.test')).rejects.toThrow(DnsValidationError);

    const empty = makeResolver(async () => [], async () => []);
    await expect(empty.validateAndCache('empty.test')).rejects.toThrow(DnsValidationError);
  });

  it('fails closed when ANY record is non-public (dual-record rebinding)', async () => {
    const mixed = makeResolver(async () => ['93.184.216.34'], async () => ['fd12::5']);
    await expect(mixed.validateAndCache('mixed.test')).rejects.toThrow(/non-public/);

    const allPrivate = makeResolver(async () => ['192.168.0.10'], async () => []);
    await expect(allPrivate.validateAndCache('lan.test')).rejects.toThrow(DnsValidationError);
  });

  it('allows blocked-range records only for explicitly approved hostnames', async () => {
    const resolver = makeResolver(
      async () => ['127.0.0.1'],
      async () => [],
      [{ host: 'myserver.lan' }],
    );
    const addresses = await resolver.validateAndCache('myserver.lan');
    expect(addresses).toEqual([{ address: '127.0.0.1', family: 4, parsed: [127, 0, 0, 1] }]);
    // Unapproved host with the same record is still rejected.
    await expect(makeResolver(async () => ['127.0.0.1'], async () => []).validateAndCache('other.test')).rejects.toThrow(DnsValidationError);
  });

  it('expires cached entries after the TTL', async () => {
    const resolve4 = vi.fn(async () => ['93.184.216.34']);
    const resolver = makeResolver(resolve4, async () => []);
    await resolver.validateAndCache('ttl.test');
    await resolver.validateAndCache('ttl.test');
    expect(resolve4).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 45)); // ttlMs = 30
    await resolver.validateAndCache('ttl.test');
    expect(resolve4).toHaveBeenCalledTimes(2);
  });

  it('the agent lookup serves ONLY validated entries and honors family filters', async () => {
    const resolver = new GuardedDnsResolver({
      ttlMs: 30,
      // Hostname-aware mocks: unknown hosts fail resolution (fail closed).
      resolve4Fn: async (host) => {
        if (host === 'example.test') return ['93.184.216.34'];
        throw new Error('NXDOMAIN');
      },
      resolve6Fn: async (host) => {
        if (host === 'example.test') return ['2606:4700::1111'];
        throw new Error('NXDOMAIN');
      },
    });
    const lookup = resolver.lookupForAgent();

    const unvalidated = new Promise((resolve, reject) =>
      lookup('never-validated.test', { family: 0 }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
    );
    await expect(unvalidated).rejects.toThrow(/DNS resolution failed|no validated/);

    await resolver.validateAndCache('example.test');
    const all = await new Promise<{ address: string; family: number }[]>((resolve, reject) =>
      lookup('example.test', { family: 0 }, (err, addresses) => (err ? reject(err) : resolve(addresses ?? []))),
    );
    expect(all.length).toBe(2);
    const v4only = await new Promise<{ address: string; family: number }[]>((resolve, reject) =>
      lookup('example.test', { family: 4 }, (err, addresses) => (err ? reject(err) : resolve(addresses ?? []))),
    );
    expect(v4only).toEqual([{ address: '93.184.216.34', family: 4 }]);
    const v9 = new Promise((resolve, reject) =>
      lookup('example.test', { family: 9 }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
    );
    await expect(v9).rejects.toThrow(/unsupported lookup family/);
  });
});

/* -------------------------------------------------------------------------- */
/* Header normalization                                                        */
/* -------------------------------------------------------------------------- */

describe('normalizeRequestHeaders', () => {
  it('lowercases, merges defaults, and keeps safe custom headers', () => {
    const { headers, dropped } = normalizeRequestHeaders(
      { 'X-Api-Key': 'secret-key', Accept: 'application/json' },
      { 'User-Agent': 'test-agent' },
    );
    expect(headers).toEqual({
      'user-agent': 'test-agent',
      'x-api-key': 'secret-key',
      accept: 'application/json',
    });
    expect(dropped).toEqual([]);
  });

  it('strips hop-by-hop, host, content-length and cookie headers', () => {
    const { headers, dropped } = normalizeRequestHeaders({
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
      Host: 'evil.example',
      'Content-Length': '999',
      Cookie: 'stolen=1',
      Accept: '*/*',
    });
    expect(headers).toEqual({ accept: '*/*' });
    expect(dropped.sort()).toEqual(['connection', 'content-length', 'cookie', 'host', 'transfer-encoding']);
  });

  it('rejects header injection (CR/LF/NUL) and invalid names', () => {
    expect(() => normalizeRequestHeaders({ 'x-safe': 'value\r\nX-Evil: 1' })).toThrow(TypeError);
    expect(() => normalizeRequestHeaders({ 'x-safe': 'value\nX-Evil: 1' })).toThrow(TypeError);
    expect(() => normalizeRequestHeaders({ 'x safe': 'v' })).toThrow(TypeError);
    expect(() => normalizeRequestHeaders({ '': 'v' })).toThrow(TypeError);
  });

  it('caps header count and value length', () => {
    const tooMany = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`x-h${i}`, 'v']));
    expect(() => normalizeRequestHeaders(tooMany)).toThrow(/too many/);
    expect(() => normalizeRequestHeaders({ 'x-big': 'a'.repeat(4097) })).toThrow(/exceeds/);
  });

  it('redacts credential headers for logs', () => {
    const redacted = redactHeadersForLog({
      cookie: 'sid=abc',
      authorization: 'Bearer tok',
      'set-cookie': ['a=1', 'b=2'],
      'content-type': 'text/html',
    });
    expect(redacted).toEqual({
      cookie: '[REDACTED]',
      authorization: '[REDACTED]',
      'set-cookie': '[REDACTED]',
      'content-type': 'text/html',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Cookie jar                                                                  */
/* -------------------------------------------------------------------------- */

describe('CookieJar', () => {
  const jar = () => new CookieJar();
  const url = (u: string) => new URL(u);

  it('stores set-cookie values and returns a cookie header for same host', () => {
    const j = jar();
    j.storeFromResponse(['sid=abc123; Path=/; HttpOnly'], url('http://example.com/watch'));
    expect(j.headerFor(url('http://example.com/watch'))).toBe('sid=abc123');
    expect(j.headerFor(url('http://example.com/other'))).toBe('sid=abc123');
  });

  it('honors Domain scoping: subdomains share, foreign domains cannot plant', () => {
    const j = jar();
    j.storeFromResponse(['k=1; Domain=example.com'], url('http://api.example.com/x'));
    expect(j.headerFor(url('http://api.example.com/'))).toBe('k=1');
    expect(j.headerFor(url('http://example.com/'))).toBe('k=1');
    expect(j.headerFor(url('http://notexample.com/'))).toBeNull();
    // A response from evil.com cannot set a cookie for example.com.
    j.storeFromResponse(['evil=1; Domain=example.com'], url('http://evil.com/'));
    expect(j.headerFor(url('http://example.com/'))).toBe('k=1');
  });

  it('honors Secure (https-only) and Path scoping', () => {
    const j = jar();
    j.storeFromResponse(['s=1; Secure'], url('http://example.com/'));
    expect(j.headerFor(url('http://example.com/'))).toBeNull();
    expect(j.headerFor(url('https://example.com/'))).toBe('s=1');

    const j2 = jar();
    j2.storeFromResponse(['p=1; Path=/foo'], url('http://example.com/foo/bar'));
    expect(j2.headerFor(url('http://example.com/foo/deep'))).toBe('p=1');
    expect(j2.headerFor(url('http://example.com/foobar'))).toBeNull();
    expect(j2.headerFor(url('http://example.com/'))).toBeNull();
  });

  it('drops expired / max-age=0 cookies', () => {
    const j = jar();
    j.storeFromResponse(['gone=1; Max-Age=0'], url('http://example.com/'));
    expect(j.size).toBe(0);
    j.storeFromResponse(['old=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT'], url('http://example.com/'));
    expect(j.size).toBe(0);
    j.storeFromResponse(['fresh=1; Max-Age=3600'], url('http://example.com/'));
    expect(j.size).toBe(1);
  });

  it('is bounded: maxCookies eviction keeps size under the cap', () => {
    const j = new CookieJar({ maxCookies: 2 });
    j.storeFromResponse(['a=1'], url('http://example.com/'));
    j.storeFromResponse(['b=2'], url('http://example.com/'));
    j.storeFromResponse(['c=3'], url('http://example.com/'));
    expect(j.size).toBe(2);
    expect(j.headerFor(url('http://example.com/'))).not.toContain('a=1');
  });

  it('ignores oversized values and unparseable pairs', () => {
    const j = jar();
    j.storeFromResponse([`big=${'x'.repeat(5000)}`, 'novalue', '=noname'], url('http://example.com/'));
    expect(j.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* TTL cache                                                                   */
/* -------------------------------------------------------------------------- */

describe('TtlCache', () => {
  it('stores, touches LRU order, and expires by TTL', async () => {
    const cache = new TtlCache<string>({ maxEntries: 3 });
    cache.set('a', 'va', 30);
    expect(cache.get('a')).toBe('va');
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts least-recently-used beyond maxEntries', () => {
    const cache = new TtlCache<number>({ maxEntries: 2 });
    cache.set('a', 1, 10_000);
    cache.set('b', 2, 10_000);
    cache.get('a'); // touch a → b becomes LRU
    cache.set('c', 3, 10_000);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('enforces the byte budget and rejects oversized values', () => {
    const cache = new TtlCache<Uint8Array>({ maxEntries: 10, maxBytes: 300, sizeOf: (v) => v.byteLength });
    const big = new Uint8Array(400);
    expect(cache.set('big', big, 10_000)).toBe(false); // oversized rejected
    const medium = new Uint8Array(150);
    expect(cache.set('m1', medium, 10_000)).toBe(true);
    expect(cache.set('m2', medium, 10_000)).toBe(true);
    expect(cache.set('m3', medium, 10_000)).toBe(true); // evicts m1 (byte bound)
    expect(cache.has('m1')).toBe(false);
    expect(cache.bytes).toBeLessThanOrEqual(300);
  });
});

/* -------------------------------------------------------------------------- */
/* robots.txt parsing + gate decisions (pure parts)                            */
/* -------------------------------------------------------------------------- */

describe('parseRobotsTxt + robotsAllows', () => {
  it('applies longest-match with allow-wins-ties semantics', () => {
    const parsed = parseRobotsTxt(
      ['User-agent: *', 'Disallow: /private', 'Allow: /private/open', 'Disallow: /private/open$'].join('\n'),
    );
    expect(robotsAllows(parsed, 'any-agent/1.0', '/private/x')).toBe(false);
    expect(robotsAllows(parsed, 'any-agent/1.0', '/private/open/file')).toBe(true); // Allow (13) beats Disallow /private (8)
    // The $-anchored Disallow (14 chars) is the longest match for exactly '/private/open'.
    expect(robotsAllows(parsed, 'any-agent/1.0', '/private/open')).toBe(false);
  });

  it('selects the most specific user-agent group', () => {
    const parsed = parseRobotsTxt(
      [
        'User-agent: specific-bot', 'Disallow: /all', '',
        'User-agent: *', 'Disallow: /other',
      ].join('\n'),
    );
    expect(robotsAllows(parsed, 'specific-bot/2.0', '/all/x')).toBe(false);
    expect(robotsAllows(parsed, 'specific-bot/2.0', '/other/x')).toBe(true);
    expect(robotsAllows(parsed, 'generic-bot/1.0', '/other/x')).toBe(false);
    expect(robotsAllows(parsed, 'generic-bot/1.0', '/all/x')).toBe(true);
  });

  it('supports wildcards and $ anchors and ignores comments', () => {
    const parsed = parseRobotsTxt(
      ['# comment', 'User-agent: *', 'Disallow: *.pdf$', 'Allow: /free*.pdf'].join('\n'),
    );
    expect(robotsAllows(parsed, 'a/1', '/files/doc.pdf')).toBe(false);
    expect(robotsAllows(parsed, 'a/1', '/free/doc.pdf')).toBe(true);
    expect(robotsAllows(parsed, 'a/1', '/files/doc.pdf?x=1')).toBe(true); // $ anchor
  });

  it('treats an empty group / empty file as allow-all', () => {
    expect(robotsAllows(parseRobotsTxt(''), 'a/1', '/x')).toBe(true);
    expect(robotsAllows(parseRobotsTxt('User-agent: *'), 'a/1', '/x')).toBe(true);
    expect(robotsAllows(parseRobotsTxt('User-agent: *\nDisallow:'), 'a/1', '/x')).toBe(true);
  });
});
