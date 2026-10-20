/**
 * E2E: the core navigation happy path (roadmap Phase 5 exit criterion):
 * home → search → title details → watch, with REAL playback of the local
 * MP4 fixture at the end of the chain.
 */

import { expect, test } from '@playwright/test';

test('home renders hero and catalog rows', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Aurora Drift/);
  await expect(page.getByRole('region', { name: 'Featured fixtures' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Series & anime' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Authorized live demo streams' })).toBeVisible();
  // Poster cards render with local SVG posters.
  const firstCard = page.getByTestId('poster-card').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('img')).toHaveAttribute('src', /\/posters\/.+\.svg/);
});

test('home → search → details → watch plays the MP4 fixture', async ({ page }) => {
  await page.goto('/');

  // home → search (nav link)
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByTestId('search-idle')).toBeVisible();

  // search → results (deterministic fixture query)
  await page.getByTestId('search-input').fill('aurora');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('search-results')).toBeVisible();

  // results → details
  await page.getByTestId('poster-card').first().click();
  await expect(page).toHaveURL(/\/title\/mock-fixtures\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Aurora Drift' })).toBeVisible();
  await expect(page.getByText('Pilot Voss')).toBeVisible(); // cast entry

  // details → watch
  await page.getByRole('link', { name: 'Play now' }).click();
  await expect(page).toHaveURL(/\/watch\/mock-fixtures\//);
  await expect(page.getByTestId('csw-video')).toBeVisible();

  // REAL playback: the native engine plays the same-origin MP4 fixture.
  await expect
    .poll(async () => page.getByTestId('csw-video').evaluate((el: HTMLVideoElement) => el.currentTime), {
      timeout: 10_000,
      intervals: [100, 250, 250, 500],
    })
    .toBeGreaterThan(0.2);
  await expect(page.locator('.csw-overlay-error')).toHaveCount(0);
  // Sources panel: the provider link list was resolved through the pipeline.
  await expect(page.getByRole('region', { name: 'Available sources' })).toContainText(/3 sources/);
});

test('series title shows episode navigation and the watch page marks the active episode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: 'Series & anime' }).getByTestId('poster-card').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Northgate' })).toBeVisible();
  const episodeLinks = page.getByTestId('episode-link');
  expect(await episodeLinks.count()).toBe(6); // 2 seasons × 3 episodes
  await episodeLinks.first().click();

  await expect(page).toHaveURL(/\/watch\/mock-fixtures\//);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Northgate — S1·E1/);
  const activeItem = page.locator('.episode-item[aria-current="true"]');
  await expect(activeItem).toHaveCount(1);
  await expect(activeItem).toContainText('S1·E1');
});
