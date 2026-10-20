import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the PHASE 5 APP e2e specs (tests/e2e-app/*.spec.ts).
 * The webServer boots the PRODUCTION build (`next start` — run `npm run
 * build:app` first); mock-provider data is deterministic and media comes
 * from local fixtures, so these tests never depend on third-party services
 * (the one remote-stream test self-skips when the network is unavailable).
 *
 * `--autoplay-policy=no-user-gesture-required` keeps autoplay deterministic:
 * real flows reach the watch page through SPA navigation (user activation is
 * preserved), but direct deep-links have no gesture.
 */
export default defineConfig({
  testDir: 'tests/e2e-app',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
