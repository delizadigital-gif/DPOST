'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, Search, Trash2 } from 'lucide-react';
import type { DisplayStatus } from '@dpost/core/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/app/status-badge';
import { PostSheet } from '@/components/app/content/post-sheet';
import { apiPost } from '@/lib/api/client';
import {
  buildPostsQuery,
  FILTER_STATUSES,
  postPreviewLine,
  type BulkResponse,
  type PostListItem,
  type PostPageResponse,
} from '@/lib/posts';

/**
 * Every post, with the review queue first.
 *
 * The list is built for going through a week's worth in one sitting: filter
 * to what needs review, select with the checkboxes, approve the lot, and
 * open anything that needs a closer look without losing your place.
 */

const PAGE_SIZE = 25;

export function ContentList({
  initial,
  pageName,
  channels = [],
}: {
  initial: PostPageResponse;
  pageName: string;
  channels?: { id: string; name: string; status: string }[];
}) {
  const t = useTranslations('content');
  const router = useRouter();

  const [posts, setPosts] = useState(initial.posts);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [total, setTotal] = useState(initial.total);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<PostListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(
    async (next?: { cursor?: string | null }) => {
      const id = ++requestId.current;
      setLoading(true);
      const response = await fetch(
        buildPostsQuery({
          status: statuses,
          search,
          cursor: next?.cursor ?? null,
          limit: PAGE_SIZE,
        }),
      );
      // A slower earlier request must not overwrite a newer one's results.
      if (id !== requestId.current) return;
      setLoading(false);

      if (!response.ok) {
        toast.error(t('loadFailed'));
        return;
      }
      const page = (await response.json()) as PostPageResponse;
      setPosts((current) => (next?.cursor ? [...current, ...page.posts] : page.posts));
      setCursor(page.nextCursor);
      setTotal(page.total);
    },
    [statuses, search, t],
  );

  // Filters re-query; typing waits a moment so every keystroke isn't a request.
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const toggleStatus = (status: string) =>
    setStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status],
    );

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = posts.length > 0 && selected.size === posts.length;

  const bulk = async (action: 'approve' | 'delete') => {
    const ids = [...selected];
    const result = await apiPost<BulkResponse>('/api/v1/posts/bulk', { ids, action });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    const { changed, skipped } = result.data;
    setSelected(new Set());
    await load();
    router.refresh();

    if (action === 'delete') {
      toast.success(t('deletedMany', { count: changed }), {
        action: {
          label: t('undo'),
          onClick: async () => {
            const undone = await apiPost<BulkResponse>('/api/v1/posts/bulk', {
              ids,
              action: 'restore',
            });
            if (undone.ok) {
              toast.success(t('restoredMany', { count: undone.data.changed }));
              await load();
              router.refresh();
            }
          },
        },
      });
      return;
    }

    // Never claim more than happened: a bulk approve skips what it can't touch.
    toast.success(
      skipped.length > 0
        ? t('approvedSome', { count: changed, skipped: skipped.length })
        : t('approvedMany', { count: changed }),
    );
  };

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="relative">
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

        <div className="flex flex-wrap items-center gap-2">
          {FILTER_STATUSES.map((status) => {
            const active = statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStatus(status)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-50 font-medium dark:bg-brand-900/30'
                    : 'border-border bg-card hover:border-brand-400'
                }`}
              >
                {t(`filters.${status}`)}
              </button>
            );
          })}
          <span className="ml-auto text-sm text-muted-foreground">
            {t('count', { count: total })}
          </span>
        </div>
      </div>

      {selected.size > 0 ? (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
        >
          <span className="text-sm font-medium">{t('selected', { count: selected.size })}</span>
          <Button size="sm" className="h-9" onClick={() => bulk('approve')}>
            <Check className="size-3.5" aria-hidden />
            {t('approveSelected')}
          </Button>
          <Button variant="destructive" size="sm" className="h-9" onClick={() => bulk('delete')}>
            <Trash2 className="size-3.5" aria-hidden />
            {t('deleteSelected')}
          </Button>
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setSelected(new Set())}>
            {t('clearSelection')}
          </Button>
        </div>
      ) : null}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
          {loading ? t('loading') : t('noMatches')}
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-3 px-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(posts.map((post) => post.id)))
              }
              aria-label={t('selectAll')}
              className="size-4 accent-brand-600"
            />
            <span className="text-xs text-muted-foreground">{t('selectAll')}</span>
          </div>

          <ul className="space-y-2">
            {posts.map((post) => (
              <li
                key={post.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
                <input
                  type="checkbox"
                  checked={selected.has(post.id)}
                  onChange={() => toggleSelected(post.id)}
                  aria-label={t('selectPost', { preview: postPreviewLine(post, 40) })}
                  className="mt-1 size-4 accent-brand-600"
                />
                <button
                  type="button"
                  onClick={() => setOpen(post)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge state={post.status as DisplayStatus} />
                    <span className="text-xs text-muted-foreground">
                      {post.plannedFor
                        ? new Date(post.plannedFor).toLocaleString()
                        : t('notScheduled')}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed">
                    {postPreviewLine(post)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {cursor ? (
            <Button
              variant="outline"
              className="mt-4 h-11 w-full"
              disabled={loading}
              onClick={() => load({ cursor })}
            >
              {loading ? t('loading') : t('loadMore')}
            </Button>
          ) : null}
        </>
      )}

      <PostSheet
        post={open}
        pageName={pageName}
        channels={channels}
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        onChanged={() => void load()}
      />
    </>
  );
}
