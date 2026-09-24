import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading text-xl font-bold tracking-tight', className)}>
      D<span className="text-spark">POST</span>
    </span>
  );
}
