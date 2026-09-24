'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormAlert } from '@/components/auth/auth-bits';
import { PasswordField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { authErrorMessage } from '@/lib/auth/errors';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match',
  });

type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ password }: Values) => {
    setServerError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    router.replace('/login?reset=1');
  };

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}
      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register('confirm')}
      />
      <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  );
}
