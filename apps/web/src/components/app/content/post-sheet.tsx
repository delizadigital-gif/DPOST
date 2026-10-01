'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, Copy, History, Pencil, Sparkles, Trash2, Undo2 } from 'lucide-react';
import type { DisplayStatus } from '@dpost/core/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Field } from '@/components/app/form/field';
import { TagInput } from '@/components/app/form/tag-input';
import { PostPreview } from '@/components/app/composer/preview';
import { SchedulePanel, type ChannelOption } from '@/components/app/content/schedule-panel';
import { StatusBadge } from '@/components/app/status-badge';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type { PostListItem } from '@/lib/posts';

/**
 * One post, opened from the list or the calendar: what it says, what it
 * will look like, and everything you can do to it.
 *
 * A sheet rather than a page, because reviewing a week of posts means
 * opening and closing a dozen of them — losing your place in the list each
 * time would make the review the slow part.
 */

interface Revision {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
}

interface PostSheetProps {
  post: PostListItem | null;
  pageName: string;
  /** Connected Pages, so scheduling is only offered when it is possible. */
  channels?: ChannelOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any change, so the list behind the sheet can catch up. */
  onChanged: () => void;
}

/**
 * Keyed by post id, so opening a different post mounts a fresh editor with
 * that post's text. Copying props into state in an effect would leave a
 * moment where the sheet shows the previous post's words.
 */
export function PostSheet({ post, ...props }: PostSheetProps) {
  if (!post) return null;
  return <PostSheetContent key={post.id} post={post} {...props} />;
}

