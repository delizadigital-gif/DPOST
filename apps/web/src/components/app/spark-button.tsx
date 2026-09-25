import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The one visual signature for AI actions, so "the AI will do something" is
 * recognisable at a glance instead of sparkles being scattered everywhere.
 * Pass `href` to render a link: the icon and label must stay inside a single
 * child, which is what Radix's `asChild` requires.
 */
export function SparkButton({
  href,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { href?: string }) {
  const classes = cn(
    'bg-spark h-10 gap-2 rounded-lg border-0 text-white hover:opacity-90',
    className,
  );
  const content = (
    <>
      <Sparkles className="size-4" aria-hidden />
      {children}
    </>
  );

  if (href) {
    return (
      <Button asChild className={classes} {...props}>
        <Link href={href}>{content}</Link>
      </Button>
    );
  }
  return (
    <Button className={classes} {...props}>
      {content}
    </Button>
  );
}
