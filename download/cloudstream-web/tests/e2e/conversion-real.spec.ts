/**
 * E2E: REAL ffmpeg.wasm CONVERSION (audit evidence, not mocked).
 *
 * Runs the actual @ffmpeg/core wasm binary inside the real browser:
 *   1. core initialization from the SELF-HOSTED path (/ffmpeg-core, gitignored,
 *      copied by `npm run fixtures:ffmpeg-core` — the test skips if absent);
 *   2. a real conversion of the committed synthetic AVI fixture
 *      (MPEG-4 part 2 + MP3), with the output profile EXPECTED FROM THE
 *      BROWSER'S OWN canPlayType PROBE (mirrors pickConversionProfile) —
 *      Chromium builds with proprietary codecs pick MP4 (H.264 + AAC),
 *      OSS builds pick WebM (VP9 + Opus);
 *   3. output playback (the browser actually decodes the produced file);
 *   4. progress reporting is exercised on the longer cancellation input
 *      (progress is observed > 0 mid-run; on the 2s fixture the run finishes
 *      in well under a second, so the transient bar is not asserted);
 *   5. mid-run CANCELLATION on a longer input (generated at test time with
 *      the system ffmpeg CLI into a temp dir — never committed), followed by
 *      an engine-recovery check (terminate -> rebuild -> a fresh run starts);
 *   6. all network traffic stays on the demo origin — no POST/PUT/PATCH exists
 *      in the flow, i.e. local media never leaves the device.
 *
 * Requires: `npm run fixtures:ffmpeg-core` (core present at demo/public/ffmpeg-core).
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const AVI_FIXTURE = fileURLToPath(new URL('../../demo/public/fixtures/sample-avi.avi', import.meta.url));
const CORE_WASM_URL = '/ffmpeg-core/ffmpeg-core.wasm';

/**
 * Mirrors pickConversionProfile (conversion/profiles.ts) against THIS browser.
 * Returns the expected profile label and output extension, or null when the
 * browser accepts neither output (conversion offer would be absent).
 */
