import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.calendar');
  return { title: t('title') };
}

export default async function CalendarPage() {
  const t = await getTranslations('pages.calendar');
  const common = await getTranslations('common');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <EmptyState
        icon={CalendarDays}
        title={t('emptyTitle')}
        body={t('emptyBody')}
        note={common('comingSoon')}
      />
    </>
  );
}
