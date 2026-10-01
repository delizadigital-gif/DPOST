'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { connectSelectedPages } from './actions';

/**
 * The Pages this person manages, for them to choose from.
 *
 * Nothing is connected until they pick: being handed a token for five Pages
 * is not permission to post to five Pages.
 */

export interface PickablePage {
  id: string;
  name: string;
  category?: string;
  avatarUrl?: string;
}

export function PagePicker({
  accountId,
  pages,
  connectedIds,
}: {
  accountId: string;
  pages: PickablePage[];
  connectedIds: string[];
}) {
  const t = useTranslations('channels');
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(connectedIds));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    const result = await connectSelectedPages(accountId, [...selected]);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('connected', { count: selected.size }));
    router.replace('/channels');
    router.refresh();
  };

  return (
    <section
      aria-labelledby="page-picker"
      className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-700 dark:bg-brand-900/30"
    >
      <h2 id="page-picker" className="font-sans text-[15px] font-semibold">
        {t('pickTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('pickBody')}</p>

      <ul className="mt-4 space-y-2">
        {pages.map((page) => (
          <li key={page.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3">
              <input
                type="checkbox"
                checked={selected.has(page.id)}
                onChange={() => toggle(page.id)}
                className="size-4 accent-brand-600"
              />
              {page.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={page.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold">
                  {page.name.charAt(0)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{page.name}</span>
                {page.category ? (
                  <span className="block text-xs text-muted-foreground">{page.category}</span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <Button onClick={save} disabled={saving || selected.size === 0} className="h-10">
          {saving ? t('connecting') : t('connectSelected', { count: selected.size })}
        </Button>
        <Button variant="ghost" className="h-10" onClick={() => router.replace('/channels')}>
          {t('cancel')}
        </Button>
      </div>
    </section>
  );
}
