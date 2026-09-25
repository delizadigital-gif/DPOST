import type { BrandProfileData } from '@dpost/core/brand';

/**
 * The welcome wizard, defined once. The step header, the "Continue" button,
 * the resume-where-you-left-off redirect and the tests all read this list,
 * so a step can't exist in one place and be missing from another.
 */

export const ONBOARDING_STEPS = [
  { slug: 'business', href: '/welcome/business' },
  { slug: 'audience', href: '/welcome/audience' },
  { slug: 'voice', href: '/welcome/voice' },
  { slug: 'connect', href: '/welcome/connect' },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]['slug'];

export const FIRST_STEP = ONBOARDING_STEPS[0];

export function stepIndex(slug: OnboardingStep): number {
  return ONBOARDING_STEPS.findIndex((step) => step.slug === slug);
}

export function nextStepHref(slug: OnboardingStep): string {
  return ONBOARDING_STEPS[stepIndex(slug) + 1]?.href ?? '/home';
}

export function previousStepHref(slug: OnboardingStep): string | null {
  return stepIndex(slug) > 0 ? (ONBOARDING_STEPS[stepIndex(slug) - 1]?.href ?? null) : null;
}

/**
 * Whether a step has anything saved. Only the business name is required, so
 * "answered" means the step's main question has an answer — not that every
 * field is filled in.
 */
export function isStepAnswered(profile: BrandProfileData, slug: OnboardingStep): boolean {
  switch (slug) {
    case 'business':
      return Boolean(profile.business.name);
    case 'audience':
      return Boolean(profile.audience.description ?? profile.offerings.items);
    case 'voice':
      return Boolean(profile.voice.tone ?? profile.voice.languages);
    case 'connect':
      // Connecting a Page happens in Phase 8; this step has nothing to save.
      return false;
  }
}

/**
 * Where someone who abandoned onboarding should land when they come back:
 * the first step they haven't answered, so their earlier answers aren't
 * re-asked and nothing is skipped silently.
 */
export function resumeHref(profile: BrandProfileData): string {
  const step = ONBOARDING_STEPS.find(({ slug }) => !isStepAnswered(profile, slug));
  return (step ?? ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]!).href;
}
