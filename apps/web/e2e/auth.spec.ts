import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { waitForEmailLink } from './mailpit';

const PASSWORD = 'saree shop 2026';

// Each test acts as its own visitor, so per-IP rate limits (which apply to
// every run from this machine) don't make repeated runs fail.
test.beforeEach(async ({ context }) => {
  const n = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
});

test('signed-out visitors are sent to log in, and back afterwards', async ({ page }) => {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login\?next=%2Fhome/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
});

test('sign up, confirm email, sign out and log back in', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.test`;

  // Sign up
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Nusrat Jahan');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Before confirming, the home page asks for it.
  await page.getByRole('link', { name: /confirm later/i }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();

  // Confirm via the real email
  const link = await waitForEmailLink(email, /confirm your email/i);
  await page.goto(link);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('Email confirmed. Thanks!')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, Nusrat');

  // The API recognises the session.
  const me = await page.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ user: { email, emailVerified: true }, role: 'owner' });

  // Sign out
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);

  // Wrong password, then the right one
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not my password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'don’t match' })).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('reset a forgotten password', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Karim', email, password: PASSWORD },
  });
  expect(signUp.status(), await signUp.text()).toBe(200);

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(email);

  await page.goto(await waitForEmailLink(email, /reset/i));
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('a brand new password');
  await page.getByLabel('Confirm new password').fill('a brand new password');
  await page.getByRole('button', { name: 'Save new password' }).click();

  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a brand new password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('legal pages are public', async ({ page }) => {
  for (const [path, title] of [
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
    ['/data-deletion', 'Deleting your data'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }
});