function PostSheetContent({
  post,
  pageName,
  channels = [],
  open,
  onOpenChange,
  onChanged,
}: PostSheetProps & { post: PostListItem }) {
  const t = useTranslations('content');
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);
  const [hashtags, setHashtags] = useState<string[]>(post.hashtags);
  const [cta, setCta] = useState(post.cta ?? '');
  // Kept here as well as in the list, because an action taken in this sheet
  // changes the status immediately — an edit withdraws approval — and the
  // badge above must say so without waiting for the list to reload.
  const [status, setStatus] = useState<DisplayStatus>(post.status);
  const [instruction, setInstruction] = useState('');
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async <T,>(
    label: string,
    path: string,
    payload: unknown,
    done: (data: T) => void,
  ) => {
    setBusy(label);
    const result = await apiPost<T>(path, payload);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    done(result.data);
    onChanged();
    router.refresh();
    return true;
  };

  const save = async () => {
    setBusy('save');
    const result = await apiPatch<PostListItem>(`/api/v1/posts/${post.id}`, {
      body,
      hashtags,
      cta: cta.trim() || null,
    });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setEditing(false);
    setStatus(result.data.status);
    onChanged();
    router.refresh();
    toast.success(t('saved'));
  };

  const approve = async () => {
    const ok = await run<PostListItem>('approve', `/api/v1/posts/${post.id}/approve`, {}, (data) =>
      setStatus(data.status),
    );
    if (ok) toast.success(t('approved'));
  };

  const duplicate = async () => {
    const ok = await run<{ id: string }>(
      'duplicate',
      `/api/v1/posts/${post.id}/duplicate`,
      {},
      () => undefined,
    );
    if (ok) toast.success(t('duplicated'));
  };

  const regenerate = async () => {
    const ok = await run<{ post: PostListItem; stub: boolean }>(
      'regenerate',
      `/api/v1/posts/${post.id}/regenerate`,
      instruction.trim() ? { instruction: instruction.trim() } : {},
      (data) => {
        setBody(data.post.body);
        setHashtags(data.post.hashtags);
        setCta(data.post.cta ?? '');
        setStatus(data.post.status);
        setInstruction('');
        if (data.stub) toast.warning(t('stubNotice'));
      },
    );
    if (ok) toast.success(t('regenerated'));
  };

  const remove = async () => {
    setBusy('delete');
    const result = await apiDelete<{ deleted: boolean }>(`/api/v1/posts/${post.id}`);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    onOpenChange(false);
    onChanged();
    router.refresh();
    // The post is only hidden, so the undo puts the same post back, with its
    // history intact — not a copy of it.
    toast.success(t('deleted'), {
      action: {
        label: t('undo'),
        onClick: async () => {
          const undone = await apiPost(`/api/v1/posts/${post.id}/restore`, {});
          if (undone.ok) {
            toast.success(t('restored'));
            onChanged();
            router.refresh();
          } else {
            toast.error(undone.error.message);
          }
        },
      },
    });
  };

  const showRevisions = async () => {
    setBusy('revisions');
    const result = await apiGet<Revision[]>(`/api/v1/posts/${post.id}/revisions`);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setRevisions(result.data);
  };

  const restoreRevision = async (revisionId: string) => {
    const ok = await run<PostListItem>(
      'restore-revision',
      `/api/v1/posts/${post.id}/revisions/${revisionId}/restore`,
      {},
      (data) => {
        setBody(data.body);
        setHashtags(data.hashtags);
        setCta(data.cta ?? '');
        setStatus(data.status);
        setRevisions(null);
      },
    );
    if (ok) toast.success(t('versionRestored'));
  };

  const working = busy !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {t('postTitle')}
            <StatusBadge state={status} />
          </SheetTitle>
          <SheetDescription>{t('postSubtitle')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {editing ? (
            <>
              <Field label={t('bodyLabel')}>
                {({ id }) => (
                  <Textarea
                    id={id}
                    value={body}
                    rows={8}
                    onChange={(event) => setBody(event.target.value)}
                    className="min-h-40 rounded-lg px-3 py-2.5 text-[15px]"
                  />
                )}
              </Field>
              <Field label={t('hashtagsLabel')} optional asGroup>
                {({ id }) => (
                  <TagInput
                    id={id}
                    values={hashtags}
                    onChange={setHashtags}
                    max={6}
                    maxLength={40}
                  />
                )}
              </Field>
              <Field label={t('ctaLabel')} optional>
                {({ id }) => (
                  <Input
                    id={id}
                    value={cta}
                    maxLength={160}
                    onChange={(event) => setCta(event.target.value)}
                    className="h-11 rounded-lg px-3"
                  />
                )}
              </Field>
              <div className="flex gap-2">
                <Button onClick={save} disabled={working || !body.trim()} className="h-10">
                  {busy === 'save' ? t('saving') : t('save')}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} className="h-10">
                  {t('cancel')}
                </Button>
              </div>
            </>
          ) : (
            <PostPreview
              pageName={pageName}
              body={body}
              hashtags={hashtags}
              cta={cta.trim() || null}
            />
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {!editing ? (
              <Button variant="outline" size="sm" className="h-9" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden />
                {t('edit')}
              </Button>
            ) : null}
            {status !== 'approved' ? (
              <Button size="sm" className="h-9" onClick={approve} disabled={working}>
                <Check className="size-3.5" aria-hidden />
                {busy === 'approve' ? t('approving') : t('approve')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={duplicate}
              disabled={working}
            >
              <Copy className="size-3.5" aria-hidden />
              {t('duplicate')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={showRevisions}
              disabled={working}
            >
              <History className="size-3.5" aria-hidden />
              {t('history')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto h-9"
              onClick={remove}
              disabled={working}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {t('delete')}
            </Button>
          </div>

          <SchedulePanel postId={post.id} status={status} channels={channels} />

          <div className="space-y-2 rounded-xl border border-border p-3">
            <label htmlFor="regenerate-instruction" className="text-sm font-medium">
              {t('regenerateLabel')}
            </label>
            <div className="flex gap-2">
              <Input
                id="regenerate-instruction"
                value={instruction}
                maxLength={500}
                placeholder={t('regeneratePlaceholder')}
                onChange={(event) => setInstruction(event.target.value)}
                className="h-10 rounded-lg px-3"
              />
              <Button
                variant="outline"
                className="h-10 shrink-0"
                onClick={regenerate}
                disabled={working}
              >
                <Sparkles className="size-4 text-brand-600" aria-hidden />
                {busy === 'regenerate' ? t('regenerating') : t('regenerate')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('regenerateHint')}</p>
          </div>

          {revisions ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t('historyTitle')}</h3>
              {revisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {revisions.map((revision) => (
                    <li key={revision.id} className="rounded-xl border border-border p-3">
                      <p className="line-clamp-3 text-sm whitespace-pre-line">{revision.body}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {t(`revisionKind.${revision.kind}`)} ·{' '}
                          {new Date(revision.createdAt).toLocaleString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8"
                          onClick={() => restoreRevision(revision.id)}
                          disabled={working}
                        >
                          <Undo2 className="size-3.5" aria-hidden />
                          {t('restoreVersion')}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
