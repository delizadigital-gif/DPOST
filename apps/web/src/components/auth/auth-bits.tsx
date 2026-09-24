import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';

export function AuthHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-8 space-y-2">
      <h1 className="text-3xl font-bold">{title}</h1>
      {description ? <p className="text-[15px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/** Announced to screen readers as soon as it appears. */
export function FormAlert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'flex gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive'
          : 'flex gap-2.5 rounded-lg border border-mint/30 bg-mint/10 p-3 text-sm text-foreground'
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
