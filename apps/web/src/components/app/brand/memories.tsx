'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import type { BrandMemorySummary } from '@dpost/core';
import { addMemory, removeMemory } from '@/app/(app)/brand/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Durable rules the AI must follow: "never call our food cheap", "Friday
 * posts mention Jummah Mubarak". They are kept as plain sentences rather
 * than structured fields because the useful ones are unpredictable.
 *
 * From Phase 11 the assistant writes here too, through its
 * `remember_preference` tool — which is exactly why each memory shows where
 * it came from and can be deleted in one click.
 */

const CATEGORIES = ['voice', 'audience', 'product', 'policy', 'schedule', 'other'] as const;

export function Memories({ memories }: { memories: BrandMemorySummary[] }) {
  const t = useTranslations('brand.memories');
  const options = useTranslations('options');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('voice');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    const result = await addMemory({ content, category });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error.fields?.content?.[0] ?? result.error.message);
      return;
    }
    setContent('');
    toast.success(t('added'));
  };

  const onRemove = async (memory: BrandMemorySummary) => {
    const result = await removeMemory(memory.id);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('removed'));
  };

  return (
    <section
      aria-labelledby="brand-memories"
      className="rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="brand-memories" className="font-sans text-[15px] font-semibold">
        {t('title')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

      {memories.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {memories.map((memory) => (
            <li
              key={memory.id}
              className="flex items-start gap-2 rounded-xl border border-border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words">{memory.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {options(`memoryCategory.${memory.category}`)} ·{' '}
                  {options(`memorySource.${memory.source}`)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('remove', { content: memory.content })}
                onClick={() => onRemove(memory)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="memory-content" className="text-sm font-medium">
            {t('addLabel')}
          </Label>
          <Input
            id="memory-content"
            value={content}
            maxLength={500}
            placeholder={t('addPlaceholder')}
            onChange={(event) => setContent(event.target.value)}
            className="h-11 rounded-lg px-3 text-[15px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="memory-category" className="text-sm font-medium">
            {t('categoryLabel')}
          </Label>
          <select
            id="memory-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
            className="h-11 rounded-lg border border-input bg-background px-3 text-[15px] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {options(`memoryCategory.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={busy || !content.trim()} className="h-11 rounded-lg px-4">
          <Plus className="size-4" aria-hidden />
          {t('add')}
        </Button>
      </form>
    </section>
  );
}
