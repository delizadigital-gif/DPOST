'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps extends ComponentProps<'input'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Right-aligned element on the label row, e.g. "Forgot password?". */
  aside?: ReactNode;
}

/** A labelled input with accessible error and hint text. */
export function FormField({ label, error, hint, aside, className, id, ...props }: FormFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  // The hint is replaced by the error when there is one; only reference what's rendered.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId}>{label}</Label>
        {aside}
      </div>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn('h-11 rounded-lg bg-card px-3 text-[15px]', className)}
        {...props}
      />
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

/** A password field with a show/hide toggle. */
export function PasswordField(props: Omit<FormFieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <FormField {...props} type={visible ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-[34px] right-1.5 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
