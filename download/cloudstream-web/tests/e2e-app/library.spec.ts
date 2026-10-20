/**
 * E2E: local library (favorites + recents, localStorage only) and the
 * providers status surface (health + kill-switch display, health API).
 */

import { expect, test } from '@playwright/test';

function titleUrlFor(slug: string): string {
  const token = Buffer.from(`https://fixtures.local/title/${slug}`).toString('base64url');
  return `/title/mock-fixtures/${token}`;
}

test('library starts empty and points at the catalog', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByTestId('library-tab-favorites')).toContainText('Favorites (0)');
  await expect(page.getByTestId('library-empty-favorites')).toBeVisible();
  await page.getByTestId('library-tab-recents').click();
  await expect(page.getByTestId('library-empty-recents')).toBeVisible();
});

test('favoriting on a title page persists in the library', async ({ page }) => {
  await page.goto(titleUrlFor('glasswing'));
  await page.getByTestId('favorite-button').click();
  await expect(page.getByTestId('favorite-button')).toContainText('In your library');

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByTestId('library-tab-favorites')).toContainText('Favorites (1)');
  await expect(page.getByTestId('library-favorites')).toContainText('Glasswing');

  // Persisted locally (localStorage), survives reload.
  await page.reload();
  await expect(page.getByTestId('library-tab-favorites')).toContainText('Favorites (1)');
});

test('watching a title records a recent entry with resume', async ({ page }) => {
  await page.goto(titleUrlFor('aurora-drift'));
  await page.getByRole('link', { name: 'Play now' }).click();
  await expect(page.getByTestId('csw-video')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Library' }).click();
  await page.getByTestId('library-tab-recents').click();
  const recents = page.getByTestId('library-recents');
  await expect(recents).toContainText('Aurora Drift');
  await expect(recents.getByRole('link', { name: /Resume Aurora Drift/ })).toBeVisible();

  // Removal works.
  await recents.getByRole('button', { name: /Remove Aurora Drift from recents/ }).click();
  await expect(page.getByTestId('library-empty-recents')).toBeVisible();
});

test('the subtitle-language preference persists and applies on the watch page', async ({ page }) => {
  await page.goto('/library');
  await page.getByTestId('pref-subtitle-language').selectOption('en');
  const stored = await page.evaluate(() => window.localStorage.getItem('csw.prefs.v1'));
  expect(JSON.parse(stored ?? '{}')).toEqual({ preferredSubtitleLanguage: 'en' });

  await page.goto(titleUrlFor('harbor-lights'));
  await page.getByTestId('episode-link').first().click();
  await expect(page.getByTestId('csw-video')).toBeVisible();
  // The preference auto-selected the matching provider subtitle track.
  const activeRadio = page.getByRole('radio', { name: /en \(sample-en\.vtt\)/ });
  await expect(activeRadio).toBeChecked();
});

test('providers page shows health, kill-switch state, and the health API contract', async ({ page }) => {
  await page.goto('/providers');
  await expect(page.getByRole('region', { name: 'Provider Mock Fixtures' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Provider Mock Fixtures' })).toContainText(/Idle|Healthy/);
  await expect(page.getByRole('region', { name: 'Provider Mock Fixtures' })).toContainText('Enabled');

  const health = await page.request.get('/api/providers/health');
  expect(health.status()).toBe(200);
  const body = (await health.json()) as { generatedAt: string; providers: Array<{ name: string; status: string; enabled: boolean }> };
  expect(Array.isArray(body.providers)).toBe(true);
  expect(body.providers.some((entry) => entry.name === 'Mock Fixtures')).toBe(true);
});

test('the search API rejects malformed input with 400', async ({ page }) => {
  const missing = await page.request.get('/api/search?q=%20');
  expect(missing.status()).toBe(400);
  const badPage = await page.request.get('/api/search?q=aurora&page=x');
  expect(badPage.status()).toBe(400);
});

test('an unresolvable title token renders the 404 page', async ({ page }) => {
  const badToken = Buffer.from('https://fixtures.local/title/does-not-exist').toString('base64url');
  await page.goto(`/title/mock-fixtures/${badToken}`);
  await expect(page.getByTestId('not-found')).toBeVisible();
});
