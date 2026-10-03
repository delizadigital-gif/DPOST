'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiGet } from '@/lib/api/client';
import { MediaLibrary, type MediaItem } from './media-library';

/**
 * Choosing images for a post: the strip of what is attached, and a dialog
 * holding the same library used on its own page.
 *
 * Facebook takes up to ten photos on one post, so the picker stops there
 * rather than letting someone attach twelve and discover the problem when
 * the post fails.
 */

const MAX_IMAGES = 10;

export function MediaPicker({
  selected,
  onChange,
  max = MAX_IMAGES,
}: {
  selected: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  max?: number;
}) {
  const t = useTranslations('media');
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<{
    media: MediaItem[];
    nextCursor: string | null;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!open || library) return;
    void apiGet<{ media: MediaItem[]; nextCursor: string | null; total: number }>(
      '/api/v1/media?limit=40',
    ).then((result) => {
      if (result.ok) setLibrary(result.data);
      else toast.error(result.error.message);
    });
  }, [open, library]);

  const toggle = (item: MediaItem) => {
    const already = selected.some((entry) => entry.id === item.id);
    if (already) {
      onChange(selected.filter((entry) => entry.id !== item.id));
      return;
    }
    if (selected.length >= max) {
      toast.error(t('tooMany', { max }));
      return;
    }
    onChange([...selected, item]);
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <li key={item.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbUrl ?? item.url}
                alt={item.altText ?? ''}
                className="size-20 rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(selected.filter((entry) => entry.id !== item.id))}
                aria-label={t('removeImage')}
                className="absolute -top-1.5 -right-1.5 inline-flex size-6 items-center justify-center rounded-full border border-border bg-card shadow-float hover:bg-muted"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <ImagePlus className="size-3.5" aria-hidden />
            {selected.length > 0 ? t('changeImages') : t('addImages')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('pickTitle')}</DialogTitle>
            <DialogDescription>{t('pickBody', { max })}</DialogDescription>
          </DialogHeader>

          {library ? (
            <MediaLibrary
              initial={library}
              mode="picker"
              selectedIds={selected.map((item) => item.id)}
              onSelect={toggle}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('loading')}</p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setOpen(false)} className="h-10">
              {t('done', { count: selected.length })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
