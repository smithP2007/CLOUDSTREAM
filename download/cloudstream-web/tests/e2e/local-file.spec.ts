/**
 * E2E: LOCAL-FILE FLOW (deterministic — no third-party service).
 *
 * A user opens a local file through the picker; the player sniffs the
 * container, selects the native engine, and plays it (autoplay in the
 * headless browser; the transport buttons are exercised mid-playback).
 * The WebM fixture is used because the Playwright Chromium build lacks
 * proprietary codecs (H.264/AAC) but ships VP9/Opus — exactly the
 * runtime-detection behavior this milestone promises. The assertions run
 * INSIDE the 2-second fixture playback window (the playlist auto-advances
 * into provider demo entries afterwards, by design).
 *
 * No file content ever leaves the browser.
 */

import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../../demo/public/fixtures/sample-webm.webm', import.meta.url));

test('local file is sniffed, playlisted, and plays in the browser', async ({ page }) => {
  await page.goto('/');

  const picker = page.getByLabel('Add local media files');
  await picker.setInputFiles(FIXTURE);

  // Playlist entry with the SNIFFED badge (extension-independent proof).
  const entry = page.locator('.csw-playlist-item', { hasText: 'sample-webm.webm' });
  await expect(entry).toContainText('WEBM');

  // The video element is fed a local object URL (never an upload).
  await expect(page.getByTestId('csw-video')).toHaveAttribute('src', /^blob:/);

  // Native engine decision is surfaced transparently.
  await expect(page.locator('.csw-decision')).toContainText(/Native playback/i);

  // Playback actually advances (VP9/Opus decode in Chromium) — asserted
  // inside the fixture's 2s window.
  await expect
    .poll(async () =>
      page.getByTestId('csw-video').evaluate((el: HTMLVideoElement) => el.currentTime),
      { timeout: 5_000, intervals: [100, 250, 250] },
    )
    .toBeGreaterThan(0.2);

  // Transport controls work mid-playback: pause stops the clock, play resumes.
  const video = page.getByTestId('csw-video');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', true);
  const frozen = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  await page.waitForTimeout(400);
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(frozen);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', false);

  // No error surface during healthy local playback.
  await expect(page.locator('.csw-overlay-error')).toHaveCount(0);
});
