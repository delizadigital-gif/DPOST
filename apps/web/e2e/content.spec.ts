import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndSignIn, skipOnboarding } from './helpers';

/**
 * Managing what has been written: the list, the calendar, and the actions
 * that act on real posts — approve, edit (which keeps a version), delete
 * (which can be undone) and rewrite.
 */

async function writePost(page: Page, body: string, plannedFor?: string): Promise<{ id: string }> {
  const response = await page.request.post('/api/v1/posts', {
    data: { body, hashtags: ['homemade'], plannedFor: plannedFor ?? null },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { id: string };
}

test.beforeEach(async ({ context, page }) => {
  const n = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
  await signUpAndSignIn(page);
  await skipOnboarding(page);
});

test('the list shows what has been written, and filters it', async ({ page }) => {
  await writePost(page, 'Biryani on Friday, order before noon.');
  await writePost(page, 'How to keep home-cooked food fresh.');

  await page.goto('/content');
  await expect(page.getByText('Biryani on Friday')).toBeVisible();
  await expect(page.getByText('How to keep home-cooked food')).toBeVisible();
  await expect(page.getByText('2 posts')).toBeVisible();

  await page.getByLabel('Search posts').fill('biryani');
  await expect(page.getByText('How to keep home-cooked food')).toBeHidden();
  await expect(page.getByText('Biryani on Friday')).toBeVisible();

  await page.getByLabel('Search posts').fill('');
  await page.getByRole('button', { name: 'Approved' }).click();
  await expect(page.getByText('Nothing matches those filters.')).toBeVisible();
});

test('several posts can be approved at once', async ({ page }) => {
  await writePost(page, 'First post to approve.');
  await writePost(page, 'Second post to approve.');

  await page.goto('/content');
  await page.getByLabel('Select all on this page').check();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  await expect(page.getByText('2 posts approved')).toBeVisible();
  await expect(page.getByText('Approved').first()).toBeVisible();
});

test('a deleted post can be brought back', async ({ page }) => {
  await writePost(page, 'Deleted by mistake.');

  await page.goto('/content');
  await page.getByText('Deleted by mistake.').click();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Post deleted')).toBeVisible();
  await expect(page.getByText('Deleted by mistake.')).toBeHidden();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Post restored')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Deleted by mistake.')).toBeVisible();
});

test('editing an approved post sends it back for review, and keeps the old version', async ({
  page,
}) => {
  const post = await writePost(page, 'The original wording of this post.');
  await page.request.post(`/api/v1/posts/${post.id}/approve`);

  await page.goto('/content');
  await page.getByText('The original wording').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Approved')).toBeVisible();

  await sheet.getByRole('button', { name: 'Edit' }).click();
  await sheet.getByLabel('Post text').fill('A second attempt at the wording.');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  // Approval was of a particular text, so changing it withdraws the approval.
  await expect(sheet.getByText('Needs review')).toBeVisible();

  await sheet.getByRole('button', { name: 'History' }).click();
  await expect(sheet.getByText('The original wording of this post.')).toBeVisible();

  await sheet.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Earlier version restored')).toBeVisible();
  await page.reload();
  await expect(page.getByText('The original wording')).toBeVisible();
});

test('a post planned for late evening in Dhaka stays on that day', async ({ page }) => {
  // 23:30 on the 5th in Dhaka is 17:30 UTC the same day; 03:00 on the 6th is
  // 21:00 UTC on the 5th. Both must land on their local day.
  await writePost(page, 'Late on the fifth, Dhaka time.', '2026-10-05T17:30:00.000Z');
  await writePost(page, 'Early on the sixth, Dhaka time.', '2026-10-05T21:00:00.000Z');

  await page.goto('/calendar?view=month&on=2026-10-05');

  const fifth = page.locator('[data-day="2026-10-05"]');
  const sixth = page.locator('[data-day="2026-10-06"]');
  await expect(fifth).toContainText('Late on the fifth');
  await expect(fifth).toContainText('23:30');
  await expect(sixth).toContainText('Early on the sixth');
  await expect(sixth).toContainText('03:00');
});

test('the calendar moves between periods and views', async ({ page }) => {
  await page.goto('/calendar?view=month&on=2026-10-15');
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();

  await page.getByLabel('Next period').click();
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();

  await page.getByRole('link', { name: 'Week' }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.locator('[data-day]')).toHaveCount(7);

  await page.getByRole('link', { name: 'List' }).click();
  await expect(page).toHaveURL(/view=list/);
});

test('posts with no date are offered separately', async ({ page }) => {
  await writePost(page, 'Written but not planned yet.');

  await page.goto('/calendar');
  await expect(page.getByText('1 post with no date')).toBeVisible();
  await expect(page.getByText('Written but not planned yet.')).toBeVisible();
});

test('generate, approve, and find it on the calendar', async ({ page }) => {
  // The journey Phase 7 exists for. The AI here is the stub (AI_PROVIDER=stub).
  await page.goto('/create');
  await page.getByLabel('How many').fill('1');
  await page.getByRole('button', { name: 'Write with AI' }).click();
  await expect(page.getByText(/Test mode/)).toBeVisible({ timeout: 20_000 });

  const written = await page.getByLabel('Post text').inputValue();
  expect(written.length).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();

  // Approve it from the list.
  await page.goto('/content');
  const firstWords = written.split('\n')[0]!.slice(0, 30);
  await page.getByText(firstWords).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved').first()).toBeVisible();

  // Give it a date through the API (scheduling arrives with publishing), then
  // check the calendar shows it on that day.
  const posts = await (await page.request.get('/api/v1/posts')).json();
  const id = posts.posts[0].id as string;
  await page.request.patch(`/api/v1/posts/${id}`, {
    data: { plannedFor: '2026-12-10T08:00:00.000Z' },
  });

  await page.goto('/calendar?view=month&on=2026-12-10');
  await expect(page.locator('[data-day="2026-12-10"]')).toContainText('14:00');
});

test('the content list and calendar are accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await writePost(page, 'A post to look at.', '2026-10-05T17:30:00.000Z');

  for (const path of ['/content', '/calendar?view=month&on=2026-10-05']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(serious.map((violation) => `${path}: ${violation.id}`)).toEqual([]);
  }
});
