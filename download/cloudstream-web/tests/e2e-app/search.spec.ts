/**
 * E2E: search UI states — idle, loading, results, empty, error (injected),
 * and deterministic pagination across the fixture catalog.
 */

import { expect, test } from '@playwright/test';

test('idle state points the user at the catalog', async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByTestId('search-idle')).toBeVisible();
});

test('a query shows results and the URL carries q/page', async ({ page }) => {
  await page.goto('/search');
  await page.getByTestId('search-input').fill('documentary');
  await page.getByTestId('search-submit').click();
  const results = page.getByTestId('search-results');
  await expect(results).toBeVisible();
  // 'documentary' matches the two documentary fixtures by tag.
  await expect(page.getByTestId('poster-card')).toHaveCount(2);
  await expect(page).toHaveURL(/\/search\?q=documentary$/);
});

test('an unknown query shows the empty state', async ({ page }) => {
  await page.goto('/search');
  await page.getByTestId('search-input').fill('zzzznothing');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('search-empty')).toBeVisible();
  await expect(page.getByTestId('search-results')).toHaveCount(0);
});

test('pagination walks pages forward and back deterministically', async ({ page }) => {
  await page.goto('/search');
  // The 'fixture' tag covers 11 titles → two pages of 6.
  await page.getByTestId('search-input').fill('fixture');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('poster-card')).toHaveCount(6);
  await expect(page.getByTestId('search-prev')).toBeDisabled();

  await page.getByTestId('search-next').click();
  await expect(page).toHaveURL(/page=2$/);
  await expect(page.getByTestId('poster-card')).toHaveCount(5);
  await expect(page.getByTestId('search-next')).toBeDisabled();

  await page.getByTestId('search-prev').click();
  await expect(page.getByTestId('poster-card')).toHaveCount(6);
  await expect(page).toHaveURL(/\/search\?q=fixture$/);
});

test('a failing search API surfaces the typed error with retry', async ({ page }) => {
  await page.route('**/api/search?**', (route) =>
    route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { kind: 'provider-failure', message: 'The provider returned no home rows for this page.' } }) }),
  );
  await page.goto('/search');
  await page.getByTestId('search-input').fill('aurora');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('search-error')).toBeVisible();
  await expect(page.getByTestId('search-error')).toContainText('Try again');
});
