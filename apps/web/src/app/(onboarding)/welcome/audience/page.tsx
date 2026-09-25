import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getBrand } from '@dpost/core';
import { getPageContext } from '@/lib/api/page-context';
import { AudienceForm } from './audience-form';
import { WizardStep } from '../wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.audience');
  return { title: t('title') };
}

export default async function AudienceStepPage() {
  const { profile } = await getBrand(await getPageContext());
  const t = await getTranslations('onboarding.audience');

  return (
    <WizardStep step="audience" title={t('title')} description={t('description')}>
      <AudienceForm
        defaults={{
          description: profile.audience.description?.value ?? '',
          locations: profile.audience.locations?.value ?? [],
          items: profile.offerings.items?.value ?? [],
        }}
      />
    </WizardStep>
  );
}
