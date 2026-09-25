import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Brain, Clock, Share2 } from 'lucide-react';
import { FinishStep } from './finish-step';
import { WizardStep } from '../wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.connect');
  return { title: t('title') };
}

/**
 * Step 4. Connecting a Facebook Page is Phase 8 work — the OAuth app, token
 * handling and publishing are not built yet, and Meta requires a verified
 * business before it will approve them.
 *
 * So this step says exactly that, instead of showing a button that pretends
 * to connect. Nothing in DPOST claims a capability it doesn't have.
 */
export default async function ConnectStepPage() {
  const t = await getTranslations('onboarding.connect');

  return (
    <WizardStep step="connect" title={t('title')} description={t('description')}>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Share2 className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold">{t('statusTitle')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('statusBody')}</p>
          </div>
        </div>

        <ul className="mt-5 space-y-3 border-t border-border pt-5">
          <li className="flex items-start gap-3 text-sm">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="leading-relaxed text-muted-foreground">{t('pointSchedule')}</span>
          </li>
          <li className="flex items-start gap-3 text-sm">
            <Brain className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="leading-relaxed text-muted-foreground">{t('pointMeanwhile')}</span>
          </li>
        </ul>
      </div>

      <FinishStep />
    </WizardStep>
  );
}
