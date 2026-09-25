import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

/**
 * Creates a fresh account and signs the browser in, so each test starts from
 * a clean workspace instead of depending on data left by another test.
 */
export async function signUpAndSignIn(page: Page): Promise<{ email: string; name: string }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const name = 'Nusrat Jahan';
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name, email, password: 'dashboard test 2026' },
  });
  if (!response.ok())
    throw new Error(`sign-up failed: ${response.status()} ${await response.text()}`);
  return { email, name };
}

/**
 * Signs out through the account menu. On laptops the menu sits in the
 * sidebar; on smaller screens it lives inside the "More" sheet.
 */
export async function signOut(page: Page, { desktop }: { desktop: boolean }) {
  if (!desktop) await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

/**
 * Leaves the welcome wizard without answering it. Most suites care about
 * the app behind onboarding, not onboarding itself, and a new account is
 * sent there on its first visit.
 */
export async function skipOnboarding(page: Page) {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await page.waitForURL(/\/home$/);
}
