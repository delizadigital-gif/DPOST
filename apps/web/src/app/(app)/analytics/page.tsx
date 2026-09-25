import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.analytics');
  return { title: t('title') };
}

export default async function AnalyticsPage() {
  const t = await getTranslations('pages.analytics');
  const common = await getTranslations('common');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <EmptyState
        icon={BarChart3}
        title={t('emptyTitle')}
        body={t('emptyBody')}
        note={common('comingSoon')}
      />
    </>
  );
}
