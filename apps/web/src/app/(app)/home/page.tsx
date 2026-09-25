import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarCheck, Link2, MessageSquareText, Sparkles } from 'lucide-react';
import { ResendVerificationButton } from '@/components/auth/resend-verification';
import { PageHeader } from '@/components/app/page-header';
import { SparkButton } from '@/components/app/spark-button';
import { getCurrentSession } from '@/lib/auth/session';
import { VerifiedToast } from './verified-toast';

export const metadata: Metadata = { title: 'Home' };

const nextSteps = [
  { icon: Sparkles, title: 'Tell us about your business', body: 'So the AI writes in your voice.' },
  { icon: Link2, title: 'Connect your Facebook Page', body: 'Needs a confirmed email.' },
  { icon: MessageSquareText, title: 'Ask the AI for a plan', body: '“Plan my next 7 days.”' },
  { icon: CalendarCheck, title: 'Review and schedule', body: 'Approve posts in one tap.' },
];

export default async function HomePage({ searchParams }: PageProps<'/home'>) {
  // The layout has already redirected signed-out visitors.
  const session = (await getCurrentSession())!;
  const params = await searchParams;
  const t = await getTranslations();
  const firstName = session.name.split(' ')[0] ?? session.name;

  return (
    <>
      {params.verified === '1' && session.emailVerified ? <VerifiedToast /> : null}

      {!session.emailVerified ? (
        <section
          aria-labelledby="verify-heading"
          className="mb-8 flex flex-col gap-4 rounded-2xl border border-amber/40 bg-amber/10 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="verify-heading" className="font-sans text-base font-semibold">
              {t('verify.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('verify.body', { email: session.email })}
            </p>
          </div>
          <div className="sm:w-56">
            <ResendVerificationButton
              email={session.email}
              variant="secondary"
              className="h-10 w-full rounded-lg"
            />
          </div>
        </section>
      ) : null}

      <PageHeader
        title={t('pages.home.greeting', { name: firstName })}
        subtitle={t('pages.home.subtitle')}
        action={<SparkButton href="/assistant">{t('nav.assistant')}</SparkButton>}
      />

      <ol className="grid gap-4 sm:grid-cols-2">
        {nextSteps.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" aria-hidden />
            </div>
            <h2 className="font-sans text-base font-semibold">
              <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">
        These steps become available over the next updates.
      </p>
    </>
  );
}