async function expectedProfile(page: Page): Promise<{ label: string; ext: string } | null> {
  return page.evaluate(() => {
    const probe = document.createElement('video');
    const order: Array<[string, string, string]> = [
      ['MP4 (H.264 + AAC)', 'mp4', 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'],
      ['WebM (VP9 + Opus)', 'webm', 'video/webm; codecs="vp9, opus"'],
      ['MP4 (H.264 + AAC)', 'mp4', 'video/mp4'],
      ['WebM (VP9 + Opus)', 'webm', 'video/webm'],
    ];
    for (const [label, ext, type] of order) {
      if (probe.canPlayType(type) !== '') return { label, ext };
    }
    return null;
  });
}

test.beforeAll(async () => {
  // The real conversion needs the pinned core copied into the demo public dir.
  const core = fileURLToPath(new URL('../../demo/public/ffmpeg-core/ffmpeg-core.wasm', import.meta.url));
  let present = false;
  try {
    present = statSync(core).size > 20_000_000;
  } catch {
    present = false;
  }
  test.skip(!present, 'self-hosted ffmpeg core not copied — run `npm run fixtures:ffmpeg-core` first');
});

test.describe('real ffmpeg.wasm conversion', () => {
  let requests: Array<{ method: string; url: string }>;

  test.beforeEach(async ({ page }) => {
    requests = [];
    page.on('request', (req) => requests.push({ method: req.method(), url: req.url() }));
    await page.goto('/');
  });

  test.afterEach(async ({}, testInfo) => {
    // Local media never leaves the device: no upload verbs anywhere in the
    // flow. Network requests must stay on the demo origin, with ONE carve-out
    // documented in demo/main.tsx: the demo playlist auto-advances into its
    // public TEST streams (Mux/Apple/Akamai/MDN) after playback ends — those
    // hosts are provenance-documented demo content, not conversion traffic.
    const base = testInfo.project.use.baseURL ?? 'http://localhost';
    const demoStreamHosts = [
      'https://test-streams.mux.dev/',
      'https://devstreaming-cdn.apple.com/',
      'https://dash.akamaized.net/',
      'https://interactive-examples.mdn.mozilla.net/',
    ];
    const uploads = requests.filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method));
    const external = requests.filter(
      (r) =>
        !r.url.replace(/^blob:/, '').startsWith(base) &&
        !demoStreamHosts.some((host) => r.url.startsWith(host)),
    );
    expect(uploads, 'conversion must never upload file data').toEqual([]);
    expect(external, 'requests must stay on the demo origin + documented demo streams').toEqual([]);
  });

  test('core init from self-hosted path, AVI converts to a playable output, honest profile probe', async ({ page }) => {
    test.setTimeout(240_000);

    const profile = await expectedProfile(page);
    test.skip(profile === null, 'this browser accepts neither conversion output profile');

    // 1. Core initialization from the self-hosted path (200 for the 30.7 MiB wasm).
    const wasmResponse = page.waitForResponse(
      (res) => res.url().includes(CORE_WASM_URL) && res.request().method() === 'GET',
    );

    await page.getByLabel('Add local media files').setInputFiles(AVI_FIXTURE);
    const entry = page.locator('.csw-playlist-item', { hasText: 'sample-avi.avi' });
    await expect(entry).toContainText('AVI');

    // 2. Conversion offer names the profile the BROWSER's own probe chose.
    const panel = page.locator('.csw-conversion');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(`Output: ${profile!.label}`);
    await expect(panel).toContainText(/runs entirely on your device/i);

    // 3. Real conversion run through the actual wasm core.
    await page.getByRole('button', { name: 'Convert and play' }).click();
    const wasm = await wasmResponse;
    expect(wasm.status(), 'self-hosted core must be served with HTTP 200').toBe(200);

    // 4. Output is added to the playlist as converted output and actually
    //    plays (the browser decodes the wasm-produced file).
    const converted = page.locator('.csw-playlist-item', { hasText: `sample-avi.${profile!.ext}` });
    await expect(converted).toBeVisible({ timeout: 120_000 });
    await expect(converted).toContainText(/converted output/i);

    const video = page.getByTestId('csw-video');
    await expect(video).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(async () => video.evaluate((el: HTMLVideoElement) => el.currentTime), {
        timeout: 15_000,
        intervals: [100, 250, 250],
      })
      .toBeGreaterThan(0.2);
    await expect(page.locator('.csw-overlay-error')).toHaveCount(0);
  });

  test('mid-run cancellation terminates the worker and the engine recovers', async ({ page }) => {
    test.setTimeout(240_000);

    // Longer input (60s, 1440 frames) generated at test time — gives a wide
    // cancellation window during a genuinely running conversion. Written to a
    // temp dir; NEVER committed. The run is intentionally NOT awaited to
    // completion (test 1 already proves end-to-end completion; this test
    // proves observable progress, termination, and recovery).
    let longAvi = '';
    try {
      const outDir = join(tmpdir(), 'csw-conversion-e2e');
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      longAvi = join(outDir, 'long-60s.avi');
      execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=60:size=320x180:rate=24',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=60',
        '-c:v', 'mpeg4', '-q:v', '6', '-c:a', 'libmp3lame', '-b:a', '48k',
        '-shortest', '-f', 'avi', longAvi,
      ], { timeout: 60_000 });
    } catch {
      test.skip(true, 'system ffmpeg CLI unavailable — cancellation fixture cannot be generated');
    }

    await page.getByLabel('Add local media files').setInputFiles(longAvi);
    const panel = page.locator('.csw-conversion');
    await expect(panel).toBeVisible();

    const profile = await expectedProfile(page);
    test.skip(profile === null, 'this browser accepts neither conversion output profile');

    // Start the run, let it make observable progress, then cancel mid-run.
    // force:true is required because the progress bar animates continuously
    // (Playwright's actionability stability check would never settle).
    await page.getByRole('button', { name: 'Convert and play' }).click();
    await expect(page.locator('.csw-conversion-progress')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () =>
        Number((await page.locator('.csw-conversion-progress').getAttribute('aria-valuenow').catch(() => '0')) ?? '0'),
        { timeout: 15_000, intervals: [200, 300, 300] },
      )
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Cancel', exact: true }).click({ force: true });

    // Typed cancellation surface; the converted OUTPUT never appears (the
    // input playlist entry legitimately stays).
    await expect(panel).toContainText('Conversion cancelled.', { timeout: 30_000 });
    await expect(page.locator('.csw-conversion-progress')).toHaveCount(0);
    await expect(page.locator('.csw-playlist-item', { hasText: `long-60s.${profile!.ext}` })).toHaveCount(0);

    // Recovery: the terminated worker is rebuilt lazily and a fresh run
    // STARTS (progress UI returns) — resource cleanup did not wedge the
    // engine. Then cancel again to end deterministically.
    await page.getByRole('button', { name: 'Convert and play' }).click();
    await expect(page.locator('.csw-conversion-progress')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click({ force: true });
    await expect(panel).toContainText('Conversion cancelled.', { timeout: 30_000 });
    await expect(page.locator('.csw-overlay-error')).toHaveCount(0);
  });
});
