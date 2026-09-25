import { useTranslations } from 'next-intl';
import type { BrandSource } from '@dpost/core/brand';

/**
 * Where a value came from: you, the welcome wizard, or the Page analysis.
 *
 * Every field carries this tag because the AI acts on these values. Someone
 * has to be able to see, at a glance, which answers they gave and which a
 * machine inferred — and correct the machine.
 */
export function ProvenanceTag({ source }: { source: BrandSource }) {
  const t = useTranslations('brand.provenance');
  const tone =
    source === 'user'
      ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
      : 'border-border bg-muted text-muted-foreground';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {t(source)}
    </span>
  );
}
