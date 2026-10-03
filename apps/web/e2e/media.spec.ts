import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndSignIn, skipOnboarding } from './helpers';

/**
 * The media library end to end: a real file goes up through the real
 * endpoint, is re-encoded and stored, and comes back in the grid and in the
 * composer.
 */

/** A small valid PNG, so the upload is a real image rather than a fixture path. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAA' +
  'UElEQVR42u3PQQkAAAgEsItjRCMaywi+hcEKLF3zWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE' +
  'BAQEBAQEBAQEBAQEBAQEBAQEBAQErsACAAWBSwvkIy0AAAAASUVORK5CYII=';

async function uploadImage(page: Page, name = 'kitchen.png'): Promise<void> {
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
}

test.beforeEach(async ({ context, page }) => {
  const n = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
  await signUpAndSignIn(page);
  await skipOnboarding(page);
});

test('an uploaded image appears in the library', async ({ page }) => {
  await page.goto('/media');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Media');
  await expect(page.getByText('No images yet.')).toBeVisible();

  await uploadImage(page);
  await expect(page.getByText('kitchen.png uploaded')).toBeVisible();
  await expect(page.getByText('1 image')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Images' }).locator('img').first()).toBeVisible();
});

test('a file that is not an image is refused', async ({ page }) => {
  await page.goto('/media');
  await page.locator('input[type=file]').setInputFiles({
    name: 'holiday.jpg',
    mimeType: 'image/jpeg',
    // A Windows executable wearing a photo's name and declared type.
    buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 0x90)]),
  });

  await expect(page.getByText(/not an image we can use/i)).toBeVisible();
  await expect(page.getByText('No images yet.')).toBeVisible();
});

test('a description can be added, and the image deleted', async ({ page }) => {
  await page.goto('/media');
  await uploadImage(page);
  await page.getByRole('list', { name: 'Images' }).locator('img').first().click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Describe this image').fill('A plate of kacchi biryani');
  await sheet.getByLabel('Describe this image').blur();
  await expect(page.getByText('Description saved')).toBeVisible();

  await sheet.getByRole('button', { name: 'Delete image' }).click();
  await expect(page.getByText('Image deleted')).toBeVisible();
  await expect(page.getByText('No images yet.')).toBeVisible();
});

test('an image can be attached to a post and shows in the preview', async ({ page }) => {
  await page.goto('/media');
  await uploadImage(page, 'dish.png');
  await expect(page.getByText('1 image')).toBeVisible();

  await page.goto('/create');
  await page.getByLabel('Post text').fill('Fresh batch out of the kitchen this morning.');
  await page.getByRole('button', { name: 'Add images' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('list', { name: 'Images' }).locator('img').first().click();
  await dialog.getByRole('button', { name: /Use 1 image/ }).click();

  // The preview shows what will actually be posted.
  await expect(page.getByRole('figure').locator('img')).toBeVisible();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();

  const posts = await page.request.get('/api/v1/posts');
  const { posts: list } = (await posts.json()) as { posts: { id: string }[] };
  const media = await page.request.get(`/api/v1/posts/${list[0]!.id}/media`);
  expect(((await media.json()) as unknown[]).length).toBe(1);
});

test('the AI can make an image, and says it is a placeholder', async ({ page }) => {
  await page.goto('/create');
  await page.getByLabel('Post text').fill('Fresh kacchi biryani today, order before noon.');
  await page.getByRole('button', { name: 'Make an image' }).click();

  await expect(page.getByText('Image added to your library')).toBeVisible({ timeout: 20_000 });
  // No image provider is configured, and the interface says so plainly.
  await expect(page.getByText(/placeholder, not a generated image/i)).toBeVisible();
  await expect(page.getByRole('figure').locator('img')).toBeVisible();

  await page.goto('/media');
  // Scoped to the grid: "AI Assistant" in the navigation also contains "AI",
  // and on a phone that link lives inside the closed "More" sheet.
  await expect(
    page.getByRole('list', { name: 'Images' }).getByText('AI', { exact: true }),
  ).toBeVisible();
});

test('one workspace cannot fetch another workspace’s image', async ({ page, browser }) => {
  await page.goto('/media');
  await uploadImage(page, 'private.png');
  await expect(page.getByText('1 image')).toBeVisible();

  const list = await page.request.get('/api/v1/media');
  const { media } = (await list.json()) as { media: { id: string; url: string }[] };
  const url = media[0]!.url;
  expect(url).toBeTruthy();

  // A second account, with its own workspace, holding someone else's key.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUpAndSignIn(otherPage);
  const response = await otherPage.request.get(url);
  expect(response.status()).toBe(404);
  await other.close();
});

test('the media library is accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/media');
  await uploadImage(page);
  await expect(page.getByText('1 image')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );
  expect(serious.map((violation) => violation.id)).toEqual([]);
});
