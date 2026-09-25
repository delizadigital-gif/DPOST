import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Images } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.media');
  return { title: t('title') };
}

export default async function MediaPage() {
  const t = await getTranslations('pages.media');
  const common = await getTranslations('common');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <EmptyState
        icon={Images}
        title={t('emptyTitle')}
        body={t('emptyBody')}
        note={common('comingSoon')}
      />
    </>
  );
}
