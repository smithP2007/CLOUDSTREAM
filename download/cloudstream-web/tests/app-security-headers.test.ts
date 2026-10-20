/**
 * D25/D26 security-header tests: the CSP/security headers served by the
 * Next.js app are fully specified by the pure builder (consumed by
 * `next.config.ts` `headers()` AND the D26 proxy `src/proxy.ts`),
 * dev-only relaxations never leak into production, the nonce variant drops
 * `'unsafe-inline'`, and the authorized media host list stays in sync with
 * the mock catalog (the ONLY remote media origins the product can legally
 * play).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_MEDIA_HOSTS,
  CORE_CDN_HOST,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from '../src/app/_lib/securityHeaders';
import { CSP_NONCE_CHARSET, generateCspNonce } from '../src/app/_lib/nonce';

describe('buildContentSecurityPolicy', () => {
  it('nonce-less baseline (recorded shape): unsafe-inline, no unsafe-eval, no ws:', () => {
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

  it('D26 nonce variant: script-src carries the nonce and NO unsafe-inline; other directives unchanged', () => {
    const nonce = generateCspNonce();
    const csp = buildContentSecurityPolicy('production', { nonce });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' blob:`);
    // THE D26 hardening property: no inline-script allow-all in the
    // script-src directive (style-src keeps its separate, recorded
    // 'unsafe-inline' for style attributes).
    const scriptDirective = csp.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(scriptDirective).toBe(`script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' blob:`);
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain('ws:');
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // style-src keeps its recorded relaxation (style attributes — separate
    // follow-up, NOT silently resolved):
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('nonce variant in development keeps the dev-only relaxations', () => {
    const dev = buildContentSecurityPolicy('development', { nonce: generateCspNonce() });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain('ws:');
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
    const csp = buildContentSecurityPolicy('production', { nonce: generateCspNonce() });
    const media = csp.split('; ').find((d) => d.startsWith('media-src'))!;
    expect(media).toBe(`media-src 'self' blob: ${AUTHORIZED_MEDIA_HOSTS.join(' ')}`);
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src'))!;
    expect(connect).toBe(`connect-src 'self' blob: ${AUTHORIZED_MEDIA_HOSTS.join(' ')} ${CORE_CDN_HOST}`);
    // style-src / img-src baselines:
    expect(csp).toContain("img-src 'self' data:");
  });
});

describe('generateCspNonce', () => {
  it('produces values in the CSP base64-value grammar (base64url, no padding)', () => {
    for (let i = 0; i < 32; i++) {
      const nonce = generateCspNonce();
      expect(nonce).toMatch(CSP_NONCE_CHARSET);
      expect(nonce).not.toContain('=');
      expect(nonce.length).toBeGreaterThanOrEqual(20); // 128 bits → 22 base64url chars
    }
  });

  it('is unique per call (per-request freshness)', () => {
    const seen = new Set(Array.from({ length: 64 }, () => generateCspNonce()));
    expect(seen.size).toBe(64);
  });
});

describe('buildSecurityHeaders', () => {
  it('emits the standard hardening headers in production (incl. HSTS) and NO static CSP (D26)', () => {
    const headers = buildSecurityHeaders('production');
    const map = new Map(headers.map((h) => [h.key, h.value]));
    expect(map.get('X-Content-Type-Options')).toBe('nosniff');
    expect(map.get('X-Frame-Options')).toBe('DENY');
    expect(map.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(map.get('Permissions-Policy')).toContain('camera=()');
    expect(map.get('Permissions-Policy')).toContain('microphone=()');
    expect(map.get('Strict-Transport-Security')).toContain('max-age=63072000');
    // The CSP is per-request (nonce, src/proxy.ts) — a static copy here would
    // intersect with it and have no nonce:
    expect(map.has('Content-Security-Policy')).toBe(false);
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
