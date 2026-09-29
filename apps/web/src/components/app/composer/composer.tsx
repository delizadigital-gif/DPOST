'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, Check, Info, Sparkles } from 'lucide-react';
import {
  CONTENT_LANGUAGES,
  MAX_DRAFTS_PER_REQUEST,
  REWRITE_ACTIONS,
  validatePost,
  type ContentLanguageCode,
  type ContentTypeCode,
  type RewriteAction,
} from '@dpost/core/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChipGroup } from '@/components/app/form/choice';
import { Field } from '@/components/app/form/field';
import { TagInput } from '@/components/app/form/tag-input';
import { apiPost } from '@/lib/api/client';
import { PostPreview } from './preview';

/**
 * The composer: write a post, or ask the AI to, then edit it and save it.
 *
 * Scheduling is deliberately absent — there is nowhere to publish to until
 * Facebook Pages are connected (Phase 8), so the footer says "Save draft"
 * and means it.
 */

interface QuotaView {
  limit: number | null;
  used: number;
  remaining: number | null;
}

interface GeneratedDraft {
  idea: string;
  body: string;
  hashtags: string[];
  cta: string | null;
  contentType: ContentTypeCode;
  language: ContentLanguageCode;
  needsImage: boolean;
  warnings: { code: string; level: 'block' | 'flag'; message: string }[];
}

interface GenerateResponse {
  drafts: GeneratedDraft[];
  meta: { provider: string; modelId: string; promptVersion: string; stub: boolean };
  quota: QuotaView;
}

interface RewriteResponse {
  post: { body: string; hashtags: string[]; cta: string | null };
  warnings: { code: string; level: 'block' | 'flag'; message: string }[];
  meta: { stub: boolean };
  quota: QuotaView;
}

export interface ComposerProps {
  pageName: string;
  aiAvailable: boolean;
  brandReady: boolean;
  quota: QuotaView;
}

