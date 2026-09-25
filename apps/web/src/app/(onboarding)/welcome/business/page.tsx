import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getBrand, type BUSINESS_TYPES } from '@dpost/core';
import { getPageContext } from '@/lib/api/page-context';
import { BusinessForm } from './business-form';
import { WizardStep } from '../wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.business');
  return { title: t('title') };
}

export default async function BusinessStepPage() {
  // Prefilled, so coming back to a step shows what was answered before.
  const { profile } = await getBrand(await getPageContext());
  const t = await getTranslations('onboarding.business');

  return (
    <WizardStep step="business" title={t('title')} description={t('description')}>
      <BusinessForm
        defaults={{
          name: profile.business.name?.value ?? '',
          type: profile.business.type?.value as (typeof BUSINESS_TYPES)[number] | undefined,
          industry: profile.business.industry?.value ?? '',
          description: profile.business.description?.value ?? '',
        }}
      />
    </WizardStep>
  );
}
