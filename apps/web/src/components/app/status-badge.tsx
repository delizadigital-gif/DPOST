import { cn } from '@/lib/utils';

/**
 * A post's state, in one consistent colour everywhere
 * (docs/06-uiux-architecture.md §8.2). Editorial states come from the post,
 * delivery states from its scheduled publication.
 */
export type PostState =
  | 'draft'
  | 'ai_generated'
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

const STYLES: Record<PostState, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-border bg-muted text-ink-600' },
  ai_generated: { label: 'AI draft', className: 'border-brand-200 bg-brand-50 text-brand-700' },
  pending_review: { label: 'Needs review', className: 'border-amber/40 bg-amber/10 text-amber' },
  approved: { label: 'Approved', className: 'border-primary/40 bg-transparent text-primary' },
  scheduled: { label: 'Scheduled', className: 'border-transparent bg-primary text-white' },
  publishing: {
    label: 'Publishing',
    className: 'border-transparent bg-primary/80 text-white animate-pulse',
  },
  published: { label: 'Published', className: 'border-mint/40 bg-mint/10 text-mint' },
  failed: {
    label: 'Failed',
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
};

export function StatusBadge({ state, className }: { state: PostState; className?: string }) {
  const style = STYLES[state];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
