/**
 * E2E: REAL ffmpeg.wasm conversion on the APP watch page, against the
 * PRODUCTION build, UNDER the D25 content-security policy.
 *
 * Mirrors the audited demo flow (tests/e2e/conversion-real.spec.ts) on the
 * product surface:
 *   1. the core is loaded from the SELF-HOSTED path (/ffmpeg-core — staged
 *      by fixtures:web; the app watch page passes conversionCoreBaseUrl);
 *   2. the D25 integrity layer verifies the core's SHA-256 BEFORE load — a
 *      successful conversion is therefore also end-to-end evidence that the
 *      verification path works against the real 30.7 MiB artifact;
 *   3. the converted output is added to the playlist and actually decoded;
 *   4. ZERO console CSP violations during the whole flow (wasm-unsafe-eval
 *      and worker-src 'self' are sufficient for the conversion stack — no
 *      blob: worker relaxation needed);
 *   5. local media never leaves the device (no upload verbs).
 *
 * Requires `npm run fixtures:ffmpeg-core` + the e2e:app staging step.
 */

import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const AVI_FIXTURE = fileURLToPath(new URL('../../demo/public/fixtures/sample-avi.avi', import.meta.url));

/** Mirrors pickConversionProfile (conversion/profiles.ts) for THIS browser. */
async function expectedProfile(page: Page): Promise<{ label: string; ext: string } | null> {
  return page.evaluate(() => {
    const probe = document.createElement('video');
    const order: Array<[string, string]> = [
      ['MP4 (H.264 + AAC)', 'mp4; codecs="avc1.42E01E, mp4a.40.2"'],
      ['WebM (VP9 + Opus)', 'webm; codecs="vp9, opus"'],
      ['MP4 (H.264 + AAC)', 'mp4'],
      ['WebM (VP9 + Opus)', 'webm'],
    ];
    for (const [label, type] of order) {
      if (probe.canPlayType(`video/${type}`) !== '') return { label, ext: type.split(';')[0]! };
    }
    return null;
  });
}

function watchUrlFor(slug: string, dataToken: string): string {
  const title = Buffer.from(`https://fixtures.local/title/${slug}`).toString('base64url');
  const data = Buffer.from(dataToken).toString('base64url');
  return `/watch/mock-fixtures/${title}/${data}`;
}

test.beforeAll(async () => {
  const core = fileURLToPath(new URL('../../public/ffmpeg-core/ffmpeg-core.wasm', import.meta.url));
  let present = false;
  try {
    present = statSync(core).size > 20_000_000;
  } catch {
    present = false;
  }
  test.skip(!present, 'staged app core missing — run `npm run fixtures:ffmpeg-core` then `npm run fixtures:web`');
});

test('AVI converts and plays on the watch page under the CSP (self-hosted core, integrity verified)', async ({ page }) => {
  test.setTimeout(240_000);
  const profile = await expectedProfile(page);
  test.skip(profile === null, 'this browser accepts neither conversion output profile');

  const cspViolations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().toUpperCase().includes('CONTENT SECURITY POLICY')) {
      cspViolations.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (error.message.toUpperCase().includes('CONTENT SECURITY POLICY')) cspViolations.push(error.message);
  });

  const uploads: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method())) uploads.push(request.url());
  });

  // The integrity-verified core load fetches the wasm as bytes from the
  // self-hosted path — capture it to prove which core URL actually served.
  const wasmResponse = page.waitForResponse(
    (response) => response.url().includes('/ffmpeg-core/ffmpeg-core.wasm') && response.request().method() === 'GET',
  );

  await page.goto(watchUrlFor('aurora-drift', 'fixtures:play:aurora-drift'));
  const input = page.getByLabel('Add local media files');
  await input.setInputFiles(AVI_FIXTURE);

  const entry = page.locator('.csw-playlist-item', { hasText: 'sample-avi.avi' });
  await expect(entry).toContainText('AVI');

  // The fixture auto-starts into the non-empty playlist, so the AVI is NOT
  // attempted on add — selecting it runs the decision flow, which offers
  // conversion (identical to the demo's empty-playlist auto-select).
  await entry.locator('.csw-playlist-main').click();

  const panel = page.locator('.csw-conversion');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`Output: ${profile!.label}`);

  await page.getByRole('button', { name: 'Convert and play' }).click();
  const wasm = await wasmResponse;
  expect(wasm.status(), 'self-hosted core must serve with HTTP 200').toBe(200);

  // Capture the pre-conversion source (the fixture may auto-start) — the
  // converted output must REPLACE it (addLocalBlob plays the explicit result).
  const video = page.getByTestId('csw-video');
  const srcBefore = await video.getAttribute('src');

  const converted = page.locator('.csw-playlist-item', { hasText: `sample-avi.${profile!.ext}` });
  await expect(converted).toBeVisible({ timeout: 180_000 });
  await expect(converted).toContainText(/converted output/i);

  // The converted output is played automatically (explicit user action) and
  // the browser actually decodes the wasm-produced file.
  await expect(video).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(async () => video.getAttribute('src'), { timeout: 15_000 })
    .not.toBe(srcBefore);
  await expect
    .poll(
      async () => video.evaluate((el: HTMLVideoElement) => el.currentTime),
      { timeout: 20_000, intervals: [250, 500, 500, 1_000] },
    )
    .toBeGreaterThan(0.2);
  await expect(page.locator('.csw-overlay-error')).toHaveCount(0);

  // The D25 CSP must hold for the entire wasm/worker/verify flow.
  expect(cspViolations, 'no CSP violations during conversion').toEqual([]);
  expect(uploads, 'conversion must never upload file data').toEqual([]);
});
