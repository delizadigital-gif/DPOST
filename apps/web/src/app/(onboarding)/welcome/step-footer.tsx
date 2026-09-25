'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nextStepHref, previousStepHref, type OnboardingStep } from '@/lib/onboarding';

/**
 * Back · Skip · Continue. Every step except the business name can be
 * skipped, so someone in a hurry reaches the product in under a minute and
 * fills the rest in later from the Brand Brain.
 */
export function StepFooter({
  step,
  submitting,
  canSkip = true,
  continueLabel,
}: {
  step: OnboardingStep;
  submitting: boolean;
  canSkip?: boolean;
  continueLabel?: string;
}) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const back = previousStepHref(step);

  return (
    <div className="mt-8 flex items-center gap-3">
      {back ? (
        <Button variant="ghost" size="lg" asChild className="h-11 px-3">
          <Link href={back}>
            <ArrowLeft className="size-4" aria-hidden />
            {t('back')}
          </Link>
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {canSkip ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11 px-3"
            onClick={() => router.push(nextStepHref(step))}
          >
            {t('skipStep')}
          </Button>
        ) : null}
        <Button type="submit" size="lg" disabled={submitting} className="h-11 rounded-lg px-5">
          {submitting ? t('saving') : (continueLabel ?? t('continue'))}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
