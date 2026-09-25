'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { BUSINESS_TYPES } from '@dpost/core/brand';
import { FormAlert } from '@/components/auth/auth-bits';
import { ChoiceCards } from '@/components/app/form/choice';
import { Field, TextAreaField, TextField } from '@/components/app/form/field';
import { nextStepHref } from '@/lib/onboarding';
import { saveBusinessStep } from '../actions';
import { StepFooter } from '../step-footer';

/**
 * Step 1. The business name is the only thing DPOST truly needs: without it
 * the AI has nothing to write as. Everything else on this screen is optional.
 */
const schema = z.object({
  name: z.string().trim().min(1, 'Please enter the name people know you by').max(100),
  type: z.enum(BUSINESS_TYPES).optional(),
  industry: z.string().trim().max(60),
  description: z.string().trim().max(600),
});

type Values = z.infer<typeof schema>;

export interface BusinessDefaults {
  name: string;
  type: (typeof BUSINESS_TYPES)[number] | undefined;
  industry: string;
  description: string;
}

export function BusinessForm({ defaults }: { defaults: BusinessDefaults }) {
  const t = useTranslations('onboarding.business');
  const options = useTranslations('options');
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    const result = await saveBusinessStep({
      name: values.name,
      // An empty box means "clear this", which the service accepts as null.
      type: values.type ?? null,
      industry: values.industry || null,
      description: values.description || null,
    });
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    router.push(nextStepHref('business'));
  };

  const types = BUSINESS_TYPES.map((value) => ({
    value,
    label: options(`businessType.${value}`),
    description: t(`typeDescriptions.${value}`),
  }));

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <TextField
        label={t('nameLabel')}
        hint={t('nameHint')}
        placeholder={t('namePlaceholder')}
        autoComplete="organization"
        autoFocus
        error={errors.name?.message}
        {...register('name')}
      />

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Field label={t('typeLabel')} optional asGroup error={errors.type?.message}>
            {() => (
              <ChoiceCards
                name="business-type"
                columns={3}
                options={types}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          </Field>
        )}
      />

      <TextField
        label={t('industryLabel')}
        hint={t('industryHint')}
        placeholder={t('industryPlaceholder')}
        list="industry-suggestions"
        optional
        error={errors.industry?.message}
        {...register('industry')}
      />
      <datalist id="industry-suggestions">
        {(t.raw('industrySuggestions') as string[]).map((industry) => (
          <option key={industry} value={industry} />
        ))}
      </datalist>

      <TextAreaField
        label={t('descriptionLabel')}
        hint={t('descriptionHint')}
        placeholder={t('descriptionPlaceholder')}
        rows={4}
        optional
        error={errors.description?.message}
        {...register('description')}
      />

      <StepFooter step="business" submitting={isSubmitting} canSkip={false} />
    </form>
  );
}
