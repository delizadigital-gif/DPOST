import type { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { AuthHeader, FormAlert } from '@/components/auth/auth-bits';
import { getCurrentSession } from '@/lib/auth/session';
import { ResendVerificationButton } from '@/components/auth/resend-verification';

export const metadata: Metadata = { title: 'Confirm your email' };

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const params = await searchParams;
  const session = await getCurrentSession();
  const email = session?.email ?? (typeof params.email === 'string' ? params.email : undefined);

  if (session?.emailVerified) {
    return (
      <>
        <AuthHeader title="Your email is confirmed" />
        <Link href="/home" className="text-sm font-medium text-primary hover:underline">
          Continue to DPOST
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="mb-6 inline-flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <MailCheck className="size-6" aria-hidden />
      </div>
      <AuthHeader
        title="Check your inbox"
        description={
          email ? (
            <>
              We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
              Click it to confirm your email.
            </>
          ) : (
            'We sent you a confirmation link. Click it to confirm your email.'
          )
        }
      />
      {params.error ? (
        <div className="mb-5">
          <FormAlert>That link is invalid or has expired. Send yourself a new one below.</FormAlert>
        </div>
      ) : null}
      <div className="space-y-3">
        {email ? <ResendVerificationButton email={email} /> : null}
        {session ? (
          <Link
            href="/home"
            className="block text-center text-sm font-medium text-primary hover:underline"
          >
            Continue to DPOST, and confirm later
          </Link>
        ) : (
          <Link
            href="/login"
            className="block text-center text-sm font-medium text-primary hover:underline"
          >
            Back to log in
          </Link>
        )}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        You can explore DPOST right away. You’ll need a confirmed email to connect your Facebook
        Page.
      </p>
    </>
  );
}
