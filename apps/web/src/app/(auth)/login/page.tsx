import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthEnv } from '@dpost/config';
import { AuthHeader, FormAlert, OrDivider } from '@/components/auth/auth-bits';
import { GoogleButton } from '@/components/auth/google-button';
import { safeNextPath } from '@/lib/auth/redirect';
import { getCurrentSession } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  if (await getCurrentSession()) redirect(next);
  const googleEnabled = Boolean(getAuthEnv().GOOGLE_CLIENT_ID);

  return (
    <>
      <AuthHeader title="Welcome back" description="Log in to plan and publish your posts." />
      {params.reset === '1' ? (
        <div className="mb-5">
          <FormAlert tone="success">
            Your password was changed. Log in with your new password.
          </FormAlert>
        </div>
      ) : null}
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      ) : null}
      <LoginForm next={next} />
      <p className="mt-6 text-sm text-muted-foreground">
        New to DPOST?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
