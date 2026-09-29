import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signUpAndSignIn, skipOnboarding } from './helpers';

/**
 * The composer, end to end. Locally and in CI the AI provider is the stub
 * (`AI_PROVIDER=stub`), so this exercises the real route, the real quality
 * gate, real metering and the real saving path — everything except the
 * sentence generation itself.
 */

test.beforeEach(async ({ context, page }) => {
  const n = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
  await signUpAndSignIn(page);
  await skipOnboarding(page);
});

test('write a post by hand and save it as a draft', async ({ page }) => {
  await page.goto('/create');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create post');

  await page.getByLabel('Post text').fill('Fresh batch out of the kitchen this morning.');
  const hashtags = page.getByRole('group', { name: 'Hashtags' }).getByRole('textbox');
  await hashtags.fill('homemade');
  await hashtags.press('Enter');
  await page.getByLabel('Call to action').fill('Inbox us to order');

  // The preview shows what will actually be posted.
  const preview = page.getByRole('figure');
  await expect(preview).toContainText('Fresh batch out of the kitchen');
  await expect(preview).toContainText('#homemade');

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();

  const posts = await page.request.get('/api/v1/posts');
  expect(posts.ok()).toBe(true);
  const body = (await posts.json()) as { body: string; hashtags: string[] }[];
  expect(body[0]).toMatchObject({
    body: 'Fresh batch out of the kitchen this morning.',
    hashtags: ['homemade'],
  });
});

test('generate drafts, pick one, edit it and save it', async ({ page }) => {
  await page.goto('/create');

  await page.getByLabel('What should the posts be about?').fill('something for this weekend');
  await page.getByRole('button', { name: 'Write with AI' }).click();

  // The stub is clearly labelled as not being a model.
  await expect(page.getByText(/Test mode/)).toBeVisible({ timeout: 20_000 });

  const drafts = page.getByRole('button', { name: /Fresh batch|Aaj shokale|আজ সকালে/ });
  await expect(drafts.first()).toBeVisible();

  const editor = page.getByLabel('Post text');
  await expect(editor).not.toBeEmpty();
  await editor.fill('Our own words, after reading what the AI suggested.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();

  const posts = await page.request.get('/api/v1/posts');
  const body = (await posts.json()) as { body: string; source: string }[];
  expect(body[0]?.body).toContain('Our own words');
  expect(body[0]?.source).toBe('ai_single');
});

test('the allowance goes down as posts are written', async ({ page }) => {
  await page.goto('/create');
  await expect(page.getByText('30 of 30 AI posts left this month')).toBeVisible();

  await page.getByLabel('How many').fill('2');
  await page.getByRole('button', { name: 'Write with AI' }).click();
  await expect(page.getByText('28 of 30 AI posts left this month')).toBeVisible({
    timeout: 20_000,
  });
});

test('an empty post cannot be saved', async ({ page }) => {
  await page.goto('/create');
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
});

test('the composer has no serious accessibility violations', async ({ page }) => {
  await page.goto('/create');
  await page.getByLabel('Post text').fill('Fresh batch this morning.');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);
});
