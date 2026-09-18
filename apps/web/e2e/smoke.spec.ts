import { expect, test } from '@playwright/test';

test('home page renders the brand, headline and Bangla line', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle(/DPOST/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Say what you want to post');
  await expect(page.locator('[lang="bn"]')).toHaveText('আপনি বলুন কী চান, বাকিটা আমরা করবো।');
  await expect(page.getByRole('listitem')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('home page has no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('health endpoint reports ok', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});
