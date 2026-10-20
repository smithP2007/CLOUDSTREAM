/**
 * E2E: AUTHORIZED DEMO PLAYBACK FLOW (deterministic — local fixtures only).
 *
 * Exercises the provider-shaped source path through the demo page's
 * `PlaybackLink` fixtures (no provider is registered):
 *  - a progressive fixture plays through the SourceSelector (asserted inside
 *    the 2s fixture window);
 *  - a header-gated fixture is reported honestly as relay-required and is
 *    NEVER fetched (the decision rejects it before any network activity);
 *  - the unsupported remote container reports its limitation.
 */

import { expect, test } from '@playwright/test';

test('a demo progressive fixture plays via the source selector', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('option', { name: /Generated fixture — WebM/ }).click();

  await expect(page.locator('.csw-decision')).toContainText(/Native progressive playback/i);
  await expect
    .poll(async () =>
      page.getByTestId('csw-video').evaluate((el: HTMLVideoElement) => el.currentTime),
      { timeout: 5_000, intervals: [100, 250, 250] },
    )
    .toBeGreaterThan(0.2);
  await expect(page.locator('.csw-overlay-error')).toHaveCount(0);
});

test('header-gated demo sources report relay-required without being fetched', async ({ page }) => {
  const headerRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.com')) headerRequests.push(request.url());
  });

  await page.goto('/');
  await page.getByRole('option', { name: /Header-gated source/ }).click();

  const error = page.locator('.csw-overlay-error');
  await expect(error).toContainText(/relay/i);
  await expect(error).toContainText(/D8/);
  // Zero network requests left the page for that source.
  expect(headerRequests).toEqual([]);
});

test('unsupported remote containers report an honest limitation', async ({ page }) => {
  const aviRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.com')) aviRequests.push(request.url());
  });

  await page.goto('/');
  await page.getByRole('option', { name: /Remote AVI/ }).click();

  await expect(page.locator('.csw-overlay-error')).toContainText(/AVI/i);
  expect(aviRequests).toEqual([]);
});
