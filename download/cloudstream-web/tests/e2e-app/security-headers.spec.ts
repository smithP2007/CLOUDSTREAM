/**
 * E2E: security headers + CSP served by the PRODUCTION build (D25).
 * `next start` must attach the D25 CSP and hardening headers to every route
 * (pages AND API), and the app must render under it. The rest of the app e2e
 * suite (navigation/search/watch/library) doubles as the CSP-compatibility
 * regression net; conversion-under-CSP is verified explicitly in
 * conversion.spec.ts.
 */

import { expect, test } from '@playwright/test';

test('the CSP and hardening headers are attached to page routes', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const csp = response.headers()['content-security-policy'];
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("worker-src 'self'");
  // MSE playback attaches MediaSource via blob:; the verified conversion core
  // is imported as a blob: module INSIDE the same-origin worker.
  expect(csp).toMatch(/media-src 'self' blob:/);
  expect(csp).toMatch(/script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:/);
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

test('the CSP is attached to API routes too', async ({ request }) => {
  const response = await request.get('/api/providers/health');
  expect(response.status()).toBe(200);
  const csp = response.headers()['content-security-policy'];
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
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
