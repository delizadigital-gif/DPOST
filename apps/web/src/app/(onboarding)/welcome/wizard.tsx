import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ONBOARDING_STEPS, stepIndex, type OnboardingStep } from '@/lib/onboarding';

/**
 * The frame every step shares: how far along you are, the question, and why
 * we're asking. The "why" line matters — people answer honestly when they
 * can see what the answer is for.
 */
export async function WizardStep({
  step,
  title,
  description,
  children,
}: {
  step: OnboardingStep;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const t = await getTranslations('onboarding');
  const index = stepIndex(step);
  const total = ONBOARDING_STEPS.length;

  return (
    <div className="pt-4 pb-10">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t('stepCounter', { current: index + 1, total })}</span>
          <span>{t('stepsRemainingTime')}</span>
        </div>
        <ol className="flex gap-1.5" aria-label={t('progressLabel')}>
          {ONBOARDING_STEPS.map((entry, position) => (
            <li
              key={entry.slug}
              aria-current={position === index ? 'step' : undefined}
              className={`h-1.5 flex-1 rounded-full ${
                position <= index ? 'bg-brand-600' : 'bg-border'
              }`}
            >
              <span className="sr-only">
                {t(`steps.${entry.slug}`)}
                {position < index ? ` — ${t('stepDone')}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <h1 className="font-heading text-3xl leading-tight font-bold">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p>

      <div className="mt-8">{children}</div>
    </div>
  );
}
