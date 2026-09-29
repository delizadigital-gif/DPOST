import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { aiIsAvailable, getBrand, getQuota } from '@dpost/core';
import { Composer } from '@/components/app/composer/composer';
import { PageHeader } from '@/components/app/page-header';
import { getPageContext } from '@/lib/api/page-context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.create');
  return { title: t('title') };
}

export default async function CreatePage() {
  const ctx = await getPageContext();
  const [{ profile }, quota, workspace] = await Promise.all([
    getBrand(ctx),
    getQuota(ctx, 'aiPosts'),
    ctx.db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true } }),
  ]);
  const t = await getTranslations('pages.create');

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Composer
        pageName={profile.business.name?.value ?? workspace?.name ?? 'DPOST'}
        // Whether the server can call a model at all: without a key the
        // interface says so instead of offering a button that fails.
        aiAvailable={aiIsAvailable()}
        brandReady={Boolean(profile.business.name)}
        quota={quota}
      />
    </>
  );
}
