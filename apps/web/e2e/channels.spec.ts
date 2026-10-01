import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signUpAndSignIn, skipOnboarding } from './helpers';

/**
 * What can be checked without a Meta app: the honest states.
 *
 * Connecting a real Page needs Meta credentials and a reviewed app, so these
 * tests cover what a user sees before that — including the limits DPOST has
 * to be straight about — plus the endpoints that must refuse anything
 * unsigned.
 */

test.beforeEach(async ({ context, page }) => {
  const n = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
  await signUpAndSignIn(page);
  await skipOnboarding(page);
});

test('the channels page is honest about what Facebook allows', async ({ page }) => {
  await page.goto('/channels');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Channels');

  await expect(page.getByText('No channels connected')).toBeVisible();
  await expect(page.getByText(/only lets apps post to Pages/)).toBeVisible();
  await expect(page.getByText(/Groups are not available/)).toBeVisible();
  await expect(page.getByText(/until Meta has reviewed DPOST/i)).toBeVisible();
});

test('it says plainly when connecting is not set up on this server', async ({ page }) => {
  // No META_APP_ID in test or CI, so the button must not be offered.
  await page.goto('/channels');
  await expect(page.getByText(/isn't set up on this server yet/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect a Facebook Page' })).toHaveCount(0);
});

test('the composer and sheet do not pretend a post can be published yet', async ({ page }) => {
  const response = await page.request.post('/api/v1/posts', {
    data: { body: 'A post with nowhere to go yet.', hashtags: [] },
  });
  expect(response.ok()).toBe(true);

  await page.goto('/content');
  await page.getByText('A post with nowhere to go yet.').click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('No Facebook Page is connected yet.')).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Connect one' })).toBeVisible();
  // No schedule button, because there is nowhere to schedule to.
  await expect(sheet.getByRole('button', { name: 'Schedule' })).toHaveCount(0);
});

test('publishing needs a confirmed email address first', async ({ page }) => {
  // Anything that reaches outside DPOST — connecting a Page, publishing —
  // waits for a confirmed email. It is what keeps throwaway accounts away
  // from our Meta app's standing, so the check comes before everything else.
  const created = await page.request.post('/api/v1/posts', {
    data: { body: 'Trying to schedule this.', hashtags: [] },
  });
  const post = (await created.json()) as { id: string };
  await page.request.post(`/api/v1/posts/${post.id}/approve`);

  const response = await page.request.post(`/api/v1/posts/${post.id}/schedule`, {
    data: {
      channelId: '0199e4e0-0000-7000-8000-000000000000',
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });

  expect(response.status()).toBe(403);
  const body = (await response.json()) as { error: { message: string; details?: unknown } };
  expect(body.error.message).toMatch(/confirm your email/i);
});

test("Meta's callbacks ignore anything unsigned", async ({ page }) => {
  // Public URLs that delete data: an unsigned request must change nothing,
  // and must not reveal whether a Facebook id is known to us.
  for (const path of ['/api/webhooks/meta/deauthorize', '/api/webhooks/meta/data-deletion']) {
    const response = await page.request.post(path, {
      form: { signed_request: 'forged.payload' },
    });
    expect(response.status(), path).toBe(200);
  }

  const deletion = await page.request.post('/api/webhooks/meta/data-deletion', {
    form: { signed_request: 'forged.payload' },
  });
  const body = (await deletion.json()) as { confirmation_code: string };
  expect(body.confirmation_code).toBe('not-configured');
});

test('the channels page is accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/channels');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );
  expect(serious.map((violation) => violation.id)).toEqual([]);
});
