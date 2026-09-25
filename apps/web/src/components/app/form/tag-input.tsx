'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A list of short values: products, locations, interests, words to avoid.
 *
 * Enter or a comma adds what's typed; so does leaving the field, because
 * people type a last item and click "Continue" without pressing Enter, and
 * silently dropping it would be the worst possible behaviour. Backspace on
 * an empty box takes the previous tag back for editing rather than deleting
 * it outright.
 */

interface TagInputProps {
  id?: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  max?: number;
  maxLength?: number;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
}

export function TagInput({
  id,
  values,
  onChange,
  placeholder,
  max = 20,
  maxLength = 80,
  ...aria
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const full = values.length >= max;

  const add = (raw: string) => {
    const tag = raw.trim().slice(0, maxLength);
    if (!tag || full) return;
    // Case-insensitive, because "Cake" and "cake" are the same product.
    if (!values.some((value) => value.toLowerCase() === tag.toLowerCase())) {
      onChange([...values, tag]);
    }
    setDraft('');
  };

  const removeAt = (index: number) => {
    onChange(values.filter((_, position) => position !== index));
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter must not submit the form while the user is still listing items.
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      event.preventDefault();
      setDraft(values[values.length - 1] ?? '');
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card p-1.5 transition-colors',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        aria['aria-invalid'] && 'border-destructive ring-3 ring-destructive/20',
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="inline-flex items-center gap-1 rounded-md bg-accent py-1 pr-1 pl-2.5 text-sm text-accent-foreground"
        >
          {value}
          <button
            type="button"
            onClick={() => removeAt(index)}
            aria-label={`Remove ${value}`}
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        disabled={full}
        maxLength={maxLength}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={full ? `That's the maximum of ${max}` : placeholder}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        className="h-9 min-w-40 flex-1 bg-transparent px-2 text-[15px] placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
