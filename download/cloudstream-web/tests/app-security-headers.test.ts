/**
 * D25 security-header tests: the CSP/security headers served by the Next.js
 * app are fully specified by the pure builder (imported by next.config.ts
 * `headers()`), dev-only relaxations never leak into production, and the
 * authorized media host list stays in sync with the mock catalog (the ONLY
 * remote media origins the product can legally play).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_MEDIA_HOSTS,
  CORE_CDN_HOST,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from '../src/app/_lib/securityHeaders';

describe('buildContentSecurityPolicy', () => {
  it('production: no unsafe-eval, no ws:; wasm-unsafe-eval present', () => {
    const csp = buildContentSecurityPolicy('production');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain('ws:');
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('development-only relaxations appear ONLY in development', () => {
    const dev = buildContentSecurityPolicy('development');
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain('ws:');
    const prod = buildContentSecurityPolicy('production');
    for (const relaxation of ["'unsafe-eval'", 'ws:']) {
      expect(prod.includes(relaxation)).toBe(false);
    }
  });

  it('media-src and connect-src allow exactly self + authorized media hosts (+ verified core CDN for connect)', () => {
    const csp = buildContentSecurityPolicy('production');
    const media = csp.split('; ').find((d) => d.startsWith('media-src'))!;
    expect(media).toBe(`media-src 'self' blob: ${AUTHORIZED_MEDIA_HOSTS.join(' ')}`);
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src'))!;
    expect(connect).toBe(`connect-src 'self' blob: ${AUTHORIZED_MEDIA_HOSTS.join(' ')} ${CORE_CDN_HOST}`);
    // style-src / img-src baselines:
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
  });
});

describe('buildSecurityHeaders', () => {
  it('emits the standard hardening headers in production (incl. HSTS)', () => {
    const headers = buildSecurityHeaders('production');
    const map = new Map(headers.map((h) => [h.key, h.value]));
    expect(map.get('X-Content-Type-Options')).toBe('nosniff');
    expect(map.get('X-Frame-Options')).toBe('DENY');
    expect(map.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(map.get('Permissions-Policy')).toContain('camera=()');
    expect(map.get('Permissions-Policy')).toContain('microphone=()');
    expect(map.get('Strict-Transport-Security')).toContain('max-age=63072000');
    expect(map.get('Content-Security-Policy')).toBeTruthy();
  });

  it('omits HSTS in development (no TLS locally)', () => {
    const headers = buildSecurityHeaders('development');
    expect(headers.some((h) => h.key === 'Strict-Transport-Security')).toBe(false);
  });
});

describe('authorized media hosts stay in sync with the mock catalog', () => {
  it('every remote host referenced by the catalog is authorized in the CSP (and vice versa)', () => {
    const catalog = readFileSync(
      new URL('../src/server/providers/mock/catalog.ts', import.meta.url),
      'utf8',
    );
    // fixtures.local is a PLACEHOLDER origin (never fetched; fixtures resolve
    // locally) — the placeholder is intentionally NOT in the CSP.
    const hosts = new Set(
      [...catalog.matchAll(/https:\/\/[a-z0-9.-]+/g)]
        .map((m) => m[0])
        .filter((origin) => origin !== 'https://fixtures.local'),
    );
    expect(new Set(AUTHORIZED_MEDIA_HOSTS)).toEqual(hosts);
  });
});
