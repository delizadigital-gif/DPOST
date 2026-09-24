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
  email: z.email('Please enter a valid email address'),
  password: z.string().min(1, 'Please enter your password'),
});

type Values = z.infer<typeof schema>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
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
      <PasswordField
        label="Password"
        autoComplete="current-password"
        error={errors.password?.message}
        aside={
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        }
        {...register('password')}
      />
      <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={isSubmitting}>
        {isSubmitting ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
