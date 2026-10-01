import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MessageSquareText } from 'lucide-react';
import { getBrand, listChannels, listPosts } from '@dpost/core';
import { ContentList } from '@/components/app/content/content-list';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/api/page-context';
import type { PostPageResponse } from '@/lib/posts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.content');
  return { title: t('title') };
}

/**
 * Every post, in one list. The first page is rendered on the server so the
 * page is useful immediately; filtering and paging then happen in the
 * browser against the same endpoint.
 */
export default async function ContentPage() {
  const ctx = await getPageContext();
  const [page, { profile }, workspace, channels] = await Promise.all([
    listPosts(ctx, { limit: 25 }),
    getBrand(ctx),
    ctx.db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true } }),
    listChannels(ctx),
  ]);
  const t = await getTranslations('pages.content');

  // JSON over the wire turns dates into strings; the client type says so.
  const initial = JSON.parse(JSON.stringify(page)) as PostPageResponse;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {initial.total === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={
            <Button asChild className="h-11 rounded-lg px-5">
              <Link href="/create">{t('writeFirst')}</Link>
            </Button>
          }
        />
      ) : (
        <ContentList
          initial={initial}
          pageName={profile.business.name?.value ?? workspace?.name ?? 'DPOST'}
          channels={channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            status: channel.status,
          }))}
        />
      )}
    </>
  );
}