export function Composer({
  pageName,
  aiAvailable,
  brandReady,
  quota: initialQuota,
}: ComposerProps) {
  const t = useTranslations('composer');
  const options = useTranslations('options');
  const router = useRouter();

  const [request, setRequest] = useState('');
  const [language, setLanguage] = useState<ContentLanguageCode>('bn');
  const [count, setCount] = useState(3);
  const [drafts, setDrafts] = useState<GeneratedDraft[]>([]);
  const [usedStub, setUsedStub] = useState(false);
  const [quota, setQuota] = useState(initialQuota);
  const [busy, setBusy] = useState<'generate' | RewriteAction | 'save' | null>(null);

  const [body, setBody] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [cta, setCta] = useState('');
  const [warnings, setWarnings] = useState<GeneratedDraft['warnings']>([]);
  const [needsImage, setNeedsImage] = useState(false);

  const validation = useMemo(() => validatePost({ body, hashtags }), [body, hashtags]);
  const outOfQuota = quota.remaining !== null && quota.remaining <= 0;
  const canUseAi = aiAvailable && !outOfQuota;

  const applyQuota = (next: QuotaView) => setQuota(next);

  const handleApiError = (error: { code: string; message: string }) => {
    toast.error(error.message);
    if (error.code === 'QUOTA_EXCEEDED') setQuota((current) => ({ ...current, remaining: 0 }));
  };

  const generate = async () => {
    setBusy('generate');
    const result = await apiPost<GenerateResponse>('/api/v1/ai/generate', {
      request,
      language,
      count,
    });
    setBusy(null);

    if (!result.ok) {
      handleApiError(result.error);
      return;
    }
    setDrafts(result.data.drafts);
    setUsedStub(result.data.meta.stub);
    applyQuota(result.data.quota);
    // The sidebar meter is rendered on the server; refresh it so both
    // places agree about what is left.
    router.refresh();
    const first = result.data.drafts[0];
    if (first) applyDraft(first);
  };

  const applyDraft = (draft: GeneratedDraft) => {
    setBody(draft.body);
    setHashtags(draft.hashtags);
    setCta(draft.cta ?? '');
    setWarnings(draft.warnings);
    setNeedsImage(draft.needsImage);
    setLanguage(draft.language);
  };

  const rewrite = async (action: RewriteAction) => {
    if (!body.trim()) return;
    setBusy(action);
    const result = await apiPost<RewriteResponse>('/api/v1/ai/rewrite', {
      action,
      body,
      hashtags,
      cta: cta.trim() || null,
      language,
    });
    setBusy(null);

    if (!result.ok) {
      handleApiError(result.error);
      return;
    }
    setBody(result.data.post.body);
    setHashtags(result.data.post.hashtags);
    setCta(result.data.post.cta ?? '');
    setWarnings(result.data.warnings);
    setUsedStub(result.data.meta.stub || usedStub);
    applyQuota(result.data.quota);
    router.refresh();
  };

  const saveDraft = async () => {
    setBusy('save');
    const result = await apiPost<{ id: string }>('/api/v1/posts', {
      body,
      hashtags,
      cta: cta.trim() || null,
      language,
      source: drafts.length > 0 ? 'ai_single' : 'manual',
    });
    setBusy(null);

    if (!result.ok) {
      handleApiError(result.error);
      return;
    }
    toast.success(t('saved'));
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section
          aria-labelledby="ai-panel"
          className="rounded-2xl border border-border bg-card p-5"
        >
          <h2 id="ai-panel" className="flex items-center gap-2 font-sans text-[15px] font-semibold">
            <Sparkles className="size-4 text-brand-600" aria-hidden />
            {t('askTitle')}
          </h2>

          {!brandReady ? (
            <p className="mt-3 flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('brandEmpty')}
            </p>
          ) : null}

          {!aiAvailable ? (
            <p className="mt-3 flex gap-2 rounded-xl border border-border bg-muted p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('aiUnavailable')}
            </p>
          ) : null}

          <div className="mt-4 space-y-4">
            <Field label={t('requestLabel')} hint={t('requestHint')} optional>
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder={t('requestPlaceholder')}
                  rows={2}
                  maxLength={1000}
                  className="min-h-16 rounded-lg px-3 py-2.5 text-[15px]"
                />
              )}
            </Field>

            <div className="flex flex-wrap items-end gap-4">
              <Field label={t('languageLabel')} asGroup>
                {() => (
                  <ChipGroup
                    options={CONTENT_LANGUAGES.map((value) => ({
                      value,
                      label: options(`language.${value}`),
                    }))}
                    values={[language]}
                    onChange={(values) =>
                      setLanguage(
                        (values.find((value) => value !== language) ??
                          language) as ContentLanguageCode,
                      )
                    }
                  />
                )}
              </Field>

              <div className="space-y-1.5">
                <Label htmlFor="draft-count" className="text-sm font-medium">
                  {t('countLabel')}
                </Label>
                <Input
                  id="draft-count"
                  type="number"
                  min={1}
                  max={MAX_DRAFTS_PER_REQUEST}
                  value={count}
                  onChange={(event) =>
                    setCount(
                      Math.min(
                        Math.max(event.target.valueAsNumber || 1, 1),
                        MAX_DRAFTS_PER_REQUEST,
                      ),
                    )
                  }
                  className="h-11 w-20 rounded-lg px-3 text-[15px]"
                />
              </div>

              <Button
                onClick={generate}
                disabled={!canUseAi || busy !== null}
                className="ml-auto h-11 rounded-lg bg-spark px-5 text-white hover:opacity-90"
              >
                <Sparkles className="size-4" aria-hidden />
                {busy === 'generate' ? t('writing') : t('write')}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {quota.limit === null
                ? t('quotaUnlimited')
                : t('quotaLeft', { remaining: quota.remaining ?? 0, limit: quota.limit })}
              {' · '}
              {t('quotaNote')}
            </p>
          </div>

          {usedStub ? (
            <p className="mt-4 flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('stubNotice')}
            </p>
          ) : null}

          {drafts.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {drafts.map((draft, index) => (
                <li key={`${draft.idea}-${index}`}>
                  <button
                    type="button"
                    onClick={() => applyDraft(draft)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors hover:border-brand-400 ${
                      draft.body === body
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                        : 'border-border'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {draft.body === body ? (
                        <Check className="size-3.5 text-brand-600" aria-hidden />
                      ) : null}
                      {draft.idea}
                      {draft.warnings.length > 0 ? (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <AlertTriangle className="size-3" aria-hidden />
                          {draft.warnings.length}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                      {draft.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="editor" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="editor" className="font-sans text-[15px] font-semibold">
            {t('editorTitle')}
          </h2>

          <div className="mt-4 space-y-4">
            <Field
              label={t('bodyLabel')}
              hint={t('bodyCount', { count: body.length })}
              error={validation.issues.find((issue) => issue.level === 'error')?.message}
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={t('bodyPlaceholder')}
                  rows={8}
                  className="min-h-44 rounded-lg px-3 py-2.5 text-[15px]"
                />
              )}
            </Field>

            <div className="flex flex-wrap gap-2">
              {REWRITE_ACTIONS.map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canUseAi || !body.trim() || busy !== null}
                  onClick={() => rewrite(action)}
                  className="h-9"
                >
                  <Sparkles className="size-3.5 text-brand-600" aria-hidden />
                  {busy === action ? t('working') : t(`actions.${action}`)}
                </Button>
              ))}
            </div>

            <Field label={t('hashtagsLabel')} hint={t('hashtagsHint')} optional asGroup>
              {({ id, describedBy }) => (
                <TagInput
                  id={id}
                  aria-describedby={describedBy}
                  values={hashtags}
                  onChange={setHashtags}
                  max={6}
                  maxLength={40}
                  placeholder={t('hashtagsPlaceholder')}
                />
              )}
            </Field>

            <Field label={t('ctaLabel')} optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={cta}
                  onChange={(event) => setCta(event.target.value)}
                  placeholder={t('ctaPlaceholder')}
                  maxLength={160}
                  className="h-11 rounded-lg px-3 text-[15px]"
                />
              )}
            </Field>

            {[...warnings, ...validation.issues.filter((issue) => issue.level === 'warning')]
              .length > 0 ? (
              <ul className="space-y-1.5">
                {warnings.map((warning, index) => (
                  <li
                    key={`w-${index}`}
                    className="flex gap-2 rounded-lg border border-amber/40 bg-amber/10 p-2.5 text-sm"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {warning.message}
                  </li>
                ))}
                {validation.issues
                  .filter((issue) => issue.level === 'warning')
                  .map((issue, index) => (
                    <li
                      key={`v-${index}`}
                      className="flex gap-2 rounded-lg border border-border bg-muted p-2.5 text-sm text-muted-foreground"
                    >
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {issue.message}
                    </li>
                  ))}
              </ul>
            ) : null}

            <div className="flex items-center gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">{t('noScheduling')}</p>
              <Button
                onClick={saveDraft}
                disabled={!validation.ok || !body.trim() || busy !== null}
                className="ml-auto h-11 rounded-lg px-5"
              >
                {busy === 'save' ? t('saving') : t('saveDraft')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('previewTitle')}</h2>
        <PostPreview
          pageName={pageName}
          body={body}
          hashtags={hashtags}
          cta={cta.trim() || null}
          needsImage={needsImage}
        />
      </div>
    </div>
  );
}
