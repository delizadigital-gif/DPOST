'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { FormAlert } from '@/components/auth/auth-bits';
import { Field, TextAreaField } from '@/components/app/form/field';
import { TagInput } from '@/components/app/form/tag-input';
import { nextStepHref } from '@/lib/onboarding';
import { saveAudienceStep } from '../actions';
import { StepFooter } from '../step-footer';

/**
 * Step 2. Who the posts are for, and what there is to sell. These two
 * answers are what stop the AI writing generic "great products!" captions.
 */
const schema = z.object({
  description: z.string().trim().max(400),
  locations: z.array(z.string()).max(10),
  items: z.array(z.string()).max(20),
});

type Values = z.infer<typeof schema>;

export function AudienceForm({ defaults }: { defaults: Values }) {
  const t = useTranslations('onboarding.audience');
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
    const result = await saveAudienceStep({
      audience: {
        description: values.description || null,
        locations: values.locations.length > 0 ? values.locations : null,
      },
      offerings: { items: values.items.length > 0 ? values.items : null },
    });
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    router.push(nextStepHref('audience'));
  };

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <TextAreaField
        label={t('customersLabel')}
        hint={t('customersHint')}
        placeholder={t('customersPlaceholder')}
        rows={3}
        autoFocus
        optional
        error={errors.description?.message}
        {...register('description')}
      />

      <Controller
        control={control}
        name="items"
        render={({ field }) => (
          <Field label={t('itemsLabel')} hint={t('itemsHint')} optional asGroup>
            {({ id, describedBy }) => (
              <TagInput
                id={id}
                aria-describedby={describedBy}
                values={field.value}
                onChange={field.onChange}
                placeholder={t('itemsPlaceholder')}
                max={20}
              />
            )}
          </Field>
        )}
      />

      <Controller
        control={control}
        name="locations"
        render={({ field }) => (
          <Field label={t('locationsLabel')} hint={t('locationsHint')} optional asGroup>
            {({ id, describedBy }) => (
              <TagInput
                id={id}
                aria-describedby={describedBy}
                values={field.value}
                onChange={field.onChange}
                placeholder={t('locationsPlaceholder')}
                max={10}
                maxLength={60}
              />
            )}
          </Field>
        )}
      />

      <StepFooter step="audience" submitting={isSubmitting} />
    </form>
  );
}
