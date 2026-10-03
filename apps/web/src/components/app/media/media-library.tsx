'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ImagePlus, Search, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { apiDelete, apiGet, apiPatch } from '@/lib/api/client';

/**
 * The media library: everything uploaded or generated, newest first.
 *
 * Also the picker — the same grid, in selection mode, so choosing an image
 * for a post and managing the library are not two different things to learn.
 */

export interface MediaItem {
  id: string;
  source: string;
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  filename: string | null;
  altText: string | null;
  prompt: string | null;
  createdAt: string;
}

interface MediaPage {
  media: MediaItem[];
  nextCursor: string | null;
  total: number;
}

export function MediaLibrary({
  initial,
  mode = 'library',
  selectedIds = [],
  onSelect,
}: {
  initial: MediaPage;
  /** `picker` adds selection and leaves management out of the way. */
  mode?: 'library' | 'picker';
  selectedIds?: string[];
  onSelect?: (item: MediaItem) => void;
}) {
  const t = useTranslations('media');
  const router = useRouter();

  const [items, setItems] = useState(initial.media);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [total, setTotal] = useState(initial.total);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'all' | 'upload' | 'ai'>('all');
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (next?: { cursor?: string | null }) => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (source !== 'all') params.set('source', source);
      if (next?.cursor) params.set('cursor', next.cursor);

      const result = await apiGet<MediaPage>(`/api/v1/media?${params}`);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setItems((current) =>
        next?.cursor ? [...current, ...result.data.media] : result.data.media,
      );
      setCursor(result.data.nextCursor);
      setTotal(result.data.total);
    },
    [search, source],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/v1/media', { method: 'POST', body: form });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast.error(payload?.error?.message ?? t('uploadFailed', { name: file.name }));
        continue;
      }
      toast.success(t('uploaded', { name: file.name }));
    }

    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
    await load();
    router.refresh();
  };

  const remove = async (item: MediaItem) => {
    const result = await apiDelete(`/api/v1/media/${item.id}`);
    if (!result.ok) {
      // Usually "a scheduled post uses this image", which is worth reading.
      toast.error(result.error.message);
      return;
    }
    toast.success(t('deleted'));
    setOpen(null);
    await load();
    router.refresh();
  };

  const saveAlt = async (item: MediaItem, altText: string) => {
    const result = await apiPatch<MediaItem>(`/api/v1/media/${item.id}`, { altText });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('altSaved'));
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, altText } : entry)),
    );
    setOpen({ ...item, altText });
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
            className="h-11 rounded-lg bg-card pl-9 text-[15px]"
          />
        </div>

        <div
          role="group"
          aria-label={t('filterLabel')}
          className="flex rounded-lg border border-border bg-card p-0.5"
        >
          {(['all', 'upload', 'ai'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={source === option}
              onClick={() => setSource(option)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                source === option
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`filters.${option}`)}
            </button>
          ))}
        </div>

        <Button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="h-11 rounded-lg px-4"
        >
          <Upload className="size-4" aria-hidden />
          {busy ? t('uploading') : t('upload')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="sr-only"
          aria-label={t('chooseFiles')}
          onChange={(event) => upload(event.target.files)}
        />
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
          {search || source !== 'all' ? t('noMatches') : t('empty')}
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{t('count', { count: total })}</p>
          <ul
            aria-label={t('gridLabel')}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {items.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => (mode === 'picker' ? onSelect?.(item) : setOpen(item))}
                    aria-pressed={mode === 'picker' ? selected : undefined}
                    // The tile's only content is an image, so it needs a name
                    // of its own: a button a screen reader announces as
                    // "button" and nothing else is a dead end.
                    aria-label={item.altText ?? item.filename ?? t('untitled')}
                    className={`group relative block w-full overflow-hidden rounded-xl border bg-card transition-colors ${
                      selected
                        ? 'border-brand-500 ring-2 ring-brand-500/40'
                        : 'border-border hover:border-brand-400'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbUrl ?? item.url}
                      alt={item.altText ?? ''}
                      loading="lazy"
                      className="aspect-square w-full bg-muted object-cover"
                    />
                    {item.source === 'ai' ? (
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-spark px-2 py-0.5 text-[11px] font-medium text-white">
                        {t('aiBadge')}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {cursor ? (
            <Button variant="outline" className="mt-4 h-11 w-full" onClick={() => load({ cursor })}>
              {t('loadMore')}
            </Button>
          ) : null}
        </>
      )}

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{open.filename ?? t('untitled')}</SheetTitle>
                <SheetDescription>
                  {open.width && open.height ? `${open.width} × ${open.height}` : ''}
                  {open.bytes ? ` · ${Math.round(open.bytes / 1024)} KB` : ''}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-4 pb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={open.url}
                  alt={open.altText ?? ''}
                  className="w-full rounded-xl border border-border bg-muted"
                />

                {open.prompt ? (
                  <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                    <span className="font-medium">{t('promptLabel')}</span> {open.prompt}
                  </p>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="alt-text" className="text-sm font-medium">
                    {t('altLabel')}
                  </Label>
                  <Input
                    id="alt-text"
                    defaultValue={open.altText ?? ''}
                    maxLength={300}
                    placeholder={t('altPlaceholder')}
                    onBlur={(event) => {
                      if (event.target.value !== (open.altText ?? '')) {
                        void saveAlt(open, event.target.value);
                      }
                    }}
                    className="h-11 rounded-lg px-3"
                  />
                  <p className="text-xs text-muted-foreground">{t('altHint')}</p>
                </div>

                <Button variant="destructive" className="h-10" onClick={() => remove(open)}>
                  <Trash2 className="size-4" aria-hidden />
                  {t('delete')}
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The empty state's call to action, shared by the page and the picker. */
export function MediaEmptyAction({ onClick }: { onClick: () => void }) {
  const t = useTranslations('media');
  return (
    <Button onClick={onClick} className="h-11 rounded-lg px-5">
      <ImagePlus className="size-4" aria-hidden />
      {t('upload')}
    </Button>
  );
}
