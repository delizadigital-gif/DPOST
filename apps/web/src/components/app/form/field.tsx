'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Form scaffolding for onboarding and the Brand Brain: a label, optional
 * hint, and an error that replaces the hint when something is wrong. The
 * wrapper works for any control, including the chip and tag inputs that
 * aren't a single focusable element.
 */

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  /** Rendered with the ids the label and error are wired to. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  /** True when the control isn't a single element a `<label>` can point at. */
  asGroup?: boolean;
}

export function Field({ label, hint, error, optional, children, asGroup }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const heading = (
    <span className="flex items-baseline gap-2">
      <span className="text-sm font-medium">{label}</span>
      {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
    </span>
  );

  return (
    <div
      className="space-y-2"
      {...(asGroup
        ? { role: 'group', 'aria-labelledby': `${id}-label`, 'aria-describedby': describedBy }
        : {})}
    >
      {asGroup ? (
        <div id={`${id}-label`}>{heading}</div>
      ) : (
        <Label htmlFor={id} className="block">
          {heading}
        </Label>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> &
  Pick<FieldProps, 'label' | 'hint' | 'error' | 'optional'>;

export function TextField({ label, hint, error, optional, className, ...props }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn('h-11 rounded-lg bg-card px-3 text-[15px]', className)}
          {...props}
        />
      )}
    </Field>
  );
}

type TextAreaFieldProps = Omit<ComponentProps<'textarea'>, 'id'> &
  Pick<FieldProps, 'label' | 'hint' | 'error' | 'optional'>;

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  className,
  ...props
}: TextAreaFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn('min-h-24 rounded-lg bg-card px-3 py-2.5 text-[15px]', className)}
          {...props}
        />
      )}
    </Field>
  );
}
