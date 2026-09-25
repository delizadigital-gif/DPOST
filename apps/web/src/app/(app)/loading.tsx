import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shown while a section's data loads. It mirrors the real layout (title,
 * subtitle, content block) so the page doesn't jump when content arrives.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
