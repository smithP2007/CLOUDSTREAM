import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the DEV-ONLY demo page e2e specs (tests/e2e/*.spec.ts).
 * The webServer boots the Vite demo (`npm run demo`); fixtures and the page
 * are local — no third-party service is contacted by these tests.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // The copy script stages the gitignored demo assets (fixtures + ffmpeg
    // core + ffmpeg-lib wrapper) before the dev server boots.
    command: 'node scripts/copy-ffmpeg-core.mjs && node scripts/copy-fixtures-web.mjs && npm run demo',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
