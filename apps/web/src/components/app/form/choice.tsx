'use client';

import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The two pickers onboarding is built from. Both are native radios and
 * checkboxes underneath: the browser gives us keyboard support, screen
 * reader semantics and form behaviour for free, and the visible card is
 * just styling on top.
 */

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface ChoiceCardsProps<T extends string> {
  name: string;
  options: readonly Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
}

/** Pick one: business type, tone of voice. */
export function ChoiceCards<T extends string>({
  name,
  options,
  value,
  onChange,
  columns = 2,
}: ChoiceCardsProps<T>) {
  const group = useId();
  return (
    <div
      className={cn(
        'grid gap-2',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-2 sm:grid-cols-3',
      )}
    >
      {options.map((option) => {
        const id = `${group}-${option.value}`;
        const selected = value === option.value;
        return (
          <div key={option.value}>
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              className={cn(
                'flex h-full cursor-pointer flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left transition-colors',
                'peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 hover:border-brand-400',
                selected && 'border-brand-500 bg-brand-50 dark:bg-brand-900/30',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {option.icon}
                {option.label}
              </span>
              {option.description ? (
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </label>
          </div>
        );
      })}
    </div>
  );
}

interface ChipGroupProps<T extends string> {
  options: readonly Choice<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
}

/** Pick any: languages, goals. */
export function ChipGroup<T extends string>({ options, values, onChange }: ChipGroupProps<T>) {
  const group = useId();
  const toggle = (value: T) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const id = `${group}-${option.value}`;
        const selected = values.includes(option.value);
        return (
          <div key={option.value}>
            <input
              type="checkbox"
              id={id}
              checked={selected}
              onChange={() => toggle(option.value)}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm transition-colors',
                'peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 hover:border-brand-400',
                selected && 'border-brand-500 bg-brand-50 font-medium dark:bg-brand-900/30',
              )}
            >
              {selected ? <Check className="size-3.5" aria-hidden /> : null}
              {option.label}
            </label>
          </div>
        );
      })}
    </div>
  );
}
