'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormAlert } from '@/components/auth/auth-bits';
import { FormField, PasswordField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { authErrorMessage } from '@/lib/auth/errors';

const schema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(100),
  email: z.email('Please enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters'),
});

type Values = z.infer<typeof schema>;

export function SignUpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    const { error } = await authClient.signUp.email({
      ...values,
      // Where the link in the confirmation email lands.
      callbackURL: '/home?verified=1',
    });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
  };

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}
      <FormField
        label="Your name"
        autoComplete="name"
        placeholder="Rahim Uddin"
        error={errors.name?.message}
        {...register('name')}
      />
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@business.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint="At least 8 characters. A short phrase is easy to remember and hard to guess."
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={isSubmitting}>
        {isSubmitting ? 'Creating your account…' : 'Create account'}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
