/**
 * E2E: watch-page playback paths —
 *  1. local-file playback (file picker, never uploaded);
 *  2. the honest relay-required failure for header-gated sources (never fetched);
 *  3. the authorized public demo streams (Mux HLS), self-skipping when the
 *     sandbox has no network egress.
 */

import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const FIXTURE_MP4 = join(process.cwd(), 'demo', 'public', 'fixtures', 'sample-mp4.mp4');

function watchUrlFor(slug: string, dataToken: string): string {
  // Tokens are base64url of the provider-opaque values; the fixtures are ASCII.
  const title = Buffer.from(`https://fixtures.local/title/${slug}`).toString('base64url');
  const data = Buffer.from(dataToken).toString('base64url');
  return `/watch/mock-fixtures/${title}/${data}`;
}

test('a local file opened on the watch page plays and never uploads', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' || request.method() === 'PUT') uploads.push(request.url());
  });

  await page.goto(watchUrlFor('aurora-drift', 'fixtures:play:aurora-drift'));
  const input = page.getByLabel('Add local media files');
  await input.setInputFiles(FIXTURE_MP4);

  await expect(page.getByText('sample-mp4.mp4')).toBeVisible();
  await expect
    .poll(async () => page.getByTestId('csw-video').evaluate((el: HTMLVideoElement) => el.currentTime), {
      timeout: 10_000,
      intervals: [100, 250, 250, 500],
    })
    .toBeGreaterThan(0.2);
  // Local playback must not transmit anything.
  expect(uploads).toEqual([]);
});

test('the header-gated fixture reports relay-required and is never fetched', async ({ page }) => {
  const protectedRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('fixtures.local/protected')) protectedRequests.push(request.url());
  });

  await page.goto(watchUrlFor('gated-vault', 'fixtures:play:gated-vault'));
  const error = page.locator('.csw-overlay-error');
  await expect(error).toContainText(/relay/i);
  await expect(error).toContainText(/D8/);
  expect(protectedRequests).toEqual([]);
});

test('the authorized Mux demo stream plays (skipped without network egress)', async ({ page }) => {
  test.skip(process.env.SKIP_REMOTE_E2E === '1', 'remote e2e disabled');
  // Probe availability first: availability of public test streams is NOT
  // guaranteed (documented provenance) — skip honestly instead of failing.
  const reachable = await page
    .request
    .get('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', { timeout: 10_000 })
    .then((response) => response.ok())
    .catch(() => false);
  test.skip(!reachable, 'Mux public test stream unreachable from this environment');

  await page.goto(watchUrlFor('harbor-lights-live', 'fixtures:live:harbor-lights-live'));
  // hls.js loads lazily, then plays the stream.
  await expect
    .poll(async () => page.getByTestId('csw-video').evaluate((el: HTMLVideoElement) => el.currentTime), {
      timeout: 20_000,
      intervals: [250, 500, 500, 1_000],
    })
    .toBeGreaterThan(0.2);
  await expect(page.locator('.csw-overlay-error')).toHaveCount(0);
});
