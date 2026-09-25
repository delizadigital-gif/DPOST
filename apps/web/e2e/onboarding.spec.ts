import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndSignIn } from './helpers';

/**
 * The setup journey: a new account answers a few questions and the answers
 * show up in the Brand Brain, tagged with where they came from — including
 * in the exact text the AI will be given.
 */

/** Answers only the required question and finishes, waiting for each step. */
async function completeSetup(page: Page, name: string) {
  await page.goto('/welcome/business');
  await page.getByLabel('Business name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome\/audience$/);
  await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page).toHaveURL(/\/welcome\/voice$/);
  await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page).toHaveURL(/\/welcome\/connect$/);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.beforeEach(async ({ context, page }) => {
  const n = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
  await signUpAndSignIn(page);
});

test('a new account is taken through setup and its answers reach the Brand Brain', async ({
  page,
}) => {
  // Any page in the app sends a new account to setup.
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/welcome\/business$/);

  // Step 1 — business
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us about your business');
  await page.getByLabel('Business name').fill("Rahim's Kitchen");
  await page.getByText('Shop', { exact: true }).click();
  await page.getByLabel('Industry').fill('Home-made food');
  await page
    .getByLabel('What do you do, in a sentence or two?')
    .fill('Home-cooked Bangladeshi meals delivered across Dhaka.');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2 — customers and products
  await expect(page).toHaveURL(/\/welcome\/audience$/);
  await page.getByLabel('Who buys from you?').fill('Working families in Dhaka');
  const products = page.getByRole('group', { name: 'What do you sell?' }).getByRole('textbox');
  await products.fill('Biryani');
  await products.press('Enter');
  await products.fill('Cakes');
  await products.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Biryani' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3 — voice and goals
  await expect(page).toHaveURL(/\/welcome\/voice$/);
  await page.getByText('Friendly', { exact: true }).click();
  await page.getByText('Banglish', { exact: true }).click();
  await page.getByText('Sell more', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4 — connect: honest about what isn't built yet
  await expect(page).toHaveURL(/\/welcome\/connect$/);
  await expect(page.getByText('Facebook publishing is not ready yet')).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();

  // Into the app, and setup is not asked for again.
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/calendar$/);

  // The answers are in the Brand Brain, tagged as coming from setup.
  await page.goto('/brand');
  const business = page.getByRole('region', { name: 'Business' });
  await expect(business.getByText("Rahim's Kitchen")).toBeVisible();
  await expect(business.getByText('Home-made food')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Products & services' }).getByText('Biryani'),
  ).toBeVisible();
  await expect(business.getByText('From setup').first()).toBeVisible();

  // And in the text the AI is actually given.
  await page.getByText('What the AI reads').click();
  const card = page.locator('pre');
  await expect(card).toContainText("# Brand: Rahim's Kitchen");
  await expect(card).toContainText('Sells: Biryani, Cakes');
  await expect(card).toContainText('friendly and warm');
});

test('setup can be skipped, and picked up again later', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page).toHaveURL(/\/welcome\/business$/);

  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Skipping doesn't pretend anything was learned.
  await page.goto('/brand');
  await expect(page.getByText('Nothing learned yet')).toBeVisible();

  // The wizard is still reachable from the Brand Brain.
  await page.getByRole('link', { name: 'Start setup' }).click();
  await expect(page).toHaveURL(/\/welcome\/business$/);
});

test('an abandoned setup resumes where it stopped', async ({ page }) => {
  await page.goto('/welcome/business');
  await page.getByLabel('Business name').fill('Nusrat Crafts');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome\/audience$/);

  // Coming back later: not the first question again, and not skipped past.
  await page.goto('/welcome');
  await expect(page).toHaveURL(/\/welcome\/audience$/);

  // What was answered is still in the form.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByLabel('Business name')).toHaveValue('Nusrat Crafts');
});

test('the business name is required, everything else can be skipped', async ({ page }) => {
  await page.goto('/welcome/business');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Please enter the name people know you by')).toBeVisible();
  await expect(page).toHaveURL(/\/welcome\/business$/);

  await page.getByLabel('Business name').fill('Shop');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome\/audience$/);

  await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page).toHaveURL(/\/welcome\/voice$/);
});

test('the Brand Brain edits what setup captured', async ({ page }) => {
  await completeSetup(page, 'Nusrat Crafts');

  await page.goto('/brand');
  await page.getByRole('button', { name: 'Edit Business' }).click();
  const name = page.getByRole('dialog').getByLabel('Name');
  await name.fill('Nusrat Handicrafts');
  await page.getByRole('button', { name: 'Save' }).click();

  const business = page.getByRole('region', { name: 'Business' });
  await expect(business.getByText('Nusrat Handicrafts')).toBeVisible();
  // An edit by hand is tagged as the user's, which analysis may never overwrite.
  await expect(business.getByText('You', { exact: true })).toBeVisible();

  // Memories: add one, see it, delete it.
  const memories = page.getByRole('region', { name: 'Memories' });
  await page.getByLabel('Something to remember').fill('Never call our work cheap');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(memories.getByText('Never call our work cheap')).toBeVisible();

  await page.getByRole('button', { name: /^Delete memory/ }).click();
  await expect(page.getByText('Nothing remembered yet')).toBeVisible();
});

test('setup and the Brand Brain are accessible', async ({ page }) => {
  await page.goto('/welcome/business');
  const wizard = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(wizard.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);

  await completeSetup(page, 'Shop');

  await page.goto('/brand');
  const brand = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(brand.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);
});
