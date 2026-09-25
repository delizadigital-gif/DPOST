import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * What a section looks like before it has any content: an illustration-like
 * icon, a sentence explaining what will appear, and the action that starts it.
 * Sections still being built pass `note` instead of an action.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  note,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div
        aria-hidden
        className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground"
      >
        <Icon className="size-6" />
      </div>
      <h2 className="font-sans text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
      {note ? (
        <p className="mt-6 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  );
}
