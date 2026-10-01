import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Info, Link2 } from 'lucide-react';
import { getMetaEnv, isMetaConfigured } from '@dpost/config';
import { listAvailablePages, listChannels } from '@dpost/core';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/api/page-context';
import { getCurrentSession } from '@/lib/auth/session';
import { ChannelCard } from './channel-card';
import { PagePicker } from './page-picker';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.channels');
  return { title: t('title') };
}

/**
 * The Pages DPOST can publish to.
 *
 * This screen is where several honest limits have to be said out loud:
 * Facebook only allows apps to post to Pages, never to personal profiles or
 * Groups; and until Meta has reviewed our app, only people with a role on it
 * can connect.
 */
export default async function ChannelsPage({ searchParams }: PageProps<'/channels'>) {
  const ctx = await getPageContext();
  const session = await getCurrentSession();
  const params = await searchParams;
  const t = await getTranslations('channels');
  const page = await getTranslations('pages.channels');

  const channels = await listChannels(ctx);
  const configured = isMetaConfigured(getMetaEnv());
  const connectState = typeof params.connect === 'string' ? params.connect : null;
  const accountId = typeof params.account === 'string' ? params.account : null;

  // Straight back from Facebook: offer the Pages this person manages.
  const pickable =
    connectState === 'choose' && accountId
      ? await listAvailablePages(ctx, accountId).catch(() => [])
      : [];

  const notices: Record<string, string> = {
    cancelled: t('noticeCancelled'),
    expired: t('noticeExpired'),
    invalid: t('noticeInvalid'),
    mismatch: t('noticeMismatch'),
    failed: t('noticeFailed'),
    'no-pages': t('noticeNoPages'),
  };
  const notice = connectState ? notices[connectState] : undefined;

  return (
    <>
      <PageHeader title={page('title')} subtitle={page('subtitle')} />

      {notice ? (
        <p
          role="status"
          className="mb-4 flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}

      {pickable.length > 0 && accountId ? (
        <PagePicker
          accountId={accountId}
          pages={pickable.map((item) => ({
            id: item.id,
            name: item.name,
            ...(item.category ? { category: item.category } : {}),
            ...(item.avatarUrl ? { avatarUrl: item.avatarUrl } : {}),
          }))}
          connectedIds={channels.map((channel) => channel.externalId)}
        />
      ) : null}

      {channels.length > 0 ? (
        <ul className="mb-6 space-y-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={{
                id: channel.id,
                name: channel.name,
                avatarUrl: channel.avatarUrl,
                category: channel.category,
                status: channel.status,
                accountName: channel.accountName,
              }}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Link2}
          title={page('emptyTitle')}
          body={page('emptyBody')}
          {...(configured && session?.emailVerified
            ? {
                action: (
                  <Button asChild className="h-11 rounded-lg px-5">
                    <Link href="/api/oauth/facebook/start">{t('connectFacebook')}</Link>
                  </Button>
                ),
              }
            : { note: configured ? t('verifyFirst') : t('notConfigured') })}
        />
      )}

      {channels.length > 0 && configured && session?.emailVerified ? (
        <Button asChild variant="outline" className="h-11">
          <Link href="/api/oauth/facebook/start">{t('connectAnother')}</Link>
        </Button>
      ) : null}

      <section className="mt-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-sans text-[15px] font-semibold">{t('limitsTitle')}</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>{t('limitPagesOnly')}</li>
          <li>{t('limitGroups')}</li>
          <li>{t('limitReview')}</li>
        </ul>
      </section>
    </>
  );
}
