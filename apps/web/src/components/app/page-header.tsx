import type { ReactNode } from 'react';

/** Title, one line of context, and optional actions. Used by every app page. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
