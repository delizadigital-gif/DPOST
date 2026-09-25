import { redirect } from 'next/navigation';
import { getBrand } from '@dpost/core';
import { getPageContext } from '@/lib/api/page-context';
import { resumeHref } from '@/lib/onboarding';

/**
 * The entry point to setup. It sends people to the first question they
 * haven't answered, so someone who closed the tab half way through is not
 * asked the same things again.
 */
export default async function WelcomePage() {
  const { profile } = await getBrand(await getPageContext());
  redirect(resumeHref(profile));
}
