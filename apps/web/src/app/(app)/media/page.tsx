import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getStorageEnv } from '@dpost/config';
import { listMedia } from '@dpost/core';
import { MediaLibrary } from '@/components/app/media/media-library';
import { PageHeader } from '@/components/app/page-header';
import { getPageContext } from '@/lib/api/page-context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.media');
  return { title: t('title') };
}

/** Everything uploaded or generated, ready to attach to a post. */
export default async function MediaPage() {
  const ctx = await getPageContext();
  const page = await listMedia(ctx, { limit: 40 });
  const t = await getTranslations('pages.media');
  const m = await getTranslations('media');
  const env = getStorageEnv();

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {env.STORAGE_DRIVER === 'local' ? (
        <p className="mb-4 rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
          {m('localStorageNotice')}
        </p>
      ) : null}

      <MediaLibrary initial={JSON.parse(JSON.stringify(page))} />
    </>
  );
}
