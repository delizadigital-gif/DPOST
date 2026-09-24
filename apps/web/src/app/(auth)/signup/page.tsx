import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthEnv } from '@dpost/config';
import { AuthHeader, OrDivider } from '@/components/auth/auth-bits';
import { GoogleButton } from '@/components/auth/google-button';
import { getCurrentSession } from '@/lib/auth/session';
import { SignUpForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignUpPage() {
  if (await getCurrentSession()) redirect('/home');
  const googleEnabled = Boolean(getAuthEnv().GOOGLE_CLIENT_ID);

  return (
    <>
      <AuthHeader title="Create your account" description="Free to start. No credit card needed." />
      {googleEnabled ? (
        <>
          <GoogleButton next="/home" />
          <OrDivider />
        </>
      ) : null}
      <SignUpForm />
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
