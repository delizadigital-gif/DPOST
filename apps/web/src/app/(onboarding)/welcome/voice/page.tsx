import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getBrand, type GOALS, type LANGUAGES, type TONES } from '@dpost/core';
import { getPageContext } from '@/lib/api/page-context';
import { VoiceForm } from './voice-form';
import { WizardStep } from '../wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.voice');
  return { title: t('title') };
}

/** Bangla and English together: the common case for a Dhaka shop. */
const DEFAULT_LANGUAGES: (typeof LANGUAGES)[number][] = ['bn'];
const DEFAULT_POSTS_PER_WEEK = 5;

export default async function VoiceStepPage() {
  const { profile } = await getBrand(await getPageContext());
  const t = await getTranslations('onboarding.voice');

  return (
    <WizardStep step="voice" title={t('title')} description={t('description')}>
      <VoiceForm
        defaults={{
          tone: profile.voice.tone?.value as (typeof TONES)[number] | undefined,
          languages: profile.voice.languages?.value ?? DEFAULT_LANGUAGES,
          goals: (profile.contentMix.goals?.value ?? []) as (typeof GOALS)[number][],
          postsPerWeek: profile.contentMix.postsPerWeek?.value ?? DEFAULT_POSTS_PER_WEEK,
        }}
      />
    </WizardStep>
  );
}
