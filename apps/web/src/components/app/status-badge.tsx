import { useTranslations } from 'next-intl';
import type { DisplayStatus } from '@dpost/core/content';
import { cn } from '@/lib/utils';

/**
 * A post's state, in one consistent colour everywhere
 * (docs/06-uiux-architecture.md §8.2). Editorial states come from the post;
 * delivery states (scheduled, published, failed) come from its publication
 * once Phase 8 can publish.
 */

const STYLES: Record<DisplayStatus, string> = {
  draft: 'border-border bg-muted text-ink-600',
  ai_generated:
    'border-brand-200 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100',
  pending_review: 'border-amber/40 bg-amber/10 text-amber',
  approved: 'border-primary/40 bg-transparent text-primary',
  archived: 'border-border bg-transparent text-muted-foreground',
  scheduled: 'border-transparent bg-primary text-white',
  publishing: 'border-transparent bg-primary/80 text-white animate-pulse',
  published: 'border-mint/40 bg-mint/10 text-mint',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
  cancelled: 'border-border bg-muted text-muted-foreground line-through',
};

export function StatusBadge({ state, className }: { state: DisplayStatus; className?: string }) {
  const t = useTranslations('status');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        STYLES[state],
        className,
      )}
    >
      {t(state)}
    </span>
  );
}

/** The same colours as a dot, for calendar chips where space is tight. */
export function StatusDot({ state, className }: { state: DisplayStatus; className?: string }) {
  const t = useTranslations('status');
  const colour =
    state === 'published'
      ? 'bg-mint'
      : state === 'failed'
        ? 'bg-destructive'
        : state === 'approved' || state === 'scheduled'
          ? 'bg-primary'
          : state === 'pending_review'
            ? 'bg-amber'
            : state === 'ai_generated'
              ? 'bg-brand-400'
              : 'bg-ink-400';

  return (
    <span className={cn('size-2 shrink-0 rounded-full', colour, className)} title={t(state)}>
      <span className="sr-only">{t(state)}</span>
    </span>
  );
}
