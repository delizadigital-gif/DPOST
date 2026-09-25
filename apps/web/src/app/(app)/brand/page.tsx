import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Brain } from 'lucide-react';
import { getBrand, getBrandCard, type BrandSource } from '@dpost/core';
import { EmptyState } from '@/components/app/empty-state';
import { Memories } from '@/components/app/brand/memories';
import { SectionCard, type SectionField } from '@/components/app/brand/section-card';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { getPageContext } from '@/lib/api/page-context';
import { SECTION_FIELDS, SECTION_ORDER } from '@/lib/brand-fields';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.brand');
  return { title: t('title') };
}

/**
 * The Brand Brain: everything DPOST knows about a business, in the user's
 * hands. Nothing here is hidden from them — including the exact text the AI
 * will be given, at the bottom of the page.
 */
export default async function BrandPage() {
  const ctx = await getPageContext();
  const [{ profile, memories }, card] = await Promise.all([getBrand(ctx), getBrandCard(ctx)]);
  const t = await getTranslations('pages.brand');
  const b = await getTranslations('brand');

  const sections = SECTION_ORDER.map((section) => ({
    section,
    fields: SECTION_FIELDS[section]
      .map((config) => {
        const stored = (
          profile[section] as Record<string, { value: unknown; source: BrandSource }>
        )[config.key];
        return stored ? { key: config.key, value: stored.value, source: stored.source } : null;
      })
      .filter((field): field is SectionField => field !== null),
  }));

  const nothingKnown = sections.every((entry) => entry.fields.length === 0);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {nothingKnown ? (
        <EmptyState
          icon={Brain}
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={
            <Button asChild className="h-11 rounded-lg px-5">
              <Link href="/welcome/business">{b('startSetup')}</Link>
            </Button>
          }
        />
      ) : null}

      <div className="space-y-4">
        {sections.map(({ section, fields }) => (
          <SectionCard key={section} section={section} fields={fields} />
        ))}

        <Memories memories={memories} />

        <details className="rounded-2xl border border-border bg-card p-5">
          <summary className="cursor-pointer text-[15px] font-semibold">{b('cardTitle')}</summary>
          <p className="mt-1 text-sm text-muted-foreground">{b('cardSubtitle')}</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-muted p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
            {card}
          </pre>
        </details>
      </div>
    </>
  );
}
