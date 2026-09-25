'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { GOALS, LANGUAGES, TONES } from '@dpost/core/brand';
import { FormAlert } from '@/components/auth/auth-bits';
import { ChipGroup, ChoiceCards } from '@/components/app/form/choice';
import { Field } from '@/components/app/form/field';
import { nextStepHref } from '@/lib/onboarding';
import { saveVoiceStep } from '../actions';
import { StepFooter } from '../step-footer';

/**
 * Step 3. How the posts should sound, in which language, and how often.
 * Language is the answer that matters most here: Bangla, Banglish and
 * English produce genuinely different posts, not translations of one.
 */
const schema = z.object({
  tone: z.enum(TONES).optional(),
  languages: z.array(z.enum(LANGUAGES)),
  goals: z.array(z.enum(GOALS)),
  postsPerWeek: z.number().int().min(1).max(21),
});

type Values = z.infer<typeof schema>;

export function VoiceForm({ defaults }: { defaults: Values }) {
  const t = useTranslations('onboarding.voice');
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,

    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    const result = await saveVoiceStep({
      voice: {
        tone: values.tone ?? null,
        languages: values.languages.length > 0 ? values.languages : null,
      },
      contentMix: {
        goals: values.goals,
        postsPerWeek: values.postsPerWeek,
      },
    });
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    router.push(nextStepHref('voice'));
  };

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <Controller
        control={control}
        name="tone"
        render={({ field }) => (
          <Field label={t('toneLabel')} optional asGroup error={errors.tone?.message}>
            {() => (
              <ChoiceCards
                name="tone"
                columns={3}
                options={TONES.map((value) => ({
                  value,
                  label: t(`tones.${value}.label`),
                  description: t(`tones.${value}.description`),
                }))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          </Field>
        )}
      />

      <Controller
        control={control}
        name="languages"
        render={({ field }) => (
          <Field label={t('languagesLabel')} hint={t('languagesHint')} asGroup>
            {() => (
              <ChipGroup
                options={LANGUAGES.map((value) => ({ value, label: t(`languages.${value}`) }))}
                values={field.value}
                onChange={field.onChange}
              />
            )}
          </Field>
        )}
      />

      <Controller
        control={control}
        name="goals"
        render={({ field }) => (
          <Field label={t('goalsLabel')} hint={t('goalsHint')} optional asGroup>
            {() => (
              <ChipGroup
                options={GOALS.map((value) => ({ value, label: t(`goals.${value}`) }))}
                values={field.value}
                onChange={field.onChange}
              />
            )}
          </Field>
        )}
      />

      <Controller
        control={control}
        name="postsPerWeek"
        render={({ field }) => (
          <Field label={t('frequencyLabel')} hint={t('frequencyHint')}>
            {({ id, describedBy }) => (
              <div className="flex items-center gap-4">
                <input
                  id={id}
                  type="range"
                  min={1}
                  max={21}
                  step={1}
                  value={field.value}
                  aria-describedby={describedBy}
                  aria-valuetext={t('frequencyValue', { count: field.value })}
                  onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-brand-600"
                />
                <output
                  htmlFor={id}
                  className="w-28 shrink-0 text-right text-sm font-medium tabular-nums"
                >
                  {t('frequencyValue', { count: field.value })}
                </output>
              </div>
            )}
          </Field>
        )}
      />

      <StepFooter step="voice" submitting={isSubmitting} />
    </form>
  );
}
