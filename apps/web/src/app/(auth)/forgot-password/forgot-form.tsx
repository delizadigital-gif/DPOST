'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthHeader, FormAlert } from '@/components/auth/auth-bits';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { authErrorMessage } from '@/lib/auth/errors';

const schema = z.object({ email: z.email('Please enter a valid email address') });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }: Values) => {
    setServerError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    setSentTo(email);
  };

  if (sentTo) {
    return (
      <>
        <AuthHeader title="Check your email" />
        <FormAlert tone="success">
          If <strong>{sentTo}</strong> has a DPOST account, we’ve sent a link to reset the password.
          It expires in 30 minutes.
        </FormAlert>
        <p className="mt-6 text-sm text-muted-foreground">
          Didn’t get it? Check your spam folder, or{' '}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => setSentTo(null)}
          >
            try again
          </button>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title="Forgot your password?"
        description="Enter your email and we’ll send you a link to choose a new one."
      />
      <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError ? <FormAlert>{serverError}</FormAlert> : null}
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@business.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button
          type="submit"
          className="h-11 w-full rounded-lg text-[15px]"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
