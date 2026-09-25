import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signUpAndSignIn } from './helpers';

/** Every section, with the heading it must show. */
const SECTIONS = [
  { path: '/home', heading: 'Welcome, Nusrat' },
  { path: '/assistant', heading: 'AI Assistant' },
  { path: '/create', heading: 'Create post' },
  { path: '/calendar', heading: 'Calendar' },
  { path: '/content', heading: 'Content' },
  { path: '/media', heading: 'Media' },
  { path: '/brand', heading: 'Brand Brain' },
  { path: '/analytics', heading: 'Analytics' },
  { path: '/channels', heading: 'Channels' },
  { path: '/notifications', heading: 'Notifications' },
  { path: '/settings', heading: 'Settings' },
] as const;

test.beforeEach(async ({ context, page }) => {
  const n = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
  await signUpAndSignIn(page);
});

test('every section loads, with no error and no sideways scrolling', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));

  for (const { path, heading } of SECTIONS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }

  expect(errors).toEqual([]);
});

test('navigation suits the screen size', async ({ page, isMobile }, testInfo) => {
  await page.goto('/home');
  const sidebar = page.locator('aside nav[aria-label="Main"]');
  const tabBar = page.locator('nav[aria-label="Main"]').last();

  if (testInfo.project.name === 'desktop') {
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('link', { name: 'Brand Brain' })).toBeVisible();
  } else {
    // Tablet and phone: the sidebar is hidden and the tab bar takes over.
    await expect(sidebar).toBeHidden();
    await expect(tabBar.getByRole('link', { name: 'Calendar' })).toBeVisible();
    expect(isMobile || testInfo.project.name === 'tablet').toBeTruthy();
  }
});

test('the current section is marked in the navigation', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.locator('a[aria-current="page"]').first()).toContainText('Calendar');
});

test('the plan and usage are shown', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'shown in the sidebar and the More sheet');
  await page.goto('/home');
  await expect(page.getByText('Free plan')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-label', /0 of 30 AI posts/);
});

test('the theme can be switched to dark and sticks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the menu lives in the sidebar on desktop');
  await page.goto('/home');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('the shell has no serious accessibility violations', async ({ page }) => {
  for (const path of ['/home', '/calendar', '/settings']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(
      serious.map((violation) => `${path}: ${violation.id} (${violation.nodes.length})`),
    ).toEqual([]);
  }
});
