'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { BrandSectionName } from '@dpost/core/brand';
import { updateSection } from '@/app/(app)/brand/actions';
import { ChipGroup, ChoiceCards } from '@/components/app/form/choice';
import { Field } from '@/components/app/form/field';
import { TagInput } from '@/components/app/form/tag-input';
import { FormAlert } from '@/components/auth/auth-bits';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isPillarList, SECTION_FIELDS, type FieldConfig, type Pillar } from '@/lib/brand-fields';

/**
 * Editing one card. The form is generated from `SECTION_FIELDS`, so the
 * fields on screen are always exactly the fields the section's schema
 * accepts.
 *
 * Validation stays on the server: the same zod schema the API uses returns
 * per-field messages, which are shown next to the inputs. Copying those
 * rules into the browser would mean two definitions of "valid" that can
 * drift apart.
 */
export function SectionDialog({
  section,
  values,
}: {
  section: BrandSectionName;
  values: Record<string, unknown>;
}) {
  const t = useTranslations('brand');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const configs = SECTION_FIELDS[section];

  const openChange = (next: boolean) => {
    // Reopening starts from what's saved, so an abandoned edit is discarded.
    if (next) {
      setDraft(values);
      setErrors({});
      setMessage(null);
    }
    setOpen(next);
  };

  const set = (key: string, value: unknown) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);

    // An emptied field is sent as null, which clears it.
    const patch = Object.fromEntries(
      configs.map((config) => [config.key, emptyToNull(draft[config.key])]),
    );
    const result = await updateSection(section, patch);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.error.fields ?? {});
      setMessage(result.error.fields ? null : result.error.message);
      return;
    }
    setOpen(false);
    toast.success(t('saved'));
  };

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2.5"
          // Six "Edit" buttons on one page: each says which card it opens.
          aria-label={t('editSection', { section: t(`sections.${section}.title`) })}
        >
          <Pencil className="size-3.5" aria-hidden />
          {t('edit')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`sections.${section}.title`)}</DialogTitle>
          <DialogDescription>{t(`sections.${section}.description`)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {message ? <FormAlert>{message}</FormAlert> : null}

          {configs.map((config) => (
            <SectionField
              key={config.key}
              section={section}
              config={config}
              value={draft[config.key]}
              error={errors[config.key]?.[0]}
              onChange={(value) => set(config.key, value)}
            />
          ))}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-10">
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="h-10 px-4">
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Empty strings and empty lists mean "clear this field". */
function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return value;
}

function SectionField({
  section,
  config,
  value,
  error,
  onChange,
}: {
  section: BrandSectionName;
  config: FieldConfig;
  value: unknown;
  error: string | undefined;
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations('brand');
  const options = useTranslations('options');
  const label = t(`fields.${section}.${config.key}`);
  const choices = (config.options ?? []).map((option) => ({
    value: option,
    label: options(`${config.optionSet}.${option}`),
  }));

  switch (config.kind) {
    case 'longtext':
      return (
        <Field label={label} error={error} optional>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              rows={3}
              maxLength={config.maxLength}
              value={String(value ?? '')}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(event) => onChange(event.target.value)}
              className="min-h-20 rounded-lg px-3 py-2.5 text-[15px]"
            />
          )}
        </Field>
      );

    case 'tags':
      return (
        <Field label={label} error={error} optional asGroup>
          {({ id, describedBy, invalid }) => (
            <TagInput
              id={id}
              values={(Array.isArray(value) ? value : []).map(String)}
              onChange={onChange}
              max={config.maxItems}
              maxLength={config.maxLength}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
      );

    case 'choice':
      return (
        <Field label={label} error={error} optional asGroup>
          {() => (
            <ChoiceCards
              name={`${section}-${config.key}`}
              columns={3}
              options={choices}
              value={typeof value === 'string' ? value : undefined}
              onChange={onChange}
            />
          )}
        </Field>
      );

    case 'multi':
      return (
        <Field label={label} error={error} optional asGroup>
          {() => (
            <ChipGroup
              options={choices}
              values={(Array.isArray(value) ? value : []).map(String)}
              onChange={onChange}
            />
          )}
        </Field>
      );

    case 'number':
      return (
        <Field label={label} error={error} optional>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={config.min}
              max={config.max}
              value={typeof value === 'number' ? value : ''}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(event) =>
                onChange(event.target.value === '' ? null : event.target.valueAsNumber)
              }
              className="h-11 w-28 rounded-lg px-3 text-[15px]"
            />
          )}
        </Field>
      );

    case 'pillars':
      return (
        <Field label={label} error={error} optional asGroup>
          {() => (
            <PillarEditor
              pillars={isPillarList(value) ? value : []}
              max={config.maxItems ?? 8}
              onChange={onChange}
            />
          )}
        </Field>
      );

    default:
      return (
        <Field label={label} error={error} optional>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              maxLength={config.maxLength}
              value={String(value ?? '')}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(event) => onChange(event.target.value)}
              className="h-11 rounded-lg px-3 text-[15px]"
            />
          )}
        </Field>
      );
  }
}

/**
 * Content pillars: a theme and how much of the plan it should take. Weights
 * are relative, so they don't have to add up to 100 — whatever is entered is
 * normalised when the mix is shown or used.
 */
function PillarEditor({
  pillars,
  max,
  onChange,
}: {
  pillars: Pillar[];
  max: number;
  onChange: (value: Pillar[]) => void;
}) {
  const t = useTranslations('brand');

  const update = (index: number, patch: Partial<Pillar>) =>
    onChange(
      pillars.map((pillar, position) => (position === index ? { ...pillar, ...patch } : pillar)),
    );

  return (
    <div className="space-y-2">
      {pillars.map((pillar, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={pillar.name}
            maxLength={40}
            placeholder={t('pillarName')}
            aria-label={t('pillarName')}
            onChange={(event) => update(index, { name: event.target.value })}
            className="h-10 flex-1 rounded-lg px-3"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={pillar.weight}
            aria-label={t('pillarWeight')}
            onChange={(event) => update(index, { weight: event.target.valueAsNumber || 0 })}
            className="h-10 w-20 rounded-lg px-3"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label={t('pillarRemove', { name: pillar.name || String(index + 1) })}
            onClick={() => onChange(pillars.filter((_, position) => position !== index))}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      {pillars.length < max ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => onChange([...pillars, { name: '', weight: 20 }])}
        >
          <Plus className="size-3.5" aria-hidden />
          {t('pillarAdd')}
        </Button>
      ) : null}
    </div>
  );
}
