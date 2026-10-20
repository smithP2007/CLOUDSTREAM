/**
 * E2E: security headers + CSP served by the PRODUCTION build (D25; D26 adds
 * the nonce-based CSP). `next start` must attach the D26 per-request nonce
 * CSP and the D25 hardening headers to every route (pages AND API), the
 * rendered page must be stamped with THAT request's nonce (no
 * `'unsafe-inline'` for scripts in production), and the app must render under
 * it with zero violations. The rest of the app e2e suite
 * (navigation/search/watch/library) doubles as the CSP-compatibility
 * regression net; conversion-under-CSP is verified explicitly in
 * conversion.spec.ts.
 */

import { expect, test } from '@playwright/test';

const NONCE_IN_SCRIPT_SRC = /script-src 'self' 'nonce-[A-Za-z0-9_-]+' 'wasm-unsafe-eval' blob:/;

test('the nonce CSP and hardening headers are attached to page routes', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const csp = response.headers()['content-security-policy'];
  expect(csp).toBeTruthy();
  if (csp === undefined) throw new Error('missing content-security-policy header');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("worker-src 'self'");
  // MSE playback attaches MediaSource via blob:; the verified conversion core
  // is imported as a blob: module INSIDE the same-origin worker.
  expect(csp).toMatch(/media-src 'self' blob:/);
  // D26: per-request nonce, and the inline-script allow-all is GONE from
  // script-src (style-src keeps its separate, recorded 'unsafe-inline'):
  expect(csp).toMatch(NONCE_IN_SCRIPT_SRC);
  const scriptDirective = csp.split('; ').find((d) => d.startsWith('script-src'));
  expect(scriptDirective).toBeTruthy();
  expect(scriptDirective).not.toContain("'unsafe-inline'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  // Production must never carry the dev-only relaxations:
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toContain('ws:');

  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response.headers()['permissions-policy']).toContain('camera=()');
  expect(response.headers()['strict-transport-security']).toContain('max-age=63072000');
});

test('the nonce CSP is attached to API routes too', async ({ request }) => {
  const response = await request.get('/api/providers/health');
  expect(response.status()).toBe(200);
  const csp = response.headers()['content-security-policy'];
  expect(csp).toBeTruthy();
  if (csp === undefined) throw new Error('missing content-security-policy header');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(NONCE_IN_SCRIPT_SRC);
});

test('the nonce is fresh per request', async ({ request }) => {
  const cspOf = async () => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeTruthy();
    if (csp === undefined) throw new Error('missing content-security-policy header');
    const match = csp!.match(/'nonce-([A-Za-z0-9_-]+)'/);
    expect(match, 'CSP carries a nonce').toBeTruthy();
    return match![1];
  };
  const first = await cspOf();
  const second = await cspOf();
  expect(first).not.toBe(second);
});

test('the rendered page is stamped with the response policy nonce (no unsafe-inline scripts)', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  const csp = response?.headers()['content-security-policy'] ?? '';
  const policyNonce = csp.match(/'nonce-([A-Za-z0-9_-]+)'/)?.[1];
  expect(policyNonce, 'response CSP carries a nonce').toBeTruthy();

  // Every inline <script> in the served HTML must carry THAT nonce (the
  // mechanism Next.js uses to keep its bootstrap/runtime scripts executable
  // without 'unsafe-inline'). Read the nonce via the IDL property: per the
  // CSP/HTML integration spec, browsers HIDE the nonce CONTENT attribute
  // after parsing (getAttribute('nonce') returns '' / the markup shows
  // nonce=""), while script.nonce still reports the parsed value.
  const inlineScriptNonces = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script:not([src])')).map(
      (el) => (el as HTMLScriptElement).nonce,
    ),
  );
  expect(inlineScriptNonces.length, 'inline bootstrap scripts are present').toBeGreaterThan(0);
  for (const nonce of inlineScriptNonces) {
    expect(nonce, 'every inline script carries a nonce').toBeTruthy();
    expect(nonce).toBe(policyNonce);
  }
});

test('the conversion worker file receives a policy with the blob: sources', async ({ request }) => {
  // The worker's OWN response policy governs its internal import(coreBlobUrl).
  // Staged by `npm run fixtures:web` (the e2e chain runs it); if it is absent
  // the conversion e2e fails elsewhere, so here it must exist.
  const response = await request.get('/ffmpeg-lib/worker.js');
  expect(response.status()).toBe(200);
  const csp = response.headers()['content-security-policy'];
  expect(csp).toBeTruthy();
  if (csp === undefined) throw new Error('missing content-security-policy header');
  expect(csp).toMatch(/script-src [^;]*blob:/);
  expect(csp).toMatch(/connect-src [^;]*blob:/);
});

test('the home page renders under the CSP with no CSP violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().toUpperCase().includes('CONTENT SECURITY POLICY')) {
      violations.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (error.message.toUpperCase().includes('CONTENT SECURITY POLICY')) violations.push(error.message);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(violations).toEqual([]);
});
