import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthHeader, FormAlert } from '@/components/auth/auth-bits';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : null;

  // Better Auth redirects here with ?error=INVALID_TOKEN for expired or used links.
  if (!token || params.error) {
    return (
      <>
        <AuthHeader title="This link has expired" />
        <FormAlert>
          Password reset links work once and expire after 30 minutes. Request a new one to continue.
        </FormAlert>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Send me a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title="Choose a new password"
        description="You’ll be signed out on your other devices after changing it."
      />
      <ResetPasswordForm token={token} />
    </>
  );
}
